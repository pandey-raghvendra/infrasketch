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

const html = fs.readFileSync(filePath, 'utf8');

// ── metadata extraction ──────────────────────────────────────────────────────

function getMeta(name) {
  const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'));
  return m ? m[1] : '';
}

function getOgMeta(property) {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'));
  return m ? m[1] : '';
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
    // strip script/style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${strip(t)}\n\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${strip(t)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${strip(t)}\n\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `#### ${strip(t)}\n\n`)
    // bold / italic
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_, t) => `**${strip(t)}**`)
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_, t) => `**${strip(t)}**`)
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_, t) => `*${strip(t)}*`)
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_, t) => `*${strip(t)}*`)
    // kbd
    .replace(/<kbd[^>]*>([\s\S]*?)<\/kbd>/gi, (_, t) => `\`${strip(t)}\``)
    // code blocks (pre > code first)
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, t) => `\`\`\`\n${decodeHtmlEntities(t)}\n\`\`\`\n\n`)
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => `\`\`\`\n${decodeHtmlEntities(t)}\n\`\`\`\n\n`)
    // inline code
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => `\`${decodeHtmlEntities(t)}\``)
    // links
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${strip(text)}](${href})`)
    // lists
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => convertList(inner, '-') + '\n')
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => convertOrderedList(inner) + '\n')
    // cta-box div → blockquote
    .replace(/<div[^>]*class=["'][^"']*cta-box[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, (_, inner) => {
      const text = strip(inner).replace(/\n+/g, ' ').trim();
      return `> ${text}\n\n`;
    })
    // tables
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, convertTable)
    // paragraphs
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `${strip(t)}\n\n`)
    // line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // strip remaining tags
    .replace(/<[^>]+>/g, '')
    // decode entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&copy;/g, '©')
    // collapse excess blank lines
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

// ── build content ────────────────────────────────────────────────────────────

const title = getTitle();
const description = getMeta('description');
const canonical = getCanonical();
const publishedAt = getSchemaDate();
const tags = getTags();
const articleHtml = extractArticleHtml();
const markdown = htmlToMarkdown(articleHtml);

console.log(`\nPublishing: "${title}"`);
console.log(`Tags: ${tags.join(', ')}`);
console.log(`Canonical: ${canonical}`);
console.log(`Markdown length: ${markdown.length} chars\n`);

// ── dev.to ───────────────────────────────────────────────────────────────────

async function postToDevTo() {
  if (!DEVTO_API_KEY) {
    console.warn('DEVTO_API_KEY not set — skipping dev.to');
    return;
  }

  const body = {
    article: {
      title,
      body_markdown: markdown,
      published: true,
      description,
      canonical_url: canonical || undefined,
      tags: tags.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, '')).slice(0, 4),
    },
  };

  const res = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': DEVTO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (res.ok) {
    console.log(`✓ dev.to: ${data.url}`);
  } else {
    console.error(`✗ dev.to: ${res.status} — ${JSON.stringify(data)}`);
    process.exitCode = 1;
  }
}

// ── Hashnode ─────────────────────────────────────────────────────────────────

async function postToHashnode() {
  if (!HASHNODE_TOKEN || !HASHNODE_PUBLICATION_ID) {
    console.warn('HASHNODE_TOKEN or HASHNODE_PUBLICATION_ID not set — skipping Hashnode');
    return;
  }

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

  const res = await fetch('https://gql.hashnode.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: HASHNODE_TOKEN,
    },
    body: JSON.stringify({ query: mutation, variables: { input } }),
  });

  const data = await res.json();
  if (data.errors) {
    console.error(`✗ Hashnode: ${JSON.stringify(data.errors)}`);
    process.exitCode = 1;
  } else {
    const post = data.data?.publishPost?.post;
    console.log(`✓ Hashnode: ${post?.url}`);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

await postToDevTo();
await postToHashnode();
