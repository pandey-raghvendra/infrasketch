import { DRAWIO_LAYOUT, SVG_NS, XLINK_NS } from './constants.js';
import { buildDiagramLayout } from './layout.js';

const DRAWIO_SHAPES = {
    // ── AWS containers ───────────────────────────────────────────────────────
    vpc:    'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc_alt;grStroke=0;strokeColor=#147EBA;fillColor=#E6F3FB;fontStyle=1;fontSize=13;verticalLabelPosition=top;verticalAlign=bottom;',
    subnet: 'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;grStroke=0;strokeColor=#48C0B0;fillColor=#E6F9F7;fontStyle=1;fontSize=11;verticalLabelPosition=top;verticalAlign=bottom;',
    // ── Azure containers ─────────────────────────────────────────────────────
    az_vnet:   'shape=mxgraph.azure2.virtual_networks;grStroke=0;strokeColor=#0078D4;fillColor=#E8F4FF;fontStyle=1;fontSize=13;verticalLabelPosition=top;verticalAlign=bottom;',
    az_subnet: 'shape=mxgraph.azure2.subnets;grStroke=0;strokeColor=#0072C6;fillColor=#EDF4FF;fontStyle=1;fontSize=11;verticalLabelPosition=top;verticalAlign=bottom;',
    // ── AWS resources ────────────────────────────────────────────────────────
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
    // ── Azure resources ──────────────────────────────────────────────────────
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

const NODE_STYLE_SUFFIX = 'labelBackgroundColor=#ffffff;fontStyle=1;fontSize=11;';
const DOCKER_STYLE = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#e8f4ff;strokeColor=#1d63ed;fontStyle=1;fontSize=11;';

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '&#xa;');
}

function stringToBase64(input) {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function svgSize(svg) {
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const [, , width, height] = viewBox.split(/\s+/).map(Number);
        if (width && height) return { width, height };
    }

    return {
        width: Number(svg.getAttribute('width')) || 1200,
        height: Number(svg.getAttribute('height')) || 800,
    };
}

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
}

async function inlineSvgImages(svg) {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', SVG_NS);

    const images = [...clone.querySelectorAll('image')];
    await Promise.all(images.map(async (image) => {
        const href = image.getAttribute('href') || image.getAttributeNS(XLINK_NS, 'href');
        if (!href || href.startsWith('data:')) return;

        const response = await fetch(new URL(href, document.baseURI).href);
        if (!response.ok) throw new Error(`Could not load icon asset: ${href}`);

        const svgText = await response.text();
        const dataUri = `data:image/svg+xml;base64,${stringToBase64(svgText)}`;
        image.setAttribute('href', dataUri);
        image.setAttributeNS(XLINK_NS, 'xlink:href', dataUri);
    }));

    return clone;
}

async function serializedStandaloneSvg(svg) {
    const clone = await inlineSvgImages(svg);
    return new XMLSerializer().serializeToString(clone);
}

export async function exportSvg(svg) {
    const svgText = await serializedStandaloneSvg(svg);
    downloadBlob(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }), 'infrasketch-diagram.svg');
}

export async function exportPng(svg) {
    const svgText = await serializedStandaloneSvg(svg);
    const { width, height } = svgSize(svg);
    const scale = 2;
    const image = new Image();
    const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));

    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Could not render the SVG export.'));
        image.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'infrasketch-diagram.png';
    link.href = dataUrl;
    link.click();
}

function drawioShapeFor(resource) {
    if (resource.type === 'docker_service') return DOCKER_STYLE;
    return (DRAWIO_SHAPES[resource.category] || 'rounded=1;whiteSpace=wrap;html=1;') + NODE_STYLE_SUFFIX;
}

export function generateDrawioXml(parsed) {
    if (!parsed.resources.length) return null;

    const layout = buildDiagramLayout(parsed, DRAWIO_LAYOUT);
    const { groups, metrics, positions, resources, connections } = layout;
    const cells = [];
    const cellIdMap = new Map();
    let idSeq = 10;
    let edgeId = 900;
    const nextId = () => `c${idSeq++}`;

    if (metrics.hasVpc) {
        const vpc = groups.vpcRes[0];
        const isAzureVnet = vpc.type === 'azurerm_virtual_network';
        const vpcCellId = nextId();
        cellIdMap.set(vpc.id, vpcCellId);
        cells.push({
            id: vpcCellId,
            value: isAzureVnet ? `VNet: ${vpc.name}` : `VPC: ${vpc.name}`,
            style: isAzureVnet ? DRAWIO_SHAPES.az_vnet : DRAWIO_SHAPES.vpc,
            vertex: true,
            parent: '1',
            geo: { x: metrics.vpcX, y: metrics.vpcY, w: metrics.vpcBoxW, h: metrics.vpcBoxH },
        });
    }

    for (const subnet of groups.subnetRes) {
        const pos = positions[subnet.id];
        if (!pos) continue;

        const subnetCellId = nextId();
        cellIdMap.set(subnet.id, subnetCellId);
        cells.push({
            id: subnetCellId,
            value: `Subnet: ${subnet.name}`,
            style: DRAWIO_SHAPES.subnet,
            vertex: true,
            parent: '1',
            geo: { x: pos.x, y: pos.y, w: pos.w, h: pos.h },
        });
    }

    for (const resource of resources) {
        if (resource.category === 'vpc' || resource.category === 'subnet') continue;

        const pos = positions[resource.id];
        if (!pos) continue;

        const resourceCellId = nextId();
        cellIdMap.set(resource.id, resourceCellId);
        cells.push({
            id: resourceCellId,
            value: `${resource.label}\n${resource.name}`,
            style: drawioShapeFor(resource),
            vertex: true,
            parent: '1',
            geo: { x: pos.x, y: pos.y, w: pos.w, h: pos.h },
        });
    }

    for (const conn of connections) {
        const source = cellIdMap.get(conn.from);
        const target = cellIdMap.get(conn.to);
        if (!source || !target) continue;

        cells.push({
            id: `e${edgeId++}`,
            value: '',
            style: 'edgeStyle=orthogonalEdgeStyle;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;',
            edge: true,
            source,
            target,
            parent: '1',
            geo: { relative: true },
        });
    }

    let xml = '<mxfile host="InfraSketch" version="1.0">\n';
    xml += '  <diagram id="arch" name="Architecture">\n';
    xml += '    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">\n';
    xml += '      <root>\n';
    xml += '        <mxCell id="0"/>\n';
    xml += '        <mxCell id="1" parent="0"/>\n';

    for (const cell of cells) {
        const geometry = cell.edge
            ? '<mxGeometry relative="1" as="geometry"/>'
            : `<mxGeometry x="${Math.round(cell.geo.x)}" y="${Math.round(cell.geo.y)}" width="${Math.round(cell.geo.w)}" height="${Math.round(cell.geo.h)}" as="geometry"/>`;
        const edgeAttrs = cell.edge ? ` edge="1" source="${xmlEscape(cell.source)}" target="${xmlEscape(cell.target)}"` : '';
        const vertexAttr = cell.vertex ? ' vertex="1"' : '';

        xml += `        <mxCell id="${xmlEscape(cell.id)}" value="${xmlEscape(cell.value)}" style="${xmlEscape(cell.style)}"${vertexAttr}${edgeAttrs} parent="${xmlEscape(cell.parent)}">\n`;
        xml += `          ${geometry}\n`;
        xml += '        </mxCell>\n';
    }

    xml += '      </root>\n';
    xml += '    </mxGraphModel>\n';
    xml += '  </diagram>\n';
    xml += '</mxfile>';

    return xml;
}

export function exportDrawio(parsed) {
    const xml = generateDrawioXml(parsed);
    if (!xml) return false;

    downloadBlob(new Blob([xml], { type: 'application/xml;charset=utf-8' }), 'infrasketch-diagram.drawio');
    return true;
}
