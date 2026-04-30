#!/usr/bin/env node
// Runs in Node 20+ (native fetch). No external dependencies.

import { readFileSync, existsSync } from 'fs';

const INFRASKETCH = 'https://infrasketch.cloud';
const MAX_FILE_BYTES = 200_000; // ~200 KB — larger files produce unwieldy URLs

const FORMAT_LABELS = {
  terraform:      'Terraform',
  pulumi:         'Pulumi',
  kubernetes:     'Kubernetes',
  cloudformation: 'CloudFormation',
  cdk:            'CDK',
  docker:         'Docker Compose',
};

function encodeState(type, code) {
  const json = JSON.stringify({ type, code });
  return Buffer.from(json, 'utf8').toString('base64');
}

function detectFormat(filename, content) {
  const base = filename.split('/').pop().toLowerCase();

  if (filename.endsWith('.tf') || filename.endsWith('.tfvars')) return 'terraform';
  if (base.startsWith('docker-compose') || base === 'compose.yml' || base === 'compose.yaml') return 'docker';

  if (!content) return null;

  if (content.includes('AWSTemplateFormatVersion') || content.includes('"AWSTemplateFormatVersion"')) {
    // CDK synth JSON has Resources but no template-level description
    if (content.trimStart().startsWith('{') && content.includes('"Resources"')) return 'cdk';
    return 'cloudformation';
  }
  if (content.includes('import * as') && content.includes('@pulumi/')) return 'pulumi';
  if (content.includes('import pulumi') || content.includes('pulumi_aws') || content.includes('pulumi_gcp')) return 'pulumi';
  if ((content.includes('apiVersion:') || content.includes('"apiVersion"')) && content.includes('kind:')) return 'kubernetes';
  if (content.includes('resource "aws_') || content.includes('resource "azurerm_') || content.includes('resource "google_')) return 'terraform';

  return null;
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

async function run() {
  const repo = process.env.REPO;
  const prNumber = process.env.PR_NUMBER;

  if (!prNumber || prNumber === 'undefined') {
    console.log('Not a pull request — skipping.');
    return;
  }

  // Fetch changed files from GitHub API
  const files = await githubApi(`/repos/${repo}/pulls/${prNumber}/files?per_page=100`);

  // Filter: skip removed files, check if file exists in workspace
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

    const content = raw.toString('utf8');
    const type = detectFormat(file.filename, content);
    if (!type) continue;

    const hash = encodeState(type, content);
    const url = `${INFRASKETCH}/#${hash}`;
    diagrams.push({ filename: file.filename, type, url, status: file.status });
  }

  if (diagrams.length === 0 && skipped.length === 0) {
    console.log('No IaC files detected in changed files — skipping comment.');
    return;
  }

  // Build comment markdown
  const count = diagrams.length;
  const lines = [
    `## 🗺️ Architecture Diagrams`,
    ``,
    count > 0
      ? `InfraSketch found **${count} infrastructure file${count !== 1 ? 's' : ''}** in this PR:`
      : `InfraSketch detected infrastructure files but could not generate links:`,
    ``,
  ];

  for (const d of diagrams) {
    const icon = d.status === 'added' ? '🆕' : d.status === 'removed' ? '🗑️' : '✏️';
    const label = FORMAT_LABELS[d.type] || d.type;
    lines.push(`${icon} \`${d.filename}\` · ${label} · [**View diagram →**](${d.url})`);
  }

  for (const s of skipped) {
    lines.push(`⚠️ \`${s.filename}\` · skipped: ${s.reason}`);
  }

  lines.push(``);
  lines.push(`> [InfraSketch](${INFRASKETCH}) — paste Terraform, Pulumi, Kubernetes, CloudFormation, CDK, or Docker Compose · get instant architecture diagrams · free, no login.`);
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
