import { XLINK_NS } from './constants.js';

// Map icon filename stem → exporters.js DRAWIO_SHAPES key
const ICON_SHAPE_MAP = {
    ec2: 'instance', eks: 'eks', ecs: 'ecs', lambda: 'lambda',
    autoscaling: 'autoscaling', ecr: 'ecr', igw: 'igw', nat: 'nat',
    eip: 'eip', rds: 'rds', dynamodb: 'dynamodb', elasticache: 'elasticache',
    s3: 's3', alb: 'alb', nlb: 'nlb', tg: 'tg', sg: 'sg',
    iam: 'iam_role', kms: 'kms', waf: 'waf', cloudfront: 'cloudfront',
    route53: 'route53', sqs: 'sqs', sns: 'sns', cloudwatch: 'cloudwatch',
    'az-vm': 'az_vm', 'az-vmss': 'az_vmss', 'az-aks': 'az_aks',
    'az-aci': 'az_aci', 'az-function': 'az_function', 'az-appservice': 'az_appservice',
    'az-appgw': 'az_appgw', 'az-lb': 'az_lb', 'az-frontdoor': 'az_frontdoor',
    'az-trafficmgr': 'az_trafficmgr', 'az-sql': 'az_sql', 'az-cosmos': 'az_cosmos',
    'az-postgres': 'az_postgres', 'az-redis': 'az_redis', 'az-storage': 'az_storage',
    'az-nsg': 'az_nsg', 'az-keyvault': 'az_keyvault', 'az-servicebus': 'az_servicebus',
    'az-eventhub': 'az_eventhub', 'az-dns': 'az_dns', 'az-monitor': 'az_monitor',
    'az-appinsights': 'az_appinsights',
};

// Mirrors exporters.js DRAWIO_SHAPES (kept local to avoid coupling)
const DRAWIO_SHAPES = {
    vpc:    'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc_alt;grStroke=0;strokeColor=#147EBA;fillColor=#E6F3FB;fontStyle=1;fontSize=13;verticalLabelPosition=top;verticalAlign=bottom;',
    subnet: 'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;grStroke=0;strokeColor=#48C0B0;fillColor=#E6F9F7;fontStyle=1;fontSize=11;verticalLabelPosition=top;verticalAlign=bottom;',
    az_vnet:   'shape=mxgraph.azure2.virtual_networks;grStroke=0;strokeColor=#0078D4;fillColor=#E8F4FF;fontStyle=1;fontSize=13;verticalLabelPosition=top;verticalAlign=bottom;',
    az_subnet: 'shape=mxgraph.azure2.subnets;grStroke=0;strokeColor=#0072C6;fillColor=#EDF4FF;fontStyle=1;fontSize=11;verticalLabelPosition=top;verticalAlign=bottom;',
    instance:    'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;',
    eks:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.eks;',
    ecs:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs;',
    lambda:      'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;',
    autoscaling: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.auto_scaling;',
    ecr:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecr;',
    rds:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;',
    dynamodb:    'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;',
    elasticache: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elasticache;',
    s3:          'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;',
    alb:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.application_load_balancer;',
    nlb:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.network_load_balancer;',
    tg:          'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elb;',
    sg:          'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.security_group;',
    iam_role:    'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.role;',
    route53:     'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;',
    cloudfront:  'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;',
    sqs:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;',
    sns:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns;',
    nat:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.nat_gateway;',
    igw:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.internet_gateway;',
    eip:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elastic_ip_address;',
    kms:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.kms;',
    cloudwatch:  'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudwatch;',
    waf:         'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.waf;',
    az_vm:         'shape=mxgraph.azure2.virtual_machine;',
    az_vmss:       'shape=mxgraph.azure2.vm_scale_sets;',
    az_aks:        'shape=mxgraph.azure2.aks_kubernetes_service;',
    az_aci:        'shape=mxgraph.azure2.container_instances;',
    az_function:   'shape=mxgraph.azure2.azure_functions;',
    az_appservice: 'shape=mxgraph.azure2.app_services;',
    az_appgw:      'shape=mxgraph.azure2.application_gateways;',
    az_lb:         'shape=mxgraph.azure2.load_balancers;',
    az_frontdoor:  'shape=mxgraph.azure2.azure_front_door;',
    az_trafficmgr: 'shape=mxgraph.azure2.traffic_manager_profiles;',
    az_sql:        'shape=mxgraph.azure2.sql_database;',
    az_cosmos:     'shape=mxgraph.azure2.azure_cosmos_db;',
    az_postgres:   'shape=mxgraph.azure2.azure_database_for_postgresql;',
    az_redis:      'shape=mxgraph.azure2.cache_for_redis;',
    az_storage:    'shape=mxgraph.azure2.storage_accounts;',
    az_nsg:        'shape=mxgraph.azure2.network_security_groups;',
    az_keyvault:   'shape=mxgraph.azure2.key_vaults;',
    az_servicebus: 'shape=mxgraph.azure2.service_bus;',
    az_eventhub:   'shape=mxgraph.azure2.event_hubs;',
    az_dns:        'shape=mxgraph.azure2.dns;',
    az_monitor:    'shape=mxgraph.azure2.monitor;',
    az_appinsights:'shape=mxgraph.azure2.application_insights;',
};

const NODE_SUFFIX   = 'labelBackgroundColor=#ffffff;fontStyle=1;fontSize=11;';
const FALLBACK_NODE = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;fontSize=11;';
const EDGE_STYLE    = 'edgeStyle=orthogonalEdgeStyle;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';

const SKIP_TAGS = new Set(['defs', 'marker', 'filter', 'style', 'script', 'title', 'desc']);

function xmlEscape(v) {
    return String(v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function imageHref(el) {
    return el.getAttribute('href') || el.getAttributeNS(XLINK_NS, 'href') || '';
}

// Resolve icon href → draw.io shape style, or null if unknown
function iconStyle(href) {
    if (!href) return null;
    const stem = href.split('/').pop().replace(/\.(svg|png|jpg)$/i, '').toLowerCase();
    const key = ICON_SHAPE_MAP[stem];
    return key && DRAWIO_SHAPES[key] ? DRAWIO_SHAPES[key] + NODE_SUFFIX : null;
}

// Fallback style for unrecognised <image> hrefs
function fallbackImageStyle(href) {
    if (href.startsWith('data:')) {
        // Already a data URI — embed directly as an image shape
        return `shape=image;image=${href};whiteSpace=wrap;html=1;`;
    }
    // External / relative path we cannot embed client-side → generic box
    return FALLBACK_NODE;
}

function parseTranslate(el) {
    const t = el.getAttribute('transform') || '';
    const m = t.match(/translate\(\s*(-?[\d.]+)[,\s]+(-?[\d.]+)\s*\)/);
    return m ? { dx: parseFloat(m[1]), dy: parseFloat(m[2]) } : { dx: 0, dy: 0 };
}

function fAttr(el, name, fallback = 0) {
    return parseFloat(el.getAttribute(name) ?? fallback) || fallback;
}

export function svgToDrawio(svgString) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svg = doc.documentElement;

    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const canvasW = (vb[2] > 0 ? vb[2] : fAttr(svg, 'width', 1200));
    const canvasH = (vb[3] > 0 ? vb[3] : fAttr(svg, 'height', 800));

    const cells = [];
    let seq = 10;
    let eseq = 900;
    const nextId  = () => `c${seq++}`;
    const nextEId = () => `e${eseq++}`;

    // ── Element handlers ──────────────────────────────────────────────────────

    function handleResourceNode(g, ox, oy) {
        const rect  = g.querySelector('rect');
        const img   = g.querySelector('image');
        const texts = [...g.querySelectorAll('text')];
        if (!rect) return;

        const x = fAttr(rect, 'x') + ox;
        const y = fAttr(rect, 'y') + oy;
        const w = fAttr(rect, 'width', 80);
        const h = fAttr(rect, 'height', 70);
        const label    = texts[0]?.textContent?.trim() || '';
        const sublabel = texts[1]?.textContent?.trim() || '';
        const value    = sublabel ? `${label}\n${sublabel}` : label;
        const href     = img ? imageHref(img) : '';
        const style    = iconStyle(href) || fallbackImageStyle(href) || FALLBACK_NODE;

        cells.push({ id: nextId(), value, style, vertex: true, x, y, w, h });
    }

    function handleRect(el, ox, oy) {
        const x = fAttr(el, 'x') + ox;
        const y = fAttr(el, 'y') + oy;
        const w = fAttr(el, 'width');
        const h = fAttr(el, 'height');
        if (w < 4 || h < 4) return;
        // Skip full-canvas background rects
        if (w >= canvasW * 0.95 && h >= canvasH * 0.95) return;

        const fill   = el.getAttribute('fill')   || '#ffffff';
        const stroke = el.getAttribute('stroke') || '#aaaaaa';
        const rx     = fAttr(el, 'rx', 0);
        const arcPct = rx ? Math.round((rx / Math.min(w, h)) * 100) : 0;
        const style  = `rounded=${arcPct > 0 ? 1 : 0};arcSize=${arcPct};whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};`;
        cells.push({ id: nextId(), value: '', style, vertex: true, x, y, w, h });
    }

    function handleCircle(el, ox, oy) {
        const cx = fAttr(el, 'cx') + ox;
        const cy = fAttr(el, 'cy') + oy;
        const r  = fAttr(el, 'r');
        const fill   = el.getAttribute('fill')   || '#ffffff';
        const stroke = el.getAttribute('stroke') || '#aaaaaa';
        cells.push({
            id: nextId(), value: '', vertex: true,
            style: `ellipse;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};`,
            x: cx - r, y: cy - r, w: r * 2, h: r * 2,
        });
    }

    function handleEllipse(el, ox, oy) {
        const cx = fAttr(el, 'cx') + ox;
        const cy = fAttr(el, 'cy') + oy;
        const rx = fAttr(el, 'rx');
        const ry = fAttr(el, 'ry');
        cells.push({
            id: nextId(), value: '', vertex: true,
            style: 'ellipse;whiteSpace=wrap;html=1;',
            x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2,
        });
    }

    function handleText(el, ox, oy) {
        const text = el.textContent?.trim();
        if (!text) return;
        const x    = fAttr(el, 'x') + ox;
        const y    = fAttr(el, 'y') + oy;
        const fs   = fAttr(el, 'font-size', 12);
        const fill = el.getAttribute('fill') || '#000000';
        const approxW = Math.max(40, text.length * fs * 0.6);
        cells.push({
            id: nextId(), value: text, vertex: true,
            style: `text;html=1;align=center;fontSize=${fs};fontColor=${fill};`,
            x, y: y - fs, w: approxW, h: fs * 1.4,
        });
    }

    function handleImage(el, ox, oy) {
        const x    = fAttr(el, 'x') + ox;
        const y    = fAttr(el, 'y') + oy;
        const w    = fAttr(el, 'width', 40);
        const h    = fAttr(el, 'height', 40);
        const href = imageHref(el);
        const style = iconStyle(href) || fallbackImageStyle(href);
        cells.push({ id: nextId(), value: '', style, vertex: true, x, y, w, h });
    }

    function handlePathOrLine(el, ox, oy) {
        const hasArrow = el.getAttribute('marker-end') || el.getAttribute('marker-start');
        if (!hasArrow) return;

        let x1, y1, x2, y2;

        if (el.tagName.toLowerCase() === 'line') {
            x1 = fAttr(el, 'x1') + ox;  y1 = fAttr(el, 'y1') + oy;
            x2 = fAttr(el, 'x2') + ox;  y2 = fAttr(el, 'y2') + oy;
        } else {
            // Extract first and last coordinate pair from path d
            const nums = (el.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number) || [];
            if (nums.length < 4) return;
            x1 = nums[0] + ox;  y1 = nums[1] + oy;
            x2 = nums[nums.length - 2] + ox;  y2 = nums[nums.length - 1] + oy;
        }

        cells.push({ id: nextEId(), edge: true, x1, y1, x2, y2 });
    }

    // ── Tree walker ───────────────────────────────────────────────────────────

    function walk(el, ox = 0, oy = 0) {
        const tag = (el.tagName || '').toLowerCase();
        if (!tag || SKIP_TAGS.has(tag)) return;

        if (tag === 'g') {
            const cls = el.getAttribute('class') || '';
            const { dx, dy } = parseTranslate(el);

            if (cls.includes('resource-node')) {
                handleResourceNode(el, ox + dx, oy + dy);
                return; // children already consumed
            }
            // zoom-layer and other groups: just recurse
            for (const child of el.children) walk(child, ox + dx, oy + dy);
            return;
        }

        switch (tag) {
            case 'rect':    handleRect(el, ox, oy);        break;
            case 'circle':  handleCircle(el, ox, oy);      break;
            case 'ellipse': handleEllipse(el, ox, oy);     break;
            case 'text':    handleText(el, ox, oy);        break;
            case 'image':   handleImage(el, ox, oy);       break;
            case 'path':
            case 'line':    handlePathOrLine(el, ox, oy);  break;
            // polyline, polygon, etc. — silently skip
        }
    }

    for (const child of svg.children) walk(child);

    // ── Emit mxGraphModel XML ─────────────────────────────────────────────────

    let xml = '<mxfile host="InfraSketch" version="1.0">\n';
    xml += '  <diagram id="arch" name="Architecture">\n';
    xml += `    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.ceil(canvasW)}" pageHeight="${Math.ceil(canvasH)}" math="0" shadow="0">\n`;
    xml += '      <root>\n';
    xml += '        <mxCell id="0"/>\n';
    xml += '        <mxCell id="1" parent="0"/>\n';

    for (const c of cells) {
        if (c.edge) {
            xml += `        <mxCell id="${xmlEscape(c.id)}" value="" style="${xmlEscape(EDGE_STYLE)}" edge="1" parent="1">\n`;
            xml += '          <mxGeometry relative="1" as="geometry">\n';
            xml += `            <mxPoint x="${Math.round(c.x1)}" y="${Math.round(c.y1)}" as="sourcePoint"/>\n`;
            xml += `            <mxPoint x="${Math.round(c.x2)}" y="${Math.round(c.y2)}" as="targetPoint"/>\n`;
            xml += '          </mxGeometry>\n';
        } else {
            xml += `        <mxCell id="${xmlEscape(c.id)}" value="${xmlEscape(c.value)}" style="${xmlEscape(c.style)}" vertex="1" parent="1">\n`;
            xml += `          <mxGeometry x="${Math.round(c.x)}" y="${Math.round(c.y)}" width="${Math.round(c.w)}" height="${Math.round(c.h)}" as="geometry"/>\n`;
        }
        xml += '        </mxCell>\n';
    }

    xml += '      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>';
    return xml;
}
