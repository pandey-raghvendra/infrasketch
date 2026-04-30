// Maps resource category/type to a simple emoji for Mermaid labels
const MERMAID_EMOJI = {
    vpc:            '🌐',
    subnet:         '📦',
    compute:        '💻',
    database:       '🗄️',
    storage:        '🪣',
    loadbalancer:   '⚖️',
    messaging:      '📨',
    security:       '🔐',
    iam:            '👤',
    cdn:            '☁️',
    dns:            '🌍',
    monitoring:     '📊',
    container:      '🐳',
    serverless:     '⚡',
    network:        '🔗',
    cache:          '⚡',
    gateway:        '🚪',
    default:        '◼',
};

function emoji(resource) {
    const cat = (resource.category || '').toLowerCase();
    return MERMAID_EMOJI[cat] || MERMAID_EMOJI.default;
}

// Sanitise id for Mermaid node identifiers (no special chars)
function nodeId(id) {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Sanitise label text for Mermaid (escape quotes, brackets)
function safeLabel(str) {
    return String(str).replace(/"/g, "'").replace(/[\[\](){}|]/g, ' ').trim();
}

/**
 * Convert a parsed diagram object to Mermaid flowchart syntax.
 *
 * @param {object} parsed  - same shape returned by parser: { resources, connections, vpcOf, subnetOf }
 * @returns {string}       - Mermaid code string
 */
export function generateMermaid(parsed) {
    if (!parsed || !parsed.resources || !parsed.resources.length) {
        return '%%  No resources to render\nflowchart LR';
    }

    const { resources, connections = [], vpcOf = {}, subnetOf = {} } = parsed;

    const lines = ['flowchart LR'];

    // Separate VPCs/networks, subnets, and regular resources
    const vpcs    = resources.filter(r => r.category === 'vpc' || r.type?.includes('virtual_network'));
    const subnets = resources.filter(r => r.category === 'subnet');
    const regular = resources.filter(r => r.category !== 'vpc' && r.category !== 'subnet'
                                         && !r.type?.includes('virtual_network'));

    const renderedIds = new Set();

    // Build subgraph nesting: VPC → subnet(s) → resources inside subnet
    for (const vpc of vpcs) {
        const vid = nodeId(vpc.id);
        lines.push('');
        lines.push(`  subgraph ${vid}["${emoji(vpc)} VPC: ${safeLabel(vpc.name)}"]`);
        renderedIds.add(vpc.id);

        // Subnets that belong to this VPC
        const mySubnets = subnets.filter(s => vpcOf[s.id] === vpc.id || !vpcOf[s.id]);

        for (const subnet of mySubnets) {
            const sid = nodeId(subnet.id);
            lines.push(`    subgraph ${sid}["📦 Subnet: ${safeLabel(subnet.name)}"]`);
            renderedIds.add(subnet.id);

            // Resources inside this subnet
            const members = regular.filter(r => subnetOf[r.id] === subnet.id);
            for (const r of members) {
                lines.push(`      ${nodeId(r.id)}["${emoji(r)} ${safeLabel(r.label)}\\n${safeLabel(r.name)}"]`);
                renderedIds.add(r.id);
            }

            lines.push('    end');
        }

        // VPC-level resources not in any subnet
        const vpcDirectResources = regular.filter(r =>
            vpcOf[r.id] === vpc.id && !subnetOf[r.id] && !renderedIds.has(r.id)
        );
        for (const r of vpcDirectResources) {
            lines.push(`    ${nodeId(r.id)}["${emoji(r)} ${safeLabel(r.label)}\\n${safeLabel(r.name)}"]`);
            renderedIds.add(r.id);
        }

        lines.push('  end');
    }

    // Resources outside any VPC (internet, security, messaging, etc.)
    lines.push('');
    for (const r of regular) {
        if (renderedIds.has(r.id)) continue;
        lines.push(`  ${nodeId(r.id)}["${emoji(r)} ${safeLabel(r.label)}\\n${safeLabel(r.name)}"]`);
        renderedIds.add(r.id);
    }

    // Connections
    if (connections.length) {
        lines.push('');
        for (const conn of connections) {
            if (!renderedIds.has(conn.from) || !renderedIds.has(conn.to)) continue;
            lines.push(`  ${nodeId(conn.from)} --> ${nodeId(conn.to)}`);
        }
    }

    return lines.join('\n');
}
