// Shared system context for the map, orrery, and Campaign Atlas. No generation logic.
window.SystemInspector = (() => {
    'use strict';
    let panel, content, title, subtitle;
    let hexId = null, tab = 'system', body = null, system = null, signature = '';
    let open = false;
    let lastInspectedHex = null;

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
    function mainworld(state) {
        return state.aowSystem?.mainworld || state.mgt2eData || state.ctData || state.t5Data || state.rttData || {};
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
        panel.hidden = true;
        panel.inert = true;
        window.CampaignAtlas?.releaseView();
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
        if (hexId !== id) { body = null; signature = ''; }
        hexId = id;
        tab = requestedTab;
        show();
        refresh(true);
        return true;
    }
    function selectBody(selected) {
        if (!canLeave()) return false;
        body = selected;
        tab = 'system';
        show();
        render();
        return true;
    }
    function syncWorkspaceButtons() {
        document.getElementById('atlas-toggle').setAttribute('aria-expanded', String(open && tab === 'system'));
        document.getElementById('campaign-toggle').setAttribute('aria-expanded', String(open && tab === 'campaign'));
        panel.setAttribute('aria-label', tab === 'campaign' ? 'Campaign workspace' : 'System inspector');
    }
    const UWP_KINDS = {
        Starport: 'starport', Size: 'size', Atmosphere: 'atmosphere', Hydrographics: 'hydrographics',
        Population: 'population', Government: 'government', 'Law level': 'law'
    };
    function formatStat(label, value) {
        if (label === 'Trade codes') {
            const text = typeof formatTradeCodes === 'function' ? formatTradeCodes(value) : (Array.isArray(value) ? value.join(', ') : String(value));
            if (!text) return '';
            const chips = text.split(', ').filter(Boolean).map(part => {
                const match = /^(.*) \(([^)]+)\)$/.exec(part);
                return match ? { code: match[2], name: match[1] } : { name: part };
            });
            return chips.length ? { chips } : '';
        }
        if (label === 'Tech level') return { code: String(value).trim() };
        if (UWP_KINDS[label] && typeof formatUwpDigit === 'function') {
            const text = formatUwpDigit(UWP_KINDS[label], value);
            if (!text) return '';
            const mark = ' \u2014 ';
            const split = text.indexOf(mark);
            if (split !== -1) return { code: text.slice(0, split), name: text.slice(split + mark.length) };
            return { code: text.trim() };
        }
        const numeric = typeof value === 'number' || /^(Orbit|Distance|Satellite orbit|Diameter|Stellar diameter|Mass|Gravity|Temperature|Luminosity|Eccentricity|Age)/.test(label);
        if (numeric) return formatDisplayNumber(value, /Temperature|Diameter \(km\)/.test(label) ? 0 : /Distance|Mass|Luminosity|Eccentricity/.test(label) ? 3 : 2);
        return Array.isArray(value) ? value.join(', ') : String(value);
    }
    function detailRows(parent, pairs) {
        const list = el('dl', undefined, 'atlas-stats');
        for (const [label, value] of pairs) {
            if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
            const formatted = formatStat(label, value);
            if (formatted == null || formatted === '') continue;
            const row = el('div', undefined, 'atlas-stat');
            row.append(el('dt', label));
            if (typeof formatted === 'object' && formatted.chips) {
                const chips = el('dd', undefined, 'atlas-stat-chips');
                formatted.chips.forEach(chip => {
                    const pill = el('span', undefined, 'atlas-chip');
                    if (chip.code) pill.append(el('b', chip.code));
                    pill.append(document.createTextNode(chip.name));
                    chips.append(pill);
                });
                row.append(chips);
            } else if (typeof formatted === 'object') {
                row.append(el('dd', formatted.code, formatted.name ? 'atlas-stat-code' : 'atlas-stat-code atlas-stat-code-solo'));
                if (formatted.name) row.append(el('dd', formatted.name, 'atlas-stat-name'));
            } else {
                row.append(el('dd', String(formatted), label === 'UWP' ? 'atlas-stat-mono' : 'atlas-stat-value'));
            }
            list.append(row);
        }
        if (list.childElementCount) parent.append(list);
    }
    function renderBody(selected) {
        const back = button('‹ System overview', () => {
            body = null;
            window.SystemViewer?.selectBody?.(null);
            render();
        }, 'atlas-link');
        content.append(back, el('h2', selected.name || selected.type || 'Star'));
        if (window.SystemViewer?.isOpen() && SystemViewer.currentHexId() === hexId) {
            const actions = el('div', undefined, 'atlas-actions');
            const following = SystemViewer.isTracking() && SystemViewer.trackedBody() === selected;
            const center = button(following ? 'Tracking' : 'Center view', () => {
                SystemViewer.centerOnBody(selected);
                render();
            }, following ? '' : 'atlas-primary');
            center.title = 'Frame this body and anything orbiting it';
            center.setAttribute('aria-pressed', String(following));
            actions.append(center);
            content.append(actions);
        }
        const namedType = selected.worldType || selected.type;
        const spectral = spectralPhrase(selected);
        const typeRestatesName = !namedType && spectral && selected.name &&
            selected.name.replace(/\s+/g, '').toUpperCase().includes(spectral.replace(/\s+/g, '').toUpperCase());
        detailRows(content, [
            ['Type', typeRestatesName ? null : (namedType || spectral)],
            ['Role', selected.role], ['UWP', selected.uwp],
            ['Starport', selected.starport], ['Size', selected.size], ['Atmosphere', selected.atm],
            ['Hydrographics', selected.hydro], ['Tech level', selected.tl],
            ['Trade codes', selected.tradeCodes], ['Travel zone', selected.travelZone],
            ['Orbit', selected.orbitId], ['Distance (AU)', selected.au], ['Satellite orbit (PD)', selected.pd],
            ['Diameter (km)', selected.diamKm], ['Stellar diameter (D☉)', selected.diam],
            ['Mass', selected.mass], ['Gravity (G)', selected.gravity],
            ['Temperature (K)', selected.meanTempK ?? selected.temp], ['Luminosity (L☉)', selected.lum],
            ['Eccentricity', selected.eccentricity], ['Moons', selected.moons?.length]
        ]);
        if (selected.moons?.length) bodyList(content, selected.moons, 'Moons');
    }
    function spectralPhrase(body) {
        return [body.sType, body.subType, body.sClass].filter(v => v != null && v !== '').join(' ');
    }
    function starPlace(star, stars) {
        const role = star.role || (star === stars[0] ? 'Primary' : 'Companion');
        const parent = Number.isInteger(star.parentStarIdx) ? stars[star.parentStarIdx] : null;
        if (role === 'Companion' && parent && parent !== star) return `Companion of ${parent.name || 'the primary'}`;
        return role;
    }
    function isRomanNumeral(token) {
        return token.length > 0 && /^(M{0,3})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(token);
    }
    function orbitalDesignation(name) {
        const text = String(name || '');
        let match = /^(.*)\s([A-Z])-([IVXLCDM]+)-([a-z])$/.exec(text);
        if (match && match[1] && isRomanNumeral(match[3])) return { system: match[1], star: match[2], roman: match[3], moon: match[4] };
        match = /^(.*)\s([A-Z])-([IVXLCDM]+)$/.exec(text);
        if (match && match[1] && isRomanNumeral(match[3])) return { system: match[1], star: match[2], roman: match[3] };
        match = /^(.*)\s([IVXLCDM]+)-([a-z])$/.exec(text);
        if (match && match[1] && isRomanNumeral(match[2])) return { system: match[1], roman: match[2], moon: match[3] };
        match = /^(.*)\s([IVXLCDM]+)$/.exec(text);
        if (match && match[1] && isRomanNumeral(match[2])) return { system: match[1], roman: match[2] };
        return null;
    }
    function designationNode(parts, withMoon) {
        const wrap = el('span', undefined, withMoon ? 'atlas-body-desig has-moon' : 'atlas-body-desig');
        wrap.append(
            el('span', parts.star || '', 'atlas-body-star'),
            el('span', parts.roman || '', 'atlas-body-roman')
        );
        if (withMoon) wrap.append(el('span', parts.moon ? `-${parts.moon}` : '', 'atlas-body-moon'));
        return wrap;
    }
    function bodyList(parent, bodies, heading) {
        const section = el('section', undefined, 'atlas-body-list');
        section.append(el('h3', heading));
        const visible = bodies.filter(b => b.type !== 'Empty');
        const rows = visible.map((b, index) => {
            const label = b.name || (heading === 'Stars' ? `Star ${index + 1}` : `${b.type || 'Body'} ${index + 1}`);
            const isStar = b.sType != null && !b.uwp;
            return { body: b, label, isStar, parts: isStar ? null : orbitalDesignation(b.name || '') };
        });
        const align = rows.some(row => row.parts);
        const withMoon = rows.some(row => row.parts && row.parts.moon);
        rows.forEach(row => {
            const btn = button('', () => {
                if (window.SystemViewer?.currentHexId?.() === hexId) SystemViewer.selectBody(row.body);
                else selectBody(row.body);
            }, align ? 'atlas-body-row atlas-body-aligned' : 'atlas-body-row');
            const detail = row.isStar ? starPlace(row.body, bodies) : (row.body.uwp || row.body.type || spectralPhrase(row.body));
            if (align) {
                btn.append(
                    el('span', row.parts ? row.parts.system : row.label, 'atlas-body-sys'),
                    designationNode(row.parts || {}, withMoon),
                    el('small', detail)
                );
            } else {
                btn.append(el('span', row.label), el('small', detail));
            }
            section.append(btn);
        });
        parent.append(section);
    }
    function renderSystem(state) {
        if (body) { renderBody(body); return; }
        const world = mainworld(state);
        const actions = el('div', undefined, 'atlas-actions');
        if (!window.SystemViewer?.isOpen()) content.append(el('p', 'Double-click this system on the map to explore its orbits.', 'atlas-muted'));
        if (state.ctData || state.mgt2eData || state.t5Data || state.rttData) {
            actions.append(button('World details', () => openHexEditor(hexId)));
        }
        if (state.ctData || state.ctSystem || state.mgt2eData || state.mgtSystem || state.t5Data || state.t5System) {
            actions.append(button('Edit system', () => SystemEditor.openEdit(hexId)));
        }
        content.append(actions);
        const uwp = world.uwp || state.uwp;
        if (uwp) content.append(el('p', uwp, 'atlas-uwp'));
        detailRows(content, [
            ['Starport', world.starport], ['Size', world.size], ['Atmosphere', world.atm],
            ['Hydrographics', world.hydro], ['Population', world.pop ?? world.population],
            ['Government', world.gov ?? world.government], ['Law level', world.law], ['Tech level', world.tl],
            ['Trade codes', world.tradeCodes || state.tradeCodes],
            ['Travel zone', state.travelZone || world.travelZone], ['Allegiance', state.allegiance || world.allegiance],
            ['Bases', world.bases || state.bases],
            ['Gas giants', state.gasGiantCount], ['Belts', state.beltCount],
            ['Age (Gyr)', system?.age], ['Edition', system?.edition]
        ]);
        if (state.notes) {
            const notes = el('details', undefined, 'atlas-notes');
            notes.append(el('summary', 'Referee notes'), el('p', state.notes));
            content.append(notes);
        }
        if (system) {
            bodyList(content, system.stars || [], 'Stars');
            bodyList(content, system.worlds || [], 'Worlds and belts');
        } else content.append(el('p', 'Orbit data has not been generated. You can still keep campaign records for this system.', 'atlas-muted'));
    }
    function render() {
        if (!content) return;
        window.CampaignAtlas?.releaseView?.();
        const footer = document.getElementById('atlas-footer');
        footer.replaceChildren();
        footer.hidden = true;
        content.replaceChildren();
        title.textContent = tab === 'campaign' ? (window.AppNavigation?.labels[CampaignAtlas.currentType()] || 'Campaign') : systemName();
        subtitle.textContent = tab === 'campaign' ? 'People, places, jobs, and stories across your map' : hexId ? `${hexId} · Referee workspace` : 'Click a system to inspect it';
        document.getElementById('workspace-label').textContent = tab === 'campaign' ? 'CAMPAIGN WORKSPACE' : 'SYSTEM INSPECTOR';
        syncWorkspaceButtons();
        if (tab === 'campaign') { window.CampaignAtlas?.render(content, hexId); syncInspectOutline(); window.syncMapActionBar?.(); return; }
        const state = hexStates.get(hexId);
        if (!state || state.type !== 'SYSTEM_PRESENT') {
            content.append(el('h2', 'Your campaign starts with a system'), el('p', 'Click a system on the map to inspect it. Double-click to explore its orbits.', 'atlas-muted'));
            window.CampaignAtlas?.syncMapFocus();
            syncInspectOutline();
            window.syncMapActionBar?.();
            return;
        }
        renderSystem(state);
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
            signature = next;
            if (window.SystemViewer?.currentHexId?.() === hexId) SystemViewer.refresh(hexId);
        }
        system = state ? (window.SystemViewer?.currentHexId?.() === hexId ? SystemViewer.currentSystem() : SystemViewer.normalizeSystem(state)) : null;
        render();
    }
    function reset() {
        hexId = null; body = null; system = null; signature = '';
        window.CampaignAtlas?.showAll();
        close(true);
        render();
    }
    function setup() {
        panel = document.getElementById('system-inspector');
        title = document.getElementById('atlas-title');
        subtitle = document.getElementById('atlas-subtitle');
        content = document.getElementById('atlas-content');
        document.getElementById('atlas-toggle').addEventListener('click', () => {
            if (open && tab === 'system') close();
            else if (canLeave()) { tab = 'system'; show(); refresh(true); }
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
        window.addEventListener('resize', layout);
        // Generated data is edited in place by existing tools. Only inspect one hex,
        // and only while visible; polling avoids changes to generation engines.
        setInterval(() => refresh(), 800);
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || !open || e.target.closest('#omni-search')) return;
            if (window.CampaignAtlas?.isPicking()) {
                e.preventDefault(); e.stopImmediatePropagation();
                CampaignAtlas.cancelPick();
                return;
            }
            if (window.CampaignAtlas?.hasDraft()) {
                e.preventDefault(); e.stopImmediatePropagation();
                if (canLeave()) render();
            } else if (!window.SystemViewer?.isOpen()) {
                e.preventDefault(); e.stopImmediatePropagation(); close();
            }
        }, true);
        render();
    }
    return { setup, openForHex, close, reset, refresh, selectBody, render, systemName, canLeave,
        currentHexId: () => hexId, currentWorkspace: () => tab, isOpen: () => open,
        inspectedHexId, remapHexId, el, button };
})();
