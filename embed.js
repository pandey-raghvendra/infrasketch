/**
 * InfraSketch Embed Web Component
 * https://infrasketch.cloud
 *
 * Usage:
 *   <script src="https://infrasketch.cloud/embed.js"></script>
 *
 *   <!-- Load from URL (GitHub raw, Gist raw, any CORS-enabled URL) -->
 *   <infra-sketch src="https://raw.githubusercontent.com/org/repo/main/main.tf"></infra-sketch>
 *
 *   <!-- Inline code (auto-detects format) -->
 *   <infra-sketch type="terraform" height="500">
 *   resource "aws_s3_bucket" "example" {
 *     bucket = "my-bucket"
 *   }
 *   </infra-sketch>
 *
 * Attributes:
 *   src       URL to fetch IaC source (must have CORS headers)
 *   type      Format override: terraform | kubernetes | cloudformation | cdk |
 *             pulumi | docker | terragrunt | bicep  (auto-detected if omitted)
 *   height    iframe height in px (default: 480)
 *   width     iframe width  (default: 100%)
 *   theme     Reserved for future use
 */
(function () {
  'use strict';

  const BASE_URL = 'https://infrasketch.cloud';

  /* ── URL hash encoding (must match main.js encodeState) ─────────────────── */

  function encodeState(type, code) {
    try {
      return btoa(unescape(encodeURIComponent(JSON.stringify({ type, code }))));
    } catch (_) {
      return null;
    }
  }

  /* ── Format auto-detection (mirrors main.js detectFormat) ───────────────── */

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
    return 'terraform'; // sensible fallback
  }

  /* ── Shared CSS for internal states ─────────────────────────────────────── */

  function stateBox(height, content) {
    return `<div style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:${height}px;background:#0c0f1a;border-radius:8px;
      font-family:system-ui,-apple-system,sans-serif;font-size:13px;
      color:#7a7f99;gap:10px;padding:24px;text-align:center;
      box-sizing:border-box;">${content}</div>`;
  }

  /* ── Web Component ───────────────────────────────────────────────────────── */

  class InfraSketchElement extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'type', 'height', 'width'];
    }

    connectedCallback() {
      // defer so inline text-node children are parsed before we read textContent
      setTimeout(() => this._render(), 0);
    }

    attributeChangedCallback(_name, oldVal, newVal) {
      if (oldVal !== newVal && this._mounted) this._render();
    }

    /* ── Main render ───────────────────────────────────────────────────────── */

    async _render() {
      this._mounted = true;
      const src    = this.getAttribute('src');
      const height = parseInt(this.getAttribute('height'), 10) || 480;
      const width  = this.getAttribute('width') || '100%';

      this._showLoading(height);

      let code = '';
      let type = (this.getAttribute('type') || '').trim();

      if (src) {
        /* ── Fetch from URL ──────────────────────────────────────────────── */
        try {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
          code = await res.text();
        } catch (err) {
          this._showError(
            `Could not load <code style="color:#06d6a0">${this._safeEscape(src)}</code><br>
             <small style="opacity:.7">${this._safeEscape(err.message)}</small><br>
             <small style="opacity:.5;font-size:10px">Make sure the URL is publicly accessible and returns CORS headers.</small>`,
            height
          );
          return;
        }
      } else {
        /* ── Inline code from element text content ───────────────────────── */
        code = this.textContent.trim();
      }

      if (!code) {
        this._showError(
          `No IaC code found.<br>
           <small style="opacity:.7">Set a <code style="color:#06d6a0">src=</code> attribute<br>
           or put code between the tags.</small>`,
          height
        );
        return;
      }

      if (!type) type = detectFormat(code);

      const hash = encodeState(type, code);
      if (!hash) {
        this._showError('Failed to encode diagram — code may be too large.', height);
        return;
      }

      this._showIframe(`${BASE_URL}/embed.html#${hash}`, height, width);
    }

    /* ── DOM helpers ───────────────────────────────────────────────────────── */

    _showLoading(height) {
      this.innerHTML = stateBox(height, `
        <svg width="18" height="18" fill="none" stroke="#06d6a0" stroke-width="2.2"
             viewBox="0 0 24 24" style="animation:is-spin .9s linear infinite;flex-shrink:0">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <style>@keyframes is-spin{to{transform:rotate(360deg)}}</style>
        <span>Loading InfraSketch diagram&hellip;</span>
      `);
    }

    _showError(html, height) {
      this.innerHTML = stateBox(height, `
        <svg width="20" height="20" fill="none" stroke="#ef476f" stroke-width="2"
             viewBox="0 0 24 24" style="flex-shrink:0">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div style="color:#ef476f;line-height:1.6">${html}</div>
        <a href="${BASE_URL}" target="_blank" rel="noopener"
           style="color:#06d6a0;font-size:11px;text-decoration:none;margin-top:4px">
          Open InfraSketch ↗
        </a>
      `);
    }

    _showIframe(iframeSrc, height, width) {
      this.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.src = iframeSrc;
      iframe.setAttribute('width', width);
      iframe.setAttribute('height', String(height));
      iframe.style.cssText = 'border:none;border-radius:8px;display:block;max-width:100%;';
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('loading', 'lazy');
      iframe.title = 'InfraSketch Architecture Diagram';
      this._iframe = iframe;
      this.appendChild(iframe);
    }

    _safeEscape(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  /* ── Register ──────────────────────────────────────────────────────────── */

  if (!customElements.get('infra-sketch')) {
    customElements.define('infra-sketch', InfraSketchElement);
  }
})();
