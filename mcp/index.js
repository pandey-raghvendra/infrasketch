#!/usr/bin/env node
/**
 * infrasketch-mcp — MCP server for InfraSketch
 * https://infrasketch.cloud
 *
 * Exposes InfraSketch diagram generation as MCP tools so Claude Code,
 * Cursor, Windsurf, and any MCP client can generate architecture diagram
 * URLs inline — without leaving the editor.
 *
 * Setup in Claude Code (.claude/settings.json):
 *   {
 *     "mcpServers": {
 *       "infrasketch": {
 *         "command": "npx",
 *         "args": ["infrasketch-mcp"]
 *       }
 *     }
 *   }
 *
 * Tools exposed:
 *   generate_diagram  — IaC code → shareable diagram URL
 *   detect_iac_format — detect format from IaC code
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = 'https://infrasketch.cloud';
const VERSION  = '1.0.0';

/* ── URL encoding (mirrors main.js encodeState exactly) ─────────────────────── */

function encodeState(type, code) {
  const json = JSON.stringify({ type, code });
  return Buffer.from(json, 'utf8').toString('base64');
}

/* ── Format auto-detection (mirrors main.js detectFormat) ───────────────────── */

function detectFormat(code) {
  const t = code.trimStart();

  if (t.startsWith('{') && /"planned_values"|"resource_changes"|"configuration"/.test(code))
    return 'terraform';
  if (code.includes('AWSTemplateFormatVersion')) {
    if (t.startsWith('{') && /"Resources"\s*:/.test(code)) return 'cdk';
    return 'cloudformation';
  }
  if (t.startsWith('{') && /"Resources"\s*:/.test(code) && /"Type"\s*:\s*"AWS::/.test(code))
    return 'cdk';
  if (t.startsWith('{') && /"resources"\s*:/.test(code) && /"type"\s*:\s*"Microsoft\./.test(code))
    return 'bicep';
  if (/\bresource\s+\w+\s+'Microsoft\.[^@']+@/.test(code)) return 'bicep';
  if (/^apiVersion\s*:/m.test(code) && /^kind\s*:/m.test(code)) return 'kubernetes';
  if (code.includes('@pulumi/')) return 'pulumi';
  if (/\bimport pulumi\b|pulumi_aws|pulumi_gcp|pulumi_azure/.test(code)) return 'pulumi';
  if (/^services\s*:/m.test(code) && /image\s*:/.test(code)) return 'docker';
  if (/^dependency\s+"/m.test(code) && /terraform\s*\{/.test(code)) return 'terragrunt';
  if (/resource\s+"[a-z_]+"/.test(code) || /^terraform\s*\{/m.test(code) || /^provider\s+"/m.test(code))
    return 'terraform';
  return 'terraform'; // safe fallback
}

const FORMAT_LABELS = {
  terraform:      'Terraform / OpenTofu',
  terragrunt:     'Terragrunt',
  pulumi:         'Pulumi',
  kubernetes:     'Kubernetes',
  cloudformation: 'CloudFormation',
  cdk:            'AWS CDK',
  bicep:          'Bicep / ARM',
  docker:         'Docker Compose',
};

/* ── MCP Server ──────────────────────────────────────────────────────────────── */

const server = new McpServer({
  name:    'infrasketch',
  version: VERSION,
});

/* ── Tool: generate_diagram ──────────────────────────────────────────────────── */

server.tool(
  'generate_diagram',
  'Generate an InfraSketch architecture diagram URL from IaC code. ' +
  'Supports Terraform, OpenTofu, Kubernetes, Pulumi, CloudFormation, CDK, ' +
  'Bicep/ARM, Terragrunt, and Docker Compose. Returns a shareable URL that ' +
  'opens an interactive diagram in the browser — no upload, no credentials.',
  {
    code: z.string().describe(
      'The IaC source code to diagram. Paste the full content of one or more ' +
      '.tf, .yaml, .yml, .json, .ts, or .py files. For multi-file Terraform ' +
      'projects, concatenate the .tf files.'
    ),
    type: z.enum([
      'terraform', 'kubernetes', 'cloudformation', 'cdk',
      'pulumi', 'docker', 'terragrunt', 'bicep',
    ]).optional().describe(
      'IaC format. Auto-detected from code content if omitted.'
    ),
  },
  async ({ code, type }) => {
    if (!code || !code.trim()) {
      return {
        content: [{
          type: 'text',
          text: 'Error: no IaC code provided. Pass the content of your .tf, .yaml, or other IaC files.',
        }],
        isError: true,
      };
    }

    const detectedType = type || detectFormat(code.trim());
    const hash         = encodeState(detectedType, code);

    if (!hash) {
      return {
        content: [{ type: 'text', text: 'Error: failed to encode diagram state.' }],
        isError: true,
      };
    }

    const url        = `${BASE_URL}/#${hash}`;
    const embedUrl   = `${BASE_URL}/embed.html#${hash}`;
    const label      = FORMAT_LABELS[detectedType] || detectedType;
    const lines      = code.split('\n').length;
    const kb         = (Buffer.byteLength(code, 'utf8') / 1024).toFixed(1);
    const encodedKb  = (Buffer.byteLength(hash, 'utf8') / 1024).toFixed(1);

    const sizeWarning = encodedKb > 150
      ? `\n⚠️ Large diagram (${encodedKb} KB encoded) — some browsers may truncate. Consider splitting into smaller files.`
      : '';

    return {
      content: [{
        type: 'text',
        text: [
          `## InfraSketch Diagram`,
          ``,
          `**Format:** ${label}`,
          `**Size:** ${lines} lines · ${kb} KB`,
          ``,
          `### Interactive diagram`,
          `${url}`,
          ``,
          `### Embed (iframe)`,
          `\`\`\`html`,
          `<iframe`,
          `  src="${embedUrl}"`,
          `  width="100%"`,
          `  height="520"`,
          `  style="border:none;border-radius:8px"`,
          `  allowfullscreen`,
          `  title="InfraSketch Architecture Diagram"`,
          `></iframe>`,
          `\`\`\``,
          ``,
          `### Embed (web component)`,
          `\`\`\`html`,
          `<script src="https://infrasketch.cloud/embed.js"></script>`,
          `<infra-sketch type="${detectedType}" height="520">`,
          `  <!-- paste your IaC code here -->`,
          `</infra-sketch>`,
          `\`\`\``,
          sizeWarning,
        ].join('\n'),
      }],
    };
  }
);

/* ── Tool: detect_iac_format ─────────────────────────────────────────────────── */

server.tool(
  'detect_iac_format',
  'Detect the IaC format of a code snippet. Returns the format name and a ' +
  'confidence level. Useful before calling generate_diagram with an explicit type.',
  {
    code: z.string().describe('IaC source code to analyse.'),
  },
  async ({ code }) => {
    if (!code || !code.trim()) {
      return {
        content: [{ type: 'text', text: 'Error: no code provided.' }],
        isError: true,
      };
    }

    const detected = detectFormat(code.trim());
    const label    = FORMAT_LABELS[detected] || detected;

    // Rough confidence: if we matched a strong heuristic, high; fallback = low
    const highConfidence = [
      /^apiVersion\s*:/m.test(code) && /^kind\s*:/m.test(code),
      code.includes('AWSTemplateFormatVersion'),
      code.includes('@pulumi/'),
      /\bimport pulumi\b/.test(code),
      /^services\s*:/m.test(code) && /image\s*:/.test(code),
      /resource\s+"[a-z_]+"/.test(code),
      code.includes('schema.management.azure.com'),
      /\bresource\s+\w+\s+'Microsoft\./.test(code),
    ].some(Boolean);

    return {
      content: [{
        type: 'text',
        text: [
          `**Detected format:** ${label} (\`${detected}\`)`,
          `**Confidence:** ${highConfidence ? 'High' : 'Low (defaulted to Terraform)'}`,
          ``,
          `Supported formats: terraform · kubernetes · cloudformation · cdk · pulumi · docker · terragrunt · bicep`,
        ].join('\n'),
      }],
    };
  }
);

/* ── Start ───────────────────────────────────────────────────────────────────── */

const transport = new StdioServerTransport();
await server.connect(transport);
