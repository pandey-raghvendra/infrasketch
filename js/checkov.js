/**
 * checkov.js — parse Checkov JSON output and apply security overlays on diagram nodes.
 *
 * Usage:
 *   const failures = parseCheckovJson(jsonText);  // Map<resourceId, Check[]>
 *   const count = applyCheckovOverlay(svgEl, failures);
 *   clearCheckovOverlay(svgEl);
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @typedef {{ checkId: string, checkName: string }} Check */

/**
 * Parse Checkov JSON (-o json output) into a Map of resourceId → Check[].
 * Supports standard output, array-wrapped output, and both terraform + k8s check types.
 * Returns null if JSON is invalid or not Checkov format.
 * @param {string} jsonText
 * @returns {Map<string, Check[]> | null}
 */
export function parseCheckovJson(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); } catch { return null; }

    // Checkov sometimes outputs an array when multiple check types run
    if (Array.isArray(data)) {
        const merged = new Map();
        let any = false;
        for (const chunk of data) {
            const m = _extractFromObject(chunk);
            if (m) { any = true; for (const [k, v] of m) { if (!merged.has(k)) merged.set(k, []); merged.get(k).push(...v); } }
        }
        return any ? merged : null;
    }

    return _extractFromObject(data);
}

function _extractFromObject(data) {
    if (!data || typeof data !== 'object') return null;

    let failed = [];
    if (Array.isArray(data?.results?.failed_checks)) {
        failed = data.results.failed_checks;
    } else if (Array.isArray(data?.failed_checks)) {
        failed = data.failed_checks;
    } else {
        return null;
    }

    const map = new Map();
    for (const check of failed) {
        const raw = check.resource || check.resource_address || '';
        const resourceId = _normalizeId(raw);
        if (!resourceId) continue;

        const checkId = check.check_id || '';
        const checkName = typeof check.check === 'string'
            ? check.check
            : (check.check?.name || check.short_description || check.check_id || 'Unknown check');

        if (!map.has(resourceId)) map.set(resourceId, []);
        // Deduplicate same check_id on same resource
        if (!map.get(resourceId).some(c => c.checkId === checkId)) {
            map.get(resourceId).push({ checkId, checkName });
        }
    }

    return map.size ? map : new Map();
}

/**
 * Normalize Checkov resource IDs to match InfraSketch node IDs.
 * Checkov: "aws_instance.web[0]" or "module.vpc.aws_subnet.private"
 * InfraSketch: "aws_instance.web" or "aws_subnet.private"
 */
function _normalizeId(raw) {
    if (!raw) return '';
    // Strip count/for_each index
    let id = raw.replace(/\[\d+\]$/, '').replace(/\["[^"]+"\]$/, '');
    // Strip module prefix: module.name.resource_type.resource_name → resource_type.resource_name
    const parts = id.split('.');
    if (parts.length >= 4 && parts[0] === 'module') {
        id = parts.slice(2).join('.');
    }
    return id;
}

/**
 * Apply red-border + badge overlays on SVG nodes that have Checkov failures.
 * Returns the number of matched resources.
 * @param {SVGElement} svgEl
 * @param {Map<string, Check[]>} failuresMap
 * @returns {number}
 */
export function applyCheckovOverlay(svgEl, failuresMap) {
    clearCheckovOverlay(svgEl);
    if (!svgEl || !failuresMap?.size) return 0;

    let matched = 0;
    const nodes = svgEl.querySelectorAll('[data-node-id]');

    for (const node of nodes) {
        const nodeId = node.getAttribute('data-node-id');
        const failures = failuresMap.get(nodeId);
        if (!failures?.length) continue;
        matched++;

        const rect = node.querySelector('rect');
        if (!rect) continue;

        const x  = parseFloat(rect.getAttribute('x'));
        const y  = parseFloat(rect.getAttribute('y'));
        const w  = parseFloat(rect.getAttribute('width'));
        const h  = parseFloat(rect.getAttribute('height'));
        const rx = parseFloat(rect.getAttribute('rx') || '8');

        // Red glow / border ring
        const border = document.createElementNS(SVG_NS, 'rect');
        border.setAttribute('x', x - 2);
        border.setAttribute('y', y - 2);
        border.setAttribute('width',  w + 4);
        border.setAttribute('height', h + 4);
        border.setAttribute('rx', rx + 1.5);
        border.setAttribute('fill', 'rgba(239,68,68,0.06)');
        border.setAttribute('stroke', '#ef4444');
        border.setAttribute('stroke-width', '2');
        border.setAttribute('pointer-events', 'none');
        border.classList.add('checkov-overlay');
        node.insertBefore(border, node.firstChild); // behind other elements

        // Badge circle (top-right)
        const count  = failures.length;
        const badgeR = 8;
        const bx = x + w - 1;
        const by = y + 1;

        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', bx);
        circle.setAttribute('cy', by);
        circle.setAttribute('r',  badgeR);
        circle.setAttribute('fill', '#ef4444');
        circle.setAttribute('pointer-events', 'none');
        circle.classList.add('checkov-overlay');
        node.appendChild(circle);

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', bx);
        label.setAttribute('y', by + 3.5);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-family', 'DM Mono,monospace');
        label.setAttribute('font-size', '9');
        label.setAttribute('font-weight', '700');
        label.setAttribute('fill', 'white');
        label.setAttribute('pointer-events', 'none');
        label.classList.add('checkov-overlay');
        label.textContent = count > 9 ? '9+' : String(count);
        node.appendChild(label);

        // SVG <title> for native hover tooltip
        const title = document.createElementNS(SVG_NS, 'title');
        title.classList.add('checkov-overlay');
        title.textContent = failures.map(f => `${f.checkId}: ${f.checkName}`).join('\n');
        node.appendChild(title);
    }

    return matched;
}

/** Remove all checkov overlay elements from an SVG. */
export function clearCheckovOverlay(svgEl) {
    if (!svgEl) return;
    svgEl.querySelectorAll('.checkov-overlay').forEach(el => el.remove());
}
