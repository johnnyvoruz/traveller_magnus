// Shared system context for the map, orrery, and Campaign Atlas. No generation logic.
window.SystemInspector = (() => {
    'use strict';
    let panel, content, title, context, hexTag, place, glyphSlot;
    let hexId = null, tab = 'system', body = null, bodyKey = null, system = null, signature = '';
    let open = false;
    let editing = false;
    let lastInspectedHex = null;
    let lastViewKey = '';
    const SPAN_KEY = 'traveller_inspector_span';
    const SVG_NS = 'http://www.w3.org/2000/svg';

    function el(tag, text, cls) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    }
    function button(text, action, cls) {
        const node = el('button', text, cls);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    }
    function icon(name) {
        const node = el('i', undefined, `fa-solid fa-${name}`);
        node.setAttribute('aria-hidden', 'true');
        return node;
    }
    // A button with a Font Awesome icon and an optional visible label.
    function iconButton(name, label, action, cls = '', showLabel = true) {
        const node = button('', action, `atlas-icon-btn ${cls}`.trim());
        node.append(icon(name));
        if (showLabel) node.append(el('span', label));
        else node.setAttribute('aria-label', label);
        node.title = label;
        return node;
    }
    function mainworld(state) {
        return state.aowSystem?.mainworld || state.mgt2eData || state.ctData || state.t5Data || state.rttData || {};
    }
    function locationLine(id) {
        const parts = String(id || '').split('-');
        const sectorNum = parseInt(parts[0], 10);
        const letter = (parts[1] || '').toUpperCase();
        if (!Number.isFinite(sectorNum) || sectorNum < 1 || !/^[A-P]$/.test(letter)) return '';
        const sectorName = (window.sectorNames && window.sectorNames[sectorNum]) || `Sector ${sectorNum}`;
        const subName = typeof getSubsectorName === 'function' ? getSubsectorName(sectorNum, letter) : `Subsector ${letter}`;
        return `${sectorName} - ${subName}`;
    }
    function systemName(id = hexId) {
        const state = hexStates.get(id);
        return state?.name || mainworld(state || {}).name || id || 'Campaign Atlas';
    }
    function canLeave() {
        return !window.CampaignAtlas || CampaignAtlas.confirmLeave();
    }
    function layout() {
        const width = open ? panel.getBoundingClientRect().width + 20 : 0;
        document.documentElement.style.setProperty('--inspector-width', `${width}px`);
        document.body.classList.toggle('inspector-open', open);
        if (window.AppNavigation) AppNavigation.layout();
        else window.SystemViewer?.resize?.();
    }
    function show() {
        window.AppNavigation?.prepare('system-inspector');
        open = true;
        panel.hidden = false;
        panel.inert = false;
        document.getElementById('help-panel')?.classList.remove('open');
        syncWorkspaceButtons();
        layout();
    }
    function close(force = false) {
        if (!force && !canLeave()) return false;
        open = false;
        tab = 'system';
        if (editing || (typeof editingHexId !== 'undefined' && editingHexId)) {
            if (typeof closeHexEditor === 'function') closeHexEditor();
        }
        panel.hidden = true;
        panel.inert = true;
        window.CampaignAtlas?.releaseView();
        window.TradeMatch?.close();
        window.CampaignAtlas?.syncMapFocus();
        syncInspectOutline();
        window.syncMapActionBar?.();
        document.getElementById('atlas-toggle').setAttribute('aria-expanded', 'false');
        document.getElementById('campaign-toggle').setAttribute('aria-expanded', 'false');
        layout();
        return true;
    }
    function openForHex(id, requestedTab = tab) {
        const keepingDraft = requestedTab === 'campaign' && window.CampaignAtlas?.draftHexId() === id;
        if ((hexId !== id || tab !== requestedTab) && !keepingDraft && !canLeave()) return false;
        const hexChanged = hexId !== id;
        if (hexChanged) { body = null; bodyKey = null; signature = ''; }
        hexId = id;
        tab = requestedTab;
        show();
        refresh(true);
        if (editing && tab === 'system' && hexChanged) openHexEditor(hexId);
        return true;
    }

    // ── Bodies ────────────────────────────────────────────────────────────────
    // A body is remembered by its campaign location key as well as by object,
    // because the inspector re-normalizes the system whenever it refreshes.
    function viewerSystem() {
        return window.SystemViewer?.currentHexId?.() === hexId ? SystemViewer.currentSystem() : null;
    }
    function locationOf(target) {
        if (!target || !window.SystemViewer?.locationForBody) return null;
        const own = viewerSystem();
        return (own && SystemViewer.locationForBody(target, own)) || (system && SystemViewer.locationForBody(target, system)) || null;
    }
    function bodyForKey(key) {
        if (!key || !system || !window.SystemViewer?.locationEntries) return null;
        return SystemViewer.locationEntries(system).find(entry => entry.key === key)?.body || null;
    }
    function selectBody(selected) {
        if (!canLeave()) return false;
        body = selected;
        bodyKey = selected ? locationOf(selected)?.key || null : null;
        tab = 'system';
        show();
        render();
        return true;
    }
    function focusBody(selected) {
        if (window.SystemViewer?.currentHexId?.() === hexId) SystemViewer.selectBody(selected);
        else selectBody(selected);
    }
    function leaveBody() {
        body = null; bodyKey = null;
        if (window.SystemViewer?.currentHexId?.() === hexId) SystemViewer.selectBody(null);
        else render();
    }
    // Opens the system panel on one body, by location key. No key shows the overview.
    function showBody(id, key) {
        if (!openForHex(id, 'system')) return false;
        const target = bodyForKey(key);
        if (target) focusBody(target);
        else if (body) leaveBody();
        return true;
    }
    function isStar(b) { return !!b && b.sType != null && !b.uwp; }
    function isMainworld(b) { return !!b && b.type === 'Mainworld'; }
    function isMoon(b) { return !!b && (b.isMoon || b.isSatellite || b.type === 'Satellite' || parentWorld(b) !== null); }
    function parentWorld(b) {
        for (const world of system?.worlds || []) if ((world.moons || []).includes(b)) return world;
        return null;
    }
    // Stars, then each world followed by its moons: the order prev/next walks.
    function navBodies() {
        if (!system) return [];
        const list = [...(system.stars || [])];
        for (const world of system.worlds || []) {
            if (world.type === 'Empty') continue;
            list.push(world);
            for (const moon of world.moons || []) if (moon.type !== 'Empty') list.push(moon);
        }
        return list;
    }
    function bodyName(b) {
        return (b.name && String(b.name).trim()) || b.type || 'Star';
    }
    function bodyTypeLabel(b) {
        if (isStar(b)) return spectralPhrase(b) || 'Star';
        if (b.type === 'Gas Giant') return b.ggType ? `Gas Giant ${b.ggType}` : 'Gas Giant';
        if (isMainworld(b)) return isMoon(b) ? 'Mainworld satellite' : 'Mainworld';
        return b.worldType || b.type || 'Body';
    }

    // ── Body glyphs ───────────────────────────────────────────────────────────
    // Presentation only: a small disc whose colour follows the body's own
    // atmosphere, hydrographics, and temperature. The mainworld carries the same
    // cyan star the orrery draws.
    function svgNode(tag, attrs = {}) {
        const node = document.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
        return node;
    }
    function ensureGlyphDefs() {
        if (document.getElementById('atlas-glyph-defs')) return;
        const defs = svgNode('svg', { id: 'atlas-glyph-defs', width: 0, height: 0, 'aria-hidden': 'true' });
        defs.style.position = 'absolute';
        const inner = svgNode('defs');
        const shade = svgNode('radialGradient', { id: 'glyph-shade', cx: '36%', cy: '32%', r: '78%' });
        shade.append(
            svgNode('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '.38' }),
            svgNode('stop', { offset: '.42', 'stop-color': '#fff', 'stop-opacity': '0' }),
            svgNode('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '.6' }));
        const clip = svgNode('clipPath', { id: 'glyph-disc', clipPathUnits: 'userSpaceOnUse' });
        clip.append(svgNode('circle', { cx: 12, cy: 12, r: 8.5 }));
        inner.append(shade, clip);
        defs.append(inner);
        document.body.append(defs);
    }
    // Shared with orbit view, so a world's icon and its painted disc agree.
    function surfaceKind(b) {
        return window.SystemViewer?.surfaceKind?.(b) || 'barren';
    }
    const SURFACES = {
        barren:    { base: '#8c9299', marks: [['circle', { cx: 9, cy: 9.5, r: 1.9 }], ['circle', { cx: 14.8, cy: 14.2, r: 2.5 }], ['circle', { cx: 15, cy: 7.8, r: 1.1 }], ['circle', { cx: 8.5, cy: 15.5, r: 1 }]], mark: '#6b7179' },
        desert:    { base: '#c99b5d', marks: [['ellipse', { cx: 10, cy: 9, rx: 5, ry: 1.3 }], ['ellipse', { cx: 14, cy: 14, rx: 5.5, ry: 1.4 }], ['ellipse', { cx: 9, cy: 17.5, rx: 4, ry: 1 }]], mark: '#a77941' },
        ocean:     { base: '#2d6db3', marks: [['ellipse', { cx: 15.5, cy: 9, rx: 2.6, ry: 1.8 }], ['ellipse', { cx: 8.5, cy: 15.5, rx: 1.8, ry: 1.2 }]], mark: '#5f9d59' },
        temperate: { base: '#3778be', marks: [['ellipse', { cx: 8.8, cy: 10, rx: 3.8, ry: 2.8 }], ['ellipse', { cx: 15, cy: 15.2, rx: 3.2, ry: 2.2 }], ['ellipse', { cx: 14.5, cy: 7.3, rx: 1.6, ry: 1 }]], mark: '#62a257', cloud: true },
        ice:       { base: '#cfe0ec', marks: [['ellipse', { cx: 12, cy: 3.8, rx: 7.5, ry: 3.2 }], ['ellipse', { cx: 12, cy: 20.4, rx: 6.5, ry: 2.6 }]], mark: '#ffffff', cracks: '#8fb3cd' },
        hot:       { base: '#a8391c', marks: [], cracks: '#ffb347', glow: '#ff7a2f' },
        exotic:    { base: '#a5a247', marks: [['ellipse', { cx: 12, cy: 8.5, rx: 9, ry: 1.4 }], ['ellipse', { cx: 12, cy: 13.5, rx: 9, ry: 1.8 }]], mark: '#cbc56b', haze: '#d9d37e' },
        storm:     { base: '#6c7ca4', marks: [], swirl: '#cad4ec' },
        rad:       { base: '#6f8a33', marks: [['circle', { cx: 9, cy: 10, r: 1.6 }], ['circle', { cx: 14.5, cy: 14, r: 2 }], ['circle', { cx: 14.5, cy: 8, r: 1 }]], mark: '#c7e45b' }
    };
    function glyphKind(b) {
        if (isStar(b)) return 'star';
        if (b.type === 'Gas Giant') return 'gas';
        if (b.type === 'Planetoid Belt' || b.type === 'Asteroid Belt' || b.worldType === 'Belt') return 'belt';
        if (b.type === 'Ring') return 'ring';
        return surfaceKind(b);
    }
    function bodyGlyph(b, size = 22) {
        ensureGlyphDefs();
        const kind = glyphKind(b);
        const root = svgNode('svg', { viewBox: '0 0 24 24', width: size, height: size, class: `atlas-glyph-svg glyph-${kind}`, 'aria-hidden': 'true', focusable: 'false' });
        const disc = (fill, r = 8.5) => svgNode('circle', { cx: 12, cy: 12, r, fill });
        const clipped = () => { const g = svgNode('g', { 'clip-path': 'url(#glyph-disc)' }); root.append(g); return g; };
        if (kind === 'star') {
            const color = window.SystemViewer?.starColor?.(b) || '#fff4ea';
            root.append(svgNode('circle', { cx: 12, cy: 12, r: 11.5, fill: color, opacity: '.14' }),
                svgNode('circle', { cx: 12, cy: 12, r: 9.8, fill: color, opacity: '.24' }),
                disc(color, 7.8), svgNode('circle', { cx: 12, cy: 12, r: 7.8, fill: 'url(#glyph-shade)', opacity: '.55' }));
        } else if (kind === 'belt') {
            [[4.5, 15, 1.3], [7.5, 11.5, 1.7], [11, 9.6, 1.2], [14.5, 8.4, 1.8], [18.3, 7.6, 1.2], [8.5, 17, 1], [13, 13.5, 1.5], [17, 11.5, 1.1], [20.2, 10.5, 1.4], [5, 19.5, 0.9]]
                .forEach(([cx, cy, r]) => root.append(svgNode('circle', { cx, cy, r, fill: '#a2a8ae' })));
        } else if (kind === 'ring') {
            root.append(svgNode('ellipse', { cx: 12, cy: 12, rx: 10.5, ry: 4, fill: 'none', stroke: '#c9d2d8', 'stroke-width': 1.6, transform: 'rotate(-18 12 12)' }));
        } else if (kind === 'gas') {
            root.append(disc('#d8b98a'));
            const g = clipped();
            [[6.2, 1.6, '#b98f5e'], [9.6, 1.1, '#e8d2a8'], [12, 2.4, '#c39462'], [15.8, 1.3, '#a97f52'], [18.2, 1.8, '#c8a473']]
                .forEach(([y, h, fill]) => g.append(svgNode('rect', { x: 0, y, width: 24, height: h, fill })));
            root.append(svgNode('circle', { cx: 12, cy: 12, r: 8.5, fill: 'url(#glyph-shade)' }));
            if ((b.rings || []).length) root.append(svgNode('ellipse', { cx: 12, cy: 12, rx: 11.6, ry: 3.1, fill: 'none', stroke: '#eadbb8', 'stroke-width': 1.1, opacity: '.9', transform: 'rotate(-16 12 12)' }));
        } else {
            const look = SURFACES[kind] || SURFACES.barren;
            if (look.glow) root.append(svgNode('circle', { cx: 12, cy: 12, r: 10.6, fill: look.glow, opacity: '.25' }));
            if (look.haze) root.append(svgNode('circle', { cx: 12, cy: 12, r: 10.2, fill: 'none', stroke: look.haze, 'stroke-width': 1.2, opacity: '.55' }));
            root.append(disc(look.base));
            const g = clipped();
            look.marks.forEach(([tag, attrs]) => g.append(svgNode(tag, { ...attrs, fill: look.mark })));
            if (look.cloud) g.append(svgNode('path', { d: 'M4 13.5 Q9 11.5 13 13 T21 12', fill: 'none', stroke: '#fff', 'stroke-width': 1, opacity: '.7' }));
            if (look.cracks) g.append(svgNode('path', { d: 'M5 9 L10 11 L12 8 M10 11 L11.5 16 L16 17.5 M12 8 L17 10 L19 14', fill: 'none', stroke: look.cracks, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }));
            if (look.swirl) g.append(svgNode('path', { d: 'M12 12 m-1 0 a1.5 1.5 0 1 1 2.5 1.5 a3.5 3.5 0 1 1 -5.5 -3.5 a6 6 0 0 1 9.5 1', fill: 'none', stroke: look.swirl, 'stroke-width': 1.1, 'stroke-linecap': 'round' }));
            root.append(svgNode('circle', { cx: 12, cy: 12, r: 8.5, fill: 'url(#glyph-shade)' }));
        }
        if (isMainworld(b)) {
            const points = [];
            for (let i = 0; i < 10; i++) {
                const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 1.9 : 4.6;
                points.push(`${(19.2 + Math.cos(angle) * radius).toFixed(2)},${(4.9 + Math.sin(angle) * radius).toFixed(2)}`);
            }
            root.append(svgNode('polygon', { points: points.join(' '), class: 'glyph-mainworld' }));
        }
        return root;
    }

    // ── Workspace chrome ──────────────────────────────────────────────────────
    function syncWorkspaceButtons() {
        document.getElementById('atlas-toggle').setAttribute('aria-expanded', String(open && tab === 'system'));
        document.getElementById('campaign-toggle').setAttribute('aria-expanded', String(open && tab === 'campaign'));
        panel.setAttribute('aria-label', tab === 'campaign' ? 'Campaign workspace' : 'System inspector');
        syncEditButton();
    }
    function applySpan(span) {
        const next = span === 'half' || span === 'full' ? span : 'column';
        panel.dataset.span = next;
        try { localStorage.setItem(SPAN_KEY, next); } catch (err) { /* storage unavailable */ }
        panel.querySelectorAll('.atlas-span button').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.span === next));
        });
        const notes = content?.querySelector('.atlas-notes');
        if (notes) notes.open = next !== 'column';
        if (next === 'full') {
            const socio = content?.querySelector('.dossier-socio-acc');
            if (socio) socio.open = true;
        }
        if (editing) syncEditAccordions();
        layout();
    }
    function syncEditButton() {
        const btn = document.getElementById('atlas-edit');
        if (!btn || !panel) return;
        const state = hexId ? hexStates.get(hexId) : null;
        const canEdit = tab === 'system' && !!state && state.type === 'SYSTEM_PRESENT'
            && !!(state.ctData || state.mgt2eData || state.t5Data || state.rttData);
        btn.hidden = !canEdit;
        const on = editing && canEdit;
        btn.setAttribute('aria-pressed', String(on));
        btn.textContent = on ? 'Editing' : 'Edit';
        panel.classList.toggle('editing', on);
        panel.dataset.workspace = tab;
    }
    function syncEditAccordions() {
        const span = panel.dataset.span || 'column';
        const openIds = [];
        if (span === 'half' || span === 'full') openIds.push('acc-btn-mgt-socio');
        if (span === 'full') openIds.push('acc-btn-mgt-system');
        document.querySelectorAll('#hex-editor .accordion-btn').forEach(btn => {
            const target = btn.dataset.accordionPanel ? document.getElementById(btn.dataset.accordionPanel) : null;
            const should = openIds.includes(btn.id) && btn.style.display !== 'none';
            btn.classList.toggle('active', should);
            if (target) target.style.display = should ? 'block' : 'none';
        });
    }
    function noteEditing(id) {
        const switched = hexId !== id;
        if (switched) { body = null; bodyKey = null; signature = ''; }
        hexId = id;
        tab = 'system';
        editing = true;
        if (!open) show();
        else syncWorkspaceButtons();
        syncEditAccordions();
        if (switched || !content.querySelector('.dossier')) refresh(true);
        layout();
    }
    function endEdit() {
        editing = false;
        syncEditButton();
        if (open) refresh(true);
    }

    // ── Stat rows ─────────────────────────────────────────────────────────────
    const UWP_KINDS = {
        Starport: 'starport', Size: 'size', Atmosphere: 'atmosphere', Hydrographics: 'hydrographics',
        Population: 'population', Government: 'government', 'Law level': 'law'
    };
    // UWP digits show as eHex, the way they read in the UWP string.
    function uwpCode(value) {
        if (typeof value === 'number' && Number.isFinite(value) && typeof toEHex === 'function') return toEHex(value);
        if (typeof value === 'string' && /^\d+$/.test(value.trim()) && typeof toEHex === 'function') return toEHex(Number(value));
        return value;
    }
    function formatTravelZone(value) {
        const key = String(value).trim().toLowerCase();
        if (key === 'g' || key === 'green') return { code: 'G', name: 'Green', zone: 'green' };
        if (key === 'a' || key === 'amber') return { code: 'A', name: 'Amber', zone: 'amber' };
        if (key === 'r' || key === 'red') return { code: 'R', name: 'Red', zone: 'red' };
        return null;
    }
    function formatStat(label, value, decimals) {
        if (label === 'Allegiance' && value && typeof value === 'object') {
            if (!value.code && !value.name) return '';
            return { code: value.code || '', name: value.name || '' };
        }
        if (label === 'Travel zone') {
            const zone = formatTravelZone(value);
            if (zone) return zone;
        }
        if (label === 'Trade codes') {
            const text = typeof formatTradeCodes === 'function' ? formatTradeCodes(value) : (Array.isArray(value) ? value.join(', ') : String(value));
            if (!text) return '';
            const chips = text.split(', ').filter(Boolean).map(part => {
                const match = /^(.*) \(([^)]+)\)$/.exec(part);
                return match ? { code: match[2], name: match[1] } : { name: part };
            });
            return chips.length ? { chips } : '';
        }
        if (label === 'Tech level') {
            const code = String(uwpCode(value)).trim();
            const number = typeof value === 'number' ? value : Number(value);
            return Number.isFinite(number) && number >= 10 ? { code, name: `TL ${number}` } : { code };
        }
        if (UWP_KINDS[label] && typeof formatUwpDigit === 'function') {
            const text = formatUwpDigit(UWP_KINDS[label], UWP_KINDS[label] === 'starport' ? value : uwpCode(value));
            if (!text) return '';
            const mark = ' — ';
            const split = text.indexOf(mark);
            if (split !== -1) return { code: text.slice(0, split), name: text.slice(split + mark.length) };
            return { code: text.trim() };
        }
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (decimals != null && Number.isFinite(Number(value))) return formatDisplayNumber(value, decimals);
        const numeric = typeof value === 'number' || /^(Orbit|Distance|Satellite orbit|Diameter|Stellar diameter|Mass|Gravity|Temperature|Luminosity|Eccentricity|Age)/.test(label);
        if (numeric) return formatDisplayNumber(value, /Temperature|Diameter \(km\)/.test(label) ? 0 : /Distance|Mass|Luminosity|Eccentricity/.test(label) ? 3 : 2);
        return Array.isArray(value) ? value.join(', ') : String(value);
    }
    // Rows are [label, value] or [label, value, decimals]. Empty values are skipped.
    function detailRows(parent, rows, sourceLabel) {
        const list = el('dl', undefined, 'atlas-stats');
        for (const [label, value, decimals] of rows) {
            if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
            const formatted = formatStat(label, value, decimals);
            if (formatted == null || formatted === '') continue;
            const row = el('div', undefined, 'atlas-stat');
            row.append(el('dt', label));
            if (typeof formatted === 'object' && formatted.chips) {
                const chips = el('dd', undefined, 'atlas-stat-chips');
                const trade = label === 'Trade codes';
                formatted.chips.forEach(chip => {
                    const code = chip.code || chip.name;
                    const pill = trade ? button('', () => {
                        const api = window.TradeMatch;
                        if (!api) return;
                        if (api.isOpen() && api.currentHexId() === hexId && api.focusCode() === code) api.close();
                        else api.open({ hexId, focus: code, sourceLabel });
                    }, 'atlas-chip') : el('span', undefined, 'atlas-chip');
                    if (trade) {
                        pill.dataset.code = code;
                        const spoken = chip.code ? `${chip.name} (${chip.code})` : chip.name;
                        pill.setAttribute('aria-label', `Trade matches for ${spoken}`);
                        pill.title = 'Worlds that trade with this, within 12 hexes';
                        const pressed = window.TradeMatch?.isOpen() && window.TradeMatch.focusCode() === code && window.TradeMatch.currentHexId() === hexId;
                        pill.setAttribute('aria-pressed', String(!!pressed));
                    }
                    if (chip.code) pill.append(el('b', chip.code));
                    pill.append(document.createTextNode(chip.name));
                    chips.append(pill);
                });
                row.append(chips);
            } else if (typeof formatted === 'object') {
                if (formatted.zone) row.classList.add(`atlas-stat-zone-${formatted.zone}`);
                row.append(el('dd', formatted.code, formatted.name ? 'atlas-stat-code' : 'atlas-stat-code atlas-stat-code-solo'));
                if (formatted.name) row.append(el('dd', formatted.name, 'atlas-stat-name'));
            } else {
                row.append(el('dd', String(formatted), label === 'UWP' ? 'atlas-stat-mono' : 'atlas-stat-value'));
            }
            list.append(row);
        }
        if (list.childElementCount) parent.append(list);
        return list.childElementCount > 0;
    }
    // A headed group of rows, left out entirely when every value is empty.
    function statSection(parent, heading, rows, sourceLabel) {
        const section = el('section', undefined, 'atlas-section');
        section.append(el('h3', heading));
        if (detailRows(section, rows, sourceLabel)) parent.append(section);
    }
    // The UWP string with each digit labelled, so it reads at a glance.
    const UWP_PARTS = ['Port', 'Size', 'Atm', 'Hyd', 'Pop', 'Gov', 'Law'];
    function uwpRibbon(uwp) {
        const text = String(uwp || '').trim();
        const match = /^([A-HXY?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])-([0-9A-Z?]+)$/i.exec(text);
        if (!match) return text ? el('p', text, 'atlas-uwp') : null;
        const ribbon = el('div', undefined, 'atlas-uwp-ribbon');
        ribbon.setAttribute('role', 'img');
        ribbon.setAttribute('aria-label', `UWP ${text}`);
        ribbon.title = `UWP ${text}`;
        const cell = (digit, label) => {
            const node = el('span', undefined, 'uwp-cell');
            node.append(el('b', digit), el('small', label));
            return node;
        };
        UWP_PARTS.forEach((label, index) => ribbon.append(cell(match[index + 1], label)));
        ribbon.append(el('span', '–', 'uwp-dash'), cell(match[8], 'TL'));
        return ribbon;
    }
    // Headline numbers for one body, as tiles.
    function factTiles(parent, facts) {
        const shown = facts.filter(([, value]) => value != null && value !== '');
        if (!shown.length) return;
        const grid = el('dl', undefined, 'atlas-facts');
        for (const [label, value, note] of shown) {
            const tile = el('div', undefined, 'atlas-fact');
            tile.append(el('dt', label));
            const dd = el('dd', value);
            if (note) dd.append(el('small', note));
            tile.append(dd);
            grid.append(tile);
        }
        parent.append(grid);
    }
    function num(value, decimals, unit) {
        if (value == null || value === '' || !Number.isFinite(Number(value))) return '';
        return formatDisplayNumber(Number(value), decimals, unit);
    }
    function periodText(b) {
        const days = Number(b.periodDays);
        if (Number.isFinite(days) && days > 0) return days >= 730 ? num(days / 365.25, 1, 'yr') : num(days, days < 10 ? 2 : 1, 'd');
        const years = Number(b.periodYears);
        if (Number.isFinite(years) && years > 0) return num(years, 2, 'yr');
        return '';
    }
    function celsius(kelvin) {
        const k = Number(kelvin);
        return Number.isFinite(k) && k > 0 ? `${formatDisplayNumber(k - 273.15, 0)} °C` : '';
    }

    // ── Surface map lead ──────────────────────────────────────────────────────
    // Rendered sheets are kept, so re-renders reuse the canvas instead of redrawing.
    // While a sheet draws, the empty diamond is scanned: its hex grid in teal
    // on black, one direction at a time. A pass runs to an edge and stops.
    // If the sheet is ready there, it fades in. If not, the line sweeps back
    // the other way and checks again.
    //   waiting   → the sheet has not been drawn yet
    //   ready     → drawn, waiting for the current pass to reach an edge
    //   revealing → the surface is fading in
    //   full      → shown
    const mapCache = new Map();
    const blankCache = new Map();
    // The sheet on screen, so moving to another world can fade from it.
    let shownSheet = null;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    function mapSheet(spec) {
        const key = JSON.stringify([spec.seed, spec.worldData, window.planetContinentalDefinition, window.planetCoastlineComplexity, !!window.printMode]);
        let sheet = mapCache.get(key);
        if (sheet) return sheet;
        sheet = { canvas: document.createElement('canvas'), state: 'waiting' };
        sheet.canvas.width = 800;
        sheet.canvas.height = 400;
        mapCache.set(key, sheet);
        if (mapCache.size > 16) mapCache.delete(mapCache.keys().next().value);
        // Two frames first, so the scan is on screen before the drawing work.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            PlanetRenderer.renderFlatMap(sheet.canvas, spec.worldData, spec.seed, { projection: 'diamond' });
            sheet.state = 'ready';
            const lead = sheet.canvas.closest('.dossier-map');
            if (lead) lead.dataset.state = 'ready';
            if (lead && reducedMotion?.matches) revealSheet(sheet, lead);
        }));
        return sheet;
    }
    function blankSheet(worldData) {
        const key = String(worldData.size);
        let blank = blankCache.get(key);
        if (!blank) {
            blank = document.createElement('canvas');
            PlanetRenderer.renderDiamondBlank(blank, worldData);
            blankCache.set(key, blank);
        }
        const copy = document.createElement('canvas');
        copy.width = blank.width;
        copy.height = blank.height;
        copy.getContext('2d').drawImage(blank, 0, 0);
        copy.className = 'map-scan-blank';
        return copy;
    }
    function revealSheet(sheet, lead) {
        if (!lead.isConnected || lead.dataset.state === 'revealing' || lead.dataset.state === 'full') return;
        const done = () => {
            sheet.state = 'full';
            lead.dataset.state = 'full';
            lead.removeAttribute('aria-busy');
        };
        if (reducedMotion?.matches) { done(); return; }
        lead.dataset.state = 'revealing';
        sheet.canvas.addEventListener('animationend', done, { once: true });
    }
    function mapScanner(sheet, worldData, lead) {
        const scan = el('span', undefined, 'map-scan');
        scan.setAttribute('aria-hidden', 'true');
        const beam = el('span', undefined, 'map-scan-beam');
        // Down first. animationend is one edge: reveal a ready sheet, or turn around.
        let downward = true;
        const play = (down) => {
            beam.classList.remove('scan-down', 'scan-up');
            beam.classList.add(down ? 'scan-down' : 'scan-up');
        };
        beam.addEventListener('animationend', (event) => {
            if (event.target !== beam) return;
            if (!lead.isConnected || lead.dataset.state === 'revealing' || lead.dataset.state === 'full') return;
            if (sheet.state === 'ready') {
                revealSheet(sheet, lead);
                return;
            }
            downward = !downward;
            play(downward);
        });
        play(true);
        // The field holds the diamond outline still while the beam moves inside it.
        const field = el('span', undefined, 'map-scan-field');
        field.append(beam);
        scan.append(blankSheet(worldData), field);
        return scan;
    }
    function worldMapLead(selected, callout) {
        const spec = window.openDiamondWorldMap?.spec?.(selected, hexId);
        if (!spec || !window.PlanetRenderer?.renderFlatMap) return null;
        const name = spec.worldData.name || selected.name || 'this world';
        const lead = button('', () => openDiamondWorldMap(selected, hexId), 'dossier-map');
        lead.setAttribute('aria-label', `Open the surface map of ${name}`);
        lead.title = 'Open the surface map';
        const sheet = mapSheet(spec);
        lead.dataset.state = sheet.state;
        const stage = el('span', undefined, 'dossier-map-stage');
        stage.append(sheet.canvas);
        if (sheet.state !== 'full') {
            // Reduced motion drops the sweep, so a sheet already drawn fades in now.
            if (reducedMotion?.matches && sheet.state === 'ready') revealSheet(sheet, lead);
            else {
                lead.setAttribute('aria-busy', 'true');
                stage.append(mapScanner(sheet, spec.worldData, lead));
            }
        }
        // Moving to another world: the last sheet fades out over this one, and
        // a sheet already drawn fades in beneath it. The same world re-rendered
        // stays put.
        if (shownSheet && shownSheet !== sheet && shownSheet.state === 'full') {
            const outgoing = document.createElement('canvas');
            outgoing.width = shownSheet.canvas.width;
            outgoing.height = shownSheet.canvas.height;
            outgoing.getContext('2d').drawImage(shownSheet.canvas, 0, 0);
            outgoing.className = 'map-outgoing';
            outgoing.addEventListener('animationend', () => outgoing.remove(), { once: true });
            stage.append(outgoing);
            if (sheet.state === 'full') lead.classList.add('is-arriving');
        }
        shownSheet = sheet;
        lead.append(stage);
        const caption = el('span', undefined, 'dossier-map-caption');
        if (callout) {
            const badge = el('span', undefined, 'dossier-map-badge');
            badge.append(icon('star'), el('span', callout));
            caption.append(badge);
        }
        const hint = el('span', undefined, 'dossier-map-hint');
        hint.append(icon('up-right-and-down-left-from-center'), el('span', 'Surface map'));
        caption.append(hint);
        lead.append(caption);
        return lead;
    }

    // ── Campaign records ──────────────────────────────────────────────────────
    function campaignSection(parent, location, subject) {
        const api = window.CampaignAtlas;
        if (!api?.createAt || !window.campaignAtlas || window.dbManager?.campaignLoadError?.()) return;
        const records = location ? api.recordsForBody(hexId, location) : api.recordsForHex(hexId);
        const from = { hexId, bodyKey: location?.key || null, label: location?.label || systemName() };
        const section = el('section', undefined, 'atlas-section atlas-campaign');
        const head = el('h3', 'Campaign');
        if (records.length) head.append(el('span', String(records.length), 'atlas-count'));
        section.append(head);
        if (records.length) {
            const list = el('div', undefined, 'atlas-campaign-list');
            for (const record of records) {
                const row = button('', () => api.openRecord(record.id, from), 'atlas-campaign-row');
                const mark = el('span', undefined, `atlas-campaign-mark type-${record.type}`);
                mark.append(icon(window.AppNavigation?.icons?.[record.type] || 'note-sticky'));
                const copy = el('span', undefined, 'atlas-campaign-copy');
                copy.append(el('strong', record.name));
                const where = !location && record.anchor.locationLabel ? record.anchor.locationLabel : '';
                const meta = [api.SINGULAR[record.type] || record.type, where].filter(Boolean).join(' · ');
                copy.append(el('span', record.summary || meta, 'atlas-campaign-meta'));
                row.append(mark, copy, icon('chevron-right'));
                row.title = `Open ${record.name}`;
                list.append(row);
            }
            section.append(list);
        } else {
            section.append(el('p', `Nothing is tied to ${subject} yet. Add a contact, a hook, or a place to start.`, 'atlas-muted atlas-campaign-empty'));
        }
        const add = el('div', undefined, 'atlas-campaign-add');
        add.setAttribute('role', 'group');
        add.setAttribute('aria-label', `Add a campaign record to ${subject}`);
        for (const type of api.TYPES) {
            const label = api.SINGULAR[type] || type;
            const chip = iconButton(window.AppNavigation?.icons?.[type] || 'plus', label,
                () => api.createAt(type, { hexId, locationLabel: location?.label || '', bodyKey: location?.key }, from), 'atlas-add-chip');
            chip.title = `New ${label.toLocaleLowerCase()} at ${subject}`;
            add.append(chip);
        }
        section.append(add);
        parent.append(section);
    }
    // The toolbar "Record" menu offers the same types without scrolling.
    function recordMenu(location, subject) {
        const api = window.CampaignAtlas;
        if (!api?.createAt || window.dbManager?.campaignLoadError?.()) return null;
        const menu = el('details', undefined, 'atlas-menu');
        const summary = el('summary', undefined, 'atlas-icon-btn');
        summary.append(icon('plus'), el('span', 'Record'));
        summary.title = `Add a campaign record to ${subject}`;
        const list = el('div', undefined, 'atlas-menu-list');
        const from = { hexId, bodyKey: location?.key || null, label: location?.label || systemName() };
        for (const type of api.TYPES) {
            const item = iconButton(window.AppNavigation?.icons?.[type] || 'plus', api.SINGULAR[type] || type,
                () => { menu.open = false; api.createAt(type, { hexId, locationLabel: location?.label || '', bodyKey: location?.key }, from); });
            list.append(item);
        }
        menu.append(summary, list);
        menu.addEventListener('toggle', () => {
            if (!menu.open) return;
            const dismiss = e => {
                if (menu.contains(e.target)) return;
                menu.open = false;
                document.removeEventListener('pointerdown', dismiss, true);
            };
            document.addEventListener('pointerdown', dismiss, true);
        });
        return menu;
    }

    // ── Body sub-layer ────────────────────────────────────────────────────────
    function openInOrbit(key) {
        if (!window.SystemViewer?.normalizeSystem(hexStates.get(hexId) || {})) return;
        SystemViewer.open(hexId);
        requestAnimationFrame(() => {
            const target = key && SystemViewer.locationEntries().find(entry => entry.key === key);
            if (target) SystemViewer.centerOnBody(target.body);
        });
    }
    function bodyBar(selected, location) {
        const bar = el('div', undefined, 'atlas-body-bar');
        const bodies = navBodies();
        const index = bodies.indexOf(selected);
        const nav = el('div', undefined, 'atlas-body-nav');
        const prev = iconButton('chevron-left', 'Previous body', () => focusBody(bodies[index - 1]), 'atlas-nav-btn', false);
        const next = iconButton('chevron-right', 'Next body', () => focusBody(bodies[index + 1]), 'atlas-nav-btn', false);
        prev.disabled = index <= 0;
        next.disabled = index < 0 || index >= bodies.length - 1;
        if (index > 0) prev.title = `Previous: ${bodyName(bodies[index - 1])}`;
        if (index >= 0 && index < bodies.length - 1) next.title = `Next: ${bodyName(bodies[index + 1])}`;
        nav.append(prev, next);
        if (index >= 0) nav.append(el('span', `${index + 1} / ${bodies.length}`, 'atlas-body-count'));
        const actions = el('div', undefined, 'atlas-body-actions');
        if (window.SystemViewer?.isOpen() && SystemViewer.currentHexId() === hexId) {
            const following = SystemViewer.isTracking() && SystemViewer.trackedBody() === selected;
            const center = iconButton('location-crosshairs', following ? 'Tracking' : 'Center', () => {
                SystemViewer.centerOnBody(selected);
                render();
            }, following ? 'is-on' : '');
            center.title = 'Frame this body and anything orbiting it';
            center.setAttribute('aria-pressed', String(following));
            actions.append(center);
        } else if (window.SystemViewer?.normalizeSystem(hexStates.get(hexId) || {})) {
            const orbit = iconButton('solar-system', 'Orbits', () => openInOrbit(location?.key));
            orbit.title = 'Open orbit view on this body';
            actions.append(orbit);
        }
        if (window.openDiamondWorldMap?.canMap(selected)) {
            const map = iconButton('map', 'Map', () => openDiamondWorldMap(selected, hexId));
            map.title = 'Diamond surface map with this world’s hex grid';
            actions.append(map);
        }
        const menu = location ? recordMenu(location, bodyName(selected)) : null;
        if (menu) actions.append(menu);
        bar.append(nav, actions);
        return bar;
    }
    function bodyPlace(selected) {
        const parts = [bodyTypeLabel(selected)];
        if (isStar(selected)) {
            const role = starPlace(selected, system?.stars || []);
            if (role && role !== parts[0]) parts.push(role);
        } else {
            const parent = parentWorld(selected);
            if (parent) parts.push(`moon of ${bodyName(parent)}`);
            else if (selected.orbitId != null && selected.orbitId !== '') parts.push(`Orbit ${num(selected.orbitId, 2)}`);
            if (!parent && selected.au != null && selected.au !== '') parts.push(num(selected.au, 3, 'AU'));
        }
        return parts.filter(Boolean).join(' · ');
    }
    function renderBody(selected) {
        content.classList.add('body-view');
        const location = locationOf(selected);
        const star = isStar(selected);
        content.append(bodyBar(selected, location));
        const scroll = el('div', undefined, 'atlas-body-scroll');
        scroll.dataset.keepScroll = 'body';
        const main = el('div', undefined, 'atlas-body-main');
        const side = el('div', undefined, 'atlas-body-side');
        const lead = worldMapLead(selected, isMainworld(selected) ? 'Mainworld' : '');
        if (lead) main.append(lead);
        const ribbon = selected.uwp ? uwpRibbon(selected.uwp) : null;
        if (ribbon) main.append(ribbon);
        const moons = (selected.moons || []).filter(moon => moon.type !== 'Empty');
        if (star) {
            factTiles(main, [
                ['Temperature', num(selected.temp, 0, 'K')], ['Luminosity', num(selected.lum, 3, 'L☉')],
                ['Mass', num(selected.mass, 3, 'M☉')], ['Diameter', num(selected.diam, 3, 'D☉')]
            ]);
        } else {
            factTiles(main, [
                ['Diameter', num(selected.diamKm, 0, 'km')], ['Gravity', num(selected.gravity, 2, 'G')],
                ['Mean temp.', num(selected.meanTempK, 0, 'K'), celsius(selected.meanTempK)],
                ['Day', window.SystemViewer?.rotationText?.(selected) || ''],
                ['Year', periodText(selected)], ['Moons', moons.length ? String(moons.length) : '']
            ]);
        }
        const sourceLabel = selected.name || selected.type || '';
        if (star) {
            statSection(main, 'Star', [
                ['Type', spectralPhrase(selected)], ['Role', starPlace(selected, system?.stars || [])],
                ['Separation', selected.separation], ['Orbit', selected.orbitId, 2], ['Eccentricity', selected.eccentricity, 3]
            ], sourceLabel);
        } else {
            statSection(main, 'World profile', [
                ['Starport', selected.starport], ['Size', selected.size], ['Atmosphere', selected.atm],
                ['Hydrographics', selected.hydro], ['Population', selected.pop], ['Government', selected.gov],
                ['Law level', selected.law], ['Tech level', selected.tl],
                ['Trade codes', selected.tradeCodes], ['Travel zone', selected.travelZone]
            ], sourceLabel);
            statSection(side, 'Orbit', [
                ['Orbit', selected.orbitId, 2], ['Distance (AU)', selected.au, 3], ['Satellite orbit (PD)', selected.pd, 2],
                ['Eccentricity', selected.eccentricity, 3], ['Orbital period (days)', selected.periodDays, 1],
                ['Axial tilt (°)', selected.axialTilt, 1],
                ['Tidally locked', selected.tidallyLocked === true ? true : null],
                ['Twilight zone', selected.isTwilightZone === true ? true : null]
            ], sourceLabel);
            statSection(side, 'Physical', [
                ['Mass (M⊕)', selected.massEarths ?? selected.mass, 3], ['Composition', selected.composition],
                ['Atmospheric pressure (bar)', selected.totalPressureBar ?? selected.pressureBar, 2],
                ['High temperature (K)', selected.highTempK, 0], ['Low temperature (K)', selected.lowTempK, 0],
                ['Temperature band', selected.tempBand], ['Albedo', selected.albedo, 2]
            ], sourceLabel);
            statSection(side, 'Life & resources', [
                ['Habitability', selected.habitability], ['Biomass', selected.biomass],
                ['Biocomplexity', selected.biocomplexity], ['Biodiversity', selected.biodiversity],
                ['Compatibility', selected.compatibility], ['Native sophont', selected.nativeSophont || null],
                ['Extinct sophont', selected.extinctSophont || null], ['Resource rating', selected.resourceRating]
            ], sourceLabel);
        }
        if (moons.length) bodyList(side, moons, 'Moons');
        if (star) {
            const worlds = (system?.worlds || []).filter(world => world.type !== 'Empty' &&
                (system.stars || []).indexOf(selected) === (world.parentStarIdx ?? 0));
            if (worlds.length) bodyList(side, worlds, 'Worlds');
        }
        if (location) campaignSection(side, location, bodyName(selected));
        scroll.append(main, side);
        content.append(scroll);
    }
    function spectralPhrase(b) {
        return [b.sType, b.subType, b.sClass].filter(v => v != null && v !== '').join(' ');
    }
    function starPlace(star, stars) {
        const role = star.role || (star === stars[0] ? 'Primary' : 'Companion');
        const parent = Number.isInteger(star.parentStarIdx) ? stars[star.parentStarIdx] : null;
        if (role === 'Companion' && parent && parent !== star) return `Companion of ${parent.name || 'the primary'}`;
        return role;
    }
    // One clickable body row: glyph, name, and a short detail line.
    function bodyRow(b, detail, extraClass = '') {
        const row = button('', () => focusBody(b), `atlas-body-row ${extraClass}`.trim());
        if (isMainworld(b)) row.classList.add('is-mainworld');
        const text = el('span', undefined, 'atlas-body-text');
        const name = el('span', bodyName(b), 'atlas-body-name');
        text.append(name);
        // A list of facts leads with the descriptor; the rest can be hidden
        // where the row is too narrow to hold it (half width).
        if (Array.isArray(detail) && detail.length) {
            const small = el('small');
            small.append(el('span', detail[0], 'atlas-body-kind'));
            if (detail.length > 1) small.append(el('span', ` · ${detail.slice(1).join(' · ')}`, 'atlas-body-extra'));
            text.append(small);
        } else if (detail) text.append(el('small', detail));
        row.append(bodyGlyph(b, isMoon(b) ? 18 : 22), text);
        if (isMainworld(b)) row.append(el('span', 'Mainworld', 'atlas-body-tag'));
        else if (b.uwp && !isStar(b)) row.append(el('span', b.uwp, 'atlas-body-uwp'));
        row.title = `${bodyName(b)} · ${bodyTypeLabel(b)}`;
        return row;
    }
    function bodyFacts(b) {
        if (isStar(b)) return starPlace(b, system?.stars || []);
        const facts = [bodyTypeLabel(b)];
        // A moon shares its parent's orbit, so its own distance is the PD figure.
        if (isMoon(b)) {
            if (b.pd != null && b.pd !== '') facts.push(num(b.pd, 1, 'PD'));
        } else {
            if (b.orbitId != null && b.orbitId !== '') facts.push(`Orbit ${num(b.orbitId, 2)}`);
            if (b.au != null && b.au !== '') facts.push(num(b.au, 2, 'AU'));
        }
        if (b.diamKm) facts.push(num(b.diamKm, 0, 'km'));
        return facts;
    }
    function bodyList(parent, bodies, heading) {
        const section = el('section', undefined, 'atlas-section atlas-body-list');
        section.append(el('h3', heading));
        bodies.filter(b => b.type !== 'Empty').forEach(b => section.append(bodyRow(b, bodyFacts(b))));
        parent.append(section);
    }

    // ── System overview ───────────────────────────────────────────────────────
    function mappedMainworld(state) {
        if (system) {
            for (const world of system.worlds || []) {
                if (world.type === 'Mainworld') return world;
                const moon = (world.moons || []).find(item => item.type === 'Mainworld');
                if (moon) return moon;
            }
        }
        return mainworld(state);
    }
    function socioExtension(ms) {
        const bits = String(ms.economicProfile || '').split(',').map(part => part.trim()).filter(Boolean);
        return bits.length > 1 ? bits[1] : '';
    }
    function socioHeadline(ms) {
        if (!ms) return '';
        const parts = [];
        if (ms.Im != null && ms.Im !== '') parts.push(`Importance ${ms.Im}`);
        const extension = socioExtension(ms);
        if (extension) parts.push(extension);
        if (ms.WTN != null && ms.WTN !== '') parts.push(`WTN ${ms.WTN}`);
        if (ms.pcGWP != null && ms.pcGWP !== '') parts.push(`Cr${ms.pcGWP}`);
        return parts.join(' · ');
    }
    function pbgCode(state, world) {
        const data = state.t5Data || world;
        if (!data || data.popDigit === undefined || typeof toEHex !== 'function') return '';
        const belts = data.planetoidBelts != null ? data.planetoidBelts : (state.beltCount || 0);
        const gas = data.gasGiantsCount != null ? data.gasGiantsCount : (state.gasGiantCount || 0);
        return `${toEHex(data.popDigit)}${toEHex(belts)}${toEHex(gas)}`;
    }
    function starLabel(star) {
        if (star.sType) return [star.sType, star.subType, star.sClass].filter(v => v != null && v !== '').join(' ');
        const decimal = star.decimal != null ? star.decimal : (star.subType != null ? star.subType : '');
        const spec = `${star.type || ''}${decimal}${star.size ? ' ' + star.size : ''}`.trim();
        return spec || star.name || 'Star';
    }
    function journeyHost(state) {
        const mapped = mappedMainworld(state);
        if (mapped && mapped.size != null && mapped.size !== '' && system?.stars?.length) return mapped;
        const profile = mainworld(state);
        if (profile && profile.size != null && profile.size !== '' && system?.stars?.length) return profile;
        return null;
    }
    function appendJourney(parent, state) {
        if (typeof buildJourneyTimesUI !== 'function') return;
        const world = journeyHost(state);
        if (!world) return;
        const stars = system.stars || [];
        const star = stars[world.parentStarIdx || 0] || stars[0];
        const html = buildJourneyTimesUI(world, star);
        if (!html) return;
        const wrap = el('div', undefined, 'dossier-jump');
        wrap.innerHTML = html;
        parent.append(wrap);
    }
    function appendStellar(parent) {
        const stars = (system && system.stars) || [];
        const visible = stars.filter(star => star.separation !== 'Companion');
        if (!visible.length) return;
        const box = el('div', undefined, 'dossier-stellar');
        box.append(el('h3', 'Stellar configuration'));
        visible.forEach(star => {
            const idx = stars.indexOf(star);
            const companions = stars.filter(item => item.separation === 'Companion' && item.parentStarIdx === idx);
            const extra = companions.length ? ` (+${companions.map(starLabel).join(', +')})` : '';
            const role = star.role && star.role !== 'Primary' ? ` — ${star.role}` : '';
            const line = el('p', undefined, 'dossier-star-line');
            line.append(bodyGlyph(star, 16), el('span', `${starLabel(star)}${extra}${role}`));
            box.append(line);
        });
        parent.append(box);
    }
    function appendTree(parent) {
        if (!system) return;
        const section = el('section', undefined, 'dossier-tree');
        section.dataset.keepScroll = 'tree';
        const worlds = (system.worlds || []).filter(world => world.type !== 'Empty');
        const head = el('h3', 'System');
        head.append(el('span', `${(system.stars || []).length + worlds.length}`, 'atlas-count'));
        section.append(head);
        (system.stars || []).forEach(star => {
            // A star named by its spectral type would say it twice.
            const spectral = starLabel(star);
            const named = star.name && star.name.replace(/\s+/g, '') !== spectral.replace(/\s+/g, '');
            section.append(bodyRow(star, [named ? spectral : '', starPlace(star, system.stars)].filter(Boolean).join(' · '), 'is-star'));
        });
        worlds.forEach(world => {
            const block = el('div', undefined, 'dossier-world');
            block.append(bodyRow(world, bodyFacts(world)));
            const moons = (world.moons || []).filter(moon => moon.type !== 'Empty');
            if (moons.length) {
                const moonList = el('div', undefined, 'dossier-moons');
                moons.forEach(moon => moonList.append(bodyRow(moon, bodyFacts(moon), 'dossier-moon')));
                block.append(moonList);
            }
            section.append(block);
        });
        if (section.querySelector('.atlas-body-row')) parent.append(section);
    }
    function mainworldCallout(state) {
        const mapped = mappedMainworld(state);
        const name = (mapped?.name && String(mapped.name).trim()) || '';
        const parent = mapped && parentWorld(mapped);
        if (parent) return `Mainworld · moon of ${bodyName(parent)}`;
        return name && name !== systemName() ? `Mainworld · ${name}` : 'Mainworld';
    }
    function renderSystem(state) {
        if (body) { renderBody(body); return; }
        content.classList.add('dossier-view');
        const mapped = mappedMainworld(state);
        const lead = worldMapLead(mapped, mainworldCallout(state));
        if (lead) content.append(lead);
        const world = mainworld(state);
        const socio = state.mgtSocio;
        const root = el('div', undefined, 'dossier');
        root.dataset.keepScroll = 'dossier';
        const identity = el('div', undefined, 'dossier-identity');
        identity.dataset.keepScroll = 'identity';
        const socioCol = el('div', undefined, 'dossier-socio');
        socioCol.dataset.keepScroll = 'socio';
        const actions = el('div', undefined, 'atlas-actions');
        const viewerHere = window.SystemViewer?.isOpen() && SystemViewer.currentHexId() === hexId;
        if (!viewerHere && window.SystemViewer?.normalizeSystem(state)) {
            const explore = iconButton('solar-system', 'Explore orbits', () => SystemViewer.open(hexId), 'atlas-primary');
            explore.title = 'Open orbit view for this system (or double-click it on the map)';
            actions.append(explore);
        }
        const mappedLocation = mapped && system ? locationOf(mapped) : null;
        if (mappedLocation) {
            const details = iconButton('earth-americas', 'Mainworld', () => focusBody(mapped));
            details.title = 'Open the mainworld’s full profile';
            actions.append(details);
        }
        if (state.ctData || state.ctSystem || state.mgt2eData || state.mgtSystem || state.t5Data || state.t5System) {
            actions.append(iconButton('pen-to-square', 'Edit system', () => SystemEditor.openEdit(hexId)));
        }
        if (actions.childElementCount) identity.append(actions);
        const ribbon = uwpRibbon(world.uwp || state.uwp);
        if (ribbon) identity.append(ribbon);
        const resourceUnits = (socio && socio.RU != null && socio.RU !== '')
            ? String(socio.RU)
            : ((state.t5Socio && state.t5Socio.RU != null) ? String(state.t5Socio.RU) : '');
        detailRows(identity, [
            ['Starport', world.starport], ['Size', world.size], ['Atmosphere', world.atm],
            ['Hydrographics', world.hydro], ['Population', world.pop ?? world.population],
            ['Government', world.gov ?? world.government], ['Law level', world.law], ['Tech level', world.tl],
            ['Trade codes', world.tradeCodes || state.tradeCodes],
            ['Travel zone', state.travelZone || world.travelZone],
            ['Allegiance', { code: state.allegiance || world.allegiance || '', name: state.allegianceName || '' }],
            ['Bases', world.baseCodes || (Array.isArray(world.bases) ? world.bases.join('') : world.bases) || state.bases],
            ['Nobility', (state.t5Socio && state.t5Socio.nobleCodes) || world.nobleCodes],
            ['PBG', pbgCode(state, world)],
            ['Resource units', resourceUnits],
            ['Gas giants', state.gasGiantCount], ['Belts', state.beltCount],
            ['Age (Gyr)', system?.age], ['Edition', system?.edition]
        ]);
        if (state.notes) {
            const notes = el('details', undefined, 'atlas-notes');
            if ((panel.dataset.span || 'column') !== 'column') notes.open = true;
            notes.append(el('summary', 'Referee notes'), el('p', state.notes));
            identity.append(notes);
        }
        appendJourney(identity, state);
        const bodies = system && ((system.stars || []).length || (system.worlds || []).some(item => item.type !== 'Empty'));
        if (!bodies) {
            const brief = el('div', undefined, 'dossier-brief');
            brief.append(el('p', 'Orbit data has not been generated. You can still keep campaign records for this system.', 'atlas-muted'));
            identity.append(brief);
        }
        campaignSection(identity, null, systemName());
        const socioAcc = el('details', undefined, 'dossier-socio-acc');
        if ((panel.dataset.span || 'column') === 'full') socioAcc.open = true;
        const summary = el('summary');
        summary.append(el('span', 'Socioeconomics'));
        const headline = socioHeadline(socio);
        if (headline) summary.append(el('span', headline, 'dossier-socio-line'));
        const socioDetail = el('div', undefined, 'dossier-socio-detail');
        socioAcc.append(summary, socioDetail);
        socioCol.append(socioAcc);
        if (socio && socio.pValue !== undefined) {
            detailRows(socioDetail, [
                ['Importance', socio.Im],
                ['Economic profile', socio.economicProfile],
                ['World trade number', socio.WTN],
                ['GWP per capita', socio.pcGWP],
                ['Resource units', socio.RU],
                ['Inequality', socio.IR],
                ['Development', socio.DR],
                ['Population value', socio.pValue],
                ['Total population', socio.totalWorldPop],
                ['PCR', socio.pcr],
                ['Urbanization', socio.urbanPercent != null ? `${socio.urbanPercent}%` : ''],
                ['Major cities', socio.majorCities],
                ['Government profile', socio.govProfile],
                ['Factions', socio.factions],
                ['Judicial profile', socio.judicialSystemProfile],
                ['Law profile', socio.lawProfile],
                ['Tech profile', socio.techProfile],
                ['Cultural profile', socio.culturalProfile],
                ['Starport profile', socio.starportProfile],
                ['Military profile', socio.militaryProfile]
            ]);
        } else socioDetail.append(el('p', 'Mongoose socioeconomics have not been built for this world.', 'atlas-muted'));
        appendStellar(socioCol);
        const side = el('div', undefined, 'dossier-side');
        side.dataset.keepScroll = 'side';
        side.append(socioCol);
        appendTree(side);
        root.append(identity, side);
        content.append(root);
    }

    // ── Header ────────────────────────────────────────────────────────────────
    // A body is a layer under its system: the eyebrow becomes a breadcrumb back
    // to the system (and to the parent world, for a moon).
    function crumb(label, action, hint) {
        const node = button('', action, 'atlas-crumb');
        node.append(el('span', label));
        node.title = hint;
        return node;
    }
    function renderHeader(campaign) {
        glyphSlot.replaceChildren();
        glyphSlot.hidden = true;
        context.replaceChildren();
        if (!campaign && hexId && body) {
            title.textContent = bodyName(body);
            const trail = [crumb(systemName(), leaveBody, 'Back to the system overview (Esc)')];
            const parent = parentWorld(body);
            if (parent) {
                trail.push(el('span', '/', 'atlas-crumb-sep'));
                trail.push(crumb(bodyName(parent).replace(`${systemName()} `, ''), () => focusBody(parent), `Back to ${bodyName(parent)}`));
            }
            const back = icon('arrow-left');
            back.classList.add('atlas-crumb-icon');
            trail[0].prepend(back);
            context.append(...trail);
            context.hidden = false;
            glyphSlot.append(bodyGlyph(body, 30));
            glyphSlot.hidden = false;
            // The hex rides on the subtitle so the glyph and name share one line.
            hexTag.textContent = '';
            hexTag.hidden = true;
            place.textContent = `${bodyPlace(body)} · ${String(hexId).replace(/-/g, '‑')}`;
            place.hidden = !place.textContent;
            return;
        }
        const heading = campaign ? (window.CampaignAtlas?.heading() || 'Campaign') : (hexId ? systemName() : 'System');
        title.textContent = heading;
        // The eyebrow names a campaign view below its root. A system keeps the
        // sector and subsector on their own line under the name.
        context.textContent = campaign && heading !== 'Campaign' ? 'Campaign' : '';
        context.hidden = !context.textContent;
        hexTag.textContent = !campaign && hexId && heading !== hexId ? hexId : '';
        hexTag.hidden = !hexTag.textContent;
        place.textContent = !campaign && hexId ? locationLine(hexId) : '';
        place.hidden = !place.textContent;
    }
    // Re-rendering the same view keeps each column where the reader left it.
    function scrollMemory() {
        const saved = [['content', content.scrollTop]];
        content.querySelectorAll('[data-keep-scroll]').forEach(node => saved.push([node.dataset.keepScroll, node.scrollTop]));
        return saved;
    }
    function restoreScroll(saved) {
        for (const [name, top] of saved) {
            const node = name === 'content' ? content : content.querySelector(`[data-keep-scroll="${name}"]`);
            if (node) node.scrollTop = top;
        }
    }
    function render() {
        if (!content) return;
        const viewKey = `${tab}|${hexId}|${body ? bodyKey || 'body' : ''}|${panel.dataset.span}`;
        const saved = viewKey === lastViewKey && tab === 'system' ? scrollMemory() : null;
        lastViewKey = viewKey;
        content.classList.remove('dossier-view', 'body-view');
        window.TradeMatch?.sync(tab === 'system' ? hexId : null);
        window.CampaignAtlas?.releaseView?.();
        const footer = document.getElementById('atlas-footer');
        footer.replaceChildren();
        footer.hidden = true;
        content.replaceChildren();
        const campaign = tab === 'campaign';
        const state = hexStates.get(hexId);
        if (body && (!state || state.type !== 'SYSTEM_PRESENT')) { body = null; bodyKey = null; }
        renderHeader(campaign);
        syncWorkspaceButtons();
        if (tab === 'campaign') { window.CampaignAtlas?.render(content, hexId); syncInspectOutline(); window.syncMapActionBar?.(); return; }
        if (!state || state.type !== 'SYSTEM_PRESENT') {
            content.append(el('h2', 'Your campaign starts with a system'), el('p', 'Click a system on the map to inspect it. Double-click to explore its orbits.', 'atlas-muted'));
            window.CampaignAtlas?.syncMapFocus();
            syncInspectOutline();
            window.syncMapActionBar?.();
            return;
        }
        renderSystem(state);
        if (saved) restoreScroll(saved);
        window.CampaignAtlas?.syncMapFocus();
        syncInspectOutline();
        window.syncMapActionBar?.();
    }
    function remapHexId(fn) {
        if (typeof fn !== 'function') return;
        if (hexId) hexId = fn(hexId);
        if (lastInspectedHex) lastInspectedHex = fn(lastInspectedHex);
    }
    function inspectedHexId() {
        if (!open || tab !== 'system' || !hexId) return null;
        const state = hexStates.get(hexId);
        return state && state.type === 'SYSTEM_PRESENT' ? hexId : null;
    }
    function syncInspectOutline() {
        const id = inspectedHexId();
        if (id === lastInspectedHex) return;
        lastInspectedHex = id;
        if (typeof draw === 'function') requestAnimationFrame(draw);
    }
    function refresh(force = false) {
        if (!open) return;
        const state = hexStates.get(hexId);
        const next = JSON.stringify(state);
        if (!force && next === signature) return;
        if (next !== signature) {
            body = null;
            bodyKey = null;
            signature = next;
            if (window.SystemViewer?.currentHexId?.() === hexId) SystemViewer.refresh(hexId);
        }
        system = state ? (window.SystemViewer?.currentHexId?.() === hexId ? SystemViewer.currentSystem() : SystemViewer.normalizeSystem(state)) : null;
        // A fresh normalization has fresh objects; find the same body again.
        if (body && bodyKey && !navBodies().includes(body)) body = bodyForKey(bodyKey);
        render();
    }
    function reset() {
        hexId = null; body = null; bodyKey = null; system = null; signature = '';
        window.CampaignAtlas?.showAll();
        close(true);
        render();
    }
    function setup() {
        panel = document.getElementById('system-inspector');
        title = document.getElementById('atlas-title');
        context = document.getElementById('atlas-context');
        hexTag = document.getElementById('atlas-hex');
        place = document.getElementById('atlas-place');
        glyphSlot = document.getElementById('atlas-glyph');
        content = document.getElementById('atlas-content');
        document.getElementById('atlas-toggle').addEventListener('click', () => {
            if (open && tab === 'system') close();
            else if (canLeave()) {
                tab = 'system';
                show();
                refresh(true);
                // A hex chosen while the campaign was open reloads the form. The same hex keeps unsaved fields.
                if (editing && (typeof editingHexId === 'undefined' || editingHexId !== hexId)) openHexEditor(hexId);
            }
        });
        document.getElementById('campaign-toggle').addEventListener('click', () => {
            if (open && tab === 'campaign' && !CampaignAtlas.currentType()) close();
            else if (canLeave()) { tab = 'campaign'; CampaignAtlas.showAll(); show(); refresh(true); }
        });
        document.getElementById('atlas-close').addEventListener('click', () => {
            if (close()) document.getElementById('atlas-toggle').focus();
        });
        document.getElementById('help-toggle').addEventListener('click', e => {
            if (open && !close()) { e.stopImmediatePropagation(); e.preventDefault(); }
        }, true);
        const editor = document.getElementById('hex-editor');
        const footer = document.getElementById('atlas-footer');
        if (editor && footer && editor.parentElement !== panel) panel.insertBefore(editor, footer);
        let stored = 'column';
        try { stored = localStorage.getItem(SPAN_KEY) || 'column'; } catch (err) { stored = 'column'; }
        applySpan(stored);
        panel.querySelectorAll('.atlas-span button').forEach(btn => {
            btn.addEventListener('click', () => { applySpan(btn.dataset.span); if (body) render(); });
        });
        document.getElementById('atlas-edit').addEventListener('click', () => {
            if (editing) closeHexEditor();
            else openHexEditor(hexId);
        });
        window.addEventListener('resize', layout);
        // Generated data is edited in place by existing tools. Only inspect one hex,
        // and only while visible; polling avoids changes to generation engines.
        setInterval(() => refresh(), 800);
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || !open || e.target.closest('#omni-search')) return;
            if (document.querySelector('.campaign-stardate-dialog[open], .atlas-crop-dialog[open]')) return;
            if (document.getElementById('world-image-panel')) return;
            const menu = panel.querySelector('.atlas-menu[open]');
            if (menu) {
                e.preventDefault(); e.stopImmediatePropagation();
                menu.open = false;
                return;
            }
            if (window.TradeMatch?.isOpen()) {
                e.preventDefault(); e.stopImmediatePropagation();
                TradeMatch.close();
                return;
            }
            if (window.CampaignAtlas?.isPicking()) {
                e.preventDefault(); e.stopImmediatePropagation();
                CampaignAtlas.cancelPick();
                return;
            }
            if (editing && tab === 'system') {
                e.preventDefault(); e.stopImmediatePropagation();
                closeHexEditor();
                return;
            }
            if (window.CampaignAtlas?.hasDraft()) {
                e.preventDefault(); e.stopImmediatePropagation();
                if (canLeave()) render();
            } else if (!window.SystemViewer?.isOpen()) {
                e.preventDefault(); e.stopImmediatePropagation();
                // Esc climbs out of a body before it closes the panel.
                if (tab === 'system' && body) leaveBody();
                else close();
            }
        }, true);
        render();
    }
    return { setup, openForHex, close, reset, refresh, selectBody, showBody, render, systemName, locationLine, canLeave,
        currentHexId: () => hexId, currentWorkspace: () => tab, isOpen: () => open,
        noteEditing, endEdit, bodyGlyph,
        inspectedHexId, remapHexId, el, button };
})();
