import { extractModuleBlocks, parseTerraform } from './parser.js';

const REGISTRY_API = 'https://registry.terraform.io/v1/modules';
const GH_RAW = 'https://raw.githubusercontent.com';
const GH_API = 'https://api.github.com/repos';

// ── ZIP helpers ───────────────────────────────────────────────────────────────

function findCommonPrefix(paths) {
    if (!paths.length) return '';
    const segments = paths[0].split('/');
    let depth = 0;
    for (let d = 1; d < segments.length; d++) {
        const candidate = segments.slice(0, d).join('/') + '/';
        if (paths.every(p => p.startsWith(candidate))) depth = d;
        else break;
    }
    return depth ? segments.slice(0, depth).join('/') + '/' : '';
}

export async function buildVirtualFS(zipFile) {
    const JSZip = globalThis.JSZip;
    if (!JSZip) throw new Error('JSZip not loaded — ensure lib/jszip.min.js is included.');

    const zip = await JSZip.loadAsync(zipFile);
    const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir && p.endsWith('.tf'));
    const prefix = findCommonPrefix(allPaths);

    const fs = new Map();
    await Promise.all(
        allPaths.map(async path => {
            const normalized = prefix ? path.slice(prefix.length) : path;
            if (normalized) {
                const content = await zip.files[path].async('string');
                fs.set(normalized, content);
            }
        })
    );
    return fs;
}

// ── Path resolution ───────────────────────────────────────────────────────────

function resolveDirPath(source) {
    const parts = source.split('/').filter(Boolean);
    const resolved = [];
    for (const p of parts) {
        if (p === '..') resolved.pop();
        else if (p !== '.') resolved.push(p);
    }
    return resolved.join('/');
}

function getModuleFilesFromVirtualFS(virtualFS, dirPath) {
    const prefix = dirPath ? dirPath + '/' : '';
    const results = [];
    for (const [path, content] of virtualFS) {
        if (path.endsWith('.tf') && (!prefix || path.startsWith(prefix))) {
            results.push(content);
        }
    }
    return results;
}

// ── Registry / GitHub fetch ───────────────────────────────────────────────────

function parseRegistrySource(source) {
    const clean = source.replace(/^registry\.terraform\.io\//, '');
    const parts = clean.split('/');
    return parts.length === 3 ? { namespace: parts[0], name: parts[1], provider: parts[2] } : null;
}

async function getModuleGitHubInfo(namespace, name, provider) {
    try {
        const resp = await fetch(`${REGISTRY_API}/${namespace}/${name}/${provider}`, {
            headers: { Accept: 'application/json' },
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const repoPath = data.source?.replace('github.com/', '');
        return repoPath ? { repo: repoPath, version: data.version } : null;
    } catch { return null; }
}

async function fetchTfFilesFromGitHub(repo, version) {
    const refs = version ? [`v${version}`, version, 'master', 'main'] : ['master', 'main'];

    for (const ref of refs) {
        try {
            const treeResp = await fetch(`${GH_API}/${repo}/git/trees/${ref}?recursive=1`);
            if (!treeResp.ok) continue;
            const treeData = await treeResp.json();

            const rootTfFiles = (treeData.tree || []).filter(
                f => f.type === 'blob' && f.path.endsWith('.tf') && !f.path.includes('/')
            );

            const contents = await Promise.all(
                rootTfFiles.map(async f => {
                    try {
                        const r = await fetch(`${GH_RAW}/${repo}/${ref}/${f.path}`);
                        return r.ok ? r.text() : null;
                    } catch { return null; }
                })
            );

            const valid = (await Promise.all(contents)).filter(Boolean);
            if (valid.length) return valid;
        } catch { continue; }
    }
    return [];
}

export async function fetchRegistryModuleFiles(source) {
    const reg = parseRegistrySource(source);
    if (!reg) return null;
    const info = await getModuleGitHubInfo(reg.namespace, reg.name, reg.provider);
    if (!info) return null;
    const files = await fetchTfFilesFromGitHub(info.repo, info.version);
    return files.length ? files.join('\n\n') : null;
}

// ── Module expansion ──────────────────────────────────────────────────────────

function prefixParsedResult(parsed, modulePrefix) {
    const p = id => `${modulePrefix}.${id}`;
    return {
        resources: parsed.resources
            .filter(r => r.type !== 'tf_module')
            .map(r => ({ ...r, id: p(r.id) })),
        connections: parsed.connections.map(c => ({ from: p(c.from), to: p(c.to) })),
        vpcOf: Object.fromEntries(Object.entries(parsed.vpcOf).map(([k, v]) => [p(k), p(v)])),
        subnetOf: Object.fromEntries(Object.entries(parsed.subnetOf).map(([k, v]) => [p(k), p(v)])),
    };
}

export async function expandModules(rootParsed, rootCode, { virtualFS = null, fetchRegistry = false } = {}) {
    if (!virtualFS?.size && !fetchRegistry) return rootParsed;

    const moduleBlocks = extractModuleBlocks(rootCode);
    if (!moduleBlocks.length) return rootParsed;

    const expandedModuleIds = new Set();
    const extra = { resources: [], connections: [], vpcOf: {}, subnetOf: {} };

    for (const mod of moduleBlocks) {
        const source = mod.body.match(/\bsource\s*=\s*"([^"]+)"/)?.[1];
        if (!source) continue;

        let moduleCode = null;

        if ((source.startsWith('./') || source.startsWith('../')) && virtualFS?.size) {
            const dir = resolveDirPath(source);
            const files = getModuleFilesFromVirtualFS(virtualFS, dir);
            if (files.length) moduleCode = files.join('\n\n');
        } else if (
            fetchRegistry &&
            !source.startsWith('.') &&
            !source.startsWith('git::') &&
            !source.startsWith('http')
        ) {
            moduleCode = await fetchRegistryModuleFiles(source);
        }

        if (!moduleCode) continue;

        expandedModuleIds.add(mod.id);
        const moduleParsed = parseTerraform(moduleCode);
        const prefixed = prefixParsedResult(moduleParsed, `module.${mod.name}`);

        extra.resources.push(...prefixed.resources);
        extra.connections.push(...prefixed.connections);
        Object.assign(extra.vpcOf, prefixed.vpcOf);
        Object.assign(extra.subnetOf, prefixed.subnetOf);
    }

    if (!expandedModuleIds.size) return rootParsed;

    return {
        resources: [
            ...rootParsed.resources.filter(r => !expandedModuleIds.has(r.id)),
            ...extra.resources,
        ],
        connections: [...rootParsed.connections, ...extra.connections],
        vpcOf: { ...rootParsed.vpcOf, ...extra.vpcOf },
        subnetOf: { ...rootParsed.subnetOf, ...extra.subnetOf },
    };
}
