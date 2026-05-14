#!/usr/bin/env node
/**
 * dedup-blog.js — find and remove duplicate posts on dev.to.
 *
 * Duplicates = same canonical_url OR same title (case-insensitive).
 * Strategy: keep the oldest post (lowest ID), unpublish the rest.
 *   - dev.to: no public DELETE API → unpublishes duplicates (published: false)
 *
 * Usage:
 *   node scripts/dedup-blog.js            # dry-run (no changes)
 *   node scripts/dedup-blog.js --apply    # actually remove duplicates
 *
 * Required env vars:
 *   DEVTO_API_KEY
 */

const DRY_RUN = !process.argv.includes('--apply');
if (DRY_RUN) {
  console.log('🔍 DRY RUN — pass --apply to make changes\n');
}

const DEVTO_API_KEY = process.env.DEVTO_API_KEY;

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

// ── run ───────────────────────────────────────────────────────────────────────

await deduplicateDevTo();
