// Campaign-authored records, separate from regeneratable system data.
window.CampaignAtlas = (() => {
    'use strict';
    const TYPES = ['person', 'place', 'business', 'organization', 'job', 'event', 'item', 'note'];
    const SINGULAR = { person: 'Person', place: 'Place', business: 'Business', organization: 'Organization', job: 'Job', event: 'Event', item: 'Item', note: 'Note' };
    const clone = value => JSON.parse(JSON.stringify(value));
    const own = (object, key) => Object.hasOwn(object, key);
    const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const fail = message => { throw new Error(message); };
    let busy = false, draft = null, baseline = '', host = null, activeHex = null;
    let selectedId = null, trackedId = null, query = '', filter = '', viewUrls = [], renderToken = 0;
    let staged = new Map(), loading = false;
    let picking = false, pickButton = null, pickStatus = null;
    let locator = null;
    let systemFilter = '';
    let lastMapFocus = null;
    // Where a record was opened from the system panel, so the editor can lead back there.
    let origin = null;
    const emptyStore = () => ({ schemaVersion: 1, records: {}, assets: {} });
    const newId = () => 'cr_' + CampaignAssets.id().slice(3);
    const isId = id => typeof id === 'string' && /^(?:cr|ca)_[A-Za-z0-9_-]{1,116}$/.test(id);
    function text(value, maximum, label, required = false) {
        if (value == null) value = '';
        if (typeof value !== 'string') return fail(`${label} must be text.`);
        if (value.length > maximum) return fail(`${label} is limited to ${maximum.toLocaleString()} characters.`);
        if (required && !value.trim()) return fail(`${label} is required.`);
        return value;
    }
    function normalizeRecord(raw, key) {
        if (!object(raw) || !isId(key) || raw.id !== key) return fail('Invalid campaign record ID.');
        if (!TYPES.includes(raw.type)) return fail('Unsupported campaign record type.');
        if (!object(raw.anchor) || raw.anchor.kind !== 'system' || !/^\d+-[A-P]-\d{4}$/.test(raw.anchor.hexId)) return fail('Invalid campaign system anchor.');
        const rawTags = typeof raw.tags === 'string' ? raw.tags.split(',') : (raw.tags || []);
        if (!Array.isArray(rawTags) || rawTags.length > 50) return fail('Use no more than 50 tags.');
        const tags = [...new Set(rawTags.map(v => text(v, 60, 'Tag').trim().toLocaleLowerCase()).filter(Boolean))];
        if (!Array.isArray(raw.images || []) || (raw.images || []).length > 10) return fail('A record can have up to 10 images.');
        const seen = new Set();
        const images = (raw.images || []).map(a => {
            if (!object(a) || !isId(a.assetId) || seen.has(a.assetId)) return fail('Invalid or duplicate image attachment.');
            seen.add(a.assetId);
            return { assetId: a.assetId, caption: text(a.caption, 1000, 'Caption'), altText: text(a.altText, 1000, 'Alt text'),
                credit: text(a.credit, 500, 'Image credit'), sourceUrl: text(a.sourceUrl, 2000, 'Source URL') };
        });
        if (raw.primaryImageId != null && !seen.has(raw.primaryImageId)) return fail('Primary image is not attached to this record.');
        if ((raw.links || []).length) return fail('This version does not support campaign relationship links.');
        return { id: key, type: raw.type, name: text(raw.name, 120, 'Name', true).trim(),
            summary: text(raw.summary, 300, 'Summary'), details: text(raw.details, 100000, 'Details'), tags,
            anchor: { kind: 'system', hexId: raw.anchor.hexId, locationLabel: text(raw.anchor.locationLabel, 300, 'Location'),
                ...(raw.anchor.bodyKey ? { bodyKey: text(raw.anchor.bodyKey, 1000, 'Location body') } : {}) },
            visibility: 'referee', provenance: { kind: 'campaign', citation: text(raw.provenance?.citation, 2000, 'Citation') },
            links: [], images, primaryImageId: raw.primaryImageId || images[0]?.assetId || null,
            createdAt: text(raw.createdAt, 40, 'Created date'), updatedAt: text(raw.updatedAt, 40, 'Updated date') };
    }
    function normalizeStore(raw) {
        if (raw === undefined) return emptyStore();
        if (!object(raw) || raw.schemaVersion !== 1) return fail('Unsupported Campaign Atlas schema. Use an application version that supports this backup.');
        if (!object(raw.records) || !object(raw.assets || {})) return fail('Invalid Campaign Atlas store.');
        const result = emptyStore();
        if (Object.keys(raw.records).length > 20000) return fail('The campaign record limit is 20,000 per map.');
        for (const [key, value] of Object.entries(raw.records)) {
            const record = normalizeRecord(value, key);
            Object.defineProperty(result.records, key, { value: record, enumerable: true, writable: true, configurable: true });
        }
        for (const key of CampaignAssets.referenced(result)) {
            const a = raw.assets?.[key];
            if (!object(a) || a.id !== key || !isId(key)) return fail('Missing or invalid image metadata.');
            const m = { id: key, createdAt: text(a.createdAt, 40, 'Image date') };
            for (const field of ['mimeType', 'thumbnailMimeType']) {
                if (!['image/png', 'image/jpeg', 'image/webp'].includes(a[field])) return fail('Unsupported stored image type.');
                m[field] = a[field];
            }
            for (const field of ['width', 'height', 'byteLength', 'thumbnailWidth', 'thumbnailHeight', 'thumbnailByteLength']) {
                if (!Number.isSafeInteger(a[field]) || a[field] < 1 || a[field] > CampaignAssets.LIMIT) return fail('Invalid image dimensions or byte count.');
                m[field] = a[field];
            }
            if (m.width > 2048 || m.height > 2048 || m.thumbnailWidth > 256 || m.thumbnailHeight > 256) return fail('Stored image dimensions exceed the supported limits.');
            result.assets[key] = m;
        }
        CampaignAssets.checkBudget(result);
        return result;
    }
    function recordsForHex(hexId) {
        return Object.values(window.campaignAtlas.records).filter(r => r.anchor.hexId === hexId)
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    // Records placed on one body. A picked location matches by key; a typed
    // one matches the body's label, as the orbit-view locator does.
    function recordsForBody(hexId, location) {
        if (!location) return [];
        const label = location.label.toLocaleLowerCase();
        return recordsForHex(hexId).filter(r => r.anchor.bodyKey ? r.anchor.bodyKey === location.key
            : r.anchor.locationLabel.trim().toLocaleLowerCase() === label);
    }
    function snapshot() { return clone(window.campaignAtlas); }
    async function reachable() {
        const ids = CampaignAssets.referenced(window.campaignAtlas);
        if (window.Saves) {
            const saved = await window.Saves.assetIds();
            saved.forEach(id => ids.add(id));
        }
        for (const id of staged.keys()) ids.add(id);
        return ids;
    }
    async function collect() {
        if (busy || loading) return;
        const keep = await reachable();
        await window.dbManager.collectCampaignAssets(keep);
        CampaignAssets.prune(keep);
    }
    async function persist() {
        if (busy || loading) return;
        try {
            await window.dbManager.saveCampaignAtlas();
            await collect();
        } catch (err) { showToast(`Campaign autosave failed: ${err.message}. Save a JSON backup before closing.`, 10000); }
    }
    async function commit(next, payloads = new Map(), action = 'Edit Campaign Record', apply = null, historyOptions = {}) {
        if (busy || loading) return fail('A campaign operation is still in progress. Please wait.');
        const normalized = normalizeStore(next);
        busy = true;
        try {
            await window.dbManager.commitCampaignAtlas(normalized, payloads, !!historyOptions.replaceCampaign);
            markChanged(action, Object.assign({ campaignAtlas: true }, historyOptions));
            CampaignAssets.remember(payloads);
            window.campaignAtlas = normalized;
            if (apply) apply();
        } finally { busy = false; }
        void collect().catch(err => console.warn('[Campaign asset cleanup]', err));
        window.SystemInspector?.refresh(true);
    }
    async function addRecord(raw, payloads = new Map(), metadata = {}) {
        const now = new Date().toISOString(), id = newId();
        const record = { ...raw, id, createdAt: now, updatedAt: now };
        const next = snapshot();
        next.records[id] = record;
        Object.assign(next.assets, metadata);
        await commit(next, payloads, 'Add Campaign Record');
        return id;
    }
    async function updateRecord(id, raw, payloads = new Map(), metadata = {}) {
        if (!own(window.campaignAtlas.records, id)) return fail('This record no longer exists.');
        const next = snapshot();
        next.records[id] = { ...raw, id, createdAt: next.records[id].createdAt, updatedAt: new Date().toISOString() };
        Object.assign(next.assets, metadata);
        await commit(next, payloads, 'Edit Campaign Record / Images');
        return id;
    }
    async function deleteRecord(id) {
        if (!own(window.campaignAtlas.records, id)) return;
        const next = snapshot(); delete next.records[id];
        await commit(next, new Map(), 'Delete Campaign Record');
    }
    async function exportForHex(hexId) {
        if (window.dbManager.campaignLoadError()) throw window.dbManager.campaignLoadError();
        if (busy || loading) return fail('Wait for the current campaign operation before exporting.');
        const store = emptyStore();
        for (const r of recordsForHex(hexId)) store.records[r.id] = clone(r);
        for (const id of CampaignAssets.referenced(store)) store.assets[id] = clone(window.campaignAtlas.assets[id]);
        return { campaignAtlas: store, campaignAssets: await CampaignAssets.serialize(store) };
    }
    async function exportMap() {
        if (window.dbManager.campaignLoadError()) throw window.dbManager.campaignLoadError();
        if (busy || loading) return fail('Wait for the current campaign save before exporting.');
        const store = normalizeStore(window.campaignAtlas);
        return { campaignAtlas: store, campaignAssets: await CampaignAssets.serialize(store) };
    }
    // Slot asset ids stay occupied so a restore still finds its portraits.
    async function prepareImport(envelope, targetHexId = null) {
        const store = normalizeStore(envelope.campaignAtlas);
        const payloads = await CampaignAssets.deserialize(store, envelope.campaignAssets);
        const used = await reachable(), assetMap = new Map();
        for (const id of Object.keys(store.assets)) if (used.has(id)) assetMap.set(id, CampaignAssets.id());
        for (const [oldId, newId] of assetMap) {
            store.assets[newId] = { ...store.assets[oldId], id: newId }; delete store.assets[oldId];
            payloads.set(newId, payloads.get(oldId)); payloads.delete(oldId);
        }
        const next = targetHexId ? snapshot() : emptyStore();
        for (const record of Object.values(store.records)) {
            if (targetHexId) {
                if (envelope.sourceHexId && record.anchor.hexId !== envelope.sourceHexId) return fail('System backup contains records for a different system.');
                record.anchor.hexId = targetHexId;
                while (own(next.records, record.id)) record.id = newId();
            }
            record.images.forEach(a => { a.assetId = assetMap.get(a.assetId) || a.assetId; });
            record.primaryImageId = assetMap.get(record.primaryImageId) || record.primaryImageId;
            next.records[record.id] = record;
        }
        Object.assign(next.assets, store.assets);
        return { store: normalizeStore(next), payloads };
    }
    async function importForHex(envelope, targetHexId) {
        const prepared = await prepareImport(envelope, targetHexId);
        await commit(prepared.store, prepared.payloads, 'Import Campaign Records');
    }
    function hasDraft() { return draft !== null; }
    function dirty() { return draft && JSON.stringify(draft) !== baseline; }
    function discard() { cancelPick(); draft = null; baseline = ''; staged = new Map(); }
    function confirmLeave() {
        if (busy || loading) { showToast('Please wait for the campaign operation to finish.', 3000); return false; }
        if (dirty() && !confirm('Discard unsaved changes to this campaign record?')) return false;
        discard(); return true;
    }
    function releaseView() {
        cancelPick();
        clearLocator();
        renderToken++;
        for (const url of viewUrls) URL.revokeObjectURL(url);
        viewUrls = [];
    }
    const el = (...args) => SystemInspector.el(...args);
    const button = (...args) => SystemInspector.button(...args);
    function cancelPick() {
        picking = false;
        if (pickButton) pickButton.setAttribute('aria-pressed', 'false');
        if (pickStatus) pickStatus.textContent = 'Pick a body in orbit view, or enter a location below.';
        document.body.classList.remove('atlas-picking');
    }
    function pickBody(body) {
        if (!picking || !draft || busy || loading) return false;
        const location = window.SystemViewer.locationForBody(body);
        if (!location) return false;
        draft.anchor.locationLabel = location.label.slice(0, 300);
        draft.anchor.bodyKey = location.key;
        cancelPick();
        const input = host.querySelector('[name="location"]');
        input.value = draft.anchor.locationLabel;
        pickStatus.textContent = `Location selected: ${draft.anchor.locationLabel}`;
        showLocator(draft.anchor, input);
        input.focus();
        return true;
    }
    function clearLocator() {
        if (locator) cancelAnimationFrame(locator.frame);
        locator?.svg.remove();
        locator = null;
    }
    function trackedHexId() {
        return locator?.anchor?.hexId || null;
    }
    function showLocator(anchor, source) {
        clearLocator();
        if (!anchor.hexId) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'campaign-locator';
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(svg.namespaceURI, 'path');
        path.setAttribute('pathLength', '1');
        const pulse = document.createElementNS(svg.namespaceURI, 'circle');
        pulse.classList.add('locator-pulse');
        const dot = document.createElementNS(svg.namespaceURI, 'circle');
        dot.setAttribute('r', '3'); dot.classList.add('locator-dot');
        svg.append(path, pulse, dot);
        svg.style.visibility = 'hidden';
        document.body.append(svg);
        locator = { svg, path, pulse, dot, anchor, source };
        // Follow sector pan/zoom, tray layout, and orbit animation alike. This
        // loop exists only while a record is active, and never redraws the map.
        const tick = () => {
            updateLocator();
            if (locator) locator.frame = requestAnimationFrame(tick);
        };
        tick();
    }
    function sectorLocationPosition(anchor) {
        const state = hexStates.get(anchor.hexId);
        const coords = getHexCoords(anchor.hexId);
        if (!coords || state?.type !== 'SYSTEM_PRESENT' || zoom < 0.07 ||
            (state.isHiddenByFilter && !window.filterSuspended)) return null;
        const data = state.rttData || state.t5Data || state.mgt2eData || state.ctData;
        if (hideNoPlanetSystems && (data?.isStellarOnly || (state.aowSystem && !state.aowSystem.mainworld))) return null;
        if (coords.q < 0 || coords.r < 0 || coords.q >= gridWidth * 32 || coords.r >= gridHeight * 40) return null;
        const pixel = getHexPixel(coords.q, coords.r);
        const x = (pixel.x - cameraX) * zoom, y = (pixel.y - cameraY) * zoom;
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
        // At sector scale the record points to its assigned system, even when
        // its free-text location cannot be resolved to an individual planet.
        return { x, y, radius: Math.max(4, 10 * zoom) };
    }
    function updateLocator() {
        if (!locator) return;
        const { svg, path, pulse, dot, anchor, source } = locator;
        const inOrbit = window.SystemViewer?.isOpen();
        const target = inOrbit ? SystemViewer.locationPosition(anchor) : sectorLocationPosition(anchor);
        svg.dataset.view = inOrbit ? 'orbit' : 'sector';
        if (!source.isConnected || !SystemInspector.isOpen()) { clearLocator(); return; }
        if (!target || window.SurfaceViewer?.isOpen() || window.ApproachViewer?.isOpen()) {
            svg.style.visibility = 'hidden'; return;
        }
        const panel = document.getElementById('system-inspector').getBoundingClientRect();
        const sourceRect = source.getBoundingClientRect();
        const contentRect = host.getBoundingClientRect();
        const sx = panel.right - 1;
        const sy = Math.max(contentRect.top + 8, Math.min(contentRect.bottom - 8, sourceRect.top + sourceRect.height / 2));
        if (target.x <= sx + 12) { svg.style.visibility = 'hidden'; return; }
        svg.style.visibility = 'visible';
        const dx = target.x - sx, dy = target.y - sy;
        // Horizontal trace, a true 45-degree diagonal, then vertical only if
        // the target is too high/low to connect with those first two segments.
        const diagonal = Math.min(Math.abs(dy), Math.max(0, dx - 24));
        const bendX = target.x - diagonal;
        const bendY = sy + Math.sign(dy) * diagonal;
        path.setAttribute('d', `M ${sx} ${sy} H ${bendX} L ${target.x} ${bendY} V ${target.y}`);
        pulse.setAttribute('cx', target.x); pulse.setAttribute('cy', target.y);
        pulse.setAttribute('r', target.radius + 5);
        dot.setAttribute('cx', sx); dot.setAttribute('cy', sy);
    }
    function error(message) {
        const area = host?.querySelector('.atlas-error');
        if (area) { area.textContent = message; area.hidden = false; }
        else showToast(message, 8000);
    }
    function errorArea() {
        const area = el('p', '', 'atlas-error'); area.setAttribute('role', 'alert'); area.hidden = true; return area;
    }
    async function loadImage(img, assetId, thumbnail = true) {
        const token = renderToken;
        try {
            const p = staged.get(assetId)?.payload || await CampaignAssets.read(assetId);
            if (token !== renderToken || !img.isConnected) return;
            const url = URL.createObjectURL(thumbnail ? p.thumbnail : p.display);
            viewUrls.push(url); img.src = url;
        } catch (err) {
            if (token === renderToken && img.isConnected) { img.alt = 'Image unavailable'; error(err.message); }
        }
    }
    function imageFor(attachment, thumbnail = true) {
        const img = el('img', undefined, thumbnail ? 'atlas-thumbnail' : 'atlas-cover');
        img.alt = attachment.altText || attachment.caption || 'Attached campaign image';
        img.loading = 'lazy';
        // Allow the caller to attach the element before resolving the image.
        queueMicrotask(() => loadImage(img, attachment.assetId, thumbnail));
        return img;
    }
    function startDraft(record) {
        if (!confirmLeave()) return;
        const systemId = record?.anchor.hexId || systemFilter || activeHex || availableSystems()[0]?.[0];
        if (!systemId) { error('Add a system to the map before creating a campaign record.'); return; }
        const now = new Date().toISOString();
        draft = record ? clone(record) : { id: null, type: filter || 'person', name: '', summary: '', details: '', tags: [],
            anchor: { kind: 'system', hexId: systemId, locationLabel: '' }, visibility: 'referee',
            provenance: { kind: 'campaign', citation: '' }, links: [], images: [], primaryImageId: null,
            createdAt: now, updatedAt: now };
        baseline = JSON.stringify(draft);
        redraw();
        host.querySelector('[name="name"]')?.focus();
    }
    function redraw() { window.SystemInspector.render(); }
    function availableSystems() {
        return [...hexStates].filter(([, state]) => state.type === 'SYSTEM_PRESENT')
            .sort(([a], [b]) => SystemInspector.systemName(a).localeCompare(SystemInspector.systemName(b)));
    }
    function systemOptions(select, all = false) {
        if (all) { const opt = el('option', 'All systems'); opt.value = ''; select.append(opt); }
        for (const [id] of availableSystems()) { const opt = el('option', `${SystemInspector.systemName(id)} (${id})`); opt.value = id; select.append(opt); }
    }
    function renderList() {
        const scoped = Object.values(window.campaignAtlas.records)
            .filter(r => !systemFilter || r.anchor.hexId === systemFilter)
            .sort((a, b) => a.name.localeCompare(b.name));
        const toolbar = el('div', undefined, 'atlas-toolbar');
        const searchRow = el('div', undefined, 'atlas-toolbar-row');
        const search = el('input'); search.type = 'search'; search.placeholder = 'Search records';
        search.setAttribute('aria-label', 'Search campaign records'); search.value = query;
        const add = button('Add', () => startDraft(), 'atlas-primary');
        add.setAttribute('aria-label', '+ Add record');
        searchRow.append(search, add);
        const types = el('div', undefined, 'atlas-types');
        types.setAttribute('role', 'group'); types.setAttribute('aria-label', 'Filter record type');
        const typeCount = type => scoped.filter(r => r.type === type).length;
        const chips = [['', 'All', scoped.length], ...TYPES.filter(t => typeCount(t) || filter === t).map(t => [t, window.AppNavigation?.labels[t] || SINGULAR[t], typeCount(t)])];
        for (const [value, label, count] of chips) {
            const chip = button('', () => { filter = value; redraw(); window.AppNavigation?.layout(); });
            chip.setAttribute('aria-pressed', String(filter === value));
            chip.append(document.createTextNode(label), el('b', String(count)));
            types.append(chip);
        }
        toolbar.append(searchRow);
        if (scoped.length) toolbar.append(types);
        if (availableSystems().length) {
            const systems = el('select'); systems.setAttribute('aria-label', 'Filter campaign by system');
            systemOptions(systems, true); systems.value = systemFilter;
            systems.addEventListener('change', () => { systemFilter = systems.value; redraw(); });
            toolbar.append(systems);
        }
        const list = el('div', undefined, 'atlas-record-list');
        host.append(toolbar, list);
        function update() {
            list.replaceChildren();
            const q = query.trim().toLocaleLowerCase();
            const matches = scoped.filter(r => (!filter || r.type === filter) &&
                [r.name, r.summary, r.details, r.anchor.locationLabel, SystemInspector.systemName(r.anchor.hexId), ...r.tags].join('\n').toLocaleLowerCase().includes(q));
            for (const r of matches) {
                const row = el('div', undefined, 'atlas-record-row');
                row.dataset.recordId = r.id;
                const track = button('', () => {
                    trackedId = r.id;
                    activeHex = r.anchor.hexId;
                    syncTracked();
                    syncMapFocus();
                }, 'atlas-record-track');
                const cover = r.images.find(a => a.assetId === r.primaryImageId);
                if (cover) track.append(imageFor(cover));
                else {
                    const mark = el('span', (r.name.trim()[0] || '·').toLocaleUpperCase(), 'atlas-placeholder');
                    mark.setAttribute('aria-hidden', 'true');
                    track.append(mark);
                }
                const info = el('span', undefined, 'atlas-record-copy');
                info.append(el('strong', r.name, 'atlas-record-name'));
                if (r.summary) info.append(el('span', r.summary, 'atlas-record-summary'));
                const where = systemFilter ? '' : SystemInspector.systemName(r.anchor.hexId);
                info.append(el('span', [SINGULAR[r.type] || r.type, where].filter(Boolean).join(' · '), 'atlas-record-meta'));
                track.append(info);
                const openDetails = button('', () => {
                    trackedId = r.id;
                    selectedId = r.id;
                    activeHex = r.anchor.hexId;
                    redraw();
                }, 'atlas-record-open');
                openDetails.setAttribute('aria-label', `View details for ${r.name}`);
                openDetails.title = 'View details';
                const openMark = el('i', undefined, 'fa-solid fa-circle-info');
                openMark.setAttribute('aria-hidden', 'true');
                openDetails.append(openMark);
                row.append(track, openDetails);
                list.append(row);
            }
            if (!matches.length) list.append(el('p', scoped.length ? 'No matching records.' : 'No records yet.', 'atlas-empty'));
            syncTracked();
        }
        function syncTracked() {
            const record = trackedId && window.campaignAtlas.records[trackedId];
            let source = null;
            for (const row of list.querySelectorAll('.atlas-record-row')) {
                const on = !!record && row.dataset.recordId === trackedId;
                row.classList.toggle('is-tracked', on);
                row.querySelector('.atlas-record-track')?.setAttribute('aria-pressed', String(on));
                if (on) source = row;
            }
            if (source && record) showLocator(record.anchor, source);
            else clearLocator();
        }
        search.addEventListener('input', () => { query = search.value; update(); });
        update();
    }
    function fullImage(attachment) {
        const dialog = el('dialog', undefined, 'atlas-lightbox');
        const img = imageFor(attachment, false);
        const close = button('Close image', () => dialog.close());
        dialog.append(close, img, el('p', attachment.caption || ''));
        dialog.addEventListener('close', () => {
            if (img.src.startsWith('blob:')) { URL.revokeObjectURL(img.src); viewUrls = viewUrls.filter(u => u !== img.src); }
            dialog.remove();
        }, { once: true });
        document.body.append(dialog); dialog.showModal(); close.focus();
    }
    const coverSources = new Map();
    function imageFiles(list) {
        return [...(list || [])].filter(file => file && (
            ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name || '')));
    }
    function clipboardImageFiles(data) {
        if (!data) return [];
        const found = [];
        for (const item of data.items || []) {
            if (item.kind !== 'file') continue;
            const file = item.getAsFile();
            if (file && (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || ''))) found.push(file);
        }
        if (!found.length) {
            for (const file of data.files || []) if (file.type.startsWith('image/')) found.push(file);
        }
        return found;
    }
    function bindFileDrop(node, onFiles, active = () => true) {
        const fileDrag = e => active() && [...(e.dataTransfer?.types || [])].includes('Files');
        const allow = e => {
            if (!fileDrag(e)) return false;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            return true;
        };
        node.addEventListener('dragenter', e => { if (allow(e)) node.classList.add('is-dropping'); });
        node.addEventListener('dragover', allow);
        node.addEventListener('dragleave', e => { if (!node.contains(e.relatedTarget)) node.classList.remove('is-dropping'); });
        node.addEventListener('drop', e => {
            if (!fileDrag(e)) return;
            node.classList.remove('is-dropping');
            const files = e.dataTransfer.files;
            if (files && files.length) {
                e.preventDefault();
                e.stopPropagation();
                onFiles(files);
                return;
            }
            // Chrome can leave dataTransfer empty when the pointer is on a file input,
            // and still assign those files through the input's own change event.
            if (e.target instanceof HTMLInputElement && e.target.type === 'file') {
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
        });
    }
    function decodeFile(file) {
        if (typeof createImageBitmap === 'function') return createImageBitmap(file, { imageOrientation: 'from-image' });
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
            img.src = url;
        });
    }
    function frameImage(file) {
        if (document.querySelector('.atlas-crop-dialog')) return Promise.resolve(null);
        return decodeFile(file).then(decoded => new Promise(resolve => {
            const dialog = el('dialog', undefined, 'atlas-crop-dialog');
            dialog.setAttribute('aria-labelledby', 'atlas-crop-title');
            const title = el('h2', 'Frame image');
            title.id = 'atlas-crop-title';
            const note = el('p', 'Drag to move the image. Scroll or use the slider to zoom.');
            const stage = el('div', undefined, 'atlas-crop-stage');
            const previewUrl = URL.createObjectURL(file);
            const img = el('img');
            img.src = previewUrl;
            img.alt = '';
            img.draggable = false;
            stage.append(img);
            const zoomLabel = el('label', undefined, 'atlas-crop-zoom');
            const range = el('input');
            range.type = 'range'; range.min = '1'; range.max = '4'; range.step = '0.01'; range.value = '1';
            range.setAttribute('aria-label', 'Zoom');
            zoomLabel.append(el('span', 'Zoom'), range);
            const use = el('button', 'Use image');
            use.type = 'button';
            const cancel = button('Cancel', () => dialog.close());
            const actions = el('div', undefined, 'atlas-crop-actions');
            actions.append(cancel, use);
            dialog.append(title, note, stage, zoomLabel, actions);
            let zoom = 1, x = 0, y = 0, settled = false;
            const widthOf = image => image.naturalWidth || image.width;
            const heightOf = image => image.naturalHeight || image.height;
            const place = () => {
                const view = stage.clientWidth || 1;
                const base = Math.max(view / widthOf(decoded), view / heightOf(decoded));
                const scale = base * zoom;
                const dw = widthOf(decoded) * scale, dh = heightOf(decoded) * scale;
                x = Math.min(0, Math.max(view - dw, x));
                y = Math.min(0, Math.max(view - dh, y));
                img.style.width = `${dw}px`;
                img.style.height = `${dh}px`;
                img.style.transform = `translate(${x}px, ${y}px)`;
                return { view, scale };
            };
            const zoomAbout = (nextZoom, px, py) => {
                const view = stage.clientWidth || 1;
                const base = Math.max(view / widthOf(decoded), view / heightOf(decoded));
                const prev = base * zoom;
                const ix = (px - x) / prev, iy = (py - y) / prev;
                zoom = Math.min(4, Math.max(1, nextZoom));
                const next = base * zoom;
                x = px - ix * next;
                y = py - iy * next;
                range.value = String(zoom);
                place();
            };
            range.addEventListener('input', () => zoomAbout(Number(range.value), (stage.clientWidth || 1) / 2, (stage.clientWidth || 1) / 2));
            stage.addEventListener('wheel', e => {
                e.preventDefault();
                const rect = stage.getBoundingClientRect();
                zoomAbout(zoom * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX - rect.left, e.clientY - rect.top);
            }, { passive: false });
            let drag = null;
            stage.addEventListener('pointerdown', e => {
                if (e.button !== 0) return;
                drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: x, oy: y };
                stage.setPointerCapture(e.pointerId);
                stage.classList.add('is-panning');
            });
            stage.addEventListener('pointermove', e => {
                if (!drag || e.pointerId !== drag.id) return;
                x = drag.ox + (e.clientX - drag.sx);
                y = drag.oy + (e.clientY - drag.sy);
                place();
            });
            const endDrag = e => {
                if (!drag || e.pointerId !== drag.id) return;
                drag = null;
                stage.classList.remove('is-panning');
            };
            stage.addEventListener('pointerup', endDrag);
            stage.addEventListener('pointercancel', endDrag);
            const finish = fileOut => {
                if (settled) return;
                settled = true;
                URL.revokeObjectURL(previewUrl);
                decoded.close?.();
                resolve(fileOut);
            };
            use.addEventListener('click', () => {
                if (settled) return;
                use.disabled = true;
                const { view, scale } = place();
                const sw = view / scale, sh = view / scale;
                const out = Math.max(1, Math.round(Math.min(sw, 2048)));
                const canvas = document.createElement('canvas');
                canvas.width = out; canvas.height = out;
                canvas.getContext('2d').drawImage(decoded, -x / scale, -y / scale, sw, sh, 0, 0, out, out);
                canvas.toBlob(blob => {
                    canvas.width = canvas.height = 1;
                    if (!blob) { use.disabled = false; error('The browser could not encode this image. Try another file.'); return; }
                    finish(new File([blob], 'cover.webp', { type: blob.type || 'image/webp' }));
                    dialog.close();
                }, 'image/webp', 0.92);
            });
            dialog.addEventListener('close', () => { dialog.remove(); finish(null); }, { once: true });
            dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
            document.body.append(dialog);
            dialog.showModal();
            const view0 = stage.clientWidth || 280;
            const base0 = Math.max(view0 / widthOf(decoded), view0 / heightOf(decoded));
            x = (view0 - widthOf(decoded) * base0) / 2;
            y = (view0 - heightOf(decoded) * base0) / 2;
            place();
            stage.focus();
        })).catch(() => { error('This file could not be decoded as an image. Choose a different file.'); return null; });
    }
    async function useCoverFile(file, extras = []) {
        const framed = await frameImage(file);
        if (!framed || !draft) return;
        const replace = draft.primaryImageId;
        const known = new Set(draft.images.map(a => a.assetId));
        await addImages([framed], replace || null);
        if (!draft) return;
        const added = draft.images.find(a => !known.has(a.assetId));
        if (added) coverSources.set(added.assetId, file);
        if (extras.length) await addImages(extras);
    }
    async function reframeCover(attachment) {
        let file = coverSources.get(attachment.assetId);
        if (!file) {
            const payload = staged.get(attachment.assetId)?.payload || await CampaignAssets.read(attachment.assetId);
            file = new File([payload.display], 'cover.webp', { type: payload.display.type || 'image/webp' });
        }
        const framed = await frameImage(file);
        if (!framed || !draft) return;
        const known = new Set(draft.images.map(a => a.assetId));
        await addImages([framed], attachment.assetId);
        const added = draft?.images.find(a => !known.has(a.assetId));
        if (added) coverSources.set(added.assetId, file);
    }
    function renderRecord(record) {
        host.append(button('‹ All records', () => { selectedId = null; redraw(); }, 'atlas-link atlas-back'));
        const identity = el('div', undefined, 'atlas-identity');
        const cover = record.images.find(a => a.assetId === record.primaryImageId);
        if (cover) {
            const photo = button('', () => fullImage(cover), 'atlas-image-button atlas-identity-photo');
            photo.setAttribute('aria-label', `View ${record.type === 'person' ? 'portrait' : 'cover image'}`);
            photo.title = [cover.caption, cover.credit].filter(Boolean).join(' — ');
            photo.append(imageFor(cover, false));
            identity.append(photo);
        }
        const copy = el('div', undefined, 'atlas-identity-copy');
        copy.append(el('h2', record.name));
        const meta = el('p', [SINGULAR[record.type] || record.type, SystemInspector.systemName(record.anchor.hexId), record.anchor.locationLabel].filter(Boolean).join(' · '), 'atlas-kicker');
        meta.title = 'Double-click this system on the map to see its location in orbit view.';
        copy.append(meta);
        identity.append(copy);
        host.append(identity);
        showLocator(record.anchor, identity);
        if (record.summary) host.append(el('p', record.summary, 'atlas-summary'));
        if (record.details) host.append(el('p', record.details, 'atlas-details'));
        if (record.tags.length) {
            const tags = el('div', undefined, 'atlas-tags');
            for (const tag of record.tags) tags.append(el('span', tag));
            host.append(tags);
        }
        const extras = record.images.filter(a => a !== cover);
        if (extras.length) {
            const strip = el('div', undefined, 'atlas-strip');
            for (const attachment of extras) {
                const view = button('', () => fullImage(attachment), 'atlas-strip-button');
                view.setAttribute('aria-label', attachment.altText || attachment.caption || 'View attached image');
                view.title = [attachment.caption, attachment.credit].filter(Boolean).join(' — ');
                view.append(imageFor(attachment));
                strip.append(view);
            }
            host.append(strip);
        }
        const actions = el('div', undefined, 'atlas-actions');
        actions.append(button('Edit record', () => startDraft(record), 'atlas-primary'), button('Delete', async () => {
            if (!confirm(`Delete campaign record “${record.name}”? You can undo this.`)) return;
            try { await deleteRecord(record.id); if (trackedId === record.id) trackedId = null; selectedId = null; redraw(); } catch (err) { error(err.message); }
        }, 'atlas-danger'));
        const footer = document.getElementById('atlas-footer');
        footer.hidden = false; footer.append(actions);
    }
    function field(form, label, name, value, change, options = {}) {
        const wrap = el('label', undefined, 'atlas-field'); wrap.append(el('span', label));
        const input = el(options.multiline ? 'textarea' : 'input');
        input.name = name; input.value = Array.isArray(value) ? value.join(', ') : value;
        if (options.max) input.maxLength = options.max;
        if (options.required) input.required = true;
        if (options.multiline) input.rows = options.rows || 4;
        input.addEventListener('input', () => change(input.value));
        wrap.append(input); form.append(wrap); return input;
    }
    async function addImages(files, replaceId = null) {
        if (!draft || loading || busy) return;
        const incoming = [...files];
        if (!incoming.length) return;
        if (draft.images.length + incoming.length - (replaceId ? 1 : 0) > 10) { error('A record can have up to 10 images.'); return; }
        loading = true;
        const fieldset = host.querySelector('fieldset'); if (fieldset) fieldset.disabled = true;
        document.querySelectorAll('#atlas-footer button').forEach(b => { b.disabled = true; });
        try {
            const additions = [];
            for (const file of incoming) additions.push(await CampaignAssets.prepare(file));
            const candidate = clone(draft), next = snapshot();
            const previous = replaceId ? candidate.images.find(a => a.assetId === replaceId) : null;
            for (const asset of additions) {
                const a = { assetId: asset.metadata.id, caption: '', altText: '', credit: '', sourceUrl: '' };
                if (previous) {
                    Object.assign(a, previous, { assetId: asset.metadata.id });
                    candidate.images[candidate.images.findIndex(i => i.assetId === replaceId)] = a;
                    if (candidate.primaryImageId === replaceId) candidate.primaryImageId = a.assetId;
                } else candidate.images.push(a);
                candidate.primaryImageId ||= a.assetId;
                next.assets[a.assetId] = asset.metadata;
            }
            for (const [id, asset] of staged) next.assets[id] = asset.metadata;
            const key = candidate.id || 'cr_draft'; candidate.id ||= key;
            next.records[key] = candidate;
            CampaignAssets.checkBudget(next);
            candidate.id = draft.id;
            draft = candidate;
            for (const a of additions) staged.set(a.metadata.id, a);
            loading = false;
            redraw();
        } catch (err) { error(err.message); }
        finally {
            loading = false; if (fieldset) fieldset.disabled = false;
            document.querySelectorAll('#atlas-footer button').forEach(b => { b.disabled = busy; });
        }
    }
    function renderEditor() {
        if (draft.id) host.append(el('p', `${SINGULAR[draft.type] || draft.type} · ${SystemInspector.systemName(draft.anchor.hexId)}`, 'atlas-kicker'));
        const form = el('form'), fields = el('fieldset');
        form.id = 'atlas-record-form';
        fields.disabled = busy || loading;
        form.append(fields);
        const coverAttachment = draft.images.find(a => a.assetId === draft.primaryImageId);
        const coverBlock = el('div', undefined, 'atlas-cover-block');
        const slot = el('div', undefined, 'atlas-cover-slot');
        slot.setAttribute('aria-label', 'Record image');
        if (coverAttachment) {
            slot.classList.add('has-image');
            const preview = imageFor(coverAttachment, false);
            preview.classList.add('atlas-avatar-img');
            slot.append(preview);
        } else slot.append(el('p', 'Drop, paste, or choose an image'));
        const coverPicker = el('input');
        coverPicker.type = 'file';
        coverPicker.accept = 'image/jpeg,image/png,image/webp';
        coverPicker.hidden = true;
        coverPicker.setAttribute('aria-label', 'Choose record image');
        coverPicker.addEventListener('change', () => {
            const chosen = coverPicker.files?.[0];
            coverPicker.value = '';
            if (chosen) void useCoverFile(chosen);
        });
        const coverActions = el('div', undefined, 'atlas-cover-actions');
        coverActions.append(button(coverAttachment ? 'Replace image' : 'Choose image', () => coverPicker.click()));
        if (coverAttachment) {
            coverActions.append(button('Adjust framing', () => { void reframeCover(coverAttachment); }));
            coverActions.append(button('Remove image', () => {
                draft.images = draft.images.filter(a => a.assetId !== coverAttachment.assetId);
                coverSources.delete(coverAttachment.assetId);
                draft.primaryImageId = draft.images[0]?.assetId || null;
                redraw();
            }));
        }
        bindFileDrop(slot, incoming => {
            const images = imageFiles(incoming);
            if (!images.length) { error('Choose a still JPEG, PNG, or WebP image.'); return; }
            void useCoverFile(images[0], images.slice(1));
        });
        coverBlock.append(slot, coverActions, coverPicker);
        fields.append(coverBlock);
        if (!draft.id) {
            const systemLabel = el('label', undefined, 'atlas-field'), systemSelect = el('select');
            systemLabel.append(el('span', 'System'), systemSelect); systemOptions(systemSelect);
            systemSelect.value = draft.anchor.hexId;
            systemSelect.addEventListener('change', () => {
                draft.anchor = { kind: 'system', hexId: systemSelect.value, locationLabel: '' };
                redraw();
            });
            fields.append(systemLabel);
        }
        const typeLabel = el('label', undefined, 'atlas-field'), type = el('select');
        type.setAttribute('aria-label', 'Type');
        type.name = 'type'; typeLabel.append(el('span', 'Type'), type);
        TYPES.forEach(t => { const o = el('option', SINGULAR[t]); o.value = t; type.append(o); });
        type.value = draft.type;
        type.addEventListener('change', () => { draft.type = type.value; redraw(); }); fields.append(typeLabel);
        field(fields, 'Name', 'name', draft.name, v => draft.name = v, { required: true, max: 120 });
        field(fields, 'Summary', 'summary', draft.summary, v => draft.summary = v, { max: 300 });
        field(fields, 'Details', 'details', draft.details, v => draft.details = v, { multiline: true, max: 100000, rows: 7 });
        pickButton = button('', () => {
            if (picking) { cancelPick(); return; }
            if (window.SystemViewer.currentHexId() !== draft.anchor.hexId) {
                error('Double-click this record’s system on the map to open orbit view, then use the target. Your draft will stay here.'); return;
            }
            picking = true;
            pickButton.setAttribute('aria-pressed', 'true');
            pickStatus.textContent = 'Click a world, moon, belt, or star. Esc cancels.';
            document.body.classList.add('atlas-picking');
        }, 'atlas-target');
        const pickMark = el('i', undefined, 'fa-solid fa-location-crosshairs');
        pickMark.setAttribute('aria-hidden', 'true');
        pickButton.append(pickMark);
        pickButton.setAttribute('aria-label', 'Pick location from orbit view');
        pickButton.setAttribute('aria-pressed', 'false');
        pickButton.title = 'Pick location from orbit view';
        const locationInput = field(fields, 'Location', 'location', draft.anchor.locationLabel, v => {
            draft.anchor.locationLabel = v;
            delete draft.anchor.bodyKey;
            cancelPick(); clearLocator();
        }, { max: 300 });
        const locationWrap = locationInput.parentElement;
        locationWrap.classList.add('atlas-location-field');
        const locationRow = el('div', undefined, 'atlas-location-row');
        locationRow.append(locationInput, pickButton);
        locationWrap.append(locationRow);
        pickStatus = el('p', 'Pick a body in orbit view, or enter a location below.', 'atlas-muted atlas-pick-status');
        pickStatus.setAttribute('role', 'status');
        fields.append(pickStatus);
        field(fields, 'Tags (comma separated)', 'tags', draft.tags, v => draft.tags = v, { max: 3000 });
        const gallery = el('section', undefined, 'atlas-gallery');
        gallery.append(el('h3', 'Images'));
        draft.images.forEach((a, index) => {
            const item = el('div', undefined, 'atlas-gallery-item');
            item.append(imageFor(a));
            const controls = el('div', undefined, 'atlas-actions');
            const primary = button(draft.primaryImageId === a.assetId ? 'Primary image ✓' : 'Make primary', () => { draft.primaryImageId = a.assetId; redraw(); });
            primary.setAttribute('aria-pressed', String(draft.primaryImageId === a.assetId));
            const up = button('Move up', () => { [draft.images[index - 1], draft.images[index]] = [a, draft.images[index - 1]]; redraw(); }); up.disabled = index === 0;
            const down = button('Move down', () => { [draft.images[index + 1], draft.images[index]] = [a, draft.images[index + 1]]; redraw(); }); down.disabled = index === draft.images.length - 1;
            const picker = el('input'); picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp'; picker.hidden = true;
            picker.addEventListener('change', () => addImages(picker.files, a.assetId));
            controls.append(primary, up, down, button('View', () => fullImage(a)), button('Replace', () => picker.click()), button('Remove', () => {
                draft.images.splice(index, 1);
                if (draft.primaryImageId === a.assetId) draft.primaryImageId = draft.images[0]?.assetId || null;
                redraw();
            }), picker);
            item.append(controls);
            field(item, 'Caption', `caption-${index}`, a.caption, v => a.caption = v, { max: 1000 });
            field(item, 'Alt text', `alt-${index}`, a.altText, v => a.altText = v, { max: 1000 });
            field(item, 'Credit', `credit-${index}`, a.credit, v => a.credit = v, { max: 500 });
            field(item, 'Source URL (attribution only)', `source-${index}`, a.sourceUrl, v => a.sourceUrl = v, { max: 2000 });
            gallery.append(item);
        });
        const drop = el('div', undefined, 'atlas-drop');
        const files = el('input'); files.type = 'file'; files.multiple = true; files.accept = 'image/jpeg,image/png,image/webp';
        files.setAttribute('aria-label', 'Add images');
        files.addEventListener('change', () => addImages(files.files));
        drop.append(el('p', 'Add images or drop them here'), files);
        bindFileDrop(drop, incoming => {
            const images = imageFiles(incoming);
            if (!images.length) { error('Choose a still JPEG, PNG, or WebP image.'); return; }
            void addImages(images);
        });
        const budgetStore = snapshot();
        for (const [id, asset] of staged) budgetStore.assets[id] = asset.metadata;
        budgetStore.records[draft.id || 'cr_draft'] = draft;
        const remaining = Math.max(0, CampaignAssets.LIMIT - CampaignAssets.serializedSize(budgetStore));
        gallery.append(drop, el('p', `Up to 10 images, 10 MiB / 20 MP each. Images are resized to 2048 px; originals and metadata are not retained. ${(remaining / 1024 / 1024).toFixed(1)} MiB of map image capacity remains.`, 'atlas-muted'));
        fields.append(gallery);
        const actions = el('div', undefined, 'atlas-actions atlas-editor-actions');
        const save = el('button', 'Save record', 'atlas-primary'); save.type = 'submit';
        save.setAttribute('form', form.id);
        save.disabled = busy || loading;
        const cancel = button('Cancel', () => {
            if (origin) returnToOrigin();
            else if (confirmLeave()) redraw();
        });
        cancel.disabled = busy || loading;
        actions.append(save, cancel);
        const footer = document.getElementById('atlas-footer');
        footer.hidden = false; footer.append(actions);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (busy || loading) return;
            fields.disabled = true;
            save.disabled = true; cancel.disabled = true;
            try {
                const record = clone(draft), payloads = new Map(), metadata = {};
                for (const a of record.images) if (staged.has(a.assetId)) {
                    const asset = staged.get(a.assetId); payloads.set(a.assetId, asset.payload); metadata[a.assetId] = asset.metadata;
                }
                const id = record.id ? await updateRecord(record.id, record, payloads, metadata) : await addRecord(record, payloads, metadata);
                discard(); selectedId = id; trackedId = id; redraw(); showToast('Campaign record saved.', 2500);
            } catch (err) { error(`Record was not saved: ${err.message}`); }
            finally { fields.disabled = false; save.disabled = false; cancel.disabled = false; }
        });
        host.append(form);
        showLocator(draft.anchor, locationInput);
    }
    function focusedHexId() {
        if (!window.SystemInspector?.isOpen() || SystemInspector.currentWorkspace() !== 'campaign') return null;
        if (draft) return draft.anchor.hexId;
        const record = selectedId && window.campaignAtlas.records[selectedId];
        if (record) return record.anchor.hexId;
        const tracked = trackedId && host?.querySelector(`.atlas-record-row[data-record-id="${trackedId}"]`);
        return tracked ? window.campaignAtlas.records[trackedId].anchor.hexId : null;
    }
    function focusedAnchor() {
        if (!focusedHexId()) return null;
        if (draft) return draft.anchor;
        return window.campaignAtlas.records[selectedId]?.anchor || window.campaignAtlas.records[trackedId]?.anchor || null;
    }
    function syncMapFocus(opts = {}) {
        const id = focusedHexId();
        const changed = id !== lastMapFocus;
        lastMapFocus = id;
        if (id && !window.SystemViewer?.isOpen() && (changed || opts.forcePan)) centerHexInView(id);
        if ((changed || opts.forcePan) && typeof draw === 'function') requestAnimationFrame(draw);
    }
    function clockText(seconds) {
        seconds = Math.floor(seconds + 1e-5) % 86400;
        return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
            .map(n => String(n).padStart(2, '0')).join(':');
    }
    function renderStardate() {
        const row = button(undefined, openStardateDialog, 'campaign-stardate-readout');
        row.title = 'Edit stardate';
        const value = el('span', window.SystemViewer.formatCampaignClock(), 'campaign-stardate-value');
        value.id = 'campaign-stardate-value';
        row.append(el('span', 'Stardate', 'campaign-stardate-label'), value);
        host.append(row);
    }
    function openStardateDialog() {
        if (document.querySelector('.campaign-stardate-dialog, .atlas-crop-dialog')) return;
        const parts = window.SystemViewer.campaignClockParts();
        const dialog = el('dialog', undefined, 'campaign-stardate-dialog');
        dialog.setAttribute('aria-labelledby', 'campaign-stardate-title');
        const title = el('h2', 'Stardate');
        title.id = 'campaign-stardate-title';
        const note = el('p', 'A year is 365 days. Orbit view starts on this date and keeps it. Until you change it, the default start date in Settings is used.');
        const form = el('form');
        form.noValidate = true;
        const field = (label, input) => {
            const wrap = el('label');
            wrap.append(el('span', label), input);
            return wrap;
        };
        const year = el('input');
        year.type = 'number'; year.step = '1'; year.required = true; year.value = String(parts.year);
        year.setAttribute('aria-label', 'Year');
        const day = el('input');
        day.type = 'number'; day.min = '1'; day.max = '365'; day.step = '1'; day.required = true; day.value = String(parts.day);
        day.setAttribute('aria-label', 'Day');
        const time = el('input');
        time.type = 'time'; time.step = '1'; time.required = true; time.value = clockText(parts.seconds);
        time.setAttribute('aria-label', 'Time');
        const message = el('p', '', 'campaign-stardate-error');
        message.hidden = true; message.setAttribute('role', 'alert');
        for (const input of [year, day, time]) input.addEventListener('input', () => { message.hidden = true; });
        const save = el('button', 'Save stardate');
        save.type = 'submit';
        const cancel = button('Cancel', () => dialog.close());
        const actions = el('div', undefined, 'campaign-stardate-actions');
        actions.append(cancel, save);
        form.append(field('Year', year), field('Day', day), field('Time', time), message, actions);
        form.addEventListener('submit', e => {
            e.preventDefault();
            const yearValue = Number(year.value);
            const dayValue = Number(day.value);
            const clock = (time.value || '').split(':').map(Number);
            if (year.value.trim() === '' || !Number.isInteger(yearValue)) { message.hidden = false; message.textContent = 'Enter a whole year.'; year.focus(); return; }
            if (day.value.trim() === '' || !Number.isInteger(dayValue) || dayValue < 1 || dayValue > 365) { message.hidden = false; message.textContent = 'Day must be from 1 to 365.'; day.focus(); return; }
            if (!time.value || clock.length < 2 || clock.some(n => !Number.isInteger(n))) { message.hidden = false; message.textContent = 'Enter a time.'; time.focus(); return; }
            const seconds = clock[0] * 3600 + clock[1] * 60 + (clock[2] || 0);
            if (seconds < 0 || seconds > 86399) { message.hidden = false; message.textContent = 'Enter a time.'; time.focus(); return; }
            window.SystemViewer.setCampaignClock(yearValue, dayValue, seconds);
            dialog.close();
        });
        dialog.append(title, note, form);
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        document.body.append(dialog);
        dialog.showModal();
        year.focus();
    }
    function returnToOrigin() {
        const from = origin;
        if (!from || !confirmLeave()) return;
        origin = null;
        SystemInspector.showBody(from.hexId, from.bodyKey);
    }
    function render(container, hexId) {
        releaseView(); host = container;
        activeHex = draft?.anchor.hexId || window.campaignAtlas.records[selectedId]?.anchor.hexId || hexId;
        if (origin && (draft || selectedId)) {
            const back = button('', returnToOrigin, 'atlas-link atlas-origin');
            const mark = el('i', undefined, 'fa-solid fa-arrow-left');
            mark.setAttribute('aria-hidden', 'true');
            back.append(mark, document.createTextNode(` Back to ${origin.label}`));
            host.append(back);
        } else origin = null;
        host.append(errorArea());
        renderStardate();
        if (draft) renderEditor();
        else if (selectedId && window.campaignAtlas.records[selectedId]) renderRecord(window.campaignAtlas.records[selectedId]);
        else renderList();
        syncMapFocus();
    }
    function setup() {
        window.campaignAtlas ||= emptyStore();
        const inspector = document.getElementById('system-inspector');
        document.addEventListener('paste', e => {
            if (!draft || inspector.hidden || document.querySelector('.atlas-crop-dialog')) return;
            const found = clipboardImageFiles(e.clipboardData);
            if (!found.length) return;
            const field = e.target?.closest?.('input, textarea, [contenteditable="true"]');
            if (field && !inspector.contains(field)) return;
            e.preventDefault();
            const images = imageFiles(found);
            if (!images.length) { error('Choose a still JPEG, PNG, or WebP image.'); return; }
            void useCoverFile(images[0], images.slice(1));
        });
        bindFileDrop(inspector, incoming => {
            const images = imageFiles(incoming);
            if (!images.length) { error('Choose a still JPEG, PNG, or WebP image.'); return; }
            void useCoverFile(images[0], images.slice(1));
        }, () => !!draft && !inspector.hidden && !document.querySelector('.atlas-crop-dialog'));
        for (const type of ['click', 'mousedown', 'keydown', 'dblclick', 'drop']) {
            document.addEventListener(type, e => {
                if (busy) { e.preventDefault(); e.stopImmediatePropagation(); }
            }, true);
        }
        window.addEventListener('beforeunload', e => {
            if (dirty() || busy || loading) { e.preventDefault(); e.returnValue = ''; }
        });
    }
    function openForHex(id) {
        if (!confirmLeave()) return false;
        systemFilter = id || ''; selectedId = null; origin = null;
        return SystemInspector.openForHex(id, 'campaign');
    }
    // A new record already placed at a system or one of its bodies.
    // `from` ({ hexId, bodyKey, label }) is the panel view to return to.
    function createAt(type, anchor, from = null) {
        if (!TYPES.includes(type) || busy || loading || !confirmLeave()) return false;
        const now = new Date().toISOString();
        systemFilter = anchor.hexId; selectedId = null; query = ''; filter = '';
        draft = { id: null, type, name: '', summary: '', details: '', tags: [],
            anchor: { kind: 'system', hexId: anchor.hexId, locationLabel: String(anchor.locationLabel || '').slice(0, 300),
                ...(anchor.bodyKey ? { bodyKey: anchor.bodyKey } : {}) },
            visibility: 'referee', provenance: { kind: 'campaign', citation: '' }, links: [], images: [], primaryImageId: null,
            createdAt: now, updatedAt: now };
        baseline = JSON.stringify(draft);
        origin = from;
        if (!SystemInspector.openForHex(anchor.hexId, 'campaign')) { discard(); origin = null; return false; }
        host?.querySelector('[name="name"]')?.focus();
        return true;
    }
    return { setup, openForHex, close: () => SystemInspector.close(),
        heading: () => draft ? (draft.id ? 'Edit record' : `New ${(SINGULAR[draft.type] || 'record').toLocaleLowerCase()}`) : ((filter && window.AppNavigation?.labels[filter]) || 'Campaign'),
        openRecord: (id, from = null) => {
            const record = window.campaignAtlas.records[id];
            if (!record || !confirmLeave()) return false;
            systemFilter = ''; query = ''; filter = record.type; selectedId = id; trackedId = id; activeHex = record.anchor.hexId;
            origin = from;
            return SystemInspector.openForHex(record.anchor.hexId, 'campaign');
        },
        openType: type => {
            if (!TYPES.includes(type) || !confirmLeave()) return false;
            systemFilter = ''; selectedId = null; query = ''; filter = type; origin = null;
            return SystemInspector.openForHex(SystemInspector.currentHexId(), 'campaign');
        },
        currentType: () => filter,
        showAll: () => { systemFilter = ''; selectedId = null; query = ''; filter = ''; origin = null; },
        draftHexId: () => draft?.anchor.hexId,
        addRecord, updateRecord, deleteRecord, recordsForHex, recordsForBody, createAt, SINGULAR, exportForHex, exportMap, importForHex, prepareImport,
        emptyStore, normalizeStore, snapshot, commit, persist, collect, reachable, render, releaseView, hasDraft,
        confirmLeave, discard, isBusy: () => busy || loading, TYPES,
        pickBody, cancelPick, isPicking: () => picking, clearLocator, updateLocator, trackedHexId,
        focusedHexId, focusedAnchor, syncMapFocus };
})();
