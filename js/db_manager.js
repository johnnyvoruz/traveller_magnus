/**
 * PROJECT AS ABOVE, SO BELOW
 * Module: DB Manager
 * Description: IndexedDB persistence layer. Automatically mirrors hexStates,
 *   sectorRoutes, and grid dimensions to IndexedDB so work is preserved across
 *   browser sessions without requiring a manual JSON save.
 *
 *   The in-memory state (hexStates, sectorRoutes) is always authoritative.
 *   Writes wait for the transaction to finish. A failure stays on screen as a
 *   sticky toast and does not clear data that was already stored.
 *
 * Sean Protocol: Zero RPG logic. Pure storage orchestration.
 */

(function () {
    'use strict';

    const DB_NAME       = 'traveller_magnus';
    const DB_VERSION    = 5;
    const STORE_HEX     = 'overlayHexes';
    const STORE_APP     = 'appState';
    const STORE_SAVES   = 'saves';
    const STORE_CAMPAIGN = 'campaign';
    const STORE_LEGACY_HEX = 'hexStates';
    const STORE_BUILT = 'baseBuilt';

    let _db        = null;
    let _syncTimer = null;
    let _campaignQueue = Promise.resolve();
    let _campaignLoadError = null;
    let _autosaveBlocked = false;
    let _writesHeld = false;
    let _idle = Promise.resolve();

    function _track(promise) {
        _idle = _idle.then(() => promise.then(() => {}, () => {}));
        return promise;
    }

    function whenWritesSettle() {
        return (async () => {
            let seen = null;
            while (seen !== _idle) {
                seen = _idle;
                await seen;
            }
        })();
    }

    function _reportWriteFailure(err) {
        console.warn('[DB] write failed:', err);
        const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
        const message = quota
            ? 'This browser is out of space, so the map was not stored. Free some space, then save a map file.'
            : 'This browser could not store the map. The saved copy was left as it was. Save a map file before you reload.';
        if (typeof showToast === 'function') showToast(message, 0);
    }

    function _done(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => {};
            tx.onabort = () => reject(tx.error || new Error('The browser storage write was interrupted.'));
        });
    }

    function _watch(work) {
        const run = (async () => {
            if (_autosaveBlocked || _writesHeld) return;
            try { await work(); }
            catch (err) {
                _reportWriteFailure(err);
                throw err;
            }
        })();
        // A handler keeps fire-and-forget saves from becoming unhandled rejections.
        // Awaiters of this same promise still see the failure.
        run.catch(() => {});
        return _track(run);
    }

    function holdWrites() {
        _writesHeld = true;
        if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
    }
    function releaseWrites() { _writesHeld = false; }
    function allowAutosave() { _autosaveBlocked = false; }
    function autosaveBlocked() { return _autosaveBlocked; }

    // -------------------------------------------------------------------------
    // Internal: open (or reuse) the database connection
    // -------------------------------------------------------------------------
    function _openDB() {
        return new Promise((resolve, reject) => {
            if (_db) { resolve(_db); return; }

            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const database = e.target.result;
                const upgrade = e.target.transaction;
                if (!database.objectStoreNames.contains(STORE_HEX)) database.createObjectStore(STORE_HEX);
                if (!database.objectStoreNames.contains(STORE_APP)) database.createObjectStore(STORE_APP);
                if (!database.objectStoreNames.contains(STORE_SAVES)) database.createObjectStore(STORE_SAVES);
                if (!database.objectStoreNames.contains(STORE_CAMPAIGN)) database.createObjectStore(STORE_CAMPAIGN);
                if (database.objectStoreNames.contains('tsvCache')) database.deleteObjectStore('tsvCache');
                if (!database.objectStoreNames.contains(STORE_BUILT)) database.createObjectStore(STORE_BUILT);
                if (e.oldVersion < 4 && database.objectStoreNames.contains(STORE_LEGACY_HEX)) {
                    const source = upgrade.objectStore(STORE_LEGACY_HEX);
                    const copied = source.openCursor();
                    copied.onsuccess = (ev) => {
                        const cur = ev.target.result;
                        if (!cur) {
                            database.deleteObjectStore(STORE_LEGACY_HEX);
                            return;
                        }
                        upgrade.objectStore(STORE_HEX).put(cur.value, cur.key);
                        cur.continue();
                    };
                } else if (database.objectStoreNames.contains(STORE_LEGACY_HEX)) {
                    database.deleteObjectStore(STORE_LEGACY_HEX);
                }
            };

            req.onsuccess = (e) => {
                _db = e.target.result;
                _db.onversionchange = () => {
                    _db.close();
                    _db = null;
                    _autosaveBlocked = true;
                    if (typeof showToast === 'function') {
                        showToast('This map was opened in another tab. Reload this one before editing, so the two do not overwrite each other.', 0);
                    }
                };
                if (navigator.storage && navigator.storage.persist) {
                    navigator.storage.persist().catch(() => {});
                }
                resolve(_db);
            };
            req.onerror = (e) => reject(e.target.error || new Error('Browser storage could not be opened.'));
            req.onblocked = () => reject(new Error('This map is open in another tab. Close that tab, then reload.'));
        });
    }

    // -------------------------------------------------------------------------
    // Startup: load all persisted data into the in-memory state.
    // Called once on page load before the map becomes interactive.
    // Returns true if any hex data was found (used to trigger an initial draw).
    // -------------------------------------------------------------------------
    async function loadFromDB() {
        try {
            const db = await _openDB();

            // Load app state (gridWidth, gridHeight, routes)
            const appState = await new Promise((resolve, reject) => {
                const tx     = db.transaction(STORE_APP, 'readonly');
                const store  = tx.objectStore(STORE_APP);
                const result = {};
                tx.oncomplete = () => resolve(result);
                tx.onabort = () => reject(tx.error || new Error('Browser storage could not be read.'));
                const cursorReq = store.openKeyCursor();
                cursorReq.onerror = () => reject(cursorReq.error || new Error('Browser storage could not be read.'));
                cursorReq.onsuccess = (e) => {
                    const cur = e.target.result;
                    if (cur) {
                        // Never materialize image Blobs in the startup metadata read.
                        if (!String(cur.key).startsWith('campaignAsset:')) {
                            const key = cur.key;
                            const getReq = store.get(key);
                            getReq.onerror = () => reject(getReq.error || new Error('Browser storage could not be read.'));
                            getReq.onsuccess = event => { result[key] = event.target.result; };
                        }
                        cur.continue();
                    }
                };
            });

            if (appState.campaignTime && Number.isFinite(appState.campaignTime.days)) {
                window.campaignTime = { days: appState.campaignTime.days };
            }
            try {
                window.campaignAtlas = window.CampaignAtlas.normalizeStore(appState.campaignAtlas);
                _campaignLoadError = null;
            } catch (err) {
                _campaignLoadError = err;
                alert(`Campaign Atlas could not be restored: ${err.message}\n\nStored campaign data has been preserved. Campaign writes are disabled until you load a supported backup or clear the canvas.`);
            }

            if (typeof appState.gridWidth       === 'number') gridWidth             = appState.gridWidth;
            if (typeof appState.gridHeight      === 'number') gridHeight            = appState.gridHeight;
            if (Array.isArray(appState.routes))               window.sectorRoutes   = appState.routes;
            if (typeof appState.autoRouteCounter === 'number') window.autoRouteCounter = appState.autoRouteCounter;
            if (appState.sectorNames && typeof appState.sectorNames === 'object') {
                window.sectorNames = appState.sectorNames;
            }
            if (appState.sectorReview && typeof appState.sectorReview === 'object') {
                window.sectorReview = appState.sectorReview;
            }
            if (appState.subsectorNames && typeof appState.subsectorNames === 'object') {
                window.subsectorNames = appState.subsectorNames;
            }

            // Restore routeDefinitions, or migrate from legacy segments if missing
            if (Array.isArray(appState.routeDefinitions) && appState.routeDefinitions.length > 0) {
                window.routeDefinitions = appState.routeDefinitions;
            } else if (Array.isArray(appState.routes) && appState.routes.length > 0 && typeof migrateToRouteDefinitions === 'function') {
                const migrated = migrateToRouteDefinitions(appState.routes);
                window.routeDefinitions = migrated.routeDefinitions;
                window.sectorRoutes     = migrated.routes;
            } else {
                window.routeDefinitions = (typeof getDefaultRouteDefinitions === 'function') ? getDefaultRouteDefinitions() : [];
            }

            // Restore border state
            if (Array.isArray(appState.borderDefinitions) && appState.borderDefinitions.length > 0) {
                window.borderDefinitions = appState.borderDefinitions;
            }
            if (Array.isArray(appState.hexBorderAssignments)) {
                window.hexBorderAssignments = new Map(appState.hexBorderAssignments);
            }
            if (Array.isArray(appState.borderPaths)) {
                window.borderPaths = new Map(appState.borderPaths);
            }

            // Restore region state
            if (Array.isArray(appState.regionDefinitions) && appState.regionDefinitions.length > 0) {
                window.regionDefinitions = appState.regionDefinitions;
            }
            if (Array.isArray(appState.regionPaths)) {
                window.regionPaths = new Map(appState.regionPaths);
            }
            if (Array.isArray(appState.allegianceDefinitions)) {
                window.allegianceDefinitions = appState.allegianceDefinitions;
            }
            if (Array.isArray(appState.allegianceAssignments)) {
                window.hexAllegianceAssignments = new Map(appState.allegianceAssignments);
            }

            if (Number.isInteger(appState.autosaveRing) && window.Saves) window.Saves.noteRing(appState.autosaveRing);
            if (appState.campaignId) window.overlayCampaignId = appState.campaignId;
            if (appState.base) window.overlayBase = appState.base;

            const records = await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_HEX, 'readonly');
                const out = [];
                const cursorReq = tx.objectStore(STORE_HEX).openCursor();
                cursorReq.onerror = () => reject(cursorReq.error || new Error('Saved hexes could not be read.'));
                tx.onabort = () => reject(tx.error || new Error('Saved hexes could not be read.'));
                cursorReq.onsuccess = (e) => {
                    const cur = e.target.result;
                    if (cur) { out.push([cur.key, cur.value]); cur.continue(); }
                    else resolve(out);
                };
            });

            const doc = {
                format: 'asab-overlay', schemaVersion: 3,
                base: appState.base || null,
                campaignId: appState.campaignId || null,
                hexes: Object.fromEntries(records)
            };
            const merged = window.Overlay ? await window.Overlay.mergedHexes(doc) : { merged: new Map(records.filter(([, v]) => !(v && v.deleted))), overlayIds: new Set(records.map(([id]) => id)) };
            hexStates.clear();
            merged.merged.forEach((state, id) => hexStates.set(id, state));
            if (window.Overlay) window.Overlay.rememberOverlay(doc, merged.overlayIds);
            else window.overlayHexes = merged.overlayIds;

            if (hexStates.size > 0) {
                console.log(`[DB] Loaded ${hexStates.size} hex(es) from IndexedDB (gridWidth=${gridWidth}, gridHeight=${gridHeight}).`);
            }
            return hexStates.size > 0;

        } catch (err) {
            // A failed read must not be treated as an empty map. The next edit
            // would otherwise overwrite the stored campaign.
            hexStates.clear();
            _autosaveBlocked = true;
            console.warn('[DB] loadFromDB failed — autosave paused:', err);
            throw err;
        }
    }

    // -------------------------------------------------------------------------
    // Every write below goes through stripHexViewState() (core.js). Hex states are
    // persisted WHOLE, so any derived field on them is persisted too — which is how
    // state.isHiddenByFilter, recomputed from the filter form on every run, ended up
    // outliving the form itself and reopening the map filtered with empty fields.
    // The store holds map data; view state is recomputed, never restored.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Save all hexes belonging to one sector by numeric sector number.
    // Called after importT5Tab — efficient because it only touches one sector.
    // -------------------------------------------------------------------------
    function _putOverlayHex(store, hexId) {
        if (!window.overlayHexes || !window.overlayHexes.has(hexId)) {
            store.delete(hexId);
            return;
        }
        const state = hexStates.get(hexId);
        if (state && typeof state === 'object') {
            const stamped = window.Overlay ? window.Overlay.stamp(state) : stripHexViewState(state);
            store.put(stamped, hexId);
            return;
        }
        const pending = window.dirtyJournal && window.dirtyJournal.pending(hexId);
        store.put({
            deleted: true,
            rev: (pending && pending.rev) || 1,
            updatedAt: (pending && pending.updatedAt) || new Date().toISOString()
        }, hexId);
    }

    function saveHexesBySectorNum(sectorNum) {
        const prefix = sectorNum + '-';
        const ids = [];
        window.overlayHexes.forEach(id => { if (String(id).startsWith(prefix)) ids.push(id); });
        return saveHexes(ids);
    }

    function saveHexes(hexIds) {
        if (!hexIds) return Promise.resolve();
        return _watch(async () => {
            const db = await _openDB();
            const tx = db.transaction(STORE_HEX, 'readwrite');
            const store = tx.objectStore(STORE_HEX);
            for (const hexId of hexIds) _putOverlayHex(store, hexId);
            await _done(tx);
        });
    }

    function _metadataEntries() {
        const settings = (typeof window.collectMapSettings === 'function') ? window.collectMapSettings() : null;
        const entries = [
            ['routes', window.sectorRoutes || []],
            ['routeDefinitions', window.routeDefinitions || []],
            ['autoRouteCounter', window.autoRouteCounter || 0],
            ['gridWidth', gridWidth],
            ['gridHeight', gridHeight],
            ['borderDefinitions', window.borderDefinitions || []],
            ['hexBorderAssignments', window.hexBorderAssignments ? [...window.hexBorderAssignments.entries()] : []],
            ['borderPaths', window.borderPaths ? [...window.borderPaths.entries()] : []],
            ['regionDefinitions', window.regionDefinitions || []],
            ['regionPaths', window.regionPaths ? [...window.regionPaths.entries()] : []],
            ['sectorNames', window.sectorNames || {}],
            ['sectorReview', window.sectorReview || {}],
            ['subsectorNames', window.subsectorNames || {}],
            ['allegianceDefinitions', window.allegianceDefinitions || []],
            ['allegianceAssignments', window.hexAllegianceAssignments ? [...window.hexAllegianceAssignments.entries()] : []],
            ['base', window.overlayBase || null],
            ['campaignId', window.overlayCampaignId || null]
        ];
        if (settings) entries.push(['settings', settings]);
        return entries;
    }

    // Replace the stored overlay. Base hexes stay out of this store.
    function replaceWorkingCopy() {
        return _watch(async () => {
            const db = await _openDB();
            const tx = db.transaction([STORE_HEX, STORE_APP], 'readwrite');
            const hexStore = tx.objectStore(STORE_HEX);
            const appStore = tx.objectStore(STORE_APP);
            hexStore.clear();
            window.overlayHexes.forEach(id => _putOverlayHex(hexStore, id));
            _metadataEntries().forEach(([key, value]) => appStore.put(value, key));
            await _done(tx);
        });
    }

    function dropOverlayHexes(ids) {
        if (!ids || !ids.length) return Promise.resolve();
        return _watch(async () => {
            const db = await _openDB();
            const tx = db.transaction(STORE_HEX, 'readwrite');
            const store = tx.objectStore(STORE_HEX);
            ids.forEach(id => store.delete(id));
            await _done(tx);
        });
    }

    function scheduleSyncAll() {
        if (_autosaveBlocked || _writesHeld) return;
        if (_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(() => {
            _syncTimer = null;
            if (_autosaveBlocked || _writesHeld) return;
            const taken = window.dirtyJournal ? window.dirtyJournal.take() : null;
            _watch(async () => {
                const db = await _openDB();
                const tx = db.transaction([STORE_HEX, STORE_APP], 'readwrite');
                const hexStore = tx.objectStore(STORE_HEX);
                const appStore = tx.objectStore(STORE_APP);
                if (taken) taken.hexIds.forEach(id => _putOverlayHex(hexStore, id));
                _metadataEntries().forEach(([key, value]) => appStore.put(value, key));
                await _done(tx);
                if (taken && window.dirtyJournal) window.dirtyJournal.ack(taken);
            });
            if (window.CampaignAtlas) void window.CampaignAtlas.persist();
        }, 2000);
    }

    function _putApp(entries) {
        return _watch(async () => {
            const db = await _openDB();
            const tx = db.transaction(STORE_APP, 'readwrite');
            const store = tx.objectStore(STORE_APP);
            for (const [key, value] of entries) store.put(value, key);
            await _done(tx);
        });
    }

    function saveRoutes() {
        return _putApp([['routes', window.sectorRoutes || []]]);
    }

    function saveRouteDefinitions() {
        return _putApp([['routeDefinitions', window.routeDefinitions || []]]);
    }

    function saveGridDimensions() {
        return _putApp([['gridWidth', gridWidth], ['gridHeight', gridHeight]]);
    }

    function saveAutoRouteCounter() {
        return _putApp([['autoRouteCounter', window.autoRouteCounter || 0]]);
    }

    function open() { return _openDB(); }

    function writeStores(names, fill) {
        return (async () => {
            if (_autosaveBlocked) throw new Error('Browser storage is paused.');
            const db = await _openDB();
            const tx = db.transaction(names, 'readwrite');
            const stores = {};
            names.forEach(name => { stores[name] = tx.objectStore(name); });
            fill(stores);
            await _done(tx);
        })();
    }

    function getAllKeys(storeName) {
        return (async () => {
            const db = await _openDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAllKeys();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error || new Error('Browser storage could not be read.'));
            });
        })();
    }

    function getRecord(storeName, key) {
        return (async () => {
            const db = await _openDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('Browser storage could not be read.'));
            });
        })();
    }

    function readAll(storeName) {
        return (async () => {
            const db = await _openDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(storeName, 'readonly');
                const out = [];
                const req = tx.objectStore(storeName).openCursor();
                req.onerror = () => reject(req.error || new Error('Browser storage could not be read.'));
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) return;
                    const value = cur.value || {};
                    value.key = cur.key;
                    out.push(value);
                    cur.continue();
                };
                tx.oncomplete = () => resolve(out);
                tx.onabort = () => reject(tx.error || new Error('Browser storage could not be read.'));
            });
        })();
    }

    function saveBorderDefinitions() {
        return _putApp([['borderDefinitions', window.borderDefinitions || []]]);
    }

    function saveBorderAssignments() {
        const entries = window.hexBorderAssignments ? [...window.hexBorderAssignments.entries()] : [];
        return _putApp([['hexBorderAssignments', entries]]);
    }

    function saveBorderPaths() {
        const entries = window.borderPaths ? [...window.borderPaths.entries()] : [];
        return _putApp([['borderPaths', entries]]);
    }

    function saveRegionDefinitions() {
        return _putApp([['regionDefinitions', window.regionDefinitions || []]]);
    }

    function saveRegionPaths() {
        const entries = window.regionPaths ? [...window.regionPaths.entries()] : [];
        return _putApp([['regionPaths', entries]]);
    }

    function saveSectorNames() {
        return _putApp([['sectorNames', window.sectorNames || {}]]);
    }

    function saveSectorReview() {
        return _putApp([['sectorReview', window.sectorReview || {}]]);
    }

    function saveSubsectorNames() {
        return _putApp([['subsectorNames', window.subsectorNames || {}]]);
    }

    function saveAllegianceDefinitions() {
        return _putApp([['allegianceDefinitions', window.allegianceDefinitions || []]]);
    }

    function saveAllegianceAssignments() {
        const entries = window.hexAllegianceAssignments ? [...window.hexAllegianceAssignments.entries()] : [];
        return _putApp([['allegianceAssignments', entries]]);
    }

    // -------------------------------------------------------------------------
    // Wipe the entire database.
    // Called before Universe import or when the user starts a new map.
    // -------------------------------------------------------------------------
    async function clearDB(clearCampaign = false) {
        await _campaignQueue;
        if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
        try {
            const db = await _openDB();
            const names = [STORE_HEX, STORE_APP, STORE_BUILT];
            const tx = db.transaction(names, 'readwrite');
            tx.objectStore(STORE_HEX).clear();
            tx.objectStore(STORE_BUILT).clear();
            if (clearCampaign) {
                tx.objectStore(STORE_APP).clear();
            } else {
                // Universe/TravellerMap imports replace generated map data but
                // must leave campaign records and portrait bytes intact.
                const req = tx.objectStore(STORE_APP).openCursor();
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) return;
                    if (cur.key !== 'campaignAtlas' && cur.key !== 'campaignTime' && !String(cur.key).startsWith('campaignAsset:')) cur.delete();
                    cur.continue();
                };
            }
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onabort = () => reject(tx.error || new Error('Database clear was interrupted.'));
                tx.onerror = () => reject(tx.error);
            });
            if (clearCampaign) _campaignLoadError = null;
        } catch (err) {
            console.warn('[DB] clearDB failed:', err);
            throw err;
        }
    }

    function _campaignWrite(work) {
        const task = _campaignQueue.then(work);
        _campaignQueue = task.catch(() => {});
        return task;
    }
    function commitCampaignAtlas(atlas, payloads = new Map(), replaceUnrestored = false) {
        return _campaignWrite(async () => {
            if (_campaignLoadError && !replaceUnrestored) throw _campaignLoadError;
            const db = await _openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_APP, 'readwrite');
                const store = tx.objectStore(STORE_APP);
                let missing = null;
                tx.oncomplete = () => { if (replaceUnrestored) _campaignLoadError = null; resolve(); };
                tx.onabort = () => reject(missing || tx.error || new Error('Campaign save was interrupted. Try saving again.'));
                tx.onerror = () => {}; // onabort reports request and quota failures
                for (const [id, payload] of payloads) store.put(payload, 'campaignAsset:' + id);
                for (const id of CampaignAssets.referenced(atlas)) {
                    if (payloads.has(id)) continue;
                    const request = store.get('campaignAsset:' + id);
                    request.onsuccess = () => {
                        if (!request.result?.display || !request.result?.thumbnail) {
                            missing = new Error('A referenced image is missing from browser storage. Restore a complete backup.');
                            tx.abort();
                        }
                    };
                }
                store.put(atlas, 'campaignAtlas');
            });
        });
    }
    function saveCampaignAtlas() {
        return commitCampaignAtlas(window.CampaignAtlas.snapshot());
    }
    function saveCampaignTime() {
        const value = (window.campaignTime && Number.isFinite(window.campaignTime.days))
            ? { days: window.campaignTime.days } : null;
        return _putApp([['campaignTime', value]]);
    }
    async function readCampaignAsset(id) {
        const db = await _openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_APP, 'readonly');
            const req = tx.objectStore(STORE_APP).get('campaignAsset:' + id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    function collectCampaignAssets(keep) {
        return _campaignWrite(async () => {
            if (_campaignLoadError) return;
            const db = await _openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_APP, 'readwrite');
                const range = IDBKeyRange.bound('campaignAsset:', 'campaignAsset:\uffff');
                const req = tx.objectStore(STORE_APP).openKeyCursor(range);
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) return;
                    if (!keep.has(String(cur.key).slice('campaignAsset:'.length))) tx.objectStore(STORE_APP).delete(cur.key);
                    cur.continue();
                };
                tx.oncomplete = resolve;
                tx.onabort = () => reject(tx.error || new Error('Asset cleanup was interrupted.'));
            });
        });
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    window.dbManager = {
        campaignLoadError: () => _campaignLoadError,
        saveCampaignAtlas,
        saveCampaignTime,
        commitCampaignAtlas,
        readCampaignAsset,
        collectCampaignAssets,
        loadFromDB,
        saveHexesBySectorNum,
        saveHexes,
        replaceWorkingCopy,
        dropOverlayHexes,
        scheduleSyncAll,
        open,
        writeStores,
        readAll,
        getAllKeys,
        getRecord,
        whenWritesSettle,
        holdWrites,
        releaseWrites,
        allowAutosave,
        autosaveBlocked,
        saveRoutes,
        saveRouteDefinitions,
        saveGridDimensions,
        saveAutoRouteCounter,
        saveBorderDefinitions,
        saveBorderAssignments,
        saveBorderPaths,
        saveRegionDefinitions,
        saveRegionPaths,
        saveSectorNames,
        saveSectorReview,
        saveSubsectorNames,
        saveAllegianceDefinitions,
        saveAllegianceAssignments,
        clearDB,
        putBuilt(hexId, record) {
            return _watch(async () => {
                const db = await _openDB();
                const tx = db.transaction(STORE_BUILT, 'readwrite');
                tx.objectStore(STORE_BUILT).put(record, hexId);
                await _done(tx);
            });
        },
        loadBuilt(slot) {
            return (async () => {
                const db = await _openDB();
                return await new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_BUILT, 'readonly');
                    const out = [];
                    const req = tx.objectStore(STORE_BUILT).openCursor();
                    req.onerror = () => reject(req.error);
                    req.onsuccess = () => {
                        const cur = req.result;
                        if (!cur) return;
                        if (String(cur.key).startsWith(String(slot) + '-')) out.push([cur.key, cur.value]);
                        cur.continue();
                    };
                    tx.oncomplete = () => resolve(out);
                });
            })();
        },
        dropBuiltSlots(slots) {
            const prefixes = (slots || []).map(slot => String(slot) + '-');
            return _watch(async () => {
                const db = await _openDB();
                const tx = db.transaction(STORE_BUILT, 'readwrite');
                const store = tx.objectStore(STORE_BUILT);
                const req = store.openCursor();
                req.onsuccess = () => {
                    const cur = req.result;
                    if (!cur) return;
                    if (prefixes.some(prefix => String(cur.key).startsWith(prefix))) cur.delete();
                    cur.continue();
                };
                await _done(tx);
            });
        }
    };

}());
