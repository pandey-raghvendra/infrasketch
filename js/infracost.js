/**
 * infracost.js — parse Infracost JSON output and apply cost overlays on diagram nodes.
 *
 * Usage:
 *   const costs = parseInfracostJson(jsonText);  // Map<resourceId, CostInfo>
 *   const count = applyInfracostOverlay(svgEl, costs);
 *   clearInfracostOverlay(svgEl);
 *
 * Generate input with:
 *   infracost breakdown --path . --format json > infracost.json
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @typedef {{ monthlyCost: number|null, hourlyCost: number|null, label: string, components: string[] }} CostInfo */

/**
 * Parse Infracost JSON breakdown output into a Map of resourceId → CostInfo.
 * Returns null if JSON is invalid or not Infracost format.
 * @param {string} jsonText
 * @returns {Map<string, CostInfo> | null}
 */
export function parseInfracostJson(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); } catch { return null; }
    if (!data || typeof data !== 'object') return null;

    // Must have projects array
    if (!Array.isArray(data.projects)) return null;

    const map = new Map();

    for (const project of data.projects) {
        const resources = project?.breakdown?.resources ?? [];
        for (const r of resources) {
            const name = r.name;
            if (!name) continue;

            const monthly = r.monthlyCost != null ? parseFloat(r.monthlyCost) : null;
            const hourly  = r.hourlyCost  != null ? parseFloat(r.hourlyCost)  : null;

            // Build components summary for tooltip
            const components = (r.costComponents || []).map(c =>
                `${c.name}: $${parseFloat(c.monthlyCost || 0).toFixed(2)}/mo`
            );

            // Sub-resources (e.g. attached EBS volumes)
            for (const sub of r.subresources || []) {
                const subMonthly = sub.monthlyCost != null ? parseFloat(sub.monthlyCost) : null;
                if (subMonthly) components.push(`${sub.name}: $${subMonthly.toFixed(2)}/mo`);
            }

            map.set(name, {
                monthlyCost: monthly,
                hourlyCost: hourly,
                label: _formatCost(monthly),
                components,
            });
        }
    }

    return map.size ? map : new Map();
}

/** Format monthly cost into a short badge label */
function _formatCost(monthly) {
    if (monthly == null) return 'Free';
    if (monthly === 0)   return 'Free';
    if (monthly < 1)     return `<$1/mo`;
    if (monthly < 1000)  return `$${Math.round(monthly)}/mo`;
    return `$${(monthly / 1000).toFixed(1)}k/mo`;
}

/** Color tier based on monthly cost */
function _costColor(monthly) {
    if (monthly == null || monthly === 0) return '#6b7280'; // grey — free
    if (monthly < 10)   return '#10b981'; // green  — cheap
    if (monthly < 100)  return '#f59e0b'; // amber  — moderate
    if (monthly < 500)  return '#f97316'; // orange — expensive
    return '#ef4444';                     // red    — very expensive
}

/**
 * Apply cost badge overlays on SVG nodes that appear in costsMap.
 * Badge sits bottom-centre of the node.
 * Returns count of matched resources.
 * @param {SVGElement} svgEl
 * @param {Map<string, CostInfo>} costsMap
 * @returns {number}
 */
export function applyInfracostOverlay(svgEl, costsMap) {
    clearInfracostOverlay(svgEl);
    if (!svgEl || !costsMap?.size) return 0;

    let matched = 0;
    const nodes = svgEl.querySelectorAll('[data-node-id]');

    for (const node of nodes) {
        const nodeId   = node.getAttribute('data-node-id');
        const costInfo = costsMap.get(nodeId);
        if (!costInfo) continue;
        matched++;

        const rect = node.querySelector('rect');
        if (!rect) continue;

        const x = parseFloat(rect.getAttribute('x'));
        const y = parseFloat(rect.getAttribute('y'));
        const w = parseFloat(rect.getAttribute('width'));
        const h = parseFloat(rect.getAttribute('height'));

        const color  = _costColor(costInfo.monthlyCost);
        const label  = costInfo.label;
        const isFree = costInfo.monthlyCost == null || costInfo.monthlyCost === 0;

        // Pill background — bottom-centre of node
        const pillH  = 14;
        const pillW  = Math.max(label.length * 6.5 + 10, 36);
        const pillX  = x + (w - pillW) / 2;
        const pillY  = y + h - pillH / 2;

        const pill = document.createElementNS(SVG_NS, 'rect');
        pill.setAttribute('x', pillX);
        pill.setAttribute('y', pillY);
        pill.setAttribute('width',  pillW);
        pill.setAttribute('height', pillH);
        pill.setAttribute('rx', pillH / 2);
        pill.setAttribute('fill',   isFree ? 'rgba(107,114,128,0.15)' : `${color}22`);
        pill.setAttribute('stroke', color);
        pill.setAttribute('stroke-width', '1');
        pill.setAttribute('pointer-events', 'none');
        pill.classList.add('infracost-overlay');
        node.appendChild(pill);

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', pillX + pillW / 2);
        text.setAttribute('y', pillY + 10);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-family', 'DM Mono,monospace');
        text.setAttribute('font-size',   '8');
        text.setAttribute('font-weight', '700');
        text.setAttribute('fill', color);
        text.setAttribute('pointer-events', 'none');
        text.classList.add('infracost-overlay');
        text.textContent = label;
        node.appendChild(text);

        // Tooltip
        if (costInfo.components.length) {
            const title = document.createElementNS(SVG_NS, 'title');
            title.classList.add('infracost-overlay');
            title.textContent = `${nodeId}\n${costInfo.components.join('\n')}`;
            node.appendChild(title);
        }
    }

    return matched;
}

/** Remove all infracost overlay elements from an SVG. */
export function clearInfracostOverlay(svgEl) {
    if (!svgEl) return;
    svgEl.querySelectorAll('.infracost-overlay').forEach(el => el.remove());
}
