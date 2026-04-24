import { DRAWIO_LAYOUT, SVG_NS, XLINK_NS } from './constants.js';
import { buildDiagramLayout } from './layout.js';

// Required prefix for icon shapes — includes vertical label positioning so label renders below icon
const ICON_PREFIX = 'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;pointerEvents=1;verticalLabelPosition=bottom;verticalAlign=top;';

function awsIcon(resIcon, fillColor) {
    return `${ICON_PREFIX}fillColor=${fillColor};shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.${resIcon};`;
}
function azIcon(shape, fillColor) {
    return `${ICON_PREFIX}fillColor=${fillColor};shape=mxgraph.azure2.${shape};`;
}
function gcpIcon(shape, fillColor) {
    return `${ICON_PREFIX}fillColor=${fillColor};shape=mxgraph.gcp2.${shape};`;
}

const DRAWIO_SHAPES = {
    // ── AWS containers ───────────────────────────────────────────────────────
    vpc:    'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc_alt;grStroke=0;strokeColor=#147EBA;fillColor=#E6F3FB;fontStyle=1;fontSize=13;verticalLabelPosition=top;verticalAlign=bottom;',
    subnet: 'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;grStroke=0;strokeColor=#48C0B0;fillColor=#E6F9F7;fontStyle=1;fontSize=11;verticalLabelPosition=top;verticalAlign=bottom;',
    // ── Azure containers ─────────────────────────────────────────────────────
    az_vnet:   'shape=mxgraph.azure2.virtual_networks;grStroke=0;strokeColor=#0078D4;fillColor=#E8F4FF;fontStyle=1;fontSize=13;verticalLabelPosition=top;verticalAlign=bottom;',
    az_subnet: 'shape=mxgraph.azure2.subnets;grStroke=0;strokeColor=#0072C6;fillColor=#EDF4FF;fontStyle=1;fontSize=11;verticalLabelPosition=top;verticalAlign=bottom;',
    // ── AWS resources (fillColor required for mxgraph.aws4.resourceIcon) ─────
    instance:    awsIcon('ec2',                       '#ED7100'),
    eks:         awsIcon('eks',                       '#ED7100'),
    ecs:         awsIcon('ecs',                       '#ED7100'),
    lambda:      awsIcon('lambda',                    '#ED7100'),
    autoscaling: awsIcon('auto_scaling',              '#ED7100'),
    ecr:         awsIcon('ecr',                       '#ED7100'),
    rds:         awsIcon('rds',                       '#C7131F'),
    dynamodb:    awsIcon('dynamodb',                  '#C7131F'),
    elasticache: awsIcon('elasticache',               '#C7131F'),
    s3:          awsIcon('s3',                        '#7AA116'),
    alb:         awsIcon('application_load_balancer', '#8C4FFF'),
    nlb:         awsIcon('network_load_balancer',     '#8C4FFF'),
    tg:          awsIcon('elb',                       '#8C4FFF'),
    sg:          awsIcon('security_group',            '#DD344C'),
    iam_role:    awsIcon('role',                      '#DD344C'),
    route53:     awsIcon('route_53',                  '#8C4FFF'),
    cloudfront:  awsIcon('cloudfront',                '#8C4FFF'),
    sqs:         awsIcon('sqs',                       '#E7157B'),
    sns:         awsIcon('sns',                       '#E7157B'),
    nat:         awsIcon('nat_gateway',               '#8C4FFF'),
    igw:         awsIcon('internet_gateway',          '#8C4FFF'),
    eip:         awsIcon('elastic_ip_address',        '#8C4FFF'),
    kms:         awsIcon('kms',                       '#DD344C'),
    cloudwatch:  awsIcon('cloudwatch',                '#E7157B'),
    waf:         awsIcon('waf',                       '#DD344C'),
    route_table: awsIcon('route_table',               '#8C4FFF'),
    transit_gw:  awsIcon('transit_gateway',           '#8C4FFF'),
    vpn_gw:      awsIcon('site_to_site_vpn',          '#8C4FFF'),
    network_iface: awsIcon('elastic_network_interface','#8C4FFF'),
    // ── Azure resources ──────────────────────────────────────────────────────
    az_vm:         azIcon('virtual_machine',                    '#0078D4'),
    az_vmss:       azIcon('vm_scale_sets',                      '#0078D4'),
    az_aks:        azIcon('aks_kubernetes_service',             '#0078D4'),
    az_aci:        azIcon('container_instances',                '#0078D4'),
    az_function:   azIcon('azure_functions',                    '#0078D4'),
    az_appservice: azIcon('app_services',                       '#0078D4'),
    az_appgw:      azIcon('application_gateways',               '#0072C6'),
    az_lb:         azIcon('load_balancers',                     '#0072C6'),
    az_frontdoor:  azIcon('azure_front_door',                   '#0072C6'),
    az_trafficmgr: azIcon('traffic_manager_profiles',           '#0072C6'),
    az_sql:        azIcon('sql_database',                       '#005BA1'),
    az_cosmos:     azIcon('azure_cosmos_db',                    '#005BA1'),
    az_postgres:   azIcon('azure_database_for_postgresql',      '#005BA1'),
    az_redis:      azIcon('cache_for_redis',                    '#005BA1'),
    az_storage:    azIcon('storage_accounts',                   '#005BA1'),
    az_nsg:        azIcon('network_security_groups',            '#6B4C9A'),
    az_keyvault:   azIcon('key_vaults',                         '#6B4C9A'),
    az_servicebus: azIcon('service_bus',                        '#E07A5F'),
    az_eventhub:   azIcon('event_hubs',                         '#E07A5F'),
    az_dns:        azIcon('dns',                                '#6B4C9A'),
    az_monitor:    azIcon('monitor',                            '#E07A5F'),
    az_appinsights:azIcon('application_insights',               '#E07A5F'),
    // ── GCP containers ───────────────────────────────────────────────────────
    gcp_vpc:    'shape=mxgraph.gcp2.network;grStroke=0;strokeColor=#1A73E8;fillColor=#E8F0FE;fontStyle=1;fontSize=13;verticalLabelPosition=top;verticalAlign=bottom;',
    gcp_subnet: 'shape=mxgraph.gcp2.subnetwork;grStroke=0;strokeColor=#4285F4;fillColor=#EEF2FF;fontStyle=1;fontSize=11;verticalLabelPosition=top;verticalAlign=bottom;',
    // ── GCP resources ────────────────────────────────────────────────────────
    gcp_fw:       gcpIcon('firewall_rules',                   '#EA4335'),
    gcp_router:   gcpIcon('cloud_router',                     '#1A73E8'),
    gcp_ip:       gcpIcon('external_ip_addresses',            '#4285F4'),
    gcp_gce:      gcpIcon('compute_engine',                   '#4285F4'),
    gcp_gke:      gcpIcon('google_kubernetes_engine',         '#1A73E8'),
    gcp_run:      gcpIcon('cloud_run',                        '#1A73E8'),
    gcp_fn:       gcpIcon('cloud_functions',                  '#FF6D00'),
    gcp_sql:      gcpIcon('cloud_sql',                        '#1A73E8'),
    gcp_bq:       gcpIcon('bigquery',                         '#4285F4'),
    gcp_spanner:  gcpIcon('cloud_spanner',                    '#34A853'),
    gcp_bigtable: gcpIcon('cloud_bigtable',                   '#34A853'),
    gcp_firestore:gcpIcon('cloud_firestore',                  '#FF6D00'),
    gcp_memstore: gcpIcon('cloud_memorystore',                '#34A853'),
    gcp_gcs:      gcpIcon('cloud_storage',                    '#FF8F00'),
    gcp_lb:       gcpIcon('cloud_load_balancing',             '#34A853'),
    gcp_kms:      gcpIcon('cloud_key_management_service',     '#7C4DFF'),
    gcp_secret:   gcpIcon('secret_manager',                   '#7C4DFF'),
    gcp_sa:       gcpIcon('cloud_iam',                        '#7C4DFF'),
    gcp_pubsub:   gcpIcon('cloud_pubsub',                     '#FF6D00'),
    gcp_dns:      gcpIcon('cloud_dns',                        '#1A73E8'),
    gcp_mon:      gcpIcon('cloud_monitoring',                 '#FBBC04'),
    // ── Terraform modules & Terragrunt ───────────────────────────────────────
    tf_module: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#EDE7F6;strokeColor=#7B42BC;fontColor=#4A148C;fontStyle=1;fontSize=11;',
    tg_unit:   'rounded=1;whiteSpace=wrap;html=1;fillColor=#E0F7FA;strokeColor=#00BEF3;fontColor=#006064;fontStyle=1;fontSize=11;',
};

const NODE_STYLE_SUFFIX = 'labelBackgroundColor=#ffffff;fontStyle=1;fontSize=11;verticalLabelPosition=bottom;verticalAlign=top;';
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

const PLAIN_STYLE_CATEGORIES = new Set(['tf_module', 'tg_unit']);

function drawioShapeFor(resource) {
    if (resource.type === 'docker_service') return DOCKER_STYLE;
    const base = DRAWIO_SHAPES[resource.category] || 'rounded=1;whiteSpace=wrap;html=1;';
    if (PLAIN_STYLE_CATEGORIES.has(resource.category)) return base;
    return base + NODE_STYLE_SUFFIX;
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
        const isGcpVpc = vpc.category === 'gcp_vpc';
        const vpcCellId = nextId();
        cellIdMap.set(vpc.id, vpcCellId);
        const vpcLabel = isAzureVnet ? `VNet: ${vpc.name}` : isGcpVpc ? `VPC Network: ${vpc.name}` : `VPC: ${vpc.name}`;
        const vpcStyle = isAzureVnet ? DRAWIO_SHAPES.az_vnet : isGcpVpc ? DRAWIO_SHAPES.gcp_vpc : DRAWIO_SHAPES.vpc;
        cells.push({
            id: vpcCellId,
            value: vpcLabel,
            style: vpcStyle,
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
        const isGcpSubnet = subnet.category === 'gcp_subnet';
        const isAzSubnet = subnet.category === 'az_subnet';
        const subnetStyle = isGcpSubnet ? DRAWIO_SHAPES.gcp_subnet : isAzSubnet ? DRAWIO_SHAPES.az_subnet : DRAWIO_SHAPES.subnet;
        cells.push({
            id: subnetCellId,
            value: `Subnet: ${subnet.name}`,
            style: subnetStyle,
            vertex: true,
            parent: '1',
            geo: { x: pos.x, y: pos.y, w: pos.w, h: pos.h },
        });
    }

    for (const resource of resources) {
        if (resource.category === 'vpc' || resource.category === 'subnet' ||
            resource.category === 'gcp_vpc' || resource.category === 'gcp_subnet') continue;

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
            style: 'edgeStyle=orthogonalEdgeStyle;html=1;rounded=0;orthogonalLoop=1;jettySize=auto;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;endArrow=block;endFill=1;',
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
