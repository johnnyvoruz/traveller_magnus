// Shared system context for the map, orrery, and Campaign Atlas. No generation logic.
window.SystemInspector = (() => {
    'use strict';
    let panel, content, title, subtitle;
    let hexId = null, tab = 'system', body = null, system = null, signature = '';
    let open = false;

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
        window.SystemViewer?.resize?.();
    }
    function show() {
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
    function detailRows(parent, pairs) {
        const list = el('dl', undefined, 'atlas-stats');
        for (const [label, value] of pairs) {
            if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
            const numeric = typeof value === 'number' || /^(Orbit|Distance|Satellite orbit|Diameter|Stellar diameter|Mass|Gravity|Temperature|Luminosity|Eccentricity|Age)/.test(label);
            const number = numeric ? formatDisplayNumber(value, /Temperature|Diameter \(km\)/.test(label) ? 0 : /Distance|Mass|Luminosity|Eccentricity/.test(label) ? 3 : 2) : String(value);
            list.append(el('dt', label), el('dd', Array.isArray(value) ? value.join(', ') : number));
        }
        parent.append(list);
    }
    function renderBody(selected) {
        const back = button('‹ System overview', () => {
            body = null;
            window.SystemViewer?.selectBody?.(null);
            render();
        }, 'atlas-link');
        content.append(back, el('h2', selected.name || selected.type || 'Star'));
        detailRows(content, [
            ['Type', selected.worldType || selected.type || [selected.sType, selected.subType, selected.sClass].filter(v => v != null).join(' ')],
            ['Role', selected.role], ['UWP', selected.uwp], ['Starport', selected.starport],
            ['Tech level', selected.tl], ['Trade codes', selected.tradeCodes], ['Travel zone', selected.travelZone],
            ['Orbit', selected.orbitId], ['Distance (AU)', selected.au], ['Satellite orbit (PD)', selected.pd],
            ['Diameter (km)', selected.diamKm], ['Stellar diameter (D☉)', selected.diam],
            ['Mass', selected.mass], ['Gravity (G)', selected.gravity],
            ['Temperature (K)', selected.meanTempK ?? selected.temp], ['Luminosity (L☉)', selected.lum],
            ['Size', selected.size], ['Atmosphere', selected.atm], ['Hydrographics', selected.hydro],
            ['Eccentricity', selected.eccentricity], ['Moons', selected.moons?.length]
        ]);
        if (selected.moons?.length) bodyList(content, selected.moons, 'Moons');
    }
    function bodyList(parent, bodies, heading) {
        const section = el('section', undefined, 'atlas-body-list');
        section.append(el('h3', heading));
        bodies.filter(b => b.type !== 'Empty').forEach((b, index) => {
            const btn = button('', () => {
                if (window.SystemViewer?.currentHexId?.() === hexId) SystemViewer.selectBody(b);
                else selectBody(b);
            }, 'atlas-body-row');
            const label = b.name || (heading === 'Stars' ? `Star ${index + 1}` : `${b.type || 'Body'} ${index + 1}`);
            btn.append(el('span', label), el('small', b.uwp || b.type || [b.sType, b.subType, b.sClass].filter(v => v != null).join(' ')));
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
            ['Edition', system?.edition], ['Allegiance', state.allegiance || world.allegiance],
            ['Trade codes', world.tradeCodes || state.tradeCodes], ['Travel zone', state.travelZone || world.travelZone],
            ['Bases', world.bases || state.bases], ['Starport', world.starport],
            ['Tech level', world.tl], ['Population', world.pop ?? world.population],
            ['Government', world.gov ?? world.government], ['Law level', world.law],
            ['Size', world.size], ['Atmosphere', world.atm], ['Hydrographics', world.hydro],
            ['Gas giants', state.gasGiantCount], ['Belts', state.beltCount], ['Age (Gyr)', system?.age]
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
        title.textContent = tab === 'campaign' ? 'Campaign' : systemName();
        subtitle.textContent = tab === 'campaign' ? 'People, places, jobs, and stories across your map' : hexId ? `${hexId} · Referee workspace` : 'Click a system to inspect it';
        document.getElementById('workspace-label').textContent = tab === 'campaign' ? 'CAMPAIGN WORKSPACE' : 'SYSTEM INSPECTOR';
        syncWorkspaceButtons();
        if (tab === 'campaign') { window.CampaignAtlas?.render(content, hexId); return; }
        const state = hexStates.get(hexId);
        if (!state || state.type !== 'SYSTEM_PRESENT') {
            content.append(el('h2', 'Your campaign starts with a system'), el('p', 'Click a system on the map to inspect it. Double-click to explore its orbits.', 'atlas-muted'));
            return;
        }
        renderSystem(state);
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
            if (open && tab === 'campaign') close();
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
            if (e.key !== 'Escape' || !open) return;
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
        currentHexId: () => hexId, currentWorkspace: () => tab, isOpen: () => open, el, button };
})();
