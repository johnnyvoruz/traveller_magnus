/**
 * Five rotating autosaves and named saves. The working copy is separate and
 * stays current. A slot is a full overlay, gzipped when the browser can.
 */
(function () {
    'use strict';

    const RING = 5;
    let ringNext = 0;
    let bulkDepth = 0;
    const stagedAssets = new Set();

    function metaOf(doc, extra) {
        const sectors = (doc.base && doc.base.sectors) ? doc.base.sectors.length : 0;
        const assetIds = [];
        const atlas = doc.campaignAtlas;
        if (atlas && window.CampaignAssets && window.CampaignAssets.referenced) {
            window.CampaignAssets.referenced(atlas).forEach(id => assetIds.push(id));
        }
        return Object.assign({
            at: new Date().toISOString(),
            label: extra.label,
            trigger: extra.trigger,
            kind: extra.kind,
            n: extra.n,
            bytes: extra.bytes,
            hexCount: Object.keys(doc.hexes || {}).length,
            sectorCount: sectors,
            base: doc.base ? { snapshotVersion: doc.base.snapshotVersion, sectors: doc.base.sectors.length } : null,
            assetIds
        }, extra.id ? { id: extra.id } : {});
    }

    async function encode(doc) {
        const json = JSON.stringify(doc);
        if (typeof CompressionStream === 'function') {
            const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
            const buf = await new Response(stream).arrayBuffer();
            return { blob: buf, encoding: 'gzip', bytes: buf.byteLength };
        }
        const bytes = new TextEncoder().encode(json);
        return { blob: bytes.buffer, encoding: 'json', bytes: bytes.byteLength };
    }

    async function decode(record) {
        if (!record || !record.blob) throw new Error('This save is empty.');
        const encoding = record.encoding || record.meta && record.meta.encoding;
        let text;
        if (encoding === 'gzip' && typeof DecompressionStream === 'function') {
            const stream = new Blob([record.blob]).stream().pipeThrough(new DecompressionStream('gzip'));
            text = await new Response(stream).text();
        } else {
            text = new TextDecoder().decode(record.blob);
        }
        return JSON.parse(text);
    }

    function withProgress(title, work) {
        let shown = false;
        const timer = setTimeout(() => {
            shown = true;
            if (typeof showWorkStatus === 'function') showWorkStatus({ title, detail: 'Working…', fraction: 0.4 });
        }, 300);
        return Promise.resolve().then(work).finally(() => {
            clearTimeout(timer);
            if (shown && typeof hideWorkStatus === 'function') hideWorkStatus();
        });
    }

    async function putSlot(key, doc, meta) {
        const packed = await encode(doc);
        meta.bytes = packed.bytes;
        meta.encoding = packed.encoding;
        await window.dbManager.writeStores(['saves', 'appState'], (stores) => {
            stores.saves.put({ meta, blob: packed.blob, encoding: packed.encoding }, key);
            stores.saves.put(meta, 'meta:' + key);
            stores.appState.put(ringNext, 'autosaveRing');
        });
        return meta;
    }

    function endBulk() {
        if (bulkDepth > 0) bulkDepth--;
    }

    function beforeBulk(label) {
        if (window.dbManager && window.dbManager.autosaveBlocked && window.dbManager.autosaveBlocked()) {
            if (typeof showToast === 'function') showToast('no autosave taken: storage is paused', 4000);
            return Promise.resolve(null);
        }
        if (!window.Overlay || !window.dbManager) return Promise.resolve(null);
        bulkDepth++;
        let doc;
        try { doc = window.Overlay.capture(); }
        catch (err) { bulkDepth--; throw err; }
        const n = ringNext;
        ringNext = (ringNext + 1) % RING;
        const trigger = 'Before: ' + label;
        const meta = metaOf(doc, { kind: 'auto', n, label: trigger, trigger });
        const key = 'auto:' + n;
        return putSlot(key, doc, meta).then(() => {
            if (typeof showToast === 'function') showToast(trigger + ' is in Autosave ' + (n + 1) + '.', 3500);
            return meta;
        }).catch(err => {
            bulkDepth--;
            if (typeof showToast === 'function') showToast('The autosave before this change failed: ' + err.message, 0);
            throw err;
        });
    }

    async function timed() {
        if (bulkDepth > 0) return;
        if (!window.dirtyJournal || !window.dirtyJournal.slotDue()) return;
        if (window.dbManager && window.dbManager.autosaveBlocked && window.dbManager.autosaveBlocked()) return;
        window.dirtyJournal.consumeSlot();
        const doc = window.Overlay.capture();
        const n = ringNext;
        ringNext = (ringNext + 1) % RING;
        const meta = metaOf(doc, { kind: 'auto', n, label: 'Timed', trigger: 'Timed' });
        await putSlot('auto:' + n, doc, meta);
    }

    function nextSlotLabel() {
        return 'Autosave ' + (ringNext + 1);
    }

    async function list() {
        const keys = await window.dbManager.getAllKeys('saves');
        const rows = [];
        const metaKeys = keys.filter(key => String(key).startsWith('meta:'));
        if (metaKeys.length) {
            for (const key of metaKeys) {
                const meta = await window.dbManager.getRecord('saves', key);
                rows.push({ key: String(key).slice(5), meta: meta || {} });
            }
        } else {
            for (const key of keys) {
                const record = await window.dbManager.getRecord('saves', key);
                if (record && record.meta) rows.push({ key, meta: record.meta });
            }
        }
        rows.sort((a, b) => String(b.meta && b.meta.at || '').localeCompare(String(a.meta && a.meta.at || '')));
        return rows;
    }

    async function loadRecord(key) {
        const record = await window.dbManager.getRecord('saves', key);
        if (record && record.blob) return record;
        throw new Error('This save is empty.');
    }

    async function assetIds() {
        const ids = new Set();
        const rows = await list();
        rows.forEach(row => ((row.meta && row.meta.assetIds) || []).forEach(id => ids.add(id)));
        stagedAssets.forEach(id => ids.add(id));
        return ids;
    }

    async function restore(key) {
        const rows = await list();
        const row = rows.find(item => item.key === key);
        if (!row || (row.meta && row.meta.deleted)) throw new Error('That save is no longer here.');
        const label = (row.meta && (row.meta.label || row.meta.trigger)) || 'save';
        const prior = await beforeBulk('Restore ' + label);
        let ok = false;
        try {
            if (window.dbManager && window.dbManager.allowAutosave) window.dbManager.allowAutosave();
            const doc = await decode(await loadRecord(key));
            ok = await window.applyOverlayFile(doc, { quiet: true });
        } finally {
            if (prior) endBulk();
        }
        if (!ok) return;
        const slotNo = prior && Number.isInteger(prior.n) ? prior.n + 1 : ringNext;
        if (typeof showToast === 'function') {
            showToast('Restored ' + label + ' — the state before this is in Autosave ' + slotNo + '.', 6000);
        }
    }

    async function keep(key) {
        const rows = await list();
        const row = rows.find(item => item.key === key);
        if (!row) return;
        const doc = await decode(await loadRecord(key));
        const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        const name = (row.meta && row.meta.trigger) || 'Kept autosave';
        const meta = metaOf(doc, { kind: 'manual', label: name, trigger: name, id });
        await putSlot('manual:' + id, doc, meta);
        if (typeof showToast === 'function') showToast('Kept as “' + name + '”.', 3000);
    }

    async function saveNamed(name) {
        const doc = window.Overlay.capture();
        const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        const meta = metaOf(doc, { kind: 'manual', label: name, trigger: name, id });
        await putSlot('manual:' + id, doc, meta);
        if (typeof showToast === 'function') showToast('Saved “' + name + '”.', 3000);
    }

    async function rename(key, name) {
        await window.dbManager.writeStores(['saves'], stores => {
            const blobReq = stores.saves.get(key);
            blobReq.onsuccess = () => {
                const row = blobReq.result;
                if (!row || !row.meta) return;
                row.meta.label = name;
                stores.saves.put(row, key);
            };
            const metaReq = stores.saves.get('meta:' + key);
            metaReq.onsuccess = () => {
                const meta = metaReq.result;
                if (!meta) return;
                meta.label = name;
                stores.saves.put(meta, 'meta:' + key);
            };
        });
    }

    async function exportSlot(key) {
        const rows = await list();
        const row = rows.find(item => item.key === key);
        if (!row) return;
        const doc = await decode(await loadRecord(key));
        const name = ((row.meta && row.meta.label) || 'overlay').replace(/[^\w.-]+/g, '_');
        const json = JSON.stringify(doc);
        if (typeof triggerDownload === 'function') triggerDownload(json, name + '.json');
    }

    async function removeManual(key) {
        const rows = await list();
        const row = rows.find(item => item.key === key);
        if (!row || !row.meta || row.meta.kind === 'auto') return;
        const name = row.meta.label || 'save';
        row.meta.deleted = true;
        row.meta.deletedAt = Date.now();
        await window.dbManager.writeStores(['saves'], stores => {
            stores.saves.put(row.meta, 'meta:' + key);
            const req = stores.saves.get(key);
            req.onsuccess = () => {
                const blob = req.result;
                if (!blob || !blob.meta) return;
                blob.meta.deleted = true;
                blob.meta.deletedAt = row.meta.deletedAt;
                stores.saves.put(blob, key);
            };
        });
        const toast = document.createElement('div');
        toast.className = 'toast show';
        toast.textContent = 'Deleted ' + name + ' — ';
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.textContent = 'Restore';
        restoreBtn.style.marginLeft = '8px';
        let gone = false;
        const finish = async (putBack) => {
            if (gone) return;
            gone = true;
            toast.remove();
            if (putBack) {
                row.meta.deleted = false;
                await window.dbManager.writeStores(['saves'], stores => {
                    stores.saves.put(row, key);
                    stores.saves.put(row.meta, 'meta:' + key);
                });
            } else {
                await window.dbManager.writeStores(['saves'], stores => {
                    stores.saves.delete(key);
                    stores.saves.delete('meta:' + key);
                });
            }
            void render();
        };
        restoreBtn.addEventListener('click', () => { void finish(true); });
        toast.append(restoreBtn);
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => { void finish(false); }, 10000);
    }

    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    }

    function fmtBytes(n) {
        if (!n && n !== 0) return '';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function fmtTime(iso) {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return iso;
        return date.toLocaleString();
    }

    async function render() {
        const body = document.getElementById('saves-body');
        if (!body) return;
        const rows = await list();
        const autos = rows.filter(row => row.meta && row.meta.kind === 'auto' && !row.meta.deleted);
        const manuals = rows.filter(row => row.meta && row.meta.kind === 'manual' && !row.meta.deleted);
        const base = window.overlayBase;
        const version = base ? (base.snapshotVersion || 'chart') : 'own map';
        const sectors = base && base.sectors ? base.sectors.length : 0;
        let meter = '';
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                if (est && est.quota) {
                    const pct = Math.round((est.usage / est.quota) * 100);
                    meter = '<p class="saves-meter' + (pct >= 80 ? ' saves-warn' : '') + '">Browser storage ' + pct + '% full'
                        + (pct >= 80 ? ' — save a map file and remove old saves.' : '') + '</p>';
                }
            }
        } catch (err) { /* estimate is optional */ }
        const head = '<p class="saves-base">Chart: ' + (base ? (sectors + ' sector' + (sectors === 1 ? '' : 's') + ' · ' + version) : 'none (your own map)') + '</p>' + meter;
        body.innerHTML = head + section('Autosaves', autos, true) + section('Saved games', manuals, false)
            + '<p><button type="button" id="saves-named">Save current map</button> '
            + '<button type="button" id="saves-attach">Attach snapshot</button> '
            + '<button type="button" id="saves-purge">Delete all saves</button></p>';
        body.querySelectorAll('[data-save-action]').forEach(button => {
            button.addEventListener('click', () => {
                const key = button.getAttribute('data-save-key');
                const action = button.getAttribute('data-save-action');
                void runAction(action, key);
            });
        });
        document.getElementById('saves-named').addEventListener('click', async () => {
            const name = prompt('Name this save');
            if (!name) return;
            await withProgress('Saving', () => saveNamed(name.trim()));
            await render();
        });
        document.getElementById('saves-purge').addEventListener('click', async () => {
            await purgeAll();
            await render();
        });
        document.getElementById('saves-attach').addEventListener('click', async () => {
            try {
                const kept = await withProgress('Attach snapshot', () => window.UniverseSnapshot.attach());
                if (typeof showToast === 'function') showToast(kept + ' hexes kept as yours.', 5000);
                if (typeof draw === 'function') requestAnimationFrame(draw);
            } catch (err) {
                if (typeof showToast === 'function') showToast(err.message, 6000);
            }
            await render();
        });
    }

    function section(title, rows, autos) {
        if (!rows.length) return '<h3>' + title + '</h3><p class="saves-empty">None yet.</p>';
        const items = rows.map(row => {
            const meta = row.meta || {};
            const text = esc(fmtTime(meta.at) + ' · ' + (meta.label || meta.trigger || ''))
                + ' · ' + (meta.hexCount || 0) + ' hexes'
                + (meta.sectorCount ? ' · ' + meta.sectorCount + ' sectors' : '')
                + ' · ' + fmtBytes(meta.bytes);
            const key = row.key;
            const buttons = [
                button('Restore', 'restore', key),
                autos ? button('Keep', 'keep', key) : '',
                button('Rename', 'rename', key),
                button('Export file', 'export', key),
                autos ? '' : button('Delete', 'delete', key)
            ].join(' ');
            return '<li><span>' + text + '</span><span class="saves-actions">' + buttons + '</span></li>';
        }).join('');
        return '<h3>' + title + '</h3><ul class="saves-list">' + items + '</ul>';
    }

    function button(label, action, key) {
        return '<button type="button" data-save-action="' + action + '" data-save-key="' + key + '">' + label + '</button>';
    }

    async function runAction(action, key) {
        try {
            if (action === 'restore') await withProgress('Restore', () => restore(key));
            else if (action === 'keep') await withProgress('Keep', () => keep(key));
            else if (action === 'export') await withProgress('Export', () => exportSlot(key));
            else if (action === 'delete') await removeManual(key);
            else if (action === 'rename') {
                const name = prompt('New name');
                if (!name) return;
                await rename(key, name.trim());
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast(err.message, 6000);
        }
        await render();
    }

    async function purgeExpiredDeletes() {
        const rows = await list();
        const now = Date.now();
        const doomed = rows.filter(row => row.meta && row.meta.deleted && now - (row.meta.deletedAt || 0) > 10000);
        if (!doomed.length) return;
        await window.dbManager.writeStores(['saves'], stores => {
            doomed.forEach(row => {
                stores.saves.delete(row.key);
                stores.saves.delete('meta:' + row.key);
            });
        });
    }

    async function purgeAll() {
        if (!confirm('Delete all saves')) return false;
        await window.dbManager.writeStores(['saves', 'appState'], stores => {
            stores.saves.clear();
            stores.appState.put(0, 'autosaveRing');
        });
        ringNext = 0;
        if (typeof showToast === 'function') showToast('All saves deleted.', 3000);
        return true;
    }

    function bind() {
        const buttonEl = document.getElementById('saves-toggle');
        const tray = document.getElementById('saves-tray');
        if (!buttonEl || !tray) return;
        buttonEl.addEventListener('click', async () => {
            if (!tray.hidden) { tray.hidden = true; window.AppNavigation && window.AppNavigation.layout(); return; }
            if (window.AppNavigation && !window.AppNavigation.prepare('saves-tray')) return;
            tray.hidden = false;
            window.AppNavigation && window.AppNavigation.layout();
            await purgeExpiredDeletes();
            await render();
        });
        document.getElementById('saves-close').addEventListener('click', () => {
            tray.hidden = true;
            window.AppNavigation && window.AppNavigation.layout();
        });
        setInterval(() => { void timed().catch(err => console.warn('[Saves] timed', err)); }, 10 * 60 * 1000);
    }

    window.Saves = {
        beforeBulk, endBulk, nextSlotLabel, list, assetIds, restore, keep, saveNamed, render, purgeAll,
        noteRing(n) { if (Number.isInteger(n)) ringNext = n % RING; },
        bulkDepth() { return bulkDepth; }
    };
    document.addEventListener('DOMContentLoaded', bind);
}());
