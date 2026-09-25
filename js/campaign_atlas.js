// Campaign-authored records, separate from regeneratable system data.
window.CampaignAtlas = (() => {
    'use strict';
    const TYPES = ['person', 'place', 'business', 'organization', 'job', 'event', 'item', 'note'];
    const clone = value => JSON.parse(JSON.stringify(value));
    const own = (object, key) => Object.hasOwn(object, key);
    const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const fail = message => { throw new Error(message); };
    let busy = false, draft = null, baseline = '', host = null, activeHex = null;
    let selectedId = null, query = '', filter = '', viewUrls = [], renderToken = 0;
    let staged = new Map(), loading = false;
    let picking = false, pickButton = null, pickStatus = null;
    let locator = null;
    let systemFilter = '';
    let lastMapFocus = null;
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
    function snapshot() { return clone(window.campaignAtlas); }
    function reachable() {
        const ids = CampaignAssets.referenced(window.campaignAtlas);
        for (const snap of [...(window.undoStack || []), ...(window.redoStack || [])]) {
            if (snap.campaignAtlas) for (const id of CampaignAssets.referenced(snap.campaignAtlas)) ids.add(id);
        }
        for (const id of staged.keys()) ids.add(id);
        return ids;
    }
    async function collect() {
        if (busy || loading) return;
        const keep = reachable();
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
            saveHistoryState(action, historyOptions);
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
    async function restoreHistory(atlas, apply) {
        if (busy || loading) return fail('A campaign operation is still in progress.');
        const normalized = normalizeStore(atlas);
        busy = true;
        try {
            await window.dbManager.commitCampaignAtlas(normalized);
            window.campaignAtlas = normalized;
            apply();
        } finally { busy = false; }
        window.SystemInspector?.refresh(true);
        void collect().catch(err => console.warn('[Campaign asset cleanup]', err));
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
    // IDs from history count as occupied too: old bytes must remain immutable for undo.
    async function prepareImport(envelope, targetHexId = null) {
        const store = normalizeStore(envelope.campaignAtlas);
        const payloads = await CampaignAssets.deserialize(store, envelope.campaignAssets);
        const used = reachable(), assetMap = new Map();
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
        const controls = el('div', undefined, 'atlas-search');
        const search = el('input'); search.type = 'search'; search.placeholder = 'Search campaign…';
        search.setAttribute('aria-label', 'Search campaign records'); search.value = query;
        const select = el('select'); select.setAttribute('aria-label', 'Filter record type');
        for (const type of ['', ...TYPES]) { const opt = el('option', type || 'All types'); opt.value = type; select.append(opt); }
        select.value = filter;
        const systems = el('select'); systems.setAttribute('aria-label', 'Filter campaign by system');
        systemOptions(systems, true); systems.value = systemFilter;
        controls.append(search, systems, select, button('+ Add record', () => startDraft(), 'atlas-primary'));
        const list = el('div', undefined, 'atlas-record-list');
        const counts = el('p', '', 'atlas-muted');
        host.append(controls, counts, list);
        function update() {
            list.replaceChildren();
            const records = Object.values(window.campaignAtlas.records).filter(r => !systemFilter || r.anchor.hexId === systemFilter).sort((a, b) => a.name.localeCompare(b.name));
            const q = query.trim().toLocaleLowerCase();
            counts.textContent = records.length ? TYPES.map(t => `${t}: ${records.filter(r => r.type === t).length}`).join(' · ') : 'People, places, jobs, and stories — all in one system.';
            const matches = records.filter(r => (!filter || r.type === filter) &&
                [r.name, r.summary, r.details, r.anchor.locationLabel, SystemInspector.systemName(r.anchor.hexId), ...r.tags].join('\n').toLocaleLowerCase().includes(q));
            for (const r of matches) {
                const row = button('', () => {
                    selectedId = r.id;
                    activeHex = r.anchor.hexId;
                    redraw();
                }, 'atlas-record-row');
                const cover = r.images.find(a => a.assetId === r.primaryImageId);
                if (cover) row.append(imageFor(cover)); else row.append(el('span', '◇', 'atlas-placeholder'));
                const info = el('span');
                info.append(el('small', r.type, 'atlas-eyebrow'), el('strong', r.name), el('span', r.summary), el('small', r.tags.join(' · '), 'atlas-muted'));
                info.append(el('small', SystemInspector.systemName(r.anchor.hexId), 'atlas-muted'));
                row.append(info); list.append(row);
            }
            if (!matches.length) list.append(el('p', records.length ? 'No matching records. Try another search or type.' : 'Add your first record: a contact, a starport bar, a rumor, or anything your players might encounter.', 'atlas-empty'));
        }
        search.addEventListener('input', () => { query = search.value; update(); });
        select.addEventListener('change', () => { filter = select.value; redraw(); window.AppNavigation?.layout(); });
        systems.addEventListener('change', () => { systemFilter = systems.value; update(); });
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
    function renderRecord(record) {
        host.append(button('‹ All records', () => { selectedId = null; redraw(); }, 'atlas-link'), el('small', record.type, 'atlas-eyebrow'), el('h2', record.name));
        const recordTitle = host.querySelector('h2');
        host.append(el('p', `System: ${SystemInspector.systemName(record.anchor.hexId)} (${record.anchor.hexId})`, 'atlas-muted'));
        if (SystemViewer.currentHexId() !== record.anchor.hexId) host.append(el('p', 'Double-click this system on the map to see its location in orbit view.', 'atlas-muted'));
        recordTitle.classList.add('atlas-active-record');
        showLocator(record.anchor, recordTitle);
        const cover = record.images.find(a => a.assetId === record.primaryImageId);
        if (cover) {
            const fig = el('figure'), btn = button('', () => fullImage(cover), 'atlas-image-button');
            btn.setAttribute('aria-label', `View ${record.type === 'person' ? 'portrait' : 'cover image'}`);
            btn.append(imageFor(cover, false));
            fig.append(btn, el('figcaption', [cover.caption, cover.credit, cover.sourceUrl].filter(Boolean).join(' — ')));
            host.append(fig);
        }
        if (record.summary) host.append(el('p', record.summary, 'atlas-summary'));
        if (record.anchor.locationLabel) host.append(el('p', `Location: ${record.anchor.locationLabel}`));
        if (record.tags.length) host.append(el('p', record.tags.join(' · '), 'atlas-muted'));
        host.append(el('p', record.details, 'atlas-details'));
        for (const attachment of record.images) {
            if (attachment === cover) continue;
            const fig = el('figure');
            const view = button('', () => fullImage(attachment), 'atlas-image-button');
            view.setAttribute('aria-label', 'View attached image'); view.append(imageFor(attachment, false));
            fig.append(view, el('figcaption', [attachment.caption, attachment.credit, attachment.sourceUrl].filter(Boolean).join(' — ')));
            host.append(fig);
        }
        const actions = el('div', undefined, 'atlas-actions');
        actions.append(button('Edit record', () => startDraft(record), 'atlas-primary'), button('Delete', async () => {
            if (!confirm(`Delete campaign record “${record.name}”? You can undo this.`)) return;
            try { await deleteRecord(record.id); selectedId = null; redraw(); } catch (err) { error(err.message); }
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
        host.append(el('h2', draft.id ? 'Edit record' : 'New campaign record'), el('p', `System: ${SystemInspector.systemName(draft.anchor.hexId)} (${draft.anchor.hexId})`, 'atlas-muted'));
        const form = el('form'), fields = el('fieldset');
        form.id = 'atlas-record-form';
        fields.disabled = busy || loading;
        form.append(fields);
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
        TYPES.forEach(t => { const o = el('option', t); o.value = t; type.append(o); });
        type.value = draft.type;
        type.addEventListener('change', () => { draft.type = type.value; redraw(); }); fields.append(typeLabel);
        field(fields, 'Name', 'name', draft.name, v => draft.name = v, { required: true, max: 120 });
        field(fields, 'Summary', 'summary', draft.summary, v => draft.summary = v, { max: 300 });
        field(fields, 'Details', 'details', draft.details, v => draft.details = v, { multiline: true, max: 100000, rows: 7 });
        const locationTools = el('div', undefined, 'atlas-location-tools');
        pickButton = button('⌖', () => {
            if (picking) { cancelPick(); return; }
            if (window.SystemViewer.currentHexId() !== draft.anchor.hexId) {
                error('Double-click this record’s system on the map to open orbit view, then use the target. Your draft will stay here.'); return;
            }
            picking = true;
            pickButton.setAttribute('aria-pressed', 'true');
            pickStatus.textContent = 'Click a world, moon, belt, or star. Esc cancels.';
            document.body.classList.add('atlas-picking');
        }, 'atlas-target');
        pickButton.setAttribute('aria-label', 'Pick location from orbit view');
        pickButton.setAttribute('aria-pressed', 'false');
        pickButton.title = 'Pick location from orbit view';
        locationTools.append(el('span', 'Location'), pickButton); fields.append(locationTools);
        const locationInput = field(fields, 'Location name', 'location', draft.anchor.locationLabel, v => {
            draft.anchor.locationLabel = v;
            delete draft.anchor.bodyKey;
            cancelPick(); clearLocator();
        }, { max: 300 });
        locationInput.parentElement.classList.add('atlas-location-field');
        pickStatus = el('p', 'Pick a body in orbit view, or enter a location below.', 'atlas-muted atlas-pick-status');
        pickStatus.setAttribute('role', 'status');
        fields.append(pickStatus);
        field(fields, 'Tags (comma separated)', 'tags', draft.tags, v => draft.tags = v, { max: 3000 });
        const gallery = el('section', undefined, 'atlas-gallery');
        gallery.append(el('h3', draft.type === 'person' ? 'Portrait and images' : 'Cover and images'));
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
        drop.addEventListener('dragover', e => { e.preventDefault(); });
        drop.addEventListener('drop', e => { e.preventDefault(); void addImages(e.dataTransfer.files); });
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
        const cancel = button('Cancel', () => { if (confirmLeave()) redraw(); });
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
                discard(); selectedId = id; redraw(); showToast('Campaign record saved.', 2500);
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
        return record ? record.anchor.hexId : null;
    }
    function focusedAnchor() {
        if (!focusedHexId()) return null;
        return draft ? draft.anchor : window.campaignAtlas.records[selectedId]?.anchor || null;
    }
    function syncMapFocus(opts = {}) {
        const id = focusedHexId();
        const changed = id !== lastMapFocus;
        lastMapFocus = id;
        if (id && !window.SystemViewer?.isOpen() && (changed || opts.forcePan)) centerHexInView(id);
        if ((changed || opts.forcePan) && typeof draw === 'function') requestAnimationFrame(draw);
    }
    function render(container, hexId) {
        releaseView(); host = container;
        activeHex = draft?.anchor.hexId || window.campaignAtlas.records[selectedId]?.anchor.hexId || hexId;
        host.append(errorArea());
        if (draft) renderEditor();
        else if (selectedId && window.campaignAtlas.records[selectedId]) renderRecord(window.campaignAtlas.records[selectedId]);
        else renderList();
        syncMapFocus();
    }
    function setup() {
        window.campaignAtlas ||= emptyStore();
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
        systemFilter = id || ''; selectedId = null;
        return SystemInspector.openForHex(id, 'campaign');
    }
    return { setup, openForHex, close: () => SystemInspector.close(),
        openRecord: id => {
            const record = window.campaignAtlas.records[id];
            if (!record || !confirmLeave()) return false;
            systemFilter = ''; query = ''; filter = record.type; selectedId = id; activeHex = record.anchor.hexId;
            return SystemInspector.openForHex(record.anchor.hexId, 'campaign');
        },
        openType: type => {
            if (!TYPES.includes(type) || !confirmLeave()) return false;
            systemFilter = ''; selectedId = null; query = ''; filter = type;
            return SystemInspector.openForHex(SystemInspector.currentHexId(), 'campaign');
        },
        currentType: () => filter,
        showAll: () => { systemFilter = ''; selectedId = null; query = ''; filter = ''; },
        draftHexId: () => draft?.anchor.hexId,
        addRecord, updateRecord, deleteRecord, recordsForHex, exportForHex, exportMap, importForHex, prepareImport,
        emptyStore, normalizeStore, snapshot, commit, restoreHistory, persist, collect, reachable, render, releaseView, hasDraft,
        confirmLeave, discard, isBusy: () => busy || loading, TYPES,
        pickBody, cancelPick, isPicking: () => picking, clearLocator, updateLocator,
        focusedHexId, focusedAnchor, syncMapFocus };
})();
