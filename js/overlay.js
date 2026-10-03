/**
 * Overlay document. The chart (when there is one) stays out of this file.
 * Own maps store every hex here with base: null.
 */
(function () {
    'use strict';

    const HEX_ID = /^[A-Za-z0-9]+-[A-P]-\d{4}$/;
    const OVERLAY_ONLY = ['disclosure', 'notes', 'custom_ui', 'manualBgColor', 'isHiddenByFilter'];

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function entries(map) {
        if (!map || typeof map.entries !== 'function') return [];
        return Array.from(map.entries());
    }

    function stamp(state, id) {
        if (!state || typeof state !== 'object') return state;
        if (state.deleted) return { deleted: true, rev: state.rev || 1, updatedAt: state.updatedAt || new Date().toISOString() };
        const view = (typeof stripHexViewState === 'function') ? stripHexViewState(state) : state;
        const out = view === state ? Object.assign({}, state) : view;
        if (!Number.isInteger(out.rev)) {
            const pending = id && window.dirtyJournal && window.dirtyJournal.pending(id);
            out.rev = (pending && Number.isInteger(pending.rev)) ? pending.rev : 1;
            state.rev = out.rev;
        }
        if (!out.updatedAt) {
            out.updatedAt = new Date().toISOString();
            state.updatedAt = out.updatedAt;
        }
        delete out.isHiddenByFilter;
        return out;
    }

    function hexObject(ids) {
        const hexes = {};
        ids.forEach(id => {
            const state = hexStates.get(id);
            if (state && typeof state === 'object') hexes[id] = stamp(state, id);
            else {
                const pending = window.dirtyJournal && window.dirtyJournal.pending(id);
                hexes[id] = {
                    deleted: true,
                    rev: (pending && pending.rev) || 1,
                    updatedAt: (pending && pending.updatedAt) || new Date().toISOString()
                };
            }
        });
        return hexes;
    }

    function capture() {
        const ids = window.overlayBase ? Array.from(window.overlayHexes) : Array.from(hexStates.keys());
        ids.sort();
        const settings = (typeof window.collectMapSettings === 'function') ? window.collectMapSettings() : {};
        let campaign = {};
        return {
            format: 'asab-overlay',
            schemaVersion: 3,
            appVersion: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '',
            saveId: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
            campaignId: (typeof ensureCampaignId === 'function') ? ensureCampaignId() : (window.overlayCampaignId || ''),
            base: window.overlayBase ? clone(window.overlayBase) : null,
            grid: { width: gridWidth, height: gridHeight },
            hexes: hexObject(ids),
            routes: clone(window.sectorRoutes || []),
            routeDefinitions: clone(window.routeDefinitions || []),
            autoRouteCounter: window.autoRouteCounter || 0,
            borderDefinitions: clone(window.borderDefinitions || []),
            hexBorderAssignments: entries(window.hexBorderAssignments),
            borderPaths: entries(window.borderPaths).map(([id, paths]) => [id, (paths || []).map(path => Object.assign({ sectorNum: path.sectorNum || null }, path))]),
            regionDefinitions: clone(window.regionDefinitions || []),
            regionPaths: entries(window.regionPaths),
            allegianceDefinitions: clone(window.allegianceDefinitions || []),
            hexAllegianceAssignments: entries(window.hexAllegianceAssignments),
            sectorNames: clone(window.sectorNames || {}),
            subsectorNames: clone(window.subsectorNames || {}),
            sectorReview: clone(window.sectorReview || {}),
            settings,
            campaignTime: (window.campaignTime && Number.isFinite(window.campaignTime.days)) ? { days: window.campaignTime.days } : null,
            campaignAtlas: window.campaignAtlas ? clone(window.campaignAtlas) : null,
            campaignAssets: campaign.campaignAssets || undefined
        };
    }

    function emptyLists() {
        return {
            routes: [], routeDefinitions: [], autoRouteCounter: 0,
            borderDefinitions: [], hexBorderAssignments: [], borderPaths: [],
            regionDefinitions: [], regionPaths: [],
            allegianceDefinitions: null, hexAllegianceAssignments: [],
            sectorNames: {}, subsectorNames: {}, sectorReview: {},
            settings: {}, campaignTime: null
        };
    }

    function normalize(parsed) {
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid map backup.');
        if (parsed.format === 'asab-overlay') {
            if (parsed.schemaVersion !== 3) throw new Error('This overlay was written by a newer version of the cartographer.');
            if (!parsed.hexes || typeof parsed.hexes !== 'object' || Array.isArray(parsed.hexes)) throw new Error('Invalid overlay.');
            validateHexes(parsed.hexes);
            return parsed;
        }
        if (parsed.hexStates && typeof parsed.hexStates === 'object' && !Array.isArray(parsed.hexStates)) {
            validateHexes(parsed.hexStates);
            return Object.assign(emptyLists(), {
                format: 'asab-overlay', schemaVersion: 3, appVersion: parsed.version || '',
                saveId: '', campaignId: parsed.campaignId || '',
                base: null,
                grid: { width: parsed.gridWidth || null, height: parsed.gridHeight || null },
                hexes: parsed.hexStates,
                routes: parsed.routes || [],
                routeDefinitions: parsed.routeDefinitions || [],
                autoRouteCounter: parsed.autoRouteCounter || 0,
                borderDefinitions: parsed.borderDefinitions || [],
                hexBorderAssignments: parsed.hexBorderAssignments || [],
                borderPaths: parsed.borderPaths || [],
                regionDefinitions: parsed.regionDefinitions || [],
                regionPaths: parsed.regionPaths || [],
                allegianceDefinitions: parsed.allegianceDefinitions || null,
                hexAllegianceAssignments: parsed.hexAllegianceAssignments || [],
                sectorNames: parsed.sectorNames || {},
                subsectorNames: parsed.subsectorNames || {},
                sectorReview: parsed.sectorReview || {},
                settings: parsed.settings || {},
                campaignTime: parsed.campaignTime || null,
                campaignAtlas: parsed.campaignAtlas,
                campaignAssets: parsed.campaignAssets,
                aesthetics: parsed.aesthetics,
                rules: parsed.rules
            });
        }
        const keys = Object.keys(parsed);
        if (keys.length && keys.every(key => HEX_ID.test(key) || /^[A-Za-z]+-[A-P]-\d{4}$/.test(key))) {
            return Object.assign(emptyLists(), {
                format: 'asab-overlay', schemaVersion: 3, base: null, grid: {},
                hexes: parsed, legacyFlat: true
            });
        }
        throw new Error('Invalid map backup.');
    }

    function validateHexes(hexes) {
        Object.entries(hexes).forEach(([id, state]) => {
            if (!/^[A-Za-z0-9]+-[A-P]-\d{4}$/.test(id) && !/^[A-Za-z]+-[A-P]-\d{4}$/.test(id)) {
                throw new Error('Invalid hex data in map backup.');
            }
            if (!state || typeof state !== 'object') throw new Error('Invalid hex data in map backup.');
        });
    }

    function asFile(doc) {
        const hexes = {};
        Object.entries(doc.hexes || {}).forEach(([id, state]) => {
            if (state && state.deleted) return;
            hexes[id] = state;
        });
        return {
            version: doc.appVersion,
            gridWidth: doc.grid && doc.grid.width,
            gridHeight: doc.grid && doc.grid.height,
            hexStates: hexes,
            routes: doc.routes || [],
            routeDefinitions: doc.routeDefinitions || [],
            autoRouteCounter: doc.autoRouteCounter || 0,
            borderDefinitions: doc.borderDefinitions || [],
            hexBorderAssignments: doc.hexBorderAssignments || [],
            borderPaths: doc.borderPaths || [],
            regionDefinitions: doc.regionDefinitions || [],
            regionPaths: doc.regionPaths || [],
            allegianceDefinitions: doc.allegianceDefinitions || undefined,
            hexAllegianceAssignments: doc.hexAllegianceAssignments || [],
            sectorNames: doc.sectorNames || {},
            subsectorNames: doc.subsectorNames || {},
            sectorReview: doc.sectorReview || {},
            settings: doc.settings || {},
            campaignTime: doc.campaignTime || null,
            campaignAtlas: doc.campaignAtlas,
            campaignAssets: doc.campaignAssets,
            aesthetics: doc.aesthetics,
            rules: doc.rules,
            campaignId: doc.campaignId || ''
        };
    }

    async function mergedHexes(doc) {
        const merged = new Map();
        const overlayIds = new Set();
        const base = doc.base;
        if (base && Array.isArray(base.sectors) && base.sectors.length) {
            if (window.UNIVERSE_INDEX && base.snapshotVersion && window.UNIVERSE_INDEX.snapshotVersion
                && base.snapshotVersion !== window.UNIVERSE_INDEX.snapshotVersion) {
                if (typeof showToast === 'function') {
                    showToast('This map was made against a different chart version. It was loaded anyway.', 8000);
                }
            }
            try {
                for (let i = 0; i < base.sectors.length; i++) {
                    const entry = base.sectors[i];
                    if (typeof showWorkStatus === 'function') {
                        showWorkStatus({
                            title: 'Loading chart',
                            detail: 'Loading ' + entry.name + ' (' + (i + 1) + ' of ' + base.sectors.length + ')',
                            fraction: (i + 1) / base.sectors.length
                        });
                    }
                    const sector = await window.UniverseSnapshot.load(entry.name);
                    if (!sector.tsv || typeof parseT5Tab !== 'function') throw new Error(entry.name + ' has no chart text in the local snapshot.');
                    const rows = parseT5Tab(sector.tsv, String(entry.slot));
                    rows.forEach((state, id) => merged.set(id, clone(state)));
                }
            } finally {
                if (typeof hideWorkStatus === 'function') hideWorkStatus();
            }
        }
        Object.entries(doc.hexes || {}).forEach(([id, state]) => {
            overlayIds.add(id);
            if (state && state.deleted) merged.delete(id);
            else merged.set(id, clone(state));
        });
        return { merged, overlayIds };
    }

    function rememberOverlay(doc, overlayIds) {
        window.overlayBase = doc.base ? clone(doc.base) : null;
        window.overlayCampaignId = doc.campaignId || window.overlayCampaignId || null;
        window.overlayHexes = overlayIds;
        if (typeof window.syncChartBuildButton === 'function') window.syncChartBuildButton();
    }

    window.Overlay = { capture, normalize, asFile, mergedHexes, rememberOverlay, stamp, clone };
}());
