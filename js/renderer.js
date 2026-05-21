import { ICON_PATHS, SVG_LAYOUT, SVG_NS, XLINK_NS } from './constants.js';
import { buildDiagramLayout } from './layout.js';

function setAttributes(element, attrs) {
    for (const [name, value] of Object.entries(attrs)) {
        if (value === undefined || value === null) continue;
        if (name === 'href') {
            element.setAttribute('href', value);
            element.setAttributeNS(XLINK_NS, 'xlink:href', value);
        } else {
            element.setAttribute(name, String(value));
        }
    }
}

function svgElement(name, attrs = {}, text = null) {
    const element = document.createElementNS(SVG_NS, name);
    setAttributes(element, attrs);
    if (text !== null) element.textContent = text;
    return element;
}

function clearElement(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
}

function append(parent, child) {
    parent.appendChild(child);
    return child;
}

function truncateLabel(label, maxLength = 16) {
    return label.length > maxLength ? `${label.slice(0, maxLength - 2)}..` : label;
}

function appendDefs(svg) {
    const defs = append(svg, svgElement('defs'));

    // ── Arrow markers ────────────────────────────────────────────────────────
    const marker = append(defs, svgElement('marker', {
        id: 'arr', markerWidth: 7, markerHeight: 5,
        refX: 6, refY: 2.5, orient: 'auto',
    }));
    append(marker, svgElement('polygon', { points: '0 0, 7 2.5, 0 5', fill: '#94a3b8' }));

    const secMarker = append(defs, svgElement('marker', {
        id: 'arr-sec', markerWidth: 7, markerHeight: 5,
        refX: 6, refY: 2.5, orient: 'auto',
    }));
    append(secMarker, svgElement('polygon', { points: '0 0, 7 2.5, 0 5', fill: '#8338ec', opacity: 0.8 }));

    const flowMarker = append(defs, svgElement('marker', {
        id: 'arr-flow', markerWidth: 7, markerHeight: 5,
        refX: 6, refY: 2.5, orient: 'auto',
    }));
    append(flowMarker, svgElement('polygon', { points: '0 0, 7 2.5, 0 5', fill: '#06d6a0' }));

    // ── Dot grid pattern ────────────────────────────────────────────────────
    const pattern = append(defs, svgElement('pattern', {
        id: 'is-dotgrid', width: 22, height: 22,
        patternUnits: 'userSpaceOnUse',
    }));
    append(pattern, svgElement('circle', { cx: 11, cy: 11, r: 0.9, fill: '#b0bac8', opacity: 0.6 }));

    // ── Drop shadow ─────────────────────────────────────────────────────────
    const filter = append(defs, svgElement('filter', {
        id: 'shadow', x: '-15%', y: '-15%', width: '130%', height: '140%',
    }));
    append(filter, svgElement('feDropShadow', { dx: 0, dy: 3, stdDeviation: 4, 'flood-opacity': 0.1 }));

    // ── Tracer glow ─────────────────────────────────────────────────────────
    const glow = append(defs, svgElement('filter', {
        id: 'tracer-glow', x: '-200%', y: '-200%', width: '500%', height: '500%',
    }));
    append(glow, svgElement('feGaussianBlur', { stdDeviation: 3, result: 'blur' }));
    const feMerge = append(glow, svgElement('feMerge'));
    append(feMerge, svgElement('feMergeNode', { in: 'blur' }));
    append(feMerge, svgElement('feMergeNode', { in: 'SourceGraphic' }));
}

// ── Zone badge: pill label with colored bg ────────────────────────────────────
function appendZoneBadge(layer, { x, y, fill, label }) {
    const pillW = label.length * 5.8 + 16;
    const pillH = 15;
    append(layer, svgElement('rect', {
        x, y: y - pillH + 4, width: pillW, height: pillH,
        rx: 3, fill, opacity: 0.18,
    }));
    append(layer, svgElement('text', {
        'font-family': 'DM Sans,sans-serif',
        'font-size': 9, 'font-weight': 700, 'letter-spacing': 0.8,
        fill, x: x + 8, y,
    }, label));
}

// ── Cubic-bezier connection paths — kills the ReactFlow L-shape ───────────────
function connectionPath(from, to, config) {
    const { NW, NH } = config;
    const fx = from.x + NW / 2;
    const fy = from.y + NH / 2;
    const tx = to.x + NW / 2;
    const ty = to.y + NH / 2;
    const vertDiff = ty - fy;

    // Near-horizontal: straight line
    if (Math.abs(vertDiff) < NH * 0.6) {
        const ex1 = fx < tx ? from.x + NW : from.x;
        const ex2 = tx > fx ? to.x : to.x + NW;
        return { d: `M${ex1},${fy} L${ex2},${ty}`, vertDiff };
    }

    // Downward cubic bezier
    if (vertDiff > 0) {
        const y1 = from.y + NH;
        const y2 = to.y;
        const mid = (y1 + y2) / 2;
        return { d: `M${fx},${y1} C${fx},${mid} ${tx},${mid} ${tx},${y2}`, vertDiff };
    }

    // Upward cubic bezier
    const y1 = from.y;
    const y2 = to.y + NH;
    const mid = (y1 + y2) / 2;
    return { d: `M${fx},${y1} C${fx},${mid} ${tx},${mid} ${tx},${y2}`, vertDiff };
}

function appendConnection(svg, conn, layout, connIndex) {
    const { positions, config, metrics } = layout;
    const from = positions[conn.from];
    const to = positions[conn.to];
    if (!from || !to || from.isSubnet || to.isSubnet) return;

    const { d, vertDiff } = connectionPath(from, to, config);
    const isSec = from.x >= metrics.secX || to.x >= metrics.secX;
    const isHoriz = Math.abs(vertDiff) < config.NH * 0.6;

    append(svg, svgElement('path', {
        id: `is-conn-${connIndex}`,
        d,
        'data-from': conn.from,
        'data-to': conn.to,
        class: 'diagram-connection',
        fill: 'none',
        stroke: isSec ? '#8338ec' : '#64748b',
        'stroke-width': 1.5,
        'stroke-dasharray': isSec ? '5 3' : (isHoriz ? '4 2' : 'none'),
        'marker-end': isSec ? 'url(#arr-sec)' : 'url(#arr)',
        opacity: isSec ? 0.65 : 0.45,
    }));
}

function appendResourceNode(svg, resource, position, config, nodeIndex = 0) {
    const group = append(svg, svgElement('g', {
        class: 'resource-node',
        'data-node-id': resource.id,
        filter: 'url(#shadow)',
    }));

    // Staggered entrance animation
    group.style.animationDelay = `${nodeIndex * 0.04}s`;

    // Card background
    append(group, svgElement('rect', {
        x: position.x, y: position.y,
        width: config.NW, height: config.NH,
        rx: 8, fill: 'white',
        stroke: resource.color, 'stroke-width': 1, 'stroke-opacity': 0.3,
    }));

    // Subtle color tint
    append(group, svgElement('rect', {
        x: position.x + 1, y: position.y + 1,
        width: config.NW - 2, height: config.NH - 2,
        rx: 7, fill: resource.color, opacity: 0.05,
    }));

    // Signature top accent bar
    append(group, svgElement('rect', {
        x: position.x + 8, y: position.y,
        width: config.NW - 16, height: 3,
        rx: 1.5, fill: resource.color,
    }));

    const iconPath = ICON_PATHS[resource.icon];
    if (iconPath) {
        const icon = append(group, svgElement('image', {
            href: iconPath,
            x: position.x + (config.NW - config.ICON_S) / 2,
            y: position.y + 7,
            width: config.ICON_S, height: config.ICON_S,
        }));
        icon.addEventListener('error', () => { icon.style.display = 'none'; });
    }

    append(group, svgElement('text', {
        x: position.x + config.NW / 2, y: position.y + 52,
        'text-anchor': 'middle',
        'font-family': 'DM Sans,sans-serif',
        'font-size': 10, 'font-weight': 700, fill: '#111827',
    }, resource.label));

    append(group, svgElement('text', {
        x: position.x + config.NW / 2, y: position.y + 63,
        'text-anchor': 'middle',
        'font-family': 'DM Mono,monospace',
        'font-size': 8, fill: '#6b7280',
    }, truncateLabel(resource.name)));
}

export function renderDiagram(parsed, svg) {
    if (!parsed.resources.length) return null;

    const layout = buildDiagramLayout(parsed, SVG_LAYOUT);
    const { config, groups, metrics, positions } = layout;

    clearElement(svg);
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('viewBox', `0 0 ${metrics.svgW} ${metrics.svgH}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', 'auto');
    svg.style.display = 'block';

    appendDefs(svg);

    const layer = append(svg, svgElement('g', { class: 'zoom-layer' }));

    // ── Canvas: base fill + dot grid ────────────────────────────────────────
    append(layer, svgElement('rect', {
        width: metrics.svgW, height: metrics.svgH, fill: '#edf0f7', rx: 8,
    }));
    append(layer, svgElement('rect', {
        width: metrics.svgW, height: metrics.svgH, fill: 'url(#is-dotgrid)', rx: 8,
    }));

    // ── INTERNET zone ────────────────────────────────────────────────────────
    if (groups.intRes.length) {
        const zoneY = config.CP - 8;
        const zoneH = metrics.intZoneH + 4;

        append(layer, svgElement('rect', {
            x: metrics.absX - 12, y: zoneY,
            width: metrics.mainW + 24, height: zoneH,
            rx: 10, fill: '#dde3ef',
            stroke: '#94a3b8', 'stroke-width': 1.5,
        }));
        // Left accent stripe
        append(layer, svgElement('rect', {
            x: metrics.absX - 12, y: zoneY,
            width: 4, height: zoneH,
            rx: 2, fill: '#64748b',
        }));
        appendZoneBadge(layer, { x: metrics.absX + 2, y: zoneY + 15, fill: '#475569', label: 'INTERNET' });
    }

    // ── VPC / VNet container ─────────────────────────────────────────────────
    if (metrics.hasVpc) {
        const vpc = groups.vpcRes[0];
        const isAzure = vpc.type === 'azurerm_virtual_network';
        const isGcp   = vpc.category === 'gcp_vpc';
        const borderColor  = isAzure ? '#0078D4' : isGcp ? '#1A73E8' : '#f59e0b';
        const headerFill   = isAzure ? '#e8f4ff' : isGcp ? '#e8f0fe' : '#fffbeb';
        const labelColor   = isAzure ? '#005A9E' : isGcp ? '#1557B0' : '#b45309';
        const containerLabel = isAzure ? `VNet — ${vpc.name}` : isGcp ? `VPC Network — ${vpc.name}` : `VPC — ${vpc.name}`;

        append(layer, svgElement('rect', {
            x: metrics.vpcX, y: metrics.vpcY,
            width: metrics.vpcBoxW, height: metrics.vpcBoxH,
            rx: 12, fill: 'white',
            stroke: borderColor, 'stroke-width': 2,
        }));
        append(layer, svgElement('rect', {
            x: metrics.vpcX, y: metrics.vpcY,
            width: metrics.vpcBoxW, height: config.VPC_LBL,
            rx: 12, fill: headerFill,
            stroke: borderColor, 'stroke-width': 2,
        }));
        append(layer, svgElement('rect', {
            x: metrics.vpcX, y: metrics.vpcY + config.VPC_LBL - 4,
            width: metrics.vpcBoxW, height: 4,
            fill: headerFill,
        }));
        // VPC left accent stripe
        append(layer, svgElement('rect', {
            x: metrics.vpcX, y: metrics.vpcY + 4,
            width: 4, height: metrics.vpcBoxH - 8,
            rx: 2, fill: borderColor, opacity: 0.6,
        }));
        append(layer, svgElement('text', {
            x: metrics.vpcX + 20, y: metrics.vpcY + 22,
            'font-family': 'DM Sans,sans-serif',
            'font-size': 11, 'font-weight': 700, fill: labelColor,
        }, containerLabel));
    }

    // ── Subnets ──────────────────────────────────────────────────────────────
    for (const subnet of groups.subnetRes) {
        const pos = positions[subnet.id];
        if (!pos) continue;

        const isPublic = /public/i.test(subnet.name);
        const subnetStroke = isPublic ? '#60a5fa' : '#93c5fd';
        const subnetFill   = isPublic ? '#eef5ff' : '#f0f7ff';

        append(layer, svgElement('rect', {
            x: pos.x, y: pos.y, width: pos.w, height: pos.h,
            rx: 8, fill: subnetFill,
            stroke: subnetStroke, 'stroke-width': 1.5, 'stroke-dasharray': '6 3',
        }));
        // Subnet type badge
        const badgeLabel = isPublic ? 'PUBLIC' : 'PRIVATE';
        const badgeColor = isPublic ? '#1d4ed8' : '#3b82f6';
        appendZoneBadge(layer, { x: pos.x + 8, y: pos.y + 16, fill: badgeColor, label: badgeLabel });
        append(layer, svgElement('text', {
            x: pos.x + 8 + (badgeLabel.length * 5.8 + 16) + 6,
            y: pos.y + 16,
            'font-family': 'DM Mono,monospace',
            'font-size': 8, fill: '#64748b',
        }, `— ${subnet.name}`));
    }

    // ── DATA zone ────────────────────────────────────────────────────────────
    if (groups.vpcDataRes.length && metrics.dataRowAbsY !== null) {
        const pad = 12;
        const zH = metrics.dataRowH + 20;

        append(layer, svgElement('rect', {
            x: metrics.dataRowAbsX - pad, y: metrics.dataRowAbsY - 8,
            width: metrics.dataRowW + pad * 2, height: zH,
            rx: 8, fill: '#e4f2fc',
            stroke: '#38bdf8', 'stroke-width': 1.5,
        }));
        append(layer, svgElement('rect', {
            x: metrics.dataRowAbsX - pad, y: metrics.dataRowAbsY - 8,
            width: 4, height: zH,
            rx: 2, fill: '#0ea5e9',
        }));
        appendZoneBadge(layer, { x: metrics.dataRowAbsX + 4, y: metrics.dataRowAbsY + 10, fill: '#0369a1', label: 'DATA' });
    }

    // ── MESSAGING zone ───────────────────────────────────────────────────────
    if (groups.msgRes.length) {
        const msgY = config.CP + metrics.mainH - metrics.msgZoneH;
        const zH = metrics.msgZoneH + 12;

        append(layer, svgElement('rect', {
            x: metrics.absX - 12, y: msgY - 4,
            width: metrics.mainW + 24, height: zH,
            rx: 8, fill: '#fef0ea',
            stroke: '#e07a5f', 'stroke-width': 1.5,
        }));
        append(layer, svgElement('rect', {
            x: metrics.absX - 12, y: msgY - 4,
            width: 4, height: zH,
            rx: 2, fill: '#e07a5f',
        }));
        appendZoneBadge(layer, { x: metrics.absX + 2, y: msgY + 13, fill: '#c2410c', label: 'MESSAGING' });
    }

    // ── SECURITY zone ────────────────────────────────────────────────────────
    if (groups.secRes.length) {
        const zH = metrics.secGridH + 52;

        append(layer, svgElement('rect', {
            x: metrics.secX - 12, y: metrics.secStartY - 28,
            width: config.NW + 24, height: zH,
            rx: 10, fill: '#f0ebff',
            stroke: '#8338ec', 'stroke-width': 2,
        }));
        append(layer, svgElement('rect', {
            x: metrics.secX - 12, y: metrics.secStartY - 28,
            width: 4, height: zH,
            rx: 2, fill: '#8338ec',
        }));
        appendZoneBadge(layer, {
            x: metrics.secX - 2, y: metrics.secStartY - 12,
            fill: '#6d28d9', label: 'SECURITY',
        });
    }

    // ── Connections (cubic bezier) ────────────────────────────────────────────
    let connIndex = 0;
    for (const conn of layout.connections) {
        appendConnection(layer, conn, layout, connIndex++);
    }

    // ── Resource nodes ────────────────────────────────────────────────────────
    let nodeIndex = 0;
    for (const resource of layout.resources) {
        const pos = positions[resource.id];
        if (!pos || pos.isSubnet) continue;
        appendResourceNode(layer, resource, pos, config, nodeIndex++);
    }

    return layout;
}
