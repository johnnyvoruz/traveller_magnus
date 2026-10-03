/**
 * Read-only chart snapshots in universe/sectors. Loaded one sector at a time.
 * A missing file is an error. The app does not call Traveller Map.
 */
(function () {
    'use strict';

    const pending = new Map();
    window.UNIVERSE_SECTOR_DATA = window.UNIVERSE_SECTOR_DATA || {};

    function fileSlug(name) {
        return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function load(name) {
        if (window.UNIVERSE_SECTOR_DATA[name]) return Promise.resolve(window.UNIVERSE_SECTOR_DATA[name]);
        if (pending.has(name)) return pending.get(name);
        const task = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'universe/sectors/' + fileSlug(name) + '.js';
            script.onload = () => {
                const data = window.UNIVERSE_SECTOR_DATA[name];
                if (!data) {
                    reject(new Error('The chart for ' + name + ' did not register.'));
                    return;
                }
                try { Object.freeze(data); } catch (err) { /* already frozen */ }
                resolve(data);
            };
            script.onerror = () => reject(new Error('The chart for ' + name + ' is not in this copy of the cartographer.'));
            document.head.appendChild(script);
        });
        pending.set(name, task);
        task.catch(() => pending.delete(name));
        return task;
    }

    function localKey(hexId) {
        const parts = String(hexId).split('-');
        if (parts.length < 3) return null;
        return parts[1] + '-' + parts[2];
    }

    const _parsedRows = new Map();
    const _builtCache = new Map();
    const _builtLoaded = new Set();

    function baseSectorFor(hexId) {
        const base = window.overlayBase;
        if (!base || !Array.isArray(base.sectors)) return null;
        const slot = parseInt(String(hexId).split('-')[0], 10);
        return base.sectors.find(item => Number(item.slot) === slot) || null;
    }

    function rowsFor(name) {
        if (_parsedRows.has(name)) return _parsedRows.get(name);
        const data = window.UNIVERSE_SECTOR_DATA[name];
        if (!data || !data.tsv || typeof parseT5Tab !== 'function') return null;
        const full = parseT5Tab(data.tsv, '1');
        const local = new Map();
        full.forEach((state, id) => {
            const key = localKey(id);
            if (key) local.set(key, state);
        });
        _parsedRows.set(name, local);
        return local;
    }

    function baseState(hexId) {
        const entry = baseSectorFor(hexId);
        if (!entry) return null;
        const rows = rowsFor(entry.name);
        const key = localKey(hexId);
        if (!rows || !key) return null;
        return rows.get(key) || null;
    }

    function generationKeys() {
        const settings = (typeof window.collectMapSettings === 'function') ? window.collectMapSettings() : {};
        return Object.keys(settings).filter(key => key.indexOf('generation') === 0);
    }

    function _withSnapshotGeneration(fn) {
        const savedSeed = masterSeed;
        const keys = generationKeys();
        const saved = {};
        keys.forEach(key => { saved[key] = window[key]; });
        const index = window.UNIVERSE_INDEX || {};
        try {
            masterSeed = index.seed || masterSeed;
            const settings = index.buildSettings || {};
            keys.forEach(key => { if (Object.prototype.hasOwnProperty.call(settings, key)) window[key] = settings[key]; });
            return fn();
        } finally {
            masterSeed = savedSeed;
            keys.forEach(key => { window[key] = saved[key]; });
        }
    }

    function scratchBuild(hexId) {
        const live = hexStates.get(hexId);
        if (!live) return null;
        const copy = JSON.parse(JSON.stringify(live));
        delete copy.mgtSystem;
        delete copy.mgt2eData;
        delete copy.mgtSocio;
        hexStates.set(hexId, copy);
        try {
            _withSnapshotGeneration(() => { if (typeof _buildOneMgtHex === 'function') _buildOneMgtHex(hexId); });
            return JSON.parse(JSON.stringify(hexStates.get(hexId)));
        } finally {
            hexStates.set(hexId, live);
        }
    }

    async function loadBuiltSlot(slot) {
        if (_builtLoaded.has(slot) || !window.dbManager || !window.dbManager.loadBuilt) return;
        _builtLoaded.add(slot);
        try {
            const rows = await window.dbManager.loadBuilt(slot);
            rows.forEach(([id, record]) => { if (!_builtCache.has(id)) _builtCache.set(id, record); });
        } catch (err) {
            _builtLoaded.delete(slot);
        }
    }

    function ensureSystemBuilt(hexId) {
        const state = hexStates.get(hexId);
        if (!state || state.type !== 'SYSTEM_PRESENT') return state;
        if (state.mgtSystem || (window.overlayHexes && window.overlayHexes.has(hexId))) return state;
        const entry = baseSectorFor(hexId);
        if (!entry) return state;
        const index = window.UNIVERSE_INDEX || {};
        const cached = _builtCache.get(hexId);
        if (cached && cached.buildVersion === index.buildVersion && cached.snapshotVersion === index.snapshotVersion && cached.state) {
            Object.assign(state, cached.state);
            return state;
        }
        if (!_builtLoaded.has(Number(entry.slot)) && window.dbManager && window.dbManager.loadBuilt) {
            void loadBuiltSlot(Number(entry.slot)).then(() => {
                const again = _builtCache.get(hexId);
                if (again && again.buildVersion === index.buildVersion && again.snapshotVersion === index.snapshotVersion && again.state && !state.mgtSystem) {
                    Object.assign(state, again.state);
                }
            });
        }
        try {
            _withSnapshotGeneration(() => { if (typeof _buildOneMgtHex === 'function') _buildOneMgtHex(hexId); });
        } catch (err) {
            console.error('[Chart build] ' + hexId, err);
            return state;
        }
        const stored = (typeof stripHexViewState === 'function') ? stripHexViewState(state) : state;
        const record = {
            state: stored,
            buildVersion: index.buildVersion || '',
            snapshotVersion: index.snapshotVersion || ''
        };
        _builtCache.set(hexId, record);
        if (window.dbManager && window.dbManager.putBuilt) void window.dbManager.putBuilt(hexId, record);
        return state;
    }

    function prefetchAround(hexId) {
        const here = localKey(hexId);
        if (!here) return;
        const slot = String(hexId).split('-')[0];
        const num = here.split('-')[1];
        if (!num || num.length !== 4) return;
        const col = parseInt(num.slice(0, 2), 10);
        const row = parseInt(num.slice(2), 10);
        const queue = [];
        hexStates.forEach((state, id) => {
            if (!state || state.type !== 'SYSTEM_PRESENT' || id === hexId) return;
            if (!String(id).startsWith(slot + '-')) return;
            const other = localKey(id);
            const n = other && other.split('-')[1];
            if (!n || n.length !== 4) return;
            const dc = Math.abs(parseInt(n.slice(0, 2), 10) - col);
            const dr = Math.abs(parseInt(n.slice(2), 10) - row);
            if (Math.max(dc, dr) <= 2) queue.push(id);
        });
        const step = () => {
            const next = queue.shift();
            if (!next) return;
            try { ensureSystemBuilt(next); } catch (err) { console.error('[Chart build] ' + next, err); }
            const schedule = window.requestIdleCallback || (fn => setTimeout(fn, 50));
            schedule(step);
        };
        const schedule = window.requestIdleCallback || (fn => setTimeout(fn, 50));
        schedule(step);
    }

    function plain(value) {
        if (!value || typeof value !== 'object') return value;
        const out = Array.isArray(value) ? [] : {};
        Object.keys(value).sort().forEach(key => {
            if (['rev', 'updatedAt', 'disclosure', 'notes', 'custom_ui', 'manualBgColor', 'isHiddenByFilter'].includes(key)) return;
            out[key] = plain(value[key]);
        });
        return out;
    }

    function sameAsBase(live, base) {
        return JSON.stringify(plain(live)) === JSON.stringify(plain(base));
    }

    async function adopt(name, slotNum) {
        const data = await load(name);
        if (!data.tsv) throw new Error(name + ' has no chart text in the local snapshot.');
        const slot = (typeof sectorSlotToNumber === 'function') ? sectorSlotToNumber(slotNum) : parseInt(slotNum, 10);
        if (!Number.isFinite(slot) || slot < 1) throw new Error('Sector slot "' + slotNum + '" is not a slot on this map.');
        const prefix = slot + '-';
        Array.from(hexStates.keys()).forEach(id => { if (id.startsWith(prefix)) hexStates.delete(id); });
        const dropped = [];
        Array.from(window.overlayHexes).forEach(id => {
            if (!id.startsWith(prefix)) return;
            window.overlayHexes.delete(id);
            dropped.push(id);
        });
        const rows = (typeof parseT5Tab === 'function') ? parseT5Tab(data.tsv, String(slot)) : new Map();
        rows.forEach((state, id) => {
            const copy = JSON.parse(JSON.stringify(state));
            ['disclosure', 'notes', 'custom_ui', 'manualBgColor', 'isHiddenByFilter'].forEach(field => delete copy[field]);
            hexStates.set(id, copy);
        });
        window.sectorNames[slot] = name;
        _parsedRows.delete(name);
        const version = (window.UNIVERSE_INDEX && window.UNIVERSE_INDEX.snapshotVersion) || data.snapshotVersion || '';
        Array.from(_builtCache.keys()).forEach(id => {
            if (String(id).startsWith(prefix)) _builtCache.delete(id);
        });
        _builtLoaded.delete(slot);
        if (window.dbManager && window.dbManager.dropBuiltSlots) void window.dbManager.dropBuiltSlots([slot]);
        const milieu = data.milieu || (window.UNIVERSE_INDEX && window.UNIVERSE_INDEX.milieu) || 'M1105';
        const sectors = ((window.overlayBase && window.overlayBase.sectors) || []).filter(item => Number(item.slot) !== slot);
        sectors.push({ name, slot });
        window.overlayBase = { milieu, snapshotVersion: version, sectors };
        if (window.dbManager && window.dbManager.dropOverlayHexes) await window.dbManager.dropOverlayHexes(dropped);
        if (typeof syncChartBuildButton === 'function') syncChartBuildButton();
        return data;
    }

    async function attach() {
        const ok = confirm('Attach the chart snapshot? A hex that matches the chart is dropped from your overlay, and its system becomes the chart\'s build.');
        if (!ok) return 0;
        let attachSlot = null;
        if (window.Saves) attachSlot = await window.Saves.beforeBulk('Attach snapshot');
        try {
        const names = window.sectorNames || {};
        const known = window.UNIVERSE_SECTORS || [];
        const sectors = (window.overlayBase && Array.isArray(window.overlayBase.sectors))
            ? window.overlayBase.sectors.map(item => ({ name: item.name, slot: item.slot }))
            : [];
        let kept = 0;
        let matched = 0;
        for (const [slotKey, name] of Object.entries(names)) {
            if (!known.some(item => item.name === name)) continue;
            let data;
            try { data = await load(name); } catch (err) { continue; }
            if (!data.tsv) continue;
            const slot = parseInt(slotKey, 10);
            if (!sectors.some(item => Number(item.slot) === slot && item.name === name)) sectors.push({ name, slot });
            matched++;
            const rows = rowsFor(name);
            if (typeof showWorkStatus === 'function') showWorkStatus({ title: 'Attach snapshot', detail: name, fraction: 0.5 });
            if (rows) rows.forEach((base, key) => {
                const id = slot + '-' + key;
                const live = hexStates.get(id);
                if (!live) {
                    window.overlayHexes.add(id);
                    if (typeof markChanged === 'function') markChanged('Attach snapshot', { hexIds: [id], skipAutoslot: true });
                    hexStates.delete(id);
                    return;
                }
                let matches = sameAsBase(live, base);
                if (matches && live.mgtSystem) {
                    const scratch = scratchBuild(id);
                    matches = scratch && sameAsBase(live.mgtSystem, scratch.mgtSystem);
                }
                if (matches) window.overlayHexes.delete(id);
                else {
                    window.overlayHexes.add(id);
                    kept++;
                }
            });
        }
        if (!matched) throw new Error('No sector on this map matches a chart snapshot.');
        const version = (window.UNIVERSE_INDEX && window.UNIVERSE_INDEX.snapshotVersion) || '';
        window.overlayBase = {
            milieu: (window.UNIVERSE_INDEX && window.UNIVERSE_INDEX.milieu) || 'M1105',
            snapshotVersion: version,
            sectors
        };
        if (typeof markChanged === 'function') markChanged('Attach snapshot', { skipAutoslot: true });
        if (window.dbManager && window.dbManager.replaceWorkingCopy) await window.dbManager.replaceWorkingCopy();
        if (typeof syncChartBuildButton === 'function') syncChartBuildButton();
        return kept;
        } finally {
            if (typeof hideWorkStatus === 'function') hideWorkStatus();
            if (attachSlot && window.Saves && window.Saves.endBulk) window.Saves.endBulk();
        }
    }

    window.UniverseSnapshot = {
        load, fileSlug, baseState, baseSectorFor, sameAsBase, adopt, attach, ensureSystemBuilt, prefetchAround
    };
    window.syncChartBuildButton = function () {
        const button = document.getElementById('btn-build-imported');
        if (button) button.hidden = !!window.overlayBase;
    };
}());
