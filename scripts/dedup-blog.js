#!/usr/bin/env node
/**
 * dedup-blog.js — find and remove duplicate posts on dev.to and Hashnode.
 *
 * Duplicates = same canonical_url OR same title (case-insensitive).
 * Strategy: keep the oldest post (lowest ID / earliest published_at), remove the rest.
 *   - dev.to:   no public DELETE API → unpublishes duplicates (published: false)
 *   - Hashnode: uses removePost mutation to hard-delete duplicates
 *
 * Usage:
 *   node scripts/dedup-blog.js            # dry-run (no changes)
 *   node scripts/dedup-blog.js --apply    # actually remove duplicates
 *
 * Required env vars (same as publish-blog.js):
 *   DEVTO_API_KEY, HASHNODE_TOKEN, HASHNODE_PUBLICATION_ID
 */

const DRY_RUN = !process.argv.includes('--apply');
if (DRY_RUN) {
  console.log('🔍 DRY RUN — pass --apply to make changes\n');
}

const DEVTO_API_KEY         = process.env.DEVTO_API_KEY;
const HASHNODE_TOKEN        = process.env.HASHNODE_TOKEN;
const HASHNODE_PUBLICATION_ID = process.env.HASHNODE_PUBLICATION_ID;

const RETRY_DELAY_MS = 30_000;
const MAX_RETRIES    = 3;

// ── retry helper ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const wait = (parseInt(res.headers.get('retry-after') || '0', 10) * 1000) || RETRY_DELAY_MS;
    console.warn(`  ${label}: rate-limited. Waiting ${wait / 1000}s (attempt ${attempt}/${MAX_RETRIES})…`);
    await sleep(wait);
  }
  return fetch(url, options);
}

// ── dedup key ─────────────────────────────────────────────────────────────────

/** Canonical URL beats title — normalise to a stable dedup key. */
function dedupKey(canonicalUrl, title) {
  if (canonicalUrl) return canonicalUrl.replace(/\/$/, '').toLowerCase();
  return `__title__${title.toLowerCase().trim()}`;
}

// ── dev.to ────────────────────────────────────────────────────────────────────

async function fetchAllDevToArticles() {
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetchWithRetry(
      `https://dev.to/api/articles/me/all?per_page=100&page=${page}`,
      { headers: { 'api-key': DEVTO_API_KEY } },
      'dev.to fetch'
    );
    if (!res.ok) {
      console.error(`✗ dev.to fetch page ${page}: ${res.status}`);
      break;
    }
    const batch = await res.json();
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}

async function deduplicateDevTo() {
  if (!DEVTO_API_KEY) {
    console.warn('DEVTO_API_KEY not set — skipping dev.to');
    return;
  }

  console.log('── dev.to ──────────────────────────────────');
  const articles = await fetchAllDevToArticles();
  console.log(`Fetched ${articles.length} articles`);

  // Group by dedup key; sort each group oldest-first (lowest id = oldest)
  const groups = new Map();
  for (const a of articles) {
    const key = dedupKey(a.canonical_url, a.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  let totalDups = 0;
  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    group.sort((a, b) => a.id - b.id); // keep smallest id (oldest)
    const [keep, ...dupes] = group;
    totalDups += dupes.length;

    console.log(`\nDuplicate: "${keep.title}" (${group.length} copies)`);
    console.log(`  ✓ keep  [id=${keep.id}] ${keep.url}`);
    for (const d of dupes) {
      console.log(`  ✗ remove [id=${d.id}] ${d.url} published=${d.published}`);
      if (!DRY_RUN) {
        const res = await fetchWithRetry(
          `https://dev.to/api/articles/${d.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'api-key': DEVTO_API_KEY },
            body: JSON.stringify({ article: { published: false } }),
          },
          'dev.to unpublish'
        );
        if (res.ok) {
          console.log(`    → unpublished`);
        } else {
          const err = await res.json().catch(() => ({}));
          console.error(`    ✗ failed: ${res.status} — ${JSON.stringify(err)}`);
          process.exitCode = 1;
        }
      }
    }
  }

  if (totalDups === 0) {
    console.log('No duplicates found on dev.to ✓');
  } else {
    console.log(`\ndev.to: ${DRY_RUN ? 'would remove' : 'removed'} ${totalDups} duplicate(s)`);
  }
}

// ── Hashnode ──────────────────────────────────────────────────────────────────

async function gql(query, variables) {
  const res = await fetchWithRetry(
    'https://gql.hashnode.com',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: HASHNODE_TOKEN },
      body: JSON.stringify({ query, variables }),
    },
    'Hashnode'
  );
  return res.json();
}

async function fetchAllHashnodePosts() {
  const all = [];
  let after = null;
  const query = `
    query GetPosts($id: ObjectId!, $after: String) {
      publication(id: $id) {
        posts(first: 50, after: $after) {
          edges { node { id title url canonicalUrl publishedAt } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;
  while (true) {
    const data = await gql(query, { id: HASHNODE_PUBLICATION_ID, after });
    const posts = data.data?.publication?.posts;
    if (!posts) break;
    all.push(...posts.edges.map(e => e.node));
    if (!posts.pageInfo.hasNextPage) break;
    after = posts.pageInfo.endCursor;
  }
  return all;
}

async function deduplicateHashnode() {
  if (!HASHNODE_TOKEN || !HASHNODE_PUBLICATION_ID) {
    console.warn('HASHNODE_TOKEN or HASHNODE_PUBLICATION_ID not set — skipping Hashnode');
    return;
  }

  console.log('\n── Hashnode ─────────────────────────────────');
  const posts = await fetchAllHashnodePosts();
  console.log(`Fetched ${posts.length} posts`);

  // Group by dedup key; sort oldest-first by publishedAt
  const groups = new Map();
  for (const p of posts) {
    const key = dedupKey(p.canonicalUrl, p.title);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  let totalDups = 0;
  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    group.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt)); // keep oldest
    const [keep, ...dupes] = group;
    totalDups += dupes.length;

    console.log(`\nDuplicate: "${keep.title}" (${group.length} copies)`);
    console.log(`  ✓ keep  [${keep.publishedAt}] ${keep.url}`);
    for (const d of dupes) {
      console.log(`  ✗ remove [${d.publishedAt}] ${d.url}`);
      if (!DRY_RUN) {
        const mutation = `
          mutation RemovePost($input: RemovePostInput!) {
            removePost(input: $input) {
              post { id title }
            }
          }
        `;
        const data = await gql(mutation, { input: { postId: d.id } });
        if (data.errors) {
          console.error(`    ✗ failed: ${JSON.stringify(data.errors)}`);
          process.exitCode = 1;
        } else {
          console.log(`    → deleted`);
        }
      }
    }
  }

  if (totalDups === 0) {
    console.log('No duplicates found on Hashnode ✓');
  } else {
    console.log(`\nHashnode: ${DRY_RUN ? 'would remove' : 'removed'} ${totalDups} duplicate(s)`);
  }
}

// ── run ───────────────────────────────────────────────────────────────────────

await deduplicateDevTo();
await deduplicateHashnode();
