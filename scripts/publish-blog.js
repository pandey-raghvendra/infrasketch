#!/usr/bin/env node
// Publishes a single blog HTML file to dev.to and Hashnode.
// Usage: node scripts/publish-blog.js blog/my-post.html

import fs from 'fs';
import path from 'path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/publish-blog.js <path-to-blog.html>');
  process.exit(1);
}

const DEVTO_API_KEY = process.env.DEVTO_API_KEY;
const HASHNODE_TOKEN = process.env.HASHNODE_TOKEN;
const HASHNODE_PUBLICATION_ID = process.env.HASHNODE_PUBLICATION_ID;

const RETRY_DELAY_MS = 30_000;
const MAX_RETRIES = 3;

const html = fs.readFileSync(filePath, 'utf8');

// ── metadata extraction ──────────────────────────────────────────────────────

function attrValue(tag, attr) {
  const m = tag.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
    || tag.match(new RegExp(`${attr}='([^']*)'`, 'i'));
  return m ? m[1] : null;
}

function getMeta(name) {
  const tags = [...html.matchAll(/<meta([^>]+)>/gi)].map(m => m[1]);
  for (const tag of tags) {
    const n = attrValue(tag, 'name');
    if (n && n.toLowerCase() === name.toLowerCase()) return attrValue(tag, 'content') ?? '';
  }
  return '';
}

function getOgMeta(property) {
  const tags = [...html.matchAll(/<meta([^>]+)>/gi)].map(m => m[1]);
  for (const tag of tags) {
    const p = attrValue(tag, 'property');
    if (p && p.toLowerCase() === property.toLowerCase()) return attrValue(tag, 'content') ?? '';
  }
  return '';
}

function getCanonical() {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return m ? m[1] : '';
}

function getSchemaDate() {
  const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  return m ? m[1] : new Date().toISOString().split('T')[0];
}

function getTitle() {
  const og = getOgMeta('og:title');
  if (og) return og.replace(/&amp;/g, '&');
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].replace(/&amp;/g, '&') : path.basename(filePath, '.html');
}

function getTags() {
  const keywords = getMeta('keywords');
  if (!keywords) return [];
  return keywords.split(',').map(t => t.trim()).filter(Boolean).slice(0, 4);
}

// ── HTML → Markdown conversion ───────────────────────────────────────────────

function extractArticleHtml() {
  const m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  return m ? m[1] : '';
}

function htmlToMarkdown(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${strip(t)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${strip(t)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${strip(t)}\n\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `#### ${strip(t)}\n\n`)
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, t) => `**${strip(t)}**`)
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_, t) => `**${strip(t)}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_, t) => `*${strip(t)}*`)
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_, t) => `*${strip(t)}*`)
    .replace(/<kbd[^>]*>([\s\S]*?)<\/kbd>/gi, (_, t) => `\`${strip(t)}\``)
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, t) => `\`\`\`\n${decodeHtmlEntities(t)}\n\`\`\`\n\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\`\`\`\n${decodeHtmlEntities(t)}\n\`\`\`\n\n`)
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${decodeHtmlEntities(t)}\``)
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${strip(text)}](${href})`)
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => convertList(inner, '-') + '\n')
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => convertOrderedList(inner) + '\n')
    .replace(/<div[^>]*class=["'][^"']*cta-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, (_, inner) => {
      const text = strip(inner).replace(/\n+/g, ' ').trim();
      return `> ${text}\n\n`;
    })
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, convertTable)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `${strip(t)}\n\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&copy;/g, '©')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function strip(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function convertList(inner, bullet) {
  const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  return items.map(([, t]) => `${bullet} ${strip(t)}`).join('\n');
}

function convertOrderedList(inner) {
  const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  return items.map(([, t], i) => `${i + 1}. ${strip(t)}`).join('\n');
}

function convertTable(_, inner) {
  const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(([, row]) => {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(([, c]) => strip(c));
    return '| ' + cells.join(' | ') + ' |';
  });
  if (rows.length === 0) return '';
  const sep = '| ' + rows[0].split('|').slice(1, -1).map(() => '---').join(' | ') + ' |';
  return [rows[0], sep, ...rows.slice(1)].join('\n') + '\n\n';
}

// ── retry helper ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, label) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10) * 1000 || RETRY_DELAY_MS;
    console.warn(`  ${label}: rate limited (429). Waiting ${retryAfter / 1000}s before retry ${attempt}/${MAX_RETRIES}...`);
    await sleep(retryAfter);
  }
  // final attempt after last sleep
  return fetch(url, options);
}

// ── build content ────────────────────────────────────────────────────────────

const title = getTitle();
const description = getMeta('description');
const canonical = getCanonical();
const publishedAt = getSchemaDate();
const tags = getTags();
const articleHtml = extractArticleHtml();
const markdown = htmlToMarkdown(articleHtml);

console.log(`\nProcessing: "${title}"`);
console.log(`Tags: ${tags.join(', ')}`);
console.log(`Canonical: ${canonical}\n`);

// ── dev.to ───────────────────────────────────────────────────────────────────

async function findDevToArticle() {
  let page = 1;
  while (true) {
    const res = await fetchWithRetry(
      `https://dev.to/api/articles/me/published?per_page=100&page=${page}`,
      { headers: { 'api-key': DEVTO_API_KEY } },
      'dev.to check'
    );
    if (!res.ok) return null;
    const articles = await res.json();
    if (articles.length === 0) return null;
    const match = articles.find(a =>
      (canonical && a.canonical_url === canonical) ||
      a.title.toLowerCase() === title.toLowerCase()
    );
    if (match) return match;
    if (articles.length < 100) return null;
    page++;
  }
}

async function postToDevTo() {
  if (!DEVTO_API_KEY) {
    console.warn('DEVTO_API_KEY not set — skipping dev.to');
    return;
  }

  const existing = await findDevToArticle();
  const articleBody = {
    article: {
      title,
      body_markdown: markdown,
      published: true,
      description,
      canonical_url: canonical || undefined,
      tags: tags.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, '')).slice(0, 4),
    },
  };

  const res = await fetchWithRetry(
    existing ? `https://dev.to/api/articles/${existing.id}` : 'https://dev.to/api/articles',
    {
      method: existing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': DEVTO_API_KEY },
      body: JSON.stringify(articleBody),
    },
    'dev.to publish'
  );

  const data = await res.json();
  if (res.ok) {
    console.log(`${existing ? '↺' : '✓'} dev.to (${existing ? 'updated' : 'created'}): ${data.url}`);
  } else {
    console.error(`✗ dev.to: ${res.status} — ${JSON.stringify(data)}`);
    process.exitCode = 1;
  }
}

// ── Hashnode ─────────────────────────────────────────────────────────────────

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

async function findHashnodePost() {
  const query = `
    query GetPosts($id: ObjectId!, $after: String) {
      publication(id: $id) {
        posts(first: 50, after: $after) {
          edges { node { id title url canonicalUrl } }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  let after = null;
  while (true) {
    const data = await gql(query, { id: HASHNODE_PUBLICATION_ID, after });
    const posts = data.data?.publication?.posts;
    if (!posts) return null;

    const match = posts.edges.find(({ node }) =>
      (canonical && node.canonicalUrl === canonical) ||
      node.title.toLowerCase() === title.toLowerCase()
    );
    if (match) return match.node;

    if (!posts.pageInfo.hasNextPage) return null;
    after = posts.pageInfo.endCursor;
  }
}

async function postToHashnode() {
  if (!HASHNODE_TOKEN || !HASHNODE_PUBLICATION_ID) {
    console.warn('HASHNODE_TOKEN or HASHNODE_PUBLICATION_ID not set — skipping Hashnode');
    return;
  }

  const existing = await findHashnodePost();

  if (existing) {
    const mutation = `
      mutation UpdatePost($input: UpdatePostInput!) {
        updatePost(input: $input) {
          post { id title url }
        }
      }
    `;
    const input = {
      id: existing.id,
      title,
      contentMarkdown: markdown,
      originalArticleURL: canonical || undefined,
      subtitle: description || undefined,
    };
    const data = await gql(mutation, { input });
    if (data.errors) {
      console.error(`✗ Hashnode: ${JSON.stringify(data.errors)}`);
      process.exitCode = 1;
    } else {
      console.log(`↺ Hashnode (updated): ${data.data?.updatePost?.post?.url}`);
    }
  } else {
    const mutation = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post { id title url }
        }
      }
    `;
    const input = {
      title,
      contentMarkdown: markdown,
      publicationId: HASHNODE_PUBLICATION_ID,
      tags: [],
      originalArticleURL: canonical || undefined,
      subtitle: description || undefined,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
    };
    const data = await gql(mutation, { input });
    if (data.errors) {
      console.error(`✗ Hashnode: ${JSON.stringify(data.errors)}`);
      process.exitCode = 1;
    } else {
      console.log(`✓ Hashnode (created): ${data.data?.publishPost?.post?.url}`);
    }
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

await postToDevTo();
await postToHashnode();
