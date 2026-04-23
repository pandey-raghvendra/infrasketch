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

    const marker = append(defs, svgElement('marker', {
        id: 'arr',
        markerWidth: 8,
        markerHeight: 6,
        refX: 7,
        refY: 3,
        orient: 'auto',
    }));
    append(marker, svgElement('polygon', { points: '0 0, 8 3, 0 6', fill: '#374151' }));

    const secMarker = append(defs, svgElement('marker', {
        id: 'arr-sec',
        markerWidth: 8,
        markerHeight: 6,
        refX: 7,
        refY: 3,
        orient: 'auto',
    }));
    append(secMarker, svgElement('polygon', { points: '0 0, 8 3, 0 6', fill: '#8338ec', opacity: 0.8 }));

    const filter = append(defs, svgElement('filter', {
        id: 'shadow',
        x: '-10%',
        y: '-10%',
        width: '120%',
        height: '130%',
    }));
    append(filter, svgElement('feDropShadow', {
        dx: 0,
        dy: 2,
        stdDeviation: 3,
        'flood-opacity': 0.08,
    }));
}

function appendZoneLabel(svg, attrs, label) {
    append(svg, svgElement('text', {
        'font-family': 'DM Sans,sans-serif',
        'font-size': 9,
        'font-weight': 700,
        'letter-spacing': attrs.letterSpacing || 0.8,
        fill: attrs.fill,
        x: attrs.x,
        y: attrs.y,
    }, label));
}

function connectionPath(from, to, config) {
    const { NW, NH } = config;
    const fx = from.x + NW / 2;
    const fy = from.y + NH / 2;
    const tx = to.x + NW / 2;
    const ty = to.y + NH / 2;
    const vertDiff = ty - fy;

    if (Math.abs(vertDiff) < NH * 0.6) {
        const ex1 = fx < tx ? from.x + NW : from.x;
        const ex2 = tx > fx ? to.x : to.x + NW;
        return { d: `M${ex1},${fy} L${ex2},${ty}`, vertDiff };
    }

    if (vertDiff > 0) {
        const y1 = from.y + NH;
        const y2 = to.y;
        const midY = (y1 + y2) / 2;
        return { d: `M${fx},${y1} L${fx},${midY} L${tx},${midY} L${tx},${y2}`, vertDiff };
    }

    const y1 = from.y;
    const y2 = to.y + NH;
    const midY = (y1 + y2) / 2;
    return { d: `M${fx},${y1} L${fx},${midY} L${tx},${midY} L${tx},${y2}`, vertDiff };
}

function appendConnection(svg, conn, layout) {
    const { positions, config, metrics } = layout;
    const from = positions[conn.from];
    const to = positions[conn.to];
    if (!from || !to || from.isSubnet || to.isSubnet) return;

    const { d, vertDiff } = connectionPath(from, to, config);
    const isSec = from.x >= metrics.secX || to.x >= metrics.secX;

    append(svg, svgElement('path', {
        d,
        'data-from': conn.from,
        'data-to': conn.to,
        fill: 'none',
        stroke: isSec ? '#8338ec' : '#374151',
        'stroke-width': 1.5,
        'stroke-dasharray': isSec ? '5 3' : (Math.abs(vertDiff) < config.NH * 0.6 ? '4 2' : 'none'),
        'marker-end': isSec ? 'url(#arr-sec)' : 'url(#arr)',
        opacity: 0.65,
    }));
}

function appendResourceNode(svg, resource, position, config) {
    const group = append(svg, svgElement('g', { class: 'resource-node', 'data-node-id': resource.id, filter: 'url(#shadow)' }));

    append(group, svgElement('rect', {
        x: position.x,
        y: position.y,
        width: config.NW,
        height: config.NH,
        rx: 8,
        fill: 'white',
        stroke: resource.color,
        'stroke-width': 1.5,
    }));

    const iconPath = ICON_PATHS[resource.icon];
    if (iconPath) {
        const icon = append(group, svgElement('image', {
            href: iconPath,
            x: position.x + (config.NW - config.ICON_S) / 2,
            y: position.y + 5,
            width: config.ICON_S,
            height: config.ICON_S,
        }));
        icon.addEventListener('error', () => {
            icon.style.display = 'none';
        });
    }

    append(group, svgElement('text', {
        x: position.x + config.NW / 2,
        y: position.y + 50,
        'text-anchor': 'middle',
        'font-family': 'DM Sans,sans-serif',
        'font-size': 10,
        'font-weight': 700,
        fill: '#111827',
    }, resource.label));

    append(group, svgElement('text', {
        x: position.x + config.NW / 2,
        y: position.y + 63,
        'text-anchor': 'middle',
        'font-family': 'DM Mono,monospace',
        'font-size': 8,
        fill: '#6b7280',
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
    svg.setAttribute('height', metrics.svgH);
    svg.style.display = 'block';

    appendDefs(svg);

    const layer = append(svg, svgElement('g', { class: 'zoom-layer' }));

    append(layer, svgElement('rect', {
        width: metrics.svgW,
        height: metrics.svgH,
        fill: '#f0f2f7',
        rx: 8,
    }));

    if (groups.intRes.length) {
        const zoneY = config.CP - 8;
        append(layer, svgElement('rect', {
            x: metrics.absX - 12,
            y: zoneY,
            width: metrics.mainW + 24,
            height: metrics.intZoneH + 4,
            rx: 8,
            fill: '#e8edf5',
            stroke: '#94a3b8',
            'stroke-width': 1,
            'stroke-dasharray': '5 3',
            opacity: 0.85,
        }));
        appendZoneLabel(layer, { x: metrics.absX + 6, y: zoneY + 15, fill: '#64748b' }, 'INTERNET');
    }

    if (metrics.hasVpc) {
        const vpc = groups.vpcRes[0];
        const isAzure = vpc.type === 'azurerm_virtual_network';
        const borderColor = isAzure ? '#0078D4' : '#f59e0b';
        const headerFill = isAzure ? '#e8f4ff' : '#fffbeb';
        const labelColor = isAzure ? '#005A9E' : '#b45309';
        const containerLabel = isAzure ? `VNet — ${vpc.name}` : `VPC — ${vpc.name}`;

        append(layer, svgElement('rect', {
            x: metrics.vpcX,
            y: metrics.vpcY,
            width: metrics.vpcBoxW,
            height: metrics.vpcBoxH,
            rx: 12,
            fill: 'white',
            stroke: borderColor,
            'stroke-width': 2,
        }));
        append(layer, svgElement('rect', {
            x: metrics.vpcX,
            y: metrics.vpcY,
            width: metrics.vpcBoxW,
            height: config.VPC_LBL,
            rx: 12,
            fill: headerFill,
            stroke: borderColor,
            'stroke-width': 2,
        }));
        append(layer, svgElement('rect', {
            x: metrics.vpcX,
            y: metrics.vpcY + config.VPC_LBL - 4,
            width: metrics.vpcBoxW,
            height: 4,
            fill: headerFill,
        }));
        append(layer, svgElement('text', {
            x: metrics.vpcX + 14,
            y: metrics.vpcY + 22,
            'font-family': 'DM Sans,sans-serif',
            'font-size': 11,
            'font-weight': 700,
            fill: labelColor,
        }, containerLabel));
    }

    for (const subnet of groups.subnetRes) {
        const pos = positions[subnet.id];
        if (!pos) continue;

        append(layer, svgElement('rect', {
            x: pos.x,
            y: pos.y,
            width: pos.w,
            height: pos.h,
            rx: 8,
            fill: '#f0f7ff',
            stroke: '#93c5fd',
            'stroke-width': 1.5,
            'stroke-dasharray': '5 3',
        }));
        append(layer, svgElement('text', {
            x: pos.x + 8,
            y: pos.y + 17,
            'font-family': 'DM Sans,sans-serif',
            'font-size': 9,
            'font-weight': 600,
            fill: '#2563eb',
        }, `subnet - ${subnet.name}`));
    }

    if (groups.msgRes.length) {
        const msgY = config.CP + metrics.mainH - metrics.msgZoneH;
        append(layer, svgElement('rect', {
            x: metrics.absX - 12,
            y: msgY - 4,
            width: metrics.mainW + 24,
            height: metrics.msgZoneH + 12,
            rx: 8,
            fill: '#fff5f0',
            stroke: '#e07a5f',
            'stroke-width': 1,
            'stroke-dasharray': '5 3',
            opacity: 0.85,
        }));
        appendZoneLabel(layer, { x: metrics.absX + 6, y: msgY + 12, fill: '#e07a5f' }, 'MESSAGING');
    }

    if (groups.secRes.length) {
        append(layer, svgElement('rect', {
            x: metrics.secX - 12,
            y: metrics.secStartY - 28,
            width: config.NW + 24,
            height: metrics.secGridH + 52,
            rx: 8,
            fill: '#f5f0ff',
            stroke: '#8338ec',
            'stroke-width': 1.5,
            'stroke-dasharray': '5 3',
        }));
        appendZoneLabel(layer, {
            x: metrics.secX,
            y: metrics.secStartY - 12,
            fill: '#8338ec',
            letterSpacing: 0.5,
        }, 'SECURITY');
    }

    for (const conn of layout.connections) {
        appendConnection(layer, conn, layout);
    }

    for (const resource of layout.resources) {
        const pos = positions[resource.id];
        if (!pos || pos.isSubnet) continue;
        appendResourceNode(layer, resource, pos, config);
    }

    return layout;
}
