// Trade matches for the system inspector.
// Partner codes are the trade-code bonus already scored in routes.js:
// Agricultural (Ag) with Non-agricultural (Na), Industrial (In) with Non-industrial (Ni).
// rules/guideline_4_4 names a broader Trade Routes Table that is not in the rules data.
window.TradeMatch = (() => {
    'use strict';

    const RANGE = 12;
    const PAIRS = [
        { a: 'Ag', b: 'Na' },
        { a: 'In', b: 'Ni' }
    ];
    const KNOWN = PAIRS.flatMap(pair => [pair.a, pair.b]);

    let panel, bodyEl, titleEl, eyebrowEl, hexEl, sourceEl, frameButton;
    let hexId = null, focus = null, sourceLabel = '', hits = [], focusHit = null;
    let svg = null, loop = 0, markKey = '';

    const el = (...args) => window.SystemInspector.el(...args);
    const button = (...args) => window.SystemInspector.button(...args);

    function canonical(code) {
        const raw = String(code || '').trim();
        return KNOWN.find(item => item.toUpperCase() === raw.toUpperCase()) || raw;
    }
    function codeLabel(code) {
        const key = canonical(code);
        return typeof formatTradeCodes === 'function' ? (formatTradeCodes([key]) || key) : key;
    }
    function partnersOf(code) {
        const key = canonical(code);
        const out = [];
        PAIRS.forEach(pair => {
            if (pair.a === key) out.push(pair.b);
            if (pair.b === key) out.push(pair.a);
        });
        return out;
    }
    function hasCode(list, code) {
        const key = canonical(code).toUpperCase();
        return list.some(item => canonical(item).toUpperCase() === key);
    }
    function profile(state) {
        if (!state) return null;
        // Same edition order as the inspector, so the list matches the codes on screen.
        return state.aowSystem?.mainworld || state.mgt2eData || state.ctData || state.t5Data || state.rttData || null;
    }
    function codesOf(state) {
        const data = profile(state);
        const raw = data?.tradeCodes || state?.tradeCodes || [];
        const list = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/);
        return list.map(item => String(item).trim()).filter(Boolean);
    }
    function sectorNumber(id) {
        const n = parseInt(String(id || '').split('-')[0], 10);
        return Number.isFinite(n) ? n : 0;
    }
    function sectorLabel(id) {
        const n = sectorNumber(id);
        if (!n) return '';
        return (window.sectorNames && window.sectorNames[n]) || `Sector ${n}`;
    }
    function zoneWord(value) {
        const key = String(value || '').trim().toLowerCase();
        if (key === 'r' || key === 'red') return 'Red';
        if (key === 'a' || key === 'amber') return 'Amber';
        return '';
    }
    function findHits(originId, code) {
        const origin = typeof getHexCoords === 'function' ? getHexCoords(originId) : null;
        const wanted = partnersOf(code);
        if (!origin || !wanted.length || typeof getHexDistance !== 'function') return [];
        const out = [];
        hexStates.forEach((state, id) => {
            if (id === originId || state?.type !== 'SYSTEM_PRESENT') return;
            if (state.isHiddenByFilter && !window.filterSuspended) return;
            const coords = getHexCoords(id);
            if (!coords) return;
            const distance = getHexDistance(origin.q, origin.r, coords.q, coords.r);
            if (distance <= 0 || distance > RANGE) return;
            const codes = codesOf(state);
            const matched = wanted.filter(item => hasCode(codes, item));
            if (!matched.length) return;
            const data = profile(state);
            out.push({
                id,
                name: window.SystemInspector?.systemName(id) || state.name || id,
                distance,
                matched,
                starport: data?.starport || '',
                zone: state.travelZone || data?.travelZone || ''
            });
        });
        out.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        return out;
    }
    function hitIds() {
        return [hexId, ...hits.map(hit => hit.id)];
    }
    function isOpen() {
        return !!panel && !panel.hidden;
    }
    function paintChips() {
        document.querySelectorAll('#atlas-content button.atlas-chip').forEach(node => {
            const on = isOpen() && node.dataset.code === focus && hexId === window.SystemInspector?.currentHexId();
            node.setAttribute('aria-pressed', String(on));
        });
    }
    function paintHitPress() {
        bodyEl?.querySelectorAll('.trade-hit').forEach(node => {
            const on = node.dataset.id === focusHit;
            node.classList.toggle('is-focus', on);
            node.setAttribute('aria-pressed', String(on));
        });
        markKey = '';
    }
    function hitMeta(hit) {
        const bits = [`${hit.distance} ${hit.distance === 1 ? 'hex' : 'hexes'}`];
        if (sectorNumber(hit.id) !== sectorNumber(hexId)) bits.push(sectorLabel(hit.id));
        if (hit.starport) bits.push(`Starport ${hit.starport}`);
        bits.push(hit.matched.join(' '));
        const zone = zoneWord(hit.zone);
        if (zone) bits.push(`${zone} zone`);
        return bits.join(' · ');
    }
    function paint() {
        const system = window.SystemInspector?.systemName(hexId) || hexId || 'System';
        titleEl.textContent = codeLabel(focus);
        eyebrowEl.textContent = 'Trade matches';
        hexEl.textContent = hexId || '';
        hexEl.hidden = !hexId;
        const onBody = sourceLabel && sourceLabel !== system;
        sourceEl.textContent = onBody ? `${sourceLabel} at ${system}` : system;
        sourceEl.hidden = false;
        bodyEl.replaceChildren();
        const chart = el('ul', undefined, 'trade-pairs');
        PAIRS.forEach(pair => {
            const active = canonical(focus) === pair.a || canonical(focus) === pair.b;
            const item = el('li', `${codeLabel(pair.a)} trades with ${codeLabel(pair.b)}`);
            if (active) item.classList.add('is-active');
            chart.append(item);
        });
        bodyEl.append(chart);
        const wanted = partnersOf(focus);
        if (!wanted.length) {
            bodyEl.append(el('p', `${codeLabel(focus)} is not one of those matches.`, 'trade-note'));
        } else {
            const head = el('h3', `${wanted.map(codeLabel).join(' or ')} within ${RANGE} hexes`);
            head.append(el('span', String(hits.length)));
            bodyEl.append(head);
            bodyEl.append(el('p', 'The line on the map locates these worlds. It is not a jump route.', 'trade-note'));
            if (!hits.length) {
                bodyEl.append(el('p', `No ${wanted.map(codeLabel).join(' or ')} world within ${RANGE} hexes.`, 'trade-note'));
            } else {
                const list = el('div', undefined, 'trade-hits');
                hits.forEach(hit => {
                    const row = button('', () => focusOn(hit.id), 'trade-hit');
                    row.dataset.id = hit.id;
                    row.setAttribute('aria-pressed', 'false');
                    row.append(el('span', hit.name, 'trade-hit-name'), el('small', hitMeta(hit)));
                    list.append(row);
                });
                bodyEl.append(list);
            }
        }
        const canFrame = hits.length > 0;
        frameButton.disabled = !canFrame;
        frameButton.title = canFrame ? 'Frame these worlds on the sector map' : `No matching worlds within ${RANGE} hexes`;
        paintHitPress();
    }
    function frame(ids) {
        if (!ids?.length || typeof fitHexesInView !== 'function') return;
        if (window.SystemViewer?.isOpen()) return;
        fitHexesInView(ids);
    }
    function showOnMap() {
        focusHit = null;
        paintHitPress();
        if (window.SystemViewer?.isOpen()) SystemViewer.close();
        if (typeof fitHexesInView === 'function') fitHexesInView(hitIds());
    }
    function focusOn(id) {
        focusHit = focusHit === id ? null : id;
        paintHitPress();
        if (window.SystemViewer?.isOpen()) SystemViewer.close();
        if (typeof fitHexesInView === 'function') fitHexesInView(focusHit ? [hexId, focusHit] : hitIds());
    }
    function sectorPoint(id) {
        const state = hexStates.get(id);
        const coords = typeof getHexCoords === 'function' ? getHexCoords(id) : null;
        if (!coords || state?.type !== 'SYSTEM_PRESENT' || zoom < 0.07) return null;
        if (state.isHiddenByFilter && !window.filterSuspended) return null;
        if (coords.q < 0 || coords.r < 0 || coords.q >= gridWidth * 32 || coords.r >= gridHeight * 40) return null;
        const pixel = getHexPixel(coords.q, coords.r);
        return {
            x: (pixel.x - cameraX) * zoom,
            y: (pixel.y - cameraY) * zoom,
            radius: Math.max(4, 10 * zoom)
        };
    }
    function ensureSvg() {
        if (svg) return;
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'trade-locator';
        svg.setAttribute('aria-hidden', 'true');
        document.body.append(svg);
    }
    function rebuildMarks() {
        ensureSvg();
        svg.replaceChildren();
        const dot = document.createElementNS(svg.namespaceURI, 'circle');
        dot.classList.add('locator-dot');
        dot.dataset.role = 'origin';
        svg.append(dot);
        hits.forEach(hit => {
            const group = document.createElementNS(svg.namespaceURI, 'g');
            group.dataset.id = hit.id;
            if (focusHit && focusHit !== hit.id) group.classList.add('is-dim');
            if (focusHit === hit.id) group.classList.add('is-focus');
            const path = document.createElementNS(svg.namespaceURI, 'path');
            const pulse = document.createElementNS(svg.namespaceURI, 'circle');
            pulse.classList.add('locator-pulse');
            group.append(path, pulse);
            svg.append(group);
        });
    }
    function positionMarks(origin) {
        const dot = svg.querySelector('[data-role="origin"]');
        if (dot) {
            dot.setAttribute('cx', origin.x);
            dot.setAttribute('cy', origin.y);
            dot.setAttribute('r', '3');
        }
        svg.querySelectorAll('g[data-id]').forEach(group => {
            const target = sectorPoint(group.dataset.id);
            if (!target) { group.style.display = 'none'; return; }
            group.style.display = '';
            group.querySelector('path').setAttribute('d', `M ${origin.x} ${origin.y} L ${target.x} ${target.y}`);
            const pulse = group.querySelector('circle');
            pulse.setAttribute('cx', target.x);
            pulse.setAttribute('cy', target.y);
            pulse.setAttribute('r', target.radius + 5);
        });
    }
    function tick() {
        if (!isOpen()) { loop = 0; return; }
        ensureSvg();
        const origin = sectorPoint(hexId);
        const hide = !origin || !hits.length || window.SystemViewer?.isOpen() || window.SurfaceViewer?.isOpen() || window.ApproachViewer?.isOpen();
        svg.style.visibility = hide ? 'hidden' : 'visible';
        const key = `${hits.map(hit => hit.id).join('|')}:${focusHit || ''}`;
        if (key !== markKey) {
            markKey = key;
            rebuildMarks();
        }
        if (!hide) positionMarks(origin);
        loop = requestAnimationFrame(tick);
    }
    function startLoop() {
        if (loop) return;
        loop = requestAnimationFrame(tick);
    }
    function stopLoop() {
        if (loop) cancelAnimationFrame(loop);
        loop = 0;
        markKey = '';
        svg?.remove();
        svg = null;
    }
    function close() {
        if (!panel) return;
        const code = focus;
        hexId = null;
        focus = null;
        sourceLabel = '';
        hits = [];
        focusHit = null;
        panel.hidden = true;
        panel.inert = true;
        stopLoop();
        paintChips();
        const chip = code ? document.querySelector(`#atlas-content button.atlas-chip[data-code="${CSS.escape(code)}"]`) : null;
        chip?.focus();
    }
    function open(opts) {
        if (!panel || !opts?.hexId || !opts.focus) return;
        hexId = opts.hexId;
        focus = canonical(opts.focus);
        sourceLabel = opts.sourceLabel || '';
        focusHit = null;
        hits = findHits(hexId, focus);
        paint();
        panel.hidden = false;
        panel.inert = false;
        startLoop();
        paintChips();
        panel.focus();
        if (hits.length) frame(hitIds());
    }
    function sync(id) {
        if (!isOpen()) return;
        if (id !== hexId) { close(); return; }
        const next = findHits(hexId, focus);
        const same = next.length === hits.length && next.every((hit, index) => {
            const prev = hits[index];
            return hit.id === prev.id && hit.distance === prev.distance && hit.matched.join(' ') === prev.matched.join(' ');
        });
        if (same) return;
        hits = next;
        if (focusHit && !hits.some(hit => hit.id === focusHit)) focusHit = null;
        paint();
    }
    function setup() {
        if (panel) return;
        panel = el('div', undefined, '');
        panel.id = 'trade-match';
        panel.hidden = true;
        panel.inert = true;
        panel.tabIndex = -1;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-labelledby', 'trade-match-title');
        const header = el('div', undefined, 'atlas-header');
        const heading = el('div', undefined, 'atlas-heading');
        eyebrowEl = el('p', 'Trade matches', 'atlas-eyebrow');
        const row = el('div', undefined, 'atlas-title-row');
        titleEl = el('h2', 'Trade');
        titleEl.id = 'trade-match-title';
        hexEl = el('span', '', 'atlas-hex');
        row.append(titleEl, hexEl);
        sourceEl = el('p', '', 'trade-source');
        heading.append(eyebrowEl, row, sourceEl);
        const closeButton = button('', close, '');
        closeButton.id = 'trade-match-close';
        closeButton.setAttribute('aria-label', 'Close trade matches');
        closeButton.title = 'Close';
        const icon = document.createElement('i');
        icon.className = 'fas fa-times';
        icon.setAttribute('aria-hidden', 'true');
        closeButton.append(icon);
        header.append(heading, closeButton);
        bodyEl = el('div', undefined, 'trade-body');
        const footer = el('div', undefined, 'trade-footer');
        frameButton = button('Show on map', showOnMap, 'trade-frame');
        footer.append(frameButton);
        panel.append(header, bodyEl, footer);
        document.body.append(panel);
        // Registered before the map shortcut handler so Escape closes this
        // panel without also clearing the hex selection.
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !isOpen()) return;
            if (event.target.closest('#omni-search')) return;
            if (document.querySelector('.campaign-stardate-dialog[open], .atlas-crop-dialog[open]')) return;
            if (document.getElementById('world-image-panel')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        }, true);
    }

    return {
        setup, open, close, sync, isOpen,
        focusCode: () => focus,
        currentHexId: () => hexId
    };
})();
