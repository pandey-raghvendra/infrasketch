import { CATEGORY_GROUPS, STAT_CATEGORY_MAP, SVG_LAYOUT } from './constants.js';

function layoutGrid(nodes, maxCols, config) {
    const { NW, NH, NGX, NGY } = config;

    if (!nodes.length) return { pos: {}, W: 0, H: 0 };

    const cols = Math.min(maxCols, nodes.length);
    const rows = Math.ceil(nodes.length / cols);
    const pos = {};

    nodes.forEach((node, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const rowItems = Math.min(nodes.length - row * cols, cols);
        const rowWidth = rowItems * NW + (rowItems - 1) * NGX;
        const totalWidth = cols * NW + (cols - 1) * NGX;

        pos[node.id] = {
            lx: (totalWidth - rowWidth) / 2 + col * (NW + NGX),
            ly: row * (NH + NGY),
        };
    });

    return {
        pos,
        W: cols * NW + (cols - 1) * NGX,
        H: rows * NH + (rows - 1) * NGY,
    };
}

function placeGridNodes(nodes, grid, x, y, positions, config) {
    for (const node of nodes) {
        const point = grid.pos[node.id];
        if (!point) continue;

        positions[node.id] = {
            x: x + point.lx,
            y: y + point.ly,
            w: config.NW,
            h: config.NH,
        };
    }
}

export function computeStats(resources) {
    const stats = { vpc: 0, compute: 0, db: 0, storage: 0, lb: 0 };

    for (const resource of resources) {
        for (const [stat, categories] of Object.entries(STAT_CATEGORY_MAP)) {
            if (categories.includes(resource.category)) stats[stat] += 1;
        }
    }

    return stats;
}

export function buildDiagramLayout(parsed, config = SVG_LAYOUT) {
    const { resources, connections, subnetOf = {} } = parsed;
    const {
        NW,
        NH,
        CP,
        VPC_LBL,
        VPC_PAD,
        SUB_LBL,
        SUB_PAD,
        SUB_GAP,
        ZONE_GAP,
        SEC_GAP,
    } = config;

    const vpcRes = resources.filter((resource) => CATEGORY_GROUPS.VPC.has(resource.category));
    const subnetRes = resources.filter((resource) => CATEGORY_GROUPS.SUBNET.has(resource.category));
    const secRes = resources.filter((resource) => CATEGORY_GROUPS.SECURITY.has(resource.category));
    const msgRes = resources.filter((resource) => CATEGORY_GROUPS.MESSAGING.has(resource.category));
    const intRes = resources.filter((resource) => CATEGORY_GROUPS.INTERNET.has(resource.category));
    const hasVpc = vpcRes.length > 0;

    const subnetContents = {};
    subnetRes.forEach((subnet) => {
        subnetContents[subnet.id] = [];
    });

    const vpcIngressRes = [];
    const vpcDataRes = [];
    const vpcOtherRes = [];

    for (const resource of resources) {
        const category = resource.category;
        if (
            CATEGORY_GROUPS.VPC.has(category)
            || CATEGORY_GROUPS.SUBNET.has(category)
            || CATEGORY_GROUPS.SECURITY.has(category)
            || CATEGORY_GROUPS.MESSAGING.has(category)
            || CATEGORY_GROUPS.INTERNET.has(category)
        ) {
            continue;
        }

        const subnetId = subnetOf[resource.id];
        if (subnetId && subnetContents[subnetId] !== undefined) {
            subnetContents[subnetId].push(resource);
        } else if (CATEGORY_GROUPS.INGRESS.has(category)) {
            vpcIngressRes.push(resource);
        } else if (CATEGORY_GROUPS.DATA.has(category)) {
            vpcDataRes.push(resource);
        } else {
            vpcOtherRes.push(resource);
        }
    }

    const subLayouts = {};
    subnetRes.forEach((subnet) => {
        subLayouts[subnet.id] = layoutGrid(subnetContents[subnet.id] || [], config.maxSubnetCols, config);
    });

    function subBoxDim(subnetId) {
        const { W, H } = subLayouts[subnetId] || { W: 0, H: 0 };
        return {
            bw: Math.max(W, NW) + SUB_PAD * 2,
            bh: (H > 0 ? H : NH) + SUB_LBL + SUB_PAD,
        };
    }

    const ingressGrid = layoutGrid(vpcIngressRes, config.maxIngressCols, config);
    const dataGrid = layoutGrid(vpcDataRes, config.maxDataCols, config);
    const otherGrid = layoutGrid(vpcOtherRes, config.maxOtherCols, config);
    const intGrid = layoutGrid(intRes, config.maxInternetCols, config);
    const msgGrid = layoutGrid(msgRes, config.maxMessagingCols, config);
    const secGrid = layoutGrid(secRes, 1, config);

    const subnetRowW = subnetRes.reduce((acc, subnet, index) => acc + subBoxDim(subnet.id).bw + (index > 0 ? SUB_GAP : 0), 0);
    const subnetRowH = subnetRes.reduce((acc, subnet) => Math.max(acc, subBoxDim(subnet.id).bh), 0);

    const vpcContentW = Math.max(ingressGrid.W, subnetRowW, dataGrid.W, otherGrid.W, NW * 2);
    const vpcRows = [
        [vpcIngressRes.length, ingressGrid.H],
        [subnetRes.length, subnetRowH],
        [vpcDataRes.length, dataGrid.H],
        [vpcOtherRes.length, otherGrid.H],
    ].filter(([count]) => count > 0);

    const vpcContentH = vpcRows.reduce((acc, [, height], index) => acc + height + (index > 0 ? ZONE_GAP : 0), 0) || NH;
    const vpcBoxW = hasVpc ? vpcContentW + VPC_PAD * 2 : vpcContentW;
    const vpcBoxH = hasVpc ? vpcContentH + VPC_LBL + VPC_PAD : vpcContentH;
    const intZoneH = intRes.length ? intGrid.H + 32 : 0;
    const msgZoneH = msgRes.length ? msgGrid.H + 32 : 0;
    const mainW = Math.max(vpcBoxW, intGrid.W, msgGrid.W);
    const mainH = (intZoneH ? intZoneH + ZONE_GAP : 0) + vpcBoxH + (msgZoneH ? ZONE_GAP + msgZoneH : 0);
    const secColW = secRes.length ? NW + SEC_GAP : 0;
    const svgW = CP + mainW + secColW + CP;
    const svgH = CP + mainH + CP;

    const positions = {};
    let absY = CP;
    const absX = CP;

    if (intRes.length) {
        const zoneX = absX + (mainW - intGrid.W) / 2;
        placeGridNodes(intRes, intGrid, zoneX, absY + 16, positions, config);
        absY += intZoneH + ZONE_GAP;
    }

    const vpcY = absY;
    const vpcX = absX;
    const innerX = hasVpc ? vpcX + VPC_PAD : vpcX;
    let innerY = hasVpc ? vpcY + VPC_LBL : vpcY;

    if (vpcIngressRes.length) {
        const rowX = innerX + (vpcContentW - ingressGrid.W) / 2;
        placeGridNodes(vpcIngressRes, ingressGrid, rowX, innerY, positions, config);
        innerY += ingressGrid.H + ZONE_GAP;
    }

    if (subnetRes.length) {
        let subX = innerX + (vpcContentW - subnetRowW) / 2;
        for (const subnet of subnetRes) {
            const { bw, bh } = subBoxDim(subnet.id);
            const layout = subLayouts[subnet.id];
            positions[subnet.id] = { x: subX, y: innerY, w: bw, h: bh, isSubnet: true };

            const contentX = subX + SUB_PAD + (bw - SUB_PAD * 2 - layout.W) / 2;
            const contentY = innerY + SUB_LBL;
            placeGridNodes(subnetContents[subnet.id] || [], layout, contentX, contentY, positions, config);
            subX += bw + SUB_GAP;
        }
        innerY += subnetRowH + ZONE_GAP;
    }

    if (vpcDataRes.length) {
        const rowX = innerX + (vpcContentW - dataGrid.W) / 2;
        placeGridNodes(vpcDataRes, dataGrid, rowX, innerY, positions, config);
        innerY += dataGrid.H + ZONE_GAP;
    }

    if (vpcOtherRes.length) {
        const rowX = innerX + (vpcContentW - otherGrid.W) / 2;
        placeGridNodes(vpcOtherRes, otherGrid, rowX, innerY, positions, config);
    }

    absY += vpcBoxH;

    if (msgRes.length) {
        absY += ZONE_GAP;
        const rowX = absX + (mainW - msgGrid.W) / 2;
        placeGridNodes(msgRes, msgGrid, rowX, absY + 16, positions, config);
        absY += msgZoneH;
    }

    const secX = CP + mainW + SEC_GAP;
    const secStartY = CP + (mainH - secGrid.H) / 2;
    if (secRes.length) {
        placeGridNodes(secRes, secGrid, secX, secStartY, positions, config);
    }

    return {
        config,
        resources,
        connections,
        positions,
        groups: {
            vpcRes,
            subnetRes,
            secRes,
            msgRes,
            intRes,
            vpcIngressRes,
            vpcDataRes,
            vpcOtherRes,
            subnetContents,
        },
        metrics: {
            absX,
            mainW,
            mainH,
            svgW,
            svgH,
            hasVpc,
            vpcX,
            vpcY,
            vpcBoxW,
            vpcBoxH,
            intZoneH,
            msgZoneH,
            secX,
            secStartY,
            secGridH: secGrid.H,
        },
    };
}
