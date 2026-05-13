#!/usr/bin/env node
/**
 * infrasketch CLI
 * https://infrasketch.cloud
 *
 * Usage:
 *   npx infrasketch .                      # scan current directory
 *   npx infrasketch main.tf                # single file
 *   npx infrasketch ./k8s/                 # directory (picks up .yaml/.yml/.tf)
 *   npx infrasketch https://raw.github…    # remote URL → embed with src=
 *   npx infrasketch --help
 *   npx infrasketch --version
 */

import { readFileSync, statSync, readdirSync, existsSync } from 'fs';
import { resolve, extname, basename, join } from 'path';
import { exec }  from 'child_process';
import { platform } from 'os';

/* ── Constants ──────────────────────────────────────────────────────────────── */

const VERSION       = '1.0.0';
const BASE_URL      = 'https://infrasketch.cloud';
const MAX_BYTES     = 150_000; // warn above this; URLs get unwieldy
const HARD_LIMIT    = 400_000; // browser URL length limit safety net

const IaC_EXTENSIONS = new Set(['.tf', '.tfvars', '.yaml', '.yml', '.json', '.ts', '.py', '.bicep', '.hcl']);

const FORMAT_LABELS = {
  terraform:      'Terraform / OpenTofu',
  terragrunt:     'Terragrunt',
  pulumi:         'Pulumi',
  kubernetes:     'Kubernetes',
  cloudformation: 'CloudFormation',
  cdk:            'CDK',
  bicep:          'Bicep / ARM',
  docker:         'Docker Compose',
};

/* ── Terminal colours (disable when not a TTY) ──────────────────────────────── */

const isTTY = process.stdout.isTTY;
const c = {
  green:  (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  cyan:   (s) => isTTY ? `\x1b[36m${s}\x1b[0m` : s,
  yellow: (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  red:    (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  bold:   (s) => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    (s) => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
};

/* ── URL encoding (matches browser main.js encodeState exactly) ─────────────── */

function encodeState(type, code) {
  try {
    const json = JSON.stringify({ type, code });
    // Mirror: btoa(unescape(encodeURIComponent(json)))
    // In Node: encode to percent-encoded string then base64 the UTF-8 bytes
    return Buffer.from(json, 'utf8').toString('base64');
  } catch (_) {
    return null;
  }
}

/* ── Format auto-detection (mirrors main.js detectFormat + filename heuristics) */

function detectFormat(filename, content) {
  const base = basename(filename).toLowerCase();
  const ext  = extname(filename).toLowerCase();

  // Extension / filename heuristics first (fast, reliable)
  if (ext === '.tf' || ext === '.tfvars')              return 'terraform';
  if (ext === '.bicep')                                 return 'bicep';
  if (base === 'terragrunt.hcl')                        return 'terragrunt';
  if (base.startsWith('docker-compose') || base === 'compose.yml' || base === 'compose.yaml') return 'docker';

  if (!content) return null;
  const t = content.trimStart();

  // Content heuristics (same order as main.js)
  if (t.startsWith('{') && /"planned_values"|"resource_changes"|"configuration"/.test(content)) return 'terraform';
  if (content.includes('AWSTemplateFormatVersion')) {
    if (t.startsWith('{') && /"Resources"\s*:/.test(content)) return 'cdk';
    return 'cloudformation';
  }
  if (t.startsWith('{') && /"Resources"\s*:/.test(content) && /"Type"\s*:\s*"AWS::/.test(content)) return 'cdk';
  if (t.startsWith('{') && /"resources"\s*:/.test(content) && /"type"\s*:\s*"Microsoft\./.test(content)) return 'bicep';
  if (/\bresource\s+\w+\s+'Microsoft\.[^@']+@/.test(content))  return 'bicep';
  if (/^apiVersion\s*:/m.test(content) && /^kind\s*:/m.test(content)) return 'kubernetes';
  if (content.includes('@pulumi/'))                             return 'pulumi';
  if (/\bimport pulumi\b|pulumi_aws|pulumi_gcp|pulumi_azure/.test(content)) return 'pulumi';
  if (/^services\s*:/m.test(content) && /image\s*:/.test(content)) return 'docker';
  if (/^dependency\s+"/m.test(content) && /terraform\s*\{/.test(content)) return 'terragrunt';
  if (/resource\s+"[a-z_]+"/.test(content) || /^terraform\s*\{/m.test(content) || /^provider\s+"/m.test(content)) return 'terraform';

  return null;
}

/* ── File collection ────────────────────────────────────────────────────────── */

// Files to skip inside directories
const SKIP_DIRS  = new Set(['node_modules', '.git', '.terraform', '__pycache__', '.venv', 'dist', 'build']);
const SKIP_FILES = new Set(['.terraform.lock.hcl']);

function collectFiles(dirPath, depth = 0) {
  if (depth > 4) return []; // don't recurse too deep
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files   = [];
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    if (SKIP_FILES.has(e.name)) continue;
    const full = join(dirPath, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      files.push(...collectFiles(full, depth + 1));
    } else if (IaC_EXTENSIONS.has(extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

/* ── Browser open ───────────────────────────────────────────────────────────── */

function openBrowser(url) {
  const p   = platform();
  const cmd = p === 'darwin' ? 'open' : p === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${cmd} "${url}"`, (err) => {
    if (err) {
      console.error(c.yellow('  Could not open browser automatically.'));
      console.error(c.dim('  Open manually: ') + url);
    }
  });
}

/* ── Help ───────────────────────────────────────────────────────────────────── */

function printHelp() {
  console.log(`
${c.bold('infrasketch')} — IaC diagram generator ${c.dim(`v${VERSION}`)}
${c.dim('https://infrasketch.cloud')}

${c.bold('USAGE')}
  ${c.cyan('infrasketch')} ${c.dim('<target>')}

${c.bold('TARGETS')}
  ${c.cyan('.')}                   Scan current directory for IaC files
  ${c.cyan('<file>')}              Single file  (.tf / .yaml / .yml / .json / .bicep …)
  ${c.cyan('<directory>')}         Scan directory recursively
  ${c.cyan('<https://…>')}         Remote URL — opens embed with src= (no upload)

${c.bold('OPTIONS')}
  ${c.cyan('--type')} <format>     Override auto-detection
                      terraform | kubernetes | cloudformation | cdk |
                      pulumi | docker | terragrunt | bicep
  ${c.cyan('--no-open')}           Print URL only, do not open browser
  ${c.cyan('--version')}           Print version
  ${c.cyan('--help')}              Print this help

${c.bold('EXAMPLES')}
  ${c.dim('# Visualise current Terraform project')}
  npx infrasketch .

  ${c.dim('# Single file')}
  npx infrasketch main.tf

  ${c.dim('# Kubernetes manifests in a folder')}
  npx infrasketch ./k8s/

  ${c.dim('# Remote GitHub raw URL (no upload, no credentials)')}
  npx infrasketch https://raw.githubusercontent.com/org/repo/main/main.tf

  ${c.dim('# CI — print URL without opening browser')}
  npx infrasketch main.tf --no-open
`);
}

/* ── Main ───────────────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  // Parse flags
  const noOpen     = args.includes('--no-open');
  const typeIdx    = args.indexOf('--type');
  const forceType  = typeIdx !== -1 ? args[typeIdx + 1] : null;

  // First non-flag arg is the target
  const target = args.find((a) => !a.startsWith('--') && a !== (forceType));
  if (!target) {
    console.error(c.red('Error: no target specified. Run infrasketch --help for usage.'));
    process.exit(1);
  }

  /* ── Remote URL mode ──────────────────────────────────────────────────────── */

  if (target.startsWith('http://') || target.startsWith('https://')) {
    // Open infrasketch.cloud?src=<url> — main.js fetches the file in-browser (nothing uploaded)
    const params = new URLSearchParams({ src: target });
    if (forceType) params.set('type', forceType);
    const openUrl = `${BASE_URL}/?${params.toString()}`;

    console.log();
    console.log(`  ${c.bold('infrasketch')} ${c.dim('·')} ${c.cyan('Remote URL')}`);
    console.log();
    console.log(`  ${c.green('✓')} Source   ${target}`);
    console.log(`  ${c.dim('ℹ')} File fetched by your browser — nothing uploaded to any server`);
    console.log(`  ${c.dim('Tip')}    Embed anywhere: ${c.cyan(`<infra-sketch src="${target}">`)}`);
    console.log();

    if (noOpen) {
      console.log(`  ${c.bold('Diagram URL:')}`);
      console.log(`  ${openUrl}`);
    } else {
      console.log(`  ${c.green('✓')} Opening in browser…`);
      openBrowser(openUrl);
    }

    console.log();
    return;
  }

  /* ── Local file / directory mode ─────────────────────────────────────────── */

  const absTarget = resolve(target);

  if (!existsSync(absTarget)) {
    console.error(c.red(`Error: "${target}" not found.`));
    process.exit(1);
  }

  const stat = statSync(absTarget);

  let files = [];
  if (stat.isDirectory()) {
    files = collectFiles(absTarget);
    if (files.length === 0) {
      console.error(c.yellow(`No IaC files found in "${target}".`));
      console.error(c.dim('  Supported: .tf .tfvars .yaml .yml .json .ts .py .bicep .hcl'));
      process.exit(1);
    }
  } else {
    files = [absTarget];
  }

  /* ── Read + detect ─────────────────────────────────────────────────────────── */

  let combinedCode = '';
  let detectedType = forceType || null;
  let totalLines   = 0;
  let totalBytes   = 0;

  for (const f of files) {
    let content;
    try {
      content = readFileSync(f, 'utf8');
    } catch (err) {
      console.error(c.yellow(`  Skipping ${f}: ${err.message}`));
      continue;
    }

    // Detect from first file that gives a result
    if (!detectedType) {
      detectedType = detectFormat(f, content);
    }

    // Separator between files when scanning a directory
    if (files.length > 1) {
      combinedCode += `\n# ── ${basename(f)} ────────────────────────────────────────\n`;
    }
    combinedCode += content;
    totalLines   += content.split('\n').length;
    totalBytes   += Buffer.byteLength(content, 'utf8');
  }

  if (!combinedCode.trim()) {
    console.error(c.red('Error: all files were empty or unreadable.'));
    process.exit(1);
  }

  if (!detectedType) detectedType = 'terraform'; // safe fallback

  /* ── Size check ─────────────────────────────────────────────────────────────── */

  const encodedBytes = Buffer.byteLength(
    encodeState(detectedType, combinedCode) || '',
    'utf8'
  );

  if (encodedBytes > HARD_LIMIT) {
    console.error(c.red('Error: combined file size is too large to encode in a URL.'));
    console.error(c.dim(`  Total: ${(totalBytes / 1024).toFixed(0)} KB — limit ~${(HARD_LIMIT / 1024).toFixed(0)} KB`));
    console.error(c.dim('  Tip: run on a specific file or subdirectory instead.'));
    process.exit(1);
  }

  /* ── Encode + open ─────────────────────────────────────────────────────────── */

  const hash = encodeState(detectedType, combinedCode);
  if (!hash) {
    console.error(c.red('Error: failed to encode state.'));
    process.exit(1);
  }

  const diagramUrl = `${BASE_URL}/#${hash}`;

  /* ── Pretty output ─────────────────────────────────────────────────────────── */

  const label     = FORMAT_LABELS[detectedType] || detectedType;
  const fileCount = files.length;
  const kb        = (totalBytes / 1024).toFixed(1);

  console.log();
  console.log(`  ${c.bold('infrasketch')} ${c.dim('·')} ${c.cyan(label)}`);
  console.log();
  console.log(`  ${c.green('✓')} Format   ${c.bold(label)}`);
  console.log(`  ${c.green('✓')} Files    ${fileCount} file${fileCount !== 1 ? 's' : ''}, ${totalLines.toLocaleString()} lines, ${kb} KB`);

  if (encodedBytes > MAX_BYTES) {
    console.log(`  ${c.yellow('⚠')} Large    URL is ${(encodedBytes / 1024).toFixed(0)} KB — some browsers may truncate it`);
  }

  console.log();

  if (noOpen) {
    console.log(`  ${c.bold('Diagram URL:')}`);
    console.log(`  ${diagramUrl}`);
  } else {
    console.log(`  ${c.green('✓')} Opening in browser…`);
    console.log(`  ${c.dim('URL:')} ${diagramUrl.slice(0, 90)}${diagramUrl.length > 90 ? c.dim('…') : ''}`);
    openBrowser(diagramUrl);
  }

  console.log();
}

main().catch((err) => {
  console.error(c.red('Unexpected error: ') + err.message);
  process.exit(1);
});
