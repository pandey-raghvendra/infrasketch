import { RESOURCE_CATEGORIES } from './constants.js';

const DOCKER_COLOR = '#ff6b35';

// ─── ARM / Bicep ──────────────────────────────────────────────────────────────

const ARM_TYPE_TO_CATEGORY = {
    'microsoft.network/virtualnetworks':           'vpc',
    'microsoft.network/virtualnetworks/subnets':   'subnet',
    'microsoft.compute/virtualmachines':           'az_vm',
    'microsoft.compute/virtualmachinescalesets':   'az_vmss',
    'microsoft.containerservice/managedclusters':  'az_aks',
    'microsoft.containerinstance/containergroups': 'az_aci',
    'microsoft.web/serverfarms':                   'az_appservice',
    'microsoft.network/applicationgateways':       'az_appgw',
    'microsoft.network/loadbalancers':             'az_lb',
    'microsoft.cdn/profiles':                      'az_frontdoor',
    'microsoft.network/frontdoors':                'az_frontdoor',
    'microsoft.network/trafficmanagerprofiles':    'az_trafficmgr',
    'microsoft.sql/servers':                       'az_sql',
    'microsoft.sql/servers/databases':             'az_sql',
    'microsoft.sql/managedinstances':              'az_sql',
    'microsoft.documentdb/databaseaccounts':       'az_cosmos',
    'microsoft.dbforpostgresql/servers':           'az_postgres',
    'microsoft.dbforpostgresql/flexibleservers':   'az_postgres',
    'microsoft.dbformysql/servers':                'az_postgres',
    'microsoft.cache/redis':                       'az_redis',
    'microsoft.storage/storageaccounts':           'az_storage',
    'microsoft.network/networksecuritygroups':     'az_nsg',
    'microsoft.keyvault/vaults':                   'az_keyvault',
    'microsoft.servicebus/namespaces':             'az_servicebus',
    'microsoft.eventhub/namespaces':               'az_eventhub',
    'microsoft.network/dnszones':                  'az_dns',
    'microsoft.network/privatednszones':           'az_dns',
    'microsoft.operationalinsights/workspaces':    'az_monitor',
    'microsoft.insights/components':               'az_appinsights',
    'microsoft.compute/disks':                     'az_storage',
};

function armCategoryForType(armType, kind = '') {
    const key = armType.toLowerCase();
    if (key === 'microsoft.web/sites') {
        return (kind || '').toLowerCase().includes('function') ? 'az_function' : 'az_appservice';
    }
    return ARM_TYPE_TO_CATEGORY[key] || null;
}

function extractArmResourceName(expr) {
    if (!expr || typeof expr !== 'string') return null;
    const m = /resourceId\s*\([^)]*,\s*'([^']+)'\s*\)/i.exec(expr);
    return m ? m[1] : null;
}

export function parseArm(code) {
    let template;
    try { template = JSON.parse(code); } catch { return null; }
    if (!template || typeof template !== 'object') return null;

    const schema = template['$schema'] || '';
    const hasArmSchema = schema.includes('deploymentTemplate') || schema.includes('subscriptionDeploymentTemplate');
    const hasResources = Array.isArray(template.resources);
    if (!hasArmSchema && !hasResources) return null;
    if (!hasResources) return { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

    const resources = [];
    const supportedIds = new Set();
    const nameToId = new Map();

    function processRes(res, parentType = '', parentName = '') {
        if (!res || !res.type || res.name == null) return;
        const fullType = parentType ? `${parentType}/${res.type}` : res.type;
        const rawName = String(res.name);
        const fullName = parentName ? `${parentName}/${rawName}` : rawName;
        const kind = res.kind || '';
        const category = armCategoryForType(fullType, kind);

        if (category) {
            const config = RESOURCE_CATEGORIES[category];
            const id = `arm.${fullType.toLowerCase()}.${fullName.toLowerCase()}`;
            const displayName = fullName.includes('/') ? fullName.split('/').pop() : fullName;
            if (!supportedIds.has(id)) {
                resources.push({ id, type: fullType, name: displayName, category, label: config.label, color: config.color, icon: config.icon });
                supportedIds.add(id);
                nameToId.set(rawName.toLowerCase(), id);
                nameToId.set(fullName.toLowerCase(), id);
                if (displayName.toLowerCase() !== rawName.toLowerCase()) nameToId.set(displayName.toLowerCase(), id);
            }
        }

        if (Array.isArray(res.resources)) {
            for (const child of res.resources) processRes(child, fullType, fullName);
        }
    }

    for (const res of template.resources) processRes(res);

    if (!resources.length) return { resources, connections: [], vpcOf: {}, subnetOf: {} };

    const vpcOf = {};
    const subnetOf = {};
    const connections = [];
    const seen = new Set();

    function addConn(from, to) {
        if (!from || !to || from === to) return;
        const key = `${from}->${to}`;
        if (!seen.has(key)) { seen.add(key); connections.push({ from, to }); }
    }

    for (const res of template.resources) {
        if (!res || !res.type || res.name == null) continue;
        const rawName = String(res.name);
        const fullType = res.type.toLowerCase();
        const myId = nameToId.get(rawName.toLowerCase());
        if (!myId || !supportedIds.has(myId)) continue;

        // Subnet → VNet containment (child type)
        if (fullType === 'microsoft.network/virtualnetworks/subnets' && rawName.includes('/')) {
            const vnetName = rawName.split('/')[0];
            const vnetId = nameToId.get(vnetName.toLowerCase());
            if (vnetId) vpcOf[myId] = vnetId;
        }

        // dependsOn connections
        for (const dep of (res.dependsOn || [])) {
            if (typeof dep !== 'string') continue;
            const refName = extractArmResourceName(dep);
            const refId = refName ? nameToId.get(refName.toLowerCase()) : null;
            if (refId && refId !== myId) addConn(refId, myId);
        }

        // Property-level resourceId refs for containment
        const props = res.properties || {};
        const subnetExpr = props.subnet?.id || props.virtualNetworkSubnetId || '';
        if (subnetExpr) {
            const refName = extractArmResourceName(String(subnetExpr));
            const refId = refName ? nameToId.get(refName.toLowerCase()) : null;
            if (refId) subnetOf[myId] = refId;
        }
        const vnetExpr = props.virtualNetwork?.id || '';
        if (vnetExpr) {
            const refName = extractArmResourceName(String(vnetExpr));
            const refId = refName ? nameToId.get(refName.toLowerCase()) : null;
            if (refId) vpcOf[myId] = refId;
        }

        // WorkspaceResourceId for App Insights → Log Analytics
        const wsExpr = props.WorkspaceResourceId || props.workspaceResourceId || '';
        if (wsExpr) {
            const refName = extractArmResourceName(String(wsExpr));
            const refId = refName ? nameToId.get(refName.toLowerCase()) : null;
            if (refId && refId !== myId) addConn(refId, myId);
        }
    }

    // Inline subnets in VNet properties
    for (const res of template.resources) {
        if (!res || res.type?.toLowerCase() !== 'microsoft.network/virtualnetworks') continue;
        const vnetName = String(res.name);
        const vnetId = nameToId.get(vnetName.toLowerCase());
        if (!vnetId) continue;
        for (const sub of (res.properties?.subnets || [])) {
            if (!sub.name) continue;
            const subId = `arm.microsoft.network/virtualnetworks/subnets.${vnetName.toLowerCase()}/${sub.name.toLowerCase()}`;
            if (!supportedIds.has(subId)) {
                const config = RESOURCE_CATEGORIES['subnet'];
                resources.push({ id: subId, type: 'Microsoft.Network/virtualNetworks/subnets', name: sub.name, category: 'subnet', label: config.label, color: config.color, icon: config.icon });
                supportedIds.add(subId);
                nameToId.set(sub.name.toLowerCase(), subId);
            }
            vpcOf[subId] = vnetId;
        }
    }

    return { resources, connections, vpcOf, subnetOf };
}

function findMatchingBraceMixed(source, openIndex) {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;

    for (let i = openIndex; i < source.length; i++) {
        const c = source[i];
        if (inDouble) {
            if (c === '\\') { i++; continue; }
            if (c === '"') inDouble = false;
            continue;
        }
        if (inSingle) {
            // Bicep escapes single quotes as ''
            if (c === "'" && source[i + 1] === "'") { i++; continue; }
            if (c === "'") inSingle = false;
            continue;
        }
        if (c === '"') { inDouble = true; continue; }
        if (c === "'") { inSingle = true; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return source.length;
}

export function parseBicep(code) {
    // resource varName 'Type@version' = [if (...)] {
    const resourceRe = /\bresource\s+(\w+)\s+'([^@']+)@[^']+'\s*=\s*(?:if\s*\([^)]*\)\s*)?\{/g;
    const entries = [];
    const seenVars = new Set();
    let m;

    while ((m = resourceRe.exec(code)) !== null) {
        const varName = m[1];
        if (seenVars.has(varName)) continue;
        seenVars.add(varName);
        const armType = m[2];
        const openIndex = resourceRe.lastIndex - 1;
        const closeIndex = findMatchingBraceMixed(code, openIndex);
        const body = code.slice(resourceRe.lastIndex, closeIndex);

        const nameMatch = /^\s*name\s*:\s*'([^']+)'/m.exec(body);
        const logicalName = nameMatch?.[1] || varName;
        const kindMatch = /^\s*kind\s*:\s*'([^']+)'/m.exec(body);
        const kind = kindMatch?.[1] || '';
        const parentMatch = /^\s*parent\s*:\s*(\w+)/m.exec(body);
        const parentVar = parentMatch?.[1] || null;

        entries.push({ varName, armType, logicalName, kind, body, parentVar });
        resourceRe.lastIndex = closeIndex + 1;
    }

    if (!entries.length) return { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

    const varToId = new Map();
    const resources = [];
    const supportedIds = new Set();

    for (const e of entries) {
        const category = armCategoryForType(e.armType, e.kind);
        if (!category) continue;
        const config = RESOURCE_CATEGORIES[category];
        const id = `bicep.${e.varName}`;
        varToId.set(e.varName, id);
        resources.push({ id, type: e.armType, name: e.logicalName, category, label: config.label, color: config.color, icon: config.icon });
        supportedIds.add(id);
    }

    if (!resources.length) return { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

    const vpcOf = {};
    const subnetOf = {};
    const connections = [];
    const connSeen = new Set();

    function addConn(from, to) {
        if (!from || !to || from === to) return;
        const key = `${from}->${to}`;
        if (!connSeen.has(key)) { connSeen.add(key); connections.push({ from, to }); }
    }

    const VPC_PROP_RE   = /\b(?:virtualNetworkId|vnetId|virtualNetwork)\s*:\s*(\w+)\.id/;
    const SUB_PROP_RE   = /\b(?:subnetId|vnetSubnetID|subnet)\s*:\s*(\w+)\.id/;
    const SKIP_LINE_RE  = /^\s*(?:name|location|parent|tags|addressPrefix|addressSpace|sku|tier|kind)\s*:/;

    for (const e of entries) {
        const myId = varToId.get(e.varName);
        if (!myId) continue;

        // parent → containment
        if (e.parentVar) {
            const parentId = varToId.get(e.parentVar);
            if (parentId) {
                const parentEntry = entries.find((x) => x.varName === e.parentVar);
                const parentCat = parentEntry ? armCategoryForType(parentEntry.armType, parentEntry.kind) : null;
                if (parentCat === 'vpc') vpcOf[myId] = parentId;
                else if (parentCat === 'subnet') subnetOf[myId] = parentId;
                else addConn(parentId, myId);
            }
        }

        for (const line of e.body.split('\n')) {
            if (SKIP_LINE_RE.test(line)) continue;

            const vm = VPC_PROP_RE.exec(line);
            if (vm) {
                const refId = varToId.get(vm[1]);
                if (refId && supportedIds.has(refId)) { vpcOf[myId] = refId; continue; }
            }
            const sm = SUB_PROP_RE.exec(line);
            if (sm) {
                const refId = varToId.get(sm[1]);
                if (refId && supportedIds.has(refId)) { subnetOf[myId] = refId; continue; }
            }

            for (const other of entries) {
                if (other.varName === e.varName) continue;
                const otherId = varToId.get(other.varName);
                if (!otherId || !supportedIds.has(otherId)) continue;
                if (new RegExp(`\\b${other.varName}\\.(id|name|properties|resourceId)\\b`).test(line)) {
                    addConn(otherId, myId);
                }
            }
        }
    }

    return { resources, connections, vpcOf, subnetOf };
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
    });
}

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

        // GCP network containment
        if (!vpcOf[block.id]) {
            const gcpNetId = firstReferencedAddress(block.body.match(/\bnetwork\s*=\s*([^\n]+)/)?.[1] || '', 'google_compute_network');
            if (gcpNetId && supportedIds.has(gcpNetId)) {
                vpcOf[block.id] = gcpNetId;
            }
        }

        const subnetId = firstReferencedAddress(
            block.body.match(/\b(?:subnet_ids?|subnets|vnet_subnet_id)\s*=\s*(\[[^\]]*\]|[^\n]+)/)?.[1] || '',
            'aws_subnet|azurerm_subnet',
        );
        if (subnetId && supportedIds.has(subnetId)) {
            subnetOf[block.id] = subnetId;
        }

        // GCP subnetwork containment
        if (!subnetOf[block.id]) {
            const gcpSubnetId = firstReferencedAddress(block.body.match(/\bsubnetwork\s*=\s*([^\n]+)/)?.[1] || '', 'google_compute_subnetwork');
            if (gcpSubnetId && supportedIds.has(gcpSubnetId)) {
                subnetOf[block.id] = gcpSubnetId;
            }
        }
    }

    const skipLine = /^\s*(?:vpc_id|subnet_id|subnet_ids|subnets|vnet_subnet_id|security_group_ids?|security_groups|allocation_id|cluster_name|db_subnet_group(?:_name)?|target_group_arns|vpc_zone_identifier|availability_zones?|cidr_block|enable_|tags\s*\{?|ingress|egress|from_port|to_port|protocol|master_|password|username|engine|instance_class|node_type|runtime|handler|role\s*=|assume_role|source_arn|bucket\s*=|domain\s*=|resource_group_name|virtual_network_name|location\s*=|address_space|address_prefixes|os_profile|storage_profile|network_interface_ids|sku\s*[={]|capacity\s*=|tenant_id|network\s*=|subnetwork\s*=|ip_cidr_range|region\s*=|zone\s*=|project\s*=|machine_type|disk_size|image\s*=|key_ring\s*=)\s*[=\[{]/;
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

export async function parseDockerCompose(code) {
    if (!globalThis.jsyaml) await loadScript('/lib/js-yaml.min.js');
    const yamlParser = globalThis.jsyaml;
    if (!yamlParser) throw new Error('YAML parser (js-yaml) could not be loaded.');

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
    'network', 'subnetwork', 'region', 'zone', 'project', 'machine_type', 'key_ring',
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

                if (leaf === 'vpc_id' || leaf === 'virtual_network_name' || leaf === 'network') {
                    if (!vpcOf[addr]) vpcOf[addr] = ref;
                    continue;
                }
                if (leaf === 'subnet_id' || leaf === 'subnet_ids' || leaf === 'vnet_subnet_id' || leaf === 'subnetwork') {
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

// ─── parseCloudFormation ──────────────────────────────────────────────────────

const CFN_TYPE_TO_CATEGORY = {
    'AWS::EC2::VPC': 'vpc',
    'AWS::EC2::Subnet': 'subnet',
    'AWS::EC2::Instance': 'instance',
    'AWS::EC2::LaunchTemplate': 'instance',
    'AWS::AutoScaling::AutoScalingGroup': 'autoscaling',
    'AWS::AutoScaling::LaunchConfiguration': 'instance',
    'AWS::EKS::Cluster': 'eks',
    'AWS::EKS::Nodegroup': 'eks',
    'AWS::ECS::Cluster': 'ecs',
    'AWS::ECS::Service': 'ecs',
    'AWS::ECS::TaskDefinition': 'ecs',
    'AWS::Lambda::Function': 'lambda',
    'AWS::RDS::DBInstance': 'rds',
    'AWS::RDS::DBCluster': 'rds',
    'AWS::DynamoDB::Table': 'dynamodb',
    'AWS::ElastiCache::CacheCluster': 'elasticache',
    'AWS::ElastiCache::ReplicationGroup': 'elasticache',
    'AWS::S3::Bucket': 's3',
    'AWS::ElasticLoadBalancingV2::LoadBalancer': 'alb',
    'AWS::ElasticLoadBalancingV2::TargetGroup': 'tg',
    'AWS::ElasticLoadBalancing::LoadBalancer': 'alb',
    'AWS::EC2::SecurityGroup': 'sg',
    'AWS::IAM::Role': 'iam_role',
    'AWS::Route53::RecordSet': 'route53',
    'AWS::Route53::RecordSetGroup': 'route53',
    'AWS::Route53::HostedZone': 'route53',
    'AWS::CloudFront::Distribution': 'cloudfront',
    'AWS::SQS::Queue': 'sqs',
    'AWS::SNS::Topic': 'sns',
    'AWS::ECR::Repository': 'ecr',
    'AWS::EC2::NatGateway': 'nat',
    'AWS::EC2::InternetGateway': 'igw',
    'AWS::EC2::EIP': 'eip',
    'AWS::KMS::Key': 'kms',
    'AWS::CloudWatch::Alarm': 'cloudwatch',
    'AWS::Logs::LogGroup': 'cloudwatch',
    'AWS::WAFv2::WebACL': 'waf',
    'AWS::EC2::RouteTable': 'route_table',
    'AWS::EC2::TransitGateway': 'transit_gw',
    'AWS::EC2::VPNGateway': 'vpn_gw',
    'AWS::EC2::NetworkInterface': 'network_iface',
};

const CFN_SKIP_CONN_PROPS = new Set([
    'VpcId', 'SubnetId', 'SubnetIds', 'Subnets', 'SecurityGroupIds',
    'SecurityGroups', 'VpcSecurityGroupIds', 'AvailabilityZone',
    'AvailabilityZones', 'Tags', 'CidrBlock', 'ImageId', 'KeyName',
    'UserData', 'DBSubnetGroupName', 'MasterUserPassword', 'MasterUsername', 'GroupId',
]);

function getCfnRef(value) {
    if (!value || typeof value !== 'object') return null;
    if ('Ref' in value && typeof value.Ref === 'string') return value.Ref;
    if ('Fn::GetAtt' in value) {
        const g = value['Fn::GetAtt'];
        if (Array.isArray(g) && typeof g[0] === 'string') return g[0];
        if (typeof g === 'string') return g.split('.')[0];
    }
    return null;
}

function collectCfnRefs(value, result = new Set()) {
    if (!value || typeof value !== 'object') return result;
    if (Array.isArray(value)) { for (const item of value) collectCfnRefs(item, result); return result; }
    const ref = getCfnRef(value);
    if (ref) { result.add(ref); return result; }
    for (const val of Object.values(value)) collectCfnRefs(val, result);
    return result;
}

function buildCfnYamlSchema(jsyaml) {
    const scalar = (tag, fn) => new jsyaml.Type(tag, { kind: 'scalar', construct: fn });
    const seq    = (tag, fn) => new jsyaml.Type(tag, { kind: 'sequence', construct: fn });
    const map    = (tag, fn) => new jsyaml.Type(tag, { kind: 'mapping', construct: fn });
    return jsyaml.DEFAULT_SCHEMA.extend([
        scalar('!Ref',         d => ({ Ref: d })),
        scalar('!GetAtt',      d => ({ 'Fn::GetAtt': d.includes('.') ? d.split('.') : [d] })),
        scalar('!Sub',         d => ({ 'Fn::Sub': d })),
        scalar('!Base64',      d => ({ 'Fn::Base64': d })),
        scalar('!ImportValue', d => ({ 'Fn::ImportValue': d })),
        scalar('!Condition',   d => ({ Condition: d })),
        seq('!Sub',         d => ({ 'Fn::Sub': d })),
        seq('!Select',      d => ({ 'Fn::Select': d })),
        seq('!Join',        d => ({ 'Fn::Join': d })),
        seq('!Split',       d => ({ 'Fn::Split': d })),
        seq('!FindInMap',   d => ({ 'Fn::FindInMap': d })),
        seq('!If',          d => ({ 'Fn::If': d })),
        seq('!And',         d => ({ 'Fn::And': d })),
        seq('!Or',          d => ({ 'Fn::Or': d })),
        seq('!Not',         d => ({ 'Fn::Not': d })),
        map('!GetAtt',      d => ({ 'Fn::GetAtt': d })),
    ]);
}

export async function parseCloudFormation(code) {
    if (!globalThis.jsyaml) await loadScript('/lib/js-yaml.min.js');
    const yamlParser = globalThis.jsyaml;

    let template;
    try {
        if (code.trimStart().startsWith('{')) {
            template = JSON.parse(code);
        } else {
            const schema = buildCfnYamlSchema(yamlParser);
            template = yamlParser.load(code, { schema });
        }
    } catch (e) {
        throw new Error(`Invalid CloudFormation template — ${e.message}`);
    }

    if (!template || typeof template !== 'object' || !template.Resources) {
        throw new Error('No Resources section found in CloudFormation template.');
    }

    const cfnResources = template.Resources;
    const resources = [];
    const supportedIds = new Set();

    for (const [logicalId, resource] of Object.entries(cfnResources)) {
        if (!resource || typeof resource !== 'object' || !resource.Type) continue;
        const cfnType = resource.Type;

        let category;
        if (cfnType === 'AWS::ElasticLoadBalancingV2::LoadBalancer') {
            category = resource.Properties?.Type === 'network' ? 'nlb' : 'alb';
        } else {
            category = CFN_TYPE_TO_CATEGORY[cfnType];
        }
        if (!category) continue;

        const config = RESOURCE_CATEGORIES[category];
        resources.push({ id: logicalId, type: cfnType, name: logicalId, category, label: config.label, color: config.color, icon: config.icon });
        supportedIds.add(logicalId);
    }

    const vpcOf = {};
    const subnetOf = {};
    const connections = [];
    const seen = new Set();

    for (const resource of resources) {
        const props = cfnResources[resource.id]?.Properties || {};

        const vpcRef = getCfnRef(props.VpcId);
        if (vpcRef && supportedIds.has(vpcRef)) vpcOf[resource.id] = vpcRef;

        if (!subnetOf[resource.id]) {
            const subRef = getCfnRef(props.SubnetId);
            if (subRef && supportedIds.has(subRef)) subnetOf[resource.id] = subRef;
        }
        if (!subnetOf[resource.id]) {
            const subnetsVal = props.SubnetIds || props.Subnets;
            if (Array.isArray(subnetsVal) && subnetsVal.length > 0) {
                const subRef = getCfnRef(subnetsVal[0]);
                if (subRef && supportedIds.has(subRef)) subnetOf[resource.id] = subRef;
            }
        }

        for (const [propName, propValue] of Object.entries(props)) {
            if (CFN_SKIP_CONN_PROPS.has(propName)) continue;
            for (const ref of collectCfnRefs(propValue)) {
                if (!supportedIds.has(ref) || ref === resource.id) continue;
                const key = `${ref}->${resource.id}`;
                if (!seen.has(key)) { seen.add(key); connections.push({ from: ref, to: resource.id }); }
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

// ─── parsePulumi ──────────────────────────────────────────────────────────────
// Supports Pulumi TypeScript and Python programs.
// Strategy: regex-scan for `new provider.Module.Class("name", {...})` (TS)
// and `varName = provider.Module.Class("name", ...)` (Python).
// Then resolve .id references between variables to build connections.

const PULUMI_TO_TF = {
    // AWS
    'aws.ec2.Vpc':                        'aws_vpc',
    'aws.ec2.DefaultVpc':                 'aws_default_vpc',
    'aws.ec2.Subnet':                     'aws_subnet',
    'aws.ec2.DefaultSubnet':              'aws_subnet',
    'aws.ec2.Instance':                   'aws_instance',
    'aws.ec2.LaunchTemplate':             'aws_launch_template',
    'aws.ec2.SecurityGroup':              'aws_security_group',
    'aws.ec2.InternetGateway':            'aws_internet_gateway',
    'aws.ec2.NatGateway':                 'aws_nat_gateway',
    'aws.ec2.Eip':                        'aws_eip',
    'aws.ec2.RouteTable':                 'aws_route_table',
    'aws.ec2.RouteTableAssociation':      'aws_route_table_association',
    'aws.ec2.TransitGateway':             'aws_transit_gateway',
    'aws.ec2.VpnGateway':                 'aws_vpn_gateway',
    'aws.ec2.NetworkInterface':           'aws_network_interface',
    'aws.eks.Cluster':                    'aws_eks_cluster',
    'aws.eks.NodeGroup':                  'aws_eks_node_group',
    'aws.ecs.Cluster':                    'aws_ecs_cluster',
    'aws.ecs.Service':                    'aws_ecs_service',
    'aws.ecs.TaskDefinition':             'aws_ecs_task_definition',
    'aws.lambda.Function':                'aws_lambda_function',
    'aws.lambda_.Function':               'aws_lambda_function',
    'aws.rds.Instance':                   'aws_db_instance',
    'aws.rds.Cluster':                    'aws_rds_cluster',
    'aws.dynamodb.Table':                 'aws_dynamodb_table',
    'aws.elasticache.Cluster':            'aws_elasticache_cluster',
    'aws.elasticache.ReplicationGroup':   'aws_elasticache_replication_group',
    'aws.s3.Bucket':                      'aws_s3_bucket',
    'aws.s3.BucketV2':                    'aws_s3_bucket',
    'aws.lb.LoadBalancer':                'aws_lb',
    'aws.alb.LoadBalancer':               'aws_alb',
    'aws.lb.TargetGroup':                 'aws_lb_target_group',
    'aws.alb.TargetGroup':                'aws_alb_target_group',
    'aws.iam.Role':                       'aws_iam_role',
    'aws.cloudwatch.MetricAlarm':         'aws_cloudwatch_metric_alarm',
    'aws.cloudwatch.LogGroup':            'aws_cloudwatch_log_group',
    'aws.kms.Key':                        'aws_kms_key',
    'aws.cloudfront.Distribution':        'aws_cloudfront_distribution',
    'aws.route53.Zone':                   'aws_route53_zone',
    'aws.route53.Record':                 'aws_route53_record',
    'aws.ecr.Repository':                 'aws_ecr_repository',
    'aws.sqs.Queue':                      'aws_sqs_queue',
    'aws.sns.Topic':                      'aws_sns_topic',
    'aws.autoscaling.Group':              'aws_autoscaling_group',
    'aws.wafv2.WebAcl':                   'aws_wafv2_web_acl',
    // GCP
    'gcp.compute.Network':                'google_compute_network',
    'gcp.compute.Subnetwork':             'google_compute_subnetwork',
    'gcp.compute.Firewall':               'google_compute_firewall',
    'gcp.compute.Router':                 'google_compute_router',
    'gcp.compute.Address':                'google_compute_address',
    'gcp.compute.GlobalAddress':          'google_compute_global_address',
    'gcp.compute.Instance':               'google_compute_instance',
    'gcp.compute.InstanceTemplate':       'google_compute_instance_template',
    'gcp.compute.InstanceGroup':          'google_compute_instance_group',
    'gcp.compute.Autoscaler':             'google_compute_autoscaler',
    'gcp.compute.GlobalForwardingRule':   'google_compute_global_forwarding_rule',
    'gcp.compute.ForwardingRule':         'google_compute_forwarding_rule',
    'gcp.compute.BackendService':         'google_compute_backend_service',
    'gcp.compute.UrlMap':                 'google_compute_url_map',
    'gcp.container.Cluster':              'google_container_cluster',
    'gcp.container.NodePool':             'google_container_node_pool',
    'gcp.cloudrun.Service':               'google_cloud_run_service',
    'gcp.cloudrunv2.Service':             'google_cloud_run_v2_service',
    'gcp.cloudfunctions.Function':        'google_cloudfunctions_function',
    'gcp.cloudfunctionsv2.Function':      'google_cloudfunctions2_function',
    'gcp.sql.DatabaseInstance':           'google_sql_database_instance',
    'gcp.bigquery.Dataset':               'google_bigquery_dataset',
    'gcp.bigquery.Table':                 'google_bigquery_table',
    'gcp.spanner.Instance':               'google_spanner_instance',
    'gcp.bigtable.Instance':              'google_bigtable_instance',
    'gcp.firestore.Document':             'google_firestore_document',
    'gcp.redis.Instance':                 'google_redis_instance',
    'gcp.memcache.Instance':              'google_memcache_instance',
    'gcp.storage.Bucket':                 'google_storage_bucket',
    'gcp.kms.KeyRing':                    'google_kms_key_ring',
    'gcp.kms.CryptoKey':                  'google_kms_crypto_key',
    'gcp.secretmanager.Secret':           'google_secret_manager_secret',
    'gcp.serviceaccount.Account':         'google_service_account',
    'gcp.pubsub.Topic':                   'google_pubsub_topic',
    'gcp.pubsub.Subscription':            'google_pubsub_subscription',
    'gcp.dns.ManagedZone':                'google_dns_managed_zone',
    'gcp.monitoring.AlertPolicy':         'google_monitoring_alert_policy',
    // Azure
    'azure.network.VirtualNetwork':             'azurerm_virtual_network',
    'azure.network.Subnet':                     'azurerm_subnet',
    'azure.network.NetworkSecurityGroup':       'azurerm_network_security_group',
    'azure.compute.VirtualMachine':             'azurerm_linux_virtual_machine',
    'azure.compute.LinuxVirtualMachine':        'azurerm_linux_virtual_machine',
    'azure.compute.WindowsVirtualMachine':      'azurerm_windows_virtual_machine',
    'azure.compute.ScaleSet':                   'azurerm_virtual_machine_scale_set',
    'azure.containerservice.KubernetesCluster': 'azurerm_kubernetes_cluster',
    'azure.containerservice.Group':             'azurerm_container_group',
    'azure.appservice.Plan':                    'azurerm_app_service',
    'azure.appservice.AppService':              'azurerm_linux_web_app',
    'azure.web.AppService':                     'azurerm_linux_web_app',
    'azure.appservice.FunctionApp':             'azurerm_function_app',
    'azure.network.ApplicationGateway':         'azurerm_application_gateway',
    'azure.network.LoadBalancer':               'azurerm_lb',
    'azure.cdn.FrontdoorProfile':               'azurerm_cdn_frontdoor_profile',
    'azure.sql.Server':                         'azurerm_sql_server',
    'azure.sql.Database':                       'azurerm_sql_database',
    'azure.cosmosdb.Account':                   'azurerm_cosmosdb_account',
    'azure.postgresql.Server':                  'azurerm_postgresql_server',
    'azure.redis.Cache':                        'azurerm_redis_cache',
    'azure.storage.Account':                    'azurerm_storage_account',
    'azure.keyvault.KeyVault':                  'azurerm_key_vault',
    'azure.servicebus.Namespace':               'azurerm_servicebus_namespace',
    'azure.eventhub.EventHubNamespace':         'azurerm_eventhub_namespace',
    'azure.dns.Zone':                           'azurerm_dns_zone',
    'azure.privatedns.Zone':                    'azurerm_private_dns_zone',
    'azure.operationalinsights.Workspace':      'azurerm_log_analytics_workspace',
    'azure.insights.Component':                 'azurerm_application_insights',
};

function pulumiClassToTf(classPath) {
    return PULUMI_TO_TF[classPath.replace(/\s/g, '')] || null;
}

function extractPulumiResources(code) {
    const entries = [];
    const seen = new Set();

    // TypeScript: const/let/var varName = new provider.Module.Class("name", ...)
    const tsRe = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+((?:aws|gcp|azure(?:native)?|awsx)\s*\.\s*\w[\w]*\s*\.\s*\w+)\s*\(\s*["']([^"']+)["']/g;
    let m;
    while ((m = tsRe.exec(code)) !== null) {
        const [, varName, classPath, logicalName] = m;
        const tfType = pulumiClassToTf(classPath);
        if (tfType && !seen.has(varName)) { seen.add(varName); entries.push({ varName, tfType, logicalName }); }
    }

    // Python: varName = provider.Module.Class("name", ...)
    const pyRe = /^(\w+)\s*=\s*((?:aws|gcp|azure(?:native)?)\s*\.\s*\w[\w]*\s*\.\s*\w+)\s*\(\s*["']([^"']+)["']/gm;
    while ((m = pyRe.exec(code)) !== null) {
        const [, varName, classPath, logicalName] = m;
        if (seen.has(varName)) continue;
        const tfType = pulumiClassToTf(classPath);
        if (tfType) { seen.add(varName); entries.push({ varName, tfType, logicalName }); }
    }

    return entries;
}

export function parsePulumi(code) {
    const entries = extractPulumiResources(code);
    if (!entries.length) return { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

    const varToId = new Map();
    for (const e of entries) varToId.set(e.varName, `${e.tfType}.${e.logicalName}`);

    const resources = [];
    const supportedIds = new Set();
    for (const e of entries) {
        const id = varToId.get(e.varName);
        const category = categoryForTerraformBlock(e.tfType, '');
        if (!category) continue;
        const config = RESOURCE_CATEGORIES[category];
        resources.push({ id, type: e.tfType, name: e.logicalName, category, label: config.label, color: config.color, icon: config.icon });
        supportedIds.add(id);
    }

    if (!resources.length) return { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

    const varNames = [...varToId.keys()];
    const vpcOf = {};
    const subnetOf = {};
    const connections = [];
    const seen = new Set();

    // VPC / subnet containment — scan each line for containment props
    const VPC_PROP_RE  = /\b(?:vpcId|vpc_id|virtualNetworkName|virtual_network_name|network)\s*[:=]\s*(\w+)(?:\.id)?/;
    const SUB_PROP_RE  = /\b(?:subnetId|subnet_id|subnetIds|subnet_ids|subnetwork)\s*[:=]\s*(?:\[?\s*)?(\w+)(?:\.id)?/;
    const SKIP_CONN_RE = /\b(?:vpcId|vpc_id|virtualNetworkName|virtual_network_name|network|subnetId|subnet_id|subnetIds|subnet_ids|subnetwork|cidrBlock|cidr_block|tags|region|zone|project|location)\s*[:=]/;

    // Track current resource context while scanning lines
    let currentVar = null;
    for (const line of code.split('\n')) {
        // Detect resource declaration line
        for (const vn of varNames) {
            if (new RegExp(`(?:const|let|var\\s+)?\\b${vn}\\b\\s*=\\s*new\\b`).test(line) ||
                new RegExp(`^\\s*${vn}\\s*=\\s*(?:aws|gcp|azure)`).test(line)) {
                currentVar = vn; break;
            }
        }

        if (currentVar) {
            const vm = VPC_PROP_RE.exec(line);
            if (vm) {
                const refId = varToId.get(vm[1]);
                const ownId = varToId.get(currentVar);
                if (refId && ownId && supportedIds.has(refId) && supportedIds.has(ownId) && !vpcOf[ownId]) vpcOf[ownId] = refId;
            }
            const sm = SUB_PROP_RE.exec(line);
            if (sm) {
                const refId = varToId.get(sm[1]);
                const ownId = varToId.get(currentVar);
                if (refId && ownId && supportedIds.has(refId) && supportedIds.has(ownId) && !subnetOf[ownId]) subnetOf[ownId] = refId;
            }
        }

        // General connections (non-containment)
        if (SKIP_CONN_RE.test(line)) continue;
        for (const fromVar of varNames) {
            if (!new RegExp(`\\b${fromVar}\\.(?:id|arn|name|apply|output)\\b`).test(line)) continue;
            const fromId = varToId.get(fromVar);
            if (!fromId || !supportedIds.has(fromId)) continue;
            const toId = currentVar && currentVar !== fromVar ? varToId.get(currentVar) : null;
            if (!toId || !supportedIds.has(toId)) continue;
            const key = `${fromId}->${toId}`;
            if (!seen.has(key)) { seen.add(key); connections.push({ from: fromId, to: toId }); }
        }
    }

    return { resources, connections, vpcOf, subnetOf };
}

// ─── parseKubernetes ──────────────────────────────────────────────────────────
// Parses Kubernetes YAML manifests (single or multi-document with ---).
// Groups resources by namespace (rendered like VPC).
// Builds connections: Ingress→Service, Service→Deployment (selector match),
// Deployment→ConfigMap/Secret/PVC (volume/envFrom refs), HPA→target.

const K8S_KIND_MAP = {
    Deployment:              'k8s_deployment',
    StatefulSet:             'k8s_statefulset',
    DaemonSet:               'k8s_daemonset',
    Job:                     'k8s_job',
    CronJob:                 'k8s_cronjob',
    Pod:                     'k8s_deployment',
    ReplicaSet:              'k8s_deployment',
    Service:                 'k8s_service',
    Ingress:                 'k8s_ingress',
    ConfigMap:               'k8s_configmap',
    Secret:                  'k8s_secret',
    PersistentVolumeClaim:   'k8s_pvc',
    PersistentVolume:        'k8s_pv',
    ServiceAccount:          'k8s_sa',
    HorizontalPodAutoscaler: 'k8s_hpa',
    NetworkPolicy:           'k8s_netpol',
};

function k8sId(kind, ns, name) { return `k8s.${kind}.${ns || 'default'}.${name}`; }
function k8sNsId(ns) { return `k8s.ns.${ns}`; }

export async function parseKubernetes(code) {
    if (!globalThis.jsyaml) await loadScript('/lib/js-yaml.min.js');
    const yaml = globalThis.jsyaml;
    if (!yaml) throw new Error('YAML parser could not be loaded.');

    const docs = [];
    try { yaml.loadAll(code, (doc) => { if (doc && doc.kind) docs.push(doc); }); }
    catch { return { resources: [], connections: [], vpcOf: {}, subnetOf: {} }; }

    if (!docs.length) return { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

    const rawResources = [];
    const supportedIds = new Set();
    const vpcOf = {};
    const nsSet = new Set();

    for (const doc of docs) {
        const tfType = K8S_KIND_MAP[doc.kind];
        if (!tfType) continue;
        const name = doc.metadata?.name;
        if (!name) continue;
        const ns = doc.metadata?.namespace || 'default';
        nsSet.add(ns);
        const id = k8sId(doc.kind, ns, name);
        if (supportedIds.has(id)) continue;
        const config = RESOURCE_CATEGORIES[tfType];
        if (!config) continue;
        rawResources.push({ id, type: tfType, name, category: tfType, label: config.label, color: config.color, icon: config.icon, _doc: doc, _ns: ns, _kind: doc.kind });
        supportedIds.add(id);
    }

    // Implicit namespace resources (like VPC containers)
    const nsResources = [];
    const nsCfg = RESOURCE_CATEGORIES['k8s_ns'];
    for (const ns of nsSet) {
        const nsId = k8sNsId(ns);
        nsResources.push({ id: nsId, type: 'k8s_ns', name: ns, category: 'k8s_ns', label: nsCfg.label, color: nsCfg.color, icon: nsCfg.icon });
        supportedIds.add(nsId);
    }
    for (const r of rawResources) vpcOf[r.id] = k8sNsId(r._ns);

    // Name lookup: `${ns}/${name}` → id
    const byNameNs = new Map();
    for (const r of rawResources) byNameNs.set(`${r._ns}/${r.name}`, { id: r.id, doc: r._doc, kind: r._kind });

    const connections = [];
    const seen = new Set();
    function addConn(from, to) {
        if (!from || !to || from === to || !supportedIds.has(from) || !supportedIds.has(to)) return;
        const key = `${from}->${to}`;
        if (!seen.has(key)) { seen.add(key); connections.push({ from, to }); }
    }

    for (const r of rawResources) {
        const spec = r._doc.spec || {};
        const ns = r._ns;

        // Ingress → Service
        if (r._kind === 'Ingress') {
            for (const rule of (spec.rules || [])) {
                for (const path of (rule.http?.paths || [])) {
                    const sn = path.backend?.service?.name || path.backend?.serviceName;
                    if (sn) addConn(r.id, byNameNs.get(`${ns}/${sn}`)?.id);
                }
            }
            const dn = spec.defaultBackend?.service?.name || spec.defaultBackend?.serviceName;
            if (dn) addConn(r.id, byNameNs.get(`${ns}/${dn}`)?.id);
        }

        // Service → workloads via selector
        if (r._kind === 'Service') {
            const sel = Object.entries(spec.selector || {});
            if (sel.length) {
                for (const w of rawResources) {
                    if (w._ns !== ns || !['Deployment','StatefulSet','DaemonSet','ReplicaSet','Pod'].includes(w._kind)) continue;
                    const podLabels = w._doc.spec?.template?.metadata?.labels || w._doc.metadata?.labels || {};
                    if (sel.every(([k, v]) => podLabels[k] === v)) addConn(r.id, w.id);
                }
            }
        }

        // Workload → ConfigMap / Secret / PVC
        const podSpec = spec.template?.spec || (r._kind === 'Pod' ? spec : null)
            || spec.jobTemplate?.spec?.template?.spec;
        if (podSpec) {
            for (const vol of (podSpec.volumes || [])) {
                if (vol.configMap?.name) addConn(r.id, byNameNs.get(`${ns}/${vol.configMap.name}`)?.id);
                if (vol.secret?.secretName) addConn(r.id, byNameNs.get(`${ns}/${vol.secret.secretName}`)?.id);
                if (vol.persistentVolumeClaim?.claimName) addConn(r.id, byNameNs.get(`${ns}/${vol.persistentVolumeClaim.claimName}`)?.id);
            }
            for (const c of [...(podSpec.containers || []), ...(podSpec.initContainers || [])]) {
                for (const ef of (c.envFrom || [])) {
                    if (ef.configMapRef?.name) addConn(r.id, byNameNs.get(`${ns}/${ef.configMapRef.name}`)?.id);
                    if (ef.secretRef?.name) addConn(r.id, byNameNs.get(`${ns}/${ef.secretRef.name}`)?.id);
                }
                for (const env of (c.env || [])) {
                    if (env.valueFrom?.configMapKeyRef?.name) addConn(r.id, byNameNs.get(`${ns}/${env.valueFrom.configMapKeyRef.name}`)?.id);
                    if (env.valueFrom?.secretKeyRef?.name) addConn(r.id, byNameNs.get(`${ns}/${env.valueFrom.secretKeyRef.name}`)?.id);
                }
            }
            if (podSpec.serviceAccountName) addConn(r.id, byNameNs.get(`${ns}/${podSpec.serviceAccountName}`)?.id);
        }

        // HPA → scaleTargetRef
        if (r._kind === 'HorizontalPodAutoscaler' && spec.scaleTargetRef?.name) {
            addConn(r.id, byNameNs.get(`${ns}/${spec.scaleTargetRef.name}`)?.id);
        }
    }

    const cleanResources = [...nsResources, ...rawResources.map(({ _doc, _ns, _kind, ...r }) => r)];
    return { resources: cleanResources, connections, vpcOf, subnetOf: {} };
}
