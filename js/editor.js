let _state = null;

function _connectionPath(from, to, config) {
    const { NW, NH } = config;
    const fx = from.x + NW / 2;
    const fy = from.y + NH / 2;
    const tx = to.x + NW / 2;
    const ty = to.y + NH / 2;
    const vertDiff = ty - fy;

    if (Math.abs(vertDiff) < NH * 0.6) {
        const ex1 = fx < tx ? from.x + NW : from.x;
        const ex2 = tx > fx ? to.x : to.x + NW;
        return `M${ex1},${fy} L${ex2},${ty}`;
    }

    if (vertDiff > 0) {
        const y1 = from.y + NH;
        const y2 = to.y;
        const midY = (y1 + y2) / 2;
        return `M${fx},${y1} L${fx},${midY} L${tx},${midY} L${tx},${y2}`;
    }

    const y1 = from.y;
    const y2 = to.y + NH;
    const midY = (y1 + y2) / 2;
    return `M${fx},${y1} L${fx},${midY} L${tx},${midY} L${tx},${y2}`;
}

function _effectivePos(nodeId) {
    const base = _state.layout.positions[nodeId];
    if (!base) return null;
    const off = _state.offsets[nodeId] || { dx: 0, dy: 0 };
    return { x: base.x + off.dx, y: base.y + off.dy };
}

function _redrawConnectionPath(path) {
    const fromId = path.getAttribute('data-from');
    const toId = path.getAttribute('data-to');
    const from = _effectivePos(fromId);
    const to = _effectivePos(toId);
    if (!from || !to) return;
    path.setAttribute('d', _connectionPath(from, to, _state.layout.config));
}

function _redrawConnectionsForNode(nodeId) {
    _state.svg
        .querySelectorAll(`[data-from="${nodeId}"], [data-to="${nodeId}"]`)
        .forEach(_redrawConnectionPath);
}

function _redrawAllConnections() {
    _state.svg.querySelectorAll('[data-from]').forEach(_redrawConnectionPath);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function _setSelection(nodeId) {
    const { svg, layout } = _state;
    svg.querySelectorAll('.resource-node.selected').forEach((g) => {
        g.classList.remove('selected');
        g.querySelector('.selection-ring')?.remove();
    });

    if (!nodeId) return;

    const group = svg.querySelector(`.resource-node[data-node-id="${nodeId}"]`);
    if (!group) return;
    group.classList.add('selected');

    const pos = layout.positions[nodeId];
    const { NW, NH } = layout.config;
    const ring = document.createElementNS(SVG_NS, 'rect');
    ring.setAttribute('class', 'selection-ring');
    ring.setAttribute('x', pos.x - 4);
    ring.setAttribute('y', pos.y - 4);
    ring.setAttribute('width', NW + 8);
    ring.setAttribute('height', NH + 8);
    ring.setAttribute('rx', 12);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#06d6a0');
    ring.setAttribute('stroke-width', '2');
    ring.setAttribute('stroke-dasharray', '4 2');
    group.insertBefore(ring, group.firstChild);
}

function _clientDeltaToNodeDelta(dClientX, dClientY) {
    const { svg, zoomState } = _state;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const svgDx = dClientX * vb.width / rect.width;
    const svgDy = dClientY * vb.height / rect.height;
    return { dx: svgDx / zoomState.scale, dy: svgDy / zoomState.scale };
}

function _onNodeMouseDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();

    const group = e.currentTarget;
    const nodeId = group.getAttribute('data-node-id');
    const existing = _state.offsets[nodeId] || { dx: 0, dy: 0 };

    _state.drag = {
        nodeId,
        group,
        startClientX: e.clientX,
        startClientY: e.clientY,
        baseDx: existing.dx,
        baseDy: existing.dy,
    };

    group.style.cursor = 'grabbing';
    _setSelection(nodeId);
}

function _onWindowMouseMove(e) {
    const drag = _state?.drag;
    if (!drag) return;

    const delta = _clientDeltaToNodeDelta(
        e.clientX - drag.startClientX,
        e.clientY - drag.startClientY,
    );
    const dx = drag.baseDx + delta.dx;
    const dy = drag.baseDy + delta.dy;

    _state.offsets[drag.nodeId] = { dx, dy };
    drag.group.setAttribute('transform', `translate(${dx},${dy})`);
    _redrawConnectionsForNode(drag.nodeId);
}

function _onWindowMouseUp() {
    if (!_state?.drag) return;
    _state.drag.group.style.cursor = 'grab';
    _state.drag = null;
}

function _onSvgClick(e) {
    if (e.target === _state?.svg || e.target.closest('.zoom-layer') === e.target) {
        _setSelection(null);
    }
}

export function initEditor(svg, layout, zoomState) {
    destroyEditor();

    _state = { svg, layout, zoomState, offsets: {}, drag: null };

    svg.querySelectorAll('.resource-node[data-node-id]').forEach((g) => {
        g.style.cursor = 'grab';
        g.addEventListener('mousedown', _onNodeMouseDown);
    });

    window.addEventListener('mousemove', _onWindowMouseMove);
    window.addEventListener('mouseup', _onWindowMouseUp);
    svg.addEventListener('click', _onSvgClick);
}

export function destroyEditor() {
    if (!_state) return;

    _state.svg.querySelectorAll('.resource-node[data-node-id]').forEach((g) => {
        g.style.cursor = '';
        g.removeEventListener('mousedown', _onNodeMouseDown);
    });
    _state.svg.removeEventListener('click', _onSvgClick);
    window.removeEventListener('mousemove', _onWindowMouseMove);
    window.removeEventListener('mouseup', _onWindowMouseUp);
    _state = null;
}

export function resetLayout() {
    if (!_state) return;
    _state.offsets = {};
    _state.drag = null;
    _state.svg.querySelectorAll('.resource-node[data-node-id]').forEach((g) => {
        g.removeAttribute('transform');
        g.classList.remove('selected');
        g.querySelector('.selection-ring')?.remove();
        g.style.cursor = 'grab';
    });
    _redrawAllConnections();
}
