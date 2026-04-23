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

export function extractModuleBlocks(code) {
    const blocks = [];
    const headerRe = /\bmodule\s+"([^"]+)"\s*\{/g;
    let match;

    while ((match = headerRe.exec(code)) !== null) {
        const openIndex = headerRe.lastIndex - 1;
        const closeIndex = findMatchingBrace(code, openIndex);
        const body = code.slice(headerRe.lastIndex, closeIndex);
        blocks.push({ name: match[1], id: `module.${match[1]}`, body });
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
    const moduleBlocks = extractModuleBlocks(code);

    const resources = blocks.map(resourceFromBlock).filter(Boolean);
    const { tf_module: modCfg } = RESOURCE_CATEGORIES;
    const moduleResources = moduleBlocks.map((b) => ({
        id: b.id,
        type: 'tf_module',
        name: b.name,
        category: 'tf_module',
        label: modCfg.label,
        color: modCfg.color,
        icon: modCfg.icon,
    }));

    const allResources = [...resources, ...moduleResources];
    const supportedIds = new Set(resources.map((r) => r.id));
    const supportedBlocks = blocks.filter((block) => supportedIds.has(block.id));

    if (!allResources.length) {
        return { resources: allResources, connections: [], vpcOf: {}, subnetOf: {} };
    }

    const vpcOf = {};
    const subnetOf = {};

    for (const block of supportedBlocks) {
        // AWS VPC containment
        const vpcId = firstReferencedAddress(block.body.match(/\bvpc_id\s*=\s*([^\n]+)/)?.[1] || '', 'aws_(?:default_)?vpc');
        if (vpcId && supportedIds.has(vpcId)) {
            vpcOf[block.id] = vpcId;
        }

        // Azure VNet containment (azurerm_subnet uses virtual_network_name)
        if (!vpcOf[block.id]) {
            const vnetId = firstReferencedAddress(block.body.match(/\bvirtual_network_name\s*=\s*([^\n]+)/)?.[1] || '', 'azurerm_virtual_network');
            if (vnetId && supportedIds.has(vnetId)) {
                vpcOf[block.id] = vnetId;
            }
        }

        const subnetId = firstReferencedAddress(
            block.body.match(/\b(?:subnet_ids?|subnets|vnet_subnet_id)\s*=\s*(\[[^\]]*\]|[^\n]+)/)?.[1] || '',
            'aws_subnet|azurerm_subnet',
        );
        if (subnetId && supportedIds.has(subnetId)) {
            subnetOf[block.id] = subnetId;
        }
    }

    const skipLine = /^\s*(?:vpc_id|subnet_id|subnet_ids|subnets|vnet_subnet_id|security_group_ids?|security_groups|allocation_id|cluster_name|db_subnet_group(?:_name)?|target_group_arns|vpc_zone_identifier|availability_zones?|cidr_block|enable_|tags\s*\{?|ingress|egress|from_port|to_port|protocol|master_|password|username|engine|instance_class|node_type|runtime|handler|role\s*=|assume_role|source_arn|bucket\s*=|domain\s*=|resource_group_name|virtual_network_name|location\s*=|address_space|address_prefixes|os_profile|storage_profile|network_interface_ids|sku\s*[={]|capacity\s*=|tenant_id)\s*[=\[{]/;
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

            // Detect module.name.output references → connection from module to this resource
            for (const mod of moduleResources) {
                if (new RegExp(`\\b${escapeRegExp(mod.id)}\\.`).test(line)) {
                    const key = `${mod.id}->${block.id}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        connections.push({ from: mod.id, to: block.id });
                    }
                }
            }
        }
    }

    return { resources: allResources, connections, vpcOf, subnetOf };
}

function normalizeDependsOn(dependsOn) {
    if (Array.isArray(dependsOn)) return dependsOn;
    if (dependsOn && typeof dependsOn === 'object') return Object.keys(dependsOn);
    return [];
}

export function parseDockerCompose(code) {
    const yamlParser = globalThis.jsyaml;
    if (!yamlParser) throw new Error('YAML parser (js-yaml) not loaded.');

    const doc = yamlParser.load(code) || {};
    const servicesMap = (doc && typeof doc === 'object') ? (doc.services || {}) : {};
    const serviceNames = Object.keys(servicesMap);
    const serviceSet = new Set(serviceNames);

    const resources = serviceNames.map((name) => ({
        id: `docker.${name}`,
        type: 'docker_service',
        name,
        category: 'instance',
        label: 'Container',
        color: DOCKER_COLOR,
        icon: 'Docker',
    }));

    const connections = [];
    const seen = new Set();

    for (const [name, service] of Object.entries(servicesMap)) {
        const deps = normalizeDependsOn(service?.depends_on);
        for (const dep of deps) {
            if (!serviceSet.has(dep)) continue;
            const from = `docker.${dep}`;
            const to = `docker.${name}`;
            const key = `${from}->${to}`;
            if (!seen.has(key)) {
                seen.add(key);
                connections.push({ from, to });
            }
        }
    }

    return { resources, connections, vpcOf: {}, subnetOf: {} };
}

// ─── parseTerraformPlan ───────────────────────────────────────────────────────

function* iterExprRefs(exprs, prefix) {
    if (!exprs || typeof exprs !== 'object') return;
    if (Array.isArray(exprs)) {
        for (const item of exprs) yield* iterExprRefs(item, prefix);
        return;
    }
    if ('references' in exprs) {
        yield { attr: prefix, refs: exprs.references };
        return;
    }
    for (const [key, val] of Object.entries(exprs)) {
        yield* iterExprRefs(val, prefix ? `${prefix}.${key}` : key);
    }
}

function normalizeRef(ref) {
    const parts = ref.split('.');
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : ref;
}

const PLAN_SKIP_ATTRS = new Set([
    'vpc_id', 'subnet_id', 'subnet_ids', 'subnets', 'vnet_subnet_id',
    'security_group_ids', 'security_groups', 'resource_group_name',
    'virtual_network_name', 'location', 'address_space', 'address_prefixes',
    'cidr_block', 'availability_zones', 'tags', 'allocation_id',
    'cluster_name', 'db_subnet_group_name', 'target_group_arns',
    'vpc_zone_identifier', 'role', 'assume_role_policy', 'source_arn',
    'bucket', 'domain', 'master_username', 'master_password',
    'password', 'username', 'engine', 'instance_class', 'node_type',
    'runtime', 'handler', 'tenant_id', 'sku_name', 'capacity',
]);

export function parseTerraformPlan(jsonText) {
    let plan;
    try { plan = JSON.parse(jsonText); } catch { return null; }
    if (!plan || !Array.isArray(plan.resource_changes)) return null;

    const changes = plan.resource_changes.filter((c) => {
        const actions = c.change?.actions || [];
        return !actions.every((a) => a === 'delete');
    });

    const resources = [];
    const supportedIds = new Set();

    for (const change of changes) {
        const { type, name, address } = change;
        const after = change.change?.after || {};

        let category;
        if (type === 'aws_lb' || type === 'aws_alb') {
            category = after.load_balancer_type === 'network' ? 'nlb' : 'alb';
        } else {
            category = categoryForTerraformBlock(type, '');
        }
        if (!category) continue;

        const config = RESOURCE_CATEGORIES[category];
        if (!supportedIds.has(address)) {
            resources.push({ id: address, type, name, category, label: config.label, color: config.color, icon: config.icon });
            supportedIds.add(address);
        }
    }

    const vpcOf = {};
    const subnetOf = {};
    const connections = [];
    const seen = new Set();
    const configResources = plan.configuration?.root_module?.resources || [];

    for (const confRes of configResources) {
        const addr = confRes.address;
        if (!supportedIds.has(addr)) continue;

        for (const { attr, refs } of iterExprRefs(confRes.expressions || {}, '')) {
            const leaf = attr.split('.').pop();
            for (const rawRef of refs) {
                const ref = normalizeRef(rawRef);
                if (!supportedIds.has(ref) || ref === addr) continue;

                if (leaf === 'vpc_id' || leaf === 'virtual_network_name') {
                    if (!vpcOf[addr]) vpcOf[addr] = ref;
                    continue;
                }
                if (leaf === 'subnet_id' || leaf === 'subnet_ids' || leaf === 'vnet_subnet_id') {
                    if (!subnetOf[addr]) subnetOf[addr] = ref;
                    continue;
                }
                if (PLAN_SKIP_ATTRS.has(leaf)) continue;

                const key = `${ref}->${addr}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    connections.push({ from: ref, to: addr });
                }
            }
        }
    }

    return { resources, connections, vpcOf, subnetOf };
}

// ─── parseTerragrunt ─────────────────────────────────────────────────────────

function parseTerragruntUnit(unitCode) {
    const deps = [];
    const depRe = /\bdependency\s+"([^"]+)"\s*\{/g;
    let match;

    while ((match = depRe.exec(unitCode)) !== null) {
        const openIndex = depRe.lastIndex - 1;
        const closeIndex = findMatchingBrace(unitCode, openIndex);
        const body = unitCode.slice(depRe.lastIndex, closeIndex);
        const configPath = body.match(/\bconfig_path\s*=\s*"([^"]+)"/)?.[1] || '';
        deps.push({ alias: match[1], configPath });
        depRe.lastIndex = closeIndex + 1;
    }

    return deps;
}

function tgUnitResource(name) {
    const cfg = RESOURCE_CATEGORIES.tg_unit;
    return { id: `tg.${name}`, type: 'tg_unit', name, category: 'tg_unit', label: cfg.label, color: cfg.color, icon: cfg.icon };
}

export function parseTerragrunt(code) {
    // Units delimited by: # --- unit: name ---
    const separatorRe = /^#\s*---\s*unit:\s*(\S+)\s*---\s*$/gm;
    const separators = [...code.matchAll(separatorRe)];

    const unitEntries = [];

    if (separators.length === 0) {
        // Single unit — infer name from source or default to "unit"
        const sourceMatch = code.match(/\bsource\s*=\s*"([^"]+)"/);
        const source = sourceMatch?.[1] || '';
        const nameMatch = source.match(/\/\/([^/?]+)|\/([^/?]+)(?:[?]|$)/);
        const name = nameMatch ? (nameMatch[1] || nameMatch[2]) : 'unit';
        unitEntries.push({ name, deps: parseTerragruntUnit(code) });
    } else {
        for (let i = 0; i < separators.length; i++) {
            const m = separators[i];
            const name = m[1];
            const start = m.index + m[0].length;
            const end = i + 1 < separators.length ? separators[i + 1].index : code.length;
            unitEntries.push({ name, deps: parseTerragruntUnit(code.slice(start, end)) });
        }
    }

    const knownNames = new Set(unitEntries.map((u) => u.name));
    const resources = unitEntries.map((u) => tgUnitResource(u.name));
    const connections = [];
    const seen = new Set();

    for (const unit of unitEntries) {
        for (const dep of unit.deps) {
            if (!knownNames.has(dep.alias)) {
                knownNames.add(dep.alias);
                resources.push(tgUnitResource(dep.alias));
            }
            const key = `tg.${dep.alias}->tg.${unit.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                connections.push({ from: `tg.${dep.alias}`, to: `tg.${unit.name}` });
            }
        }
    }

    return { resources, connections, vpcOf: {}, subnetOf: {} };
}
