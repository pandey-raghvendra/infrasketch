#!/usr/bin/env node
// Runs in Node 20+ (native fetch). No external dependencies.

import { readFileSync, existsSync } from 'fs';

const INFRASKETCH = 'https://infrasketch.cloud';
const MAX_FILE_BYTES = 200_000; // ~200 KB — larger files produce unwieldy URLs

const FORMAT_LABELS = {
  terraform:      'Terraform',
  terragrunt:     'Terragrunt',
  pulumi:         'Pulumi',
  kubernetes:     'Kubernetes',
  cloudformation: 'CloudFormation',
  cdk:            'CDK',
  bicep:          'Bicep / ARM',
  docker:         'Docker Compose',
};

function encodeState(type, code) {
  const json = JSON.stringify({ type, code });
  return Buffer.from(json, 'utf8').toString('base64');
}

function encodeDiffState(type, v1, v2) {
  const json = JSON.stringify({ type, v1, v2 });
  return Buffer.from(json, 'utf8').toString('base64');
}

function detectFormat(filename, content) {
  const base = filename.split('/').pop().toLowerCase();

  if (filename.endsWith('.tf') || filename.endsWith('.tfvars')) return 'terraform';
  if (filename.endsWith('.bicep')) return 'bicep';
  if (base === 'terragrunt.hcl') return 'terragrunt';
  if (base.startsWith('docker-compose') || base === 'compose.yml' || base === 'compose.yaml') return 'docker';

  if (!content) return null;

  if (content.includes('schema.management.azure.com') || content.includes('deploymentTemplate.json')) return 'bicep';

  if (content.includes('AWSTemplateFormatVersion') || content.includes('"AWSTemplateFormatVersion"')) {
    if (content.trimStart().startsWith('{') && content.includes('"Resources"')) return 'cdk';
    return 'cloudformation';
  }
  if (content.includes('import * as') && content.includes('@pulumi/')) return 'pulumi';
  if (content.includes('import pulumi') || content.includes('pulumi_aws') || content.includes('pulumi_gcp')) return 'pulumi';
  if ((content.includes('apiVersion:') || content.includes('"apiVersion"')) && content.includes('kind:')) return 'kubernetes';
  if (content.includes('resource "aws_') || content.includes('resource "azurerm_') || content.includes('resource "google_')) return 'terraform';

  return null;
}

// Extract named resource identifiers per format — best-effort, no full parser needed
function extractResources(type, content) {
  if (!content) return new Set();
  const ids = new Set();

  if (type === 'terraform' || type === 'terragrunt') {
    for (const m of content.matchAll(/^resource\s+"([^"]+)"\s+"([^"]+)"/gm))
      ids.add(`${m[1]}.${m[2]}`);
    for (const m of content.matchAll(/^module\s+"([^"]+)"/gm))
      ids.add(`module.${m[1]}`);
  } else if (type === 'cloudformation' || type === 'cdk') {
    // JSON: "LogicalId": { "Type": "AWS::..." }
    for (const m of content.matchAll(/"([A-Za-z0-9]+)"\s*:\s*\{\s*"Type"\s*:\s*"([^"]+)"/g))
      ids.add(`${m[2]} (${m[1]})`);
    // YAML: LogicalId:\n  Type: AWS::...
    for (const m of content.matchAll(/^([A-Za-z][A-Za-z0-9]*):\s*\n\s+Type:\s*(AWS::[^\s]+)/gm))
      ids.add(`${m[2]} (${m[1]})`);
  } else if (type === 'kubernetes') {
    for (const m of content.matchAll(/^kind:\s*(\S+)/gm)) {
      const kindMatch = m[1];
      const nameMatch = content.slice(m.index).match(/name:\s*(\S+)/);
      ids.add(nameMatch ? `${kindMatch}/${nameMatch[1]}` : kindMatch);
    }
  } else if (type === 'bicep') {
    for (const m of content.matchAll(/^resource\s+(\w+)\s+'([^']+)'/gm))
      ids.add(`${m[2]} (${m[1]})`);
  } else if (type === 'docker') {
    for (const m of content.matchAll(/^  ([a-zA-Z][a-zA-Z0-9_-]*):\s*$/gm))
      ids.add(`service: ${m[1]}`);
  } else if (type === 'pulumi') {
    for (const m of content.matchAll(/new\s+\w+\.([A-Z][A-Za-z]+)\s*\(\s*"([^"]+)"/g))
      ids.add(`${m[1]}/${m[2]}`);
  }

  return ids;
}

function diffSets(before, after) {
  const added   = [...after].filter(r => !before.has(r));
  const removed = [...before].filter(r => !after.has(r));
  const kept    = [...before].filter(r => after.has(r));
  return { added, removed, kept };
}

async function githubApi(path, method = 'GET', body = null) {
  const token = process.env.GITHUB_TOKEN;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(`https://api.github.com${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchBaseContent(repo, filename, baseSha) {
  try {
    const data = await githubApi(`/repos/${repo}/contents/${encodeURIComponent(filename)}?ref=${baseSha}`);
    if (data.encoding === 'base64' && data.content) {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }
  } catch {
    // file didn't exist at base — that's fine (newly added)
  }
  return null;
}

async function run() {
  const repo = process.env.REPO;
  const prNumber = process.env.PR_NUMBER;

  if (!prNumber || prNumber === 'undefined') {
    console.log('Not a pull request — skipping.');
    return;
  }

  // Fetch PR metadata for base SHA
  const pr = await githubApi(`/repos/${repo}/pulls/${prNumber}`);
  const baseSha = pr.base.sha;

  // Fetch changed files from GitHub API
  const files = await githubApi(`/repos/${repo}/pulls/${prNumber}/files?per_page=100`);

  const candidates = files.filter(f => f.status !== 'removed');

  const diagrams = [];
  const skipped = [];

  for (const file of candidates) {
    if (!existsSync(file.filename)) continue;

    const raw = readFileSync(file.filename);
    if (raw.byteLength > MAX_FILE_BYTES) {
      skipped.push({ filename: file.filename, reason: 'too large (>200 KB)' });
      continue;
    }

    const headContent = raw.toString('utf8');
    const type = detectFormat(file.filename, headContent);
    if (!type) continue;

    // For modified/renamed files, fetch base version for diff
    let baseContent = null;
    if (file.status === 'modified' || file.status === 'renamed') {
      const basePath = file.status === 'renamed' ? file.previous_filename : file.filename;
      baseContent = await fetchBaseContent(repo, basePath, baseSha);
    }

    const headResources = extractResources(type, headContent);
    const baseResources = extractResources(type, baseContent);
    const { added, removed } = diffSets(baseResources, headResources);

    let url;
    if (baseContent && (added.length > 0 || removed.length > 0)) {
      const hash = encodeDiffState(type, baseContent, headContent);
      url = `${INFRASKETCH}/#${hash}`;
    } else {
      const hash = encodeState(type, headContent);
      url = `${INFRASKETCH}/#${hash}`;
    }

    diagrams.push({
      filename: file.filename,
      type,
      url,
      status: file.status,
      added,
      removed,
      isDiff: baseContent != null && (added.length > 0 || removed.length > 0),
    });
  }

  if (diagrams.length === 0 && skipped.length === 0) {
    console.log('No IaC files detected in changed files — skipping comment.');
    return;
  }

  // Build comment markdown
  const lines = [
    `## 🗺️ InfraSketch — Infrastructure Changes`,
    ``,
  ];

  for (const d of diagrams) {
    const label = FORMAT_LABELS[d.type] || d.type;
    const statusIcon = d.status === 'added' ? '🆕 added' : d.status === 'modified' ? '✏️ modified' : '🔄 renamed';

    lines.push(`**\`${d.filename}\`** · ${label} · ${statusIcon}`);
    lines.push(``);

    if (d.isDiff && (d.added.length > 0 || d.removed.length > 0)) {
      if (d.added.length > 0) {
        for (const r of d.added.slice(0, 10))
          lines.push(`- ➕ \`${r}\``);
        if (d.added.length > 10)
          lines.push(`- ➕ _…and ${d.added.length - 10} more added_`);
      }
      if (d.removed.length > 0) {
        for (const r of d.removed.slice(0, 10))
          lines.push(`- ➖ \`${r}\``);
        if (d.removed.length > 10)
          lines.push(`- ➖ _…and ${d.removed.length - 10} more removed_`);
      }
      lines.push(``);
      lines.push(`[**🔍 View visual diff →**](${d.url})`);
    } else if (d.status === 'added') {
      lines.push(`[**🗺️ View diagram →**](${d.url})`);
    } else {
      lines.push(`[**🗺️ View diagram →**](${d.url})`);
    }

    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  if (skipped.length > 0) {
    for (const s of skipped)
      lines.push(`> ⚠️ \`${s.filename}\` skipped: ${s.reason}`);
    lines.push(``);
  }

  lines.push(`<sub>🔍 [InfraSketch](${INFRASKETCH}) — free browser-based architecture diagrams from Terraform, Bicep, Pulumi, Kubernetes, CloudFormation, CDK & Docker Compose. Nothing leaves your browser.</sub>`);
  lines.push(`<!-- infrasketch-action -->`);

  const body = lines.join('\n');

  // Find and update existing bot comment, or post new one
  const comments = await githubApi(`/repos/${repo}/issues/${prNumber}/comments?per_page=100`);
  const existing = comments.find(c =>
    c.body.includes('<!-- infrasketch-action -->') &&
    c.user.type === 'Bot'
  );

  if (existing) {
    await githubApi(`/repos/${repo}/issues/comments/${existing.id}`, 'PATCH', { body });
    console.log(`Updated existing diagram comment (${diagrams.length} file(s)).`);
  } else {
    await githubApi(`/repos/${repo}/issues/${prNumber}/comments`, 'POST', { body });
    console.log(`Posted new diagram comment (${diagrams.length} file(s)).`);
  }
}

run().catch(err => {
  console.error('infrasketch-action error:', err.message);
  process.exit(1);
});
