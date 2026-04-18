import { RESOURCE_CATEGORIES } from './constants.js';

const DOCKER_COLOR = '#ff6b35';

function terraformAddress(type, name) {
    return `${type}.${name}`;
}

function findMatchingBrace(source, openIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = openIndex; i < source.length; i += 1) {
        const char = source[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }

    return source.length;
}

function categoryForTerraformBlock(type, body) {
    if (type === 'aws_lb') {
        return /\bload_balancer_type\s*=\s*"network"/.test(body) ? 'nlb' : 'alb';
    }

    for (const [category, config] of Object.entries(RESOURCE_CATEGORIES)) {
        if (config.match.includes(type)) return category;
    }

    return null;
}

function resourceFromBlock(block) {
    const category = categoryForTerraformBlock(block.type, block.body);
    if (!category) return null;

    const config = RESOURCE_CATEGORIES[category];
    return {
        id: terraformAddress(block.type, block.name),
        type: block.type,
        name: block.name,
        category,
        label: config.label,
        color: config.color,
        icon: config.icon,
    };
}

function extractTerraformBlocks(code) {
    const blocks = [];
    const headerRe = /resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/g;
    let match;

    while ((match = headerRe.exec(code)) !== null) {
        const openIndex = headerRe.lastIndex - 1;
        const closeIndex = findMatchingBrace(code, openIndex);
        const body = code.slice(headerRe.lastIndex, closeIndex);
        blocks.push({
            type: match[1],
            name: match[2],
            id: terraformAddress(match[1], match[2]),
            body,
        });
        headerRe.lastIndex = closeIndex + 1;
    }

    return blocks;
}

function firstReferencedAddress(body, resourceTypePattern) {
    const match = body.match(new RegExp(`\\b(${resourceTypePattern})\\.(\\w+)`));
    return match ? terraformAddress(match[1], match[2]) : null;
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectReferences(line, resources) {
    const refs = [];

    for (const resource of resources) {
        if (new RegExp(`\\b${escapeRegExp(resource.id)}\\b`).test(line)) refs.push(resource.id);
    }

    return refs;
}

export function parseTerraform(code) {
    const blocks = extractTerraformBlocks(code);
    const resources = blocks
        .map(resourceFromBlock)
        .filter(Boolean);

    const supportedIds = new Set(resources.map((resource) => resource.id));
    const supportedBlocks = blocks.filter((block) => supportedIds.has(block.id));

    if (!resources.length) {
        return { resources, connections: [], vpcOf: {}, subnetOf: {} };
    }

    const vpcOf = {};
    const subnetOf = {};

    for (const block of supportedBlocks) {
        const vpcId = firstReferencedAddress(block.body.match(/\bvpc_id\s*=\s*([^\n]+)/)?.[1] || '', 'aws_(?:default_)?vpc');
        if (vpcId && supportedIds.has(vpcId)) {
            vpcOf[block.id] = vpcId;
        }

        const subnetId = firstReferencedAddress(
            block.body.match(/\b(?:subnet_ids?|subnets)\s*=\s*(\[[^\]]*\]|[^\n]+)/)?.[1] || '',
            'aws_subnet',
        );
        if (subnetId && supportedIds.has(subnetId)) {
            subnetOf[block.id] = subnetId;
        }
    }

    const skipLine = /^\s*(?:vpc_id|subnet_id|subnet_ids|subnets|security_group_ids?|security_groups|allocation_id|cluster_name|db_subnet_group(?:_name)?|target_group_arns|vpc_zone_identifier|availability_zones?|cidr_block|enable_|tags\s*\{?|ingress|egress|from_port|to_port|protocol|master_|password|username|engine|instance_class|node_type|runtime|handler|role\s*=|assume_role|source_arn|bucket\s*=|domain\s*=)\s*[=\[{]/;
    const connections = [];
    const seen = new Set();

    for (const block of supportedBlocks) {
        for (const line of block.body.split('\n')) {
            if (skipLine.test(line)) continue;

            for (const fromId of collectReferences(line, resources)) {
                if (fromId === block.id) continue;
                const key = `${fromId}->${block.id}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    connections.push({ from: fromId, to: block.id });
                }
            }
        }
    }

    return { resources, connections, vpcOf, subnetOf };
}

function indentOf(line) {
    const match = line.match(/^ */);
    return match ? match[0].length : 0;
}

function stripComment(line) {
    const hashIndex = line.indexOf('#');
    return hashIndex === -1 ? line : line.slice(0, hashIndex);
}

function parseInlineDependencyList(value) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return [];

    return trimmed
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
}

function parseDependsOn(service) {
    const dependencies = new Set();

    for (let i = 0; i < service.lines.length; i += 1) {
        const rawLine = stripComment(service.lines[i]);
        const match = rawLine.match(/^(\s*)depends_on\s*:\s*(.*)$/);
        if (!match) continue;

        const propertyIndent = match[1].length;
        parseInlineDependencyList(match[2]).forEach((dep) => dependencies.add(dep));

        for (let j = i + 1; j < service.lines.length; j += 1) {
            const childLine = stripComment(service.lines[j]);
            if (!childLine.trim()) continue;

            const childIndent = indentOf(childLine);
            if (childIndent <= propertyIndent) break;

            const listItem = childLine.match(/^\s*-\s*([\w.-]+)/);
            if (listItem) {
                dependencies.add(listItem[1]);
                continue;
            }

            const mapItem = childLine.match(/^\s*([\w.-]+)\s*:/);
            if (mapItem) dependencies.add(mapItem[1]);
        }
    }

    return [...dependencies];
}

function extractComposeServices(code) {
    const lines = code.replace(/\r\n/g, '\n').split('\n');
    const servicesLineIndex = lines.findIndex((line) => /^\s*services\s*:\s*(?:#.*)?$/.test(stripComment(line)));
    if (servicesLineIndex === -1) return [];

    const baseIndent = indentOf(lines[servicesLineIndex]);
    const services = [];
    let current = null;
    let serviceIndent = null;

    for (let i = servicesLineIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        const cleanLine = stripComment(line);
        if (!cleanLine.trim()) {
            if (current) current.lines.push(line);
            continue;
        }

        const indent = indentOf(cleanLine);
        if (indent <= baseIndent) break;

        const serviceMatch = cleanLine.match(/^(\s*)([\w.-]+)\s*:\s*$/);
        if (serviceMatch && (serviceIndent === null || indent === serviceIndent)) {
            serviceIndent = indent;
            current = { name: serviceMatch[2], lines: [] };
            services.push(current);
            continue;
        }

        if (current) current.lines.push(line);
    }

    return services;
}

export function parseDockerCompose(code) {
    const services = extractComposeServices(code);
    const serviceNames = new Set(services.map((service) => service.name));
    const resources = services.map((service) => ({
        id: `docker.${service.name}`,
        type: 'docker_service',
        name: service.name,
        category: 'instance',
        label: 'Container',
        color: DOCKER_COLOR,
        icon: 'Docker',
    }));

    const connections = [];
    const seen = new Set();

    for (const service of services) {
        for (const dependency of parseDependsOn(service)) {
            if (!serviceNames.has(dependency)) continue;

            const from = `docker.${dependency}`;
            const to = `docker.${service.name}`;
            const key = `${from}->${to}`;
            if (!seen.has(key)) {
                seen.add(key);
                connections.push({ from, to });
            }
        }
    }

    return { resources, connections, vpcOf: {}, subnetOf: {} };
}
