// ============================================================================
// REGIONS.JS - Region Manager UI & Import
// Parallel architecture to borders.js — regions are first-class objects with
// their own slot definitions, window, and direct renderer fill pass.
// state.cluster stores the matching slot name on each hex.
// ============================================================================

const REGION_COLOR_CYCLE = [
    '#e63946','#f4a261','#e9c46a','#2a9d8f','#4cc9f0',
    '#7209b7','#f72585','#06d6a0','#ffffff','#ff6b35',
    '#b5e48c','#0077b6','#9d4edd','#ffbe0b','#d62828',
    '#52b788','#c77dff','#3a86ff','#fb8500','#a8dadc',
];

function getDefaultRegionDefinitions() {
    return Array.from({ length: 5 }, (_, i) => ({
        id:      i + 1,
        name:    `Region ${i + 1}`,
        color:   REGION_COLOR_CYCLE[i],
        visible: true,
    }));
}

window.ensureFreeRegionSlot = function () {
    if (!window.regionDefinitions) window.regionDefinitions = getDefaultRegionDefinitions();
    const hexCounts = new Map();
    hexStates.forEach(state => {
        if (state.cluster && state.cluster !== '----') {
            hexCounts.set(state.cluster, (hexCounts.get(state.cluster) || 0) + 1);
        }
    });
    const free = window.regionDefinitions.find(d =>
        /^Region \d+$/.test(d.name) && !hexCounts.has(d.name)
    );
    if (free) return false;
    const nextId = window.regionDefinitions.length > 0
        ? Math.max(...window.regionDefinitions.map(d => d.id)) + 1 : 1;
    window.regionDefinitions.push({
        id:      nextId,
        name:    `Region ${nextId}`,
        color:   REGION_COLOR_CYCLE[(nextId - 1) % REGION_COLOR_CYCLE.length],
        visible: true,
    });
    return true;
};

// Sort used region slots alphabetically, trim excess free slots to one sentinel,
// then renumber IDs.  Safe because hex assignments use def.name (state.cluster),
// not def.id, and regionPaths is also keyed by name.
window.sortAndTrimRegionDefinitions = function () {
    if (!window.regionDefinitions || window.regionDefinitions.length === 0) return;

    const usedNames = new Set();
    hexStates.forEach(state => {
        if (state.cluster && state.cluster !== '----') usedNames.add(state.cluster);
    });
    const isUsed = d => usedNames.has(d.name);

    window.regionDefinitions.sort((a, b) => {
        const aUsed = isUsed(a);
        const bUsed = isUsed(b);
        if (aUsed !== bUsed) return aUsed ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    // Trim to one free sentinel slot.
    const firstFreeIdx = window.regionDefinitions.findIndex(d => !isUsed(d));
    if (firstFreeIdx !== -1) {
        window.regionDefinitions.splice(firstFreeIdx + 1);
    }

    window.regionDefinitions.forEach((d, i) => { d.id = i + 1; });

    window.ensureFreeRegionSlot();
    if (window.dbManager) window.dbManager.saveRegionDefinitions?.();
};

let _regionSort = 'default';
let _selectedRegionId = null;
let _regionMenuEl = null;
let _regionMenuAnchor = null;

function _regionNameLines(name) {
    const comma = String(name).indexOf(',');
    if (comma < 0) return String(name);
    const rest = name.slice(comma + 1).trim();
    if (!rest) return String(name);
    return name.slice(0, comma + 1) + '\n' + rest;
}

function _regionHexIds(name) {
    const ids = [];
    hexStates.forEach((state, hexId) => {
        if (state.cluster === name) ids.push(hexId);
    });
    return ids;
}

function _orderedRegionDefs(defs, hexCounts) {
    if (_regionSort === 'default') return defs;
    const list = defs.slice();
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    const hexes = name => hexCounts.get(name) || 0;
    if (_regionSort === 'alpha-asc') list.sort((a, b) => byName(a, b) || a.id - b.id);
    else if (_regionSort === 'alpha-desc') list.sort((a, b) => byName(b, a) || a.id - b.id);
    else if (_regionSort === 'hex-desc') list.sort((a, b) => hexes(b.name) - hexes(a.name) || a.id - b.id);
    else if (_regionSort === 'hex-asc') list.sort((a, b) => hexes(a.name) - hexes(b.name) || a.id - b.id);
    return list;
}

function _markRegionRows() {
    document.querySelectorAll('#region-window-list .border-row').forEach(row => {
        row.classList.toggle('is-selected', row.dataset.regionId === String(_selectedRegionId));
    });
}

function _closeRegionMenu() {
    if (_regionMenuAnchor) _regionMenuAnchor.setAttribute('aria-expanded', 'false');
    _regionMenuAnchor = null;
    if (_regionMenuEl) _regionMenuEl.style.display = 'none';
}

function _renameRegion(def, newName) {
    const oldName = def.name;
    if (!newName || newName === oldName) return;
    hexStates.forEach(state => {
        if (state.cluster === oldName) state.cluster = newName;
    });
    if (typeof window.invalidateRegionFillCache === 'function') window.invalidateRegionFillCache();
    if (window.regionPaths) {
        window.regionPaths.forEach((val, key) => {
            if (key.endsWith(':' + oldName)) window.regionPaths.delete(key);
        });
    }
    def.name = newName;
    if (window.dbManager) { window.dbManager.saveRegionDefinitions?.(); window.dbManager.saveRegionPaths?.(); }
    requestAnimationFrame(draw);
    window.renderRegionWindow();
}

function _clearRegion(def) {
    const count = _regionHexIds(def.name).length;
    if (count === 0) { showToast(`"${def.name}" has no hexes to clear.`, 2000); return; }
    if (!confirm(`Clear all ${count} hex assignment(s) for "${def.name}"?`)) return;
    const touched = _regionHexIds(def.name);
    saveHistoryState(`Clear ${def.name}`, { hexIds: touched, regions: true });
    hexStates.forEach(state => {
        if (state.cluster === def.name) state.cluster = '----';
    });
    if (typeof window.invalidateRegionFillCache === 'function') window.invalidateRegionFillCache();
    if (window.regionPaths) {
        window.regionPaths.forEach((val, key) => {
            if (key.endsWith(':' + def.name)) window.regionPaths.delete(key);
        });
    }
    if (window.dbManager) window.dbManager.saveRegionPaths?.();
    requestAnimationFrame(draw);
    window.renderRegionWindow();
    showToast(`Cleared all hexes for "${def.name}".`, 2000);
}

function _deleteRegion(def) {
    const count = _regionHexIds(def.name).length;
    const hexMsg = count > 0 ? `\nThis will also clear its ${count} hex assignment(s).` : '';
    if (!confirm(`Delete region "${def.name}"?${hexMsg}\n\nThis can be undone with Ctrl+Z.`)) return;
    const touched = _regionHexIds(def.name);
    saveHistoryState(`Delete ${def.name}`, { hexIds: touched, regions: true });
    hexStates.forEach(state => {
        if (state.cluster === def.name) state.cluster = '----';
    });
    if (typeof window.invalidateRegionFillCache === 'function') window.invalidateRegionFillCache();
    if (window.regionPaths) {
        window.regionPaths.forEach((val, key) => {
            if (key.endsWith(':' + def.name)) window.regionPaths.delete(key);
        });
    }
    window.regionDefinitions = (window.regionDefinitions || []).filter(d => d.id !== def.id);
    if (String(_selectedRegionId) === String(def.id)) _selectedRegionId = null;
    if (window.dbManager) {
        window.dbManager.saveRegionDefinitions?.();
        window.dbManager.saveRegionPaths?.();
    }
    requestAnimationFrame(draw);
    window.renderRegionWindow();
    showToast(`Deleted region "${def.name}".`, 2000);
}

function _openRegionMenu(def, anchor, hexCount) {
    if (_regionMenuEl && _regionMenuEl.style.display !== 'none' && _regionMenuEl.dataset.regionId === String(def.id)) {
        _closeRegionMenu();
        return;
    }
    if (!_regionMenuEl) {
        const el = document.createElement('div');
        el.id = 'region-more-menu';
        el.className = 'app-menu';
        el.setAttribute('role', 'menu');
        el.style.display = 'none';
        document.body.appendChild(el);
        _regionMenuEl = el;
    }
    const el = _regionMenuEl;
    el.dataset.regionId = String(def.id);
    el.replaceChildren();
    const addItem = (label, opts = {}) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = label;
        if (opts.danger) btn.className = 'danger';
        btn.disabled = !!opts.disabled;
        if (!opts.disabled) btn.addEventListener('click', () => { _closeRegionMenu(); opts.run(); });
        el.appendChild(btn);
    };
    addItem('Rename', { run: () => {
        if (typeof window.openRecordNameModal !== 'function') return;
        window.openRecordNameModal({
            title: 'Rename region',
            value: def.name,
            okLabel: 'Rename',
            onOk: (name) => _renameRegion(def, name)
        });
    } });
    addItem('Clear hexes', { disabled: hexCount === 0, run: () => _clearRegion(def) });
    const sep = document.createElement('div');
    sep.className = 'app-menu-sep';
    el.appendChild(sep);
    addItem('Delete region', { danger: true, run: () => _deleteRegion(def) });
    if (_regionMenuAnchor) _regionMenuAnchor.setAttribute('aria-expanded', 'false');
    _regionMenuAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    el.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth || 180;
    let left = r.right - w;
    let top = r.bottom + 4;
    if (left < 8) left = 8;
    if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - el.offsetHeight - 4);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}

window.addRegionSlot = function (name) {
    if (!window.regionDefinitions) window.regionDefinitions = getDefaultRegionDefinitions();
    saveHistoryState('Add region', { regions: true });
    const nextId = window.regionDefinitions.length
        ? Math.max(...window.regionDefinitions.map(d => d.id)) + 1 : 1;
    const def = {
        id: nextId,
        name: (name && String(name).trim()) || `Region ${nextId}`,
        color: REGION_COLOR_CYCLE[(nextId - 1) % REGION_COLOR_CYCLE.length],
        visible: true
    };
    window.regionDefinitions.push(def);
    if (window.dbManager) window.dbManager.saveRegionDefinitions?.();
    _selectedRegionId = nextId;
    window.renderRegionWindow();
    const row = document.querySelector(`#region-window-list .border-row[data-region-id="${nextId}"]`);
    if (row) row.scrollIntoView({ block: 'end' });
    showToast(`Added "${def.name}".`, 2200);
    return nextId;
};

// ── Render the Region Manager window list ─────────────────────────────────────
window.renderRegionWindow = function () {
    const list = document.getElementById('region-window-list');
    if (!list) return;
    list.innerHTML = '';
    _closeRegionMenu();

    if (!window.regionDefinitions) window.regionDefinitions = getDefaultRegionDefinitions();

    // Count hexes per region by scanning state.cluster
    const hexCounts = new Map();
    hexStates.forEach(state => {
        if (state.cluster && state.cluster !== '----') {
            hexCounts.set(state.cluster, (hexCounts.get(state.cluster) || 0) + 1);
        }
    });

    _orderedRegionDefs(window.regionDefinitions, hexCounts).forEach(def => {
        const hexCount = hexCounts.get(def.name) || 0;
        const hexClass = hexCount > 0 ? 'used' : 'free';
        const hexLabel = hexCount > 0 ? String(hexCount) : '—';
        const safeName = def.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const selected = String(_selectedRegionId) === String(def.id);

        const row = document.createElement('div');
        row.className = 'border-row route-row' + (def.visible ? '' : ' is-hidden') + (selected ? ' is-selected' : '');
        row.dataset.regionId = def.id;
        row.innerHTML = `
            <button type="button" class="route-eye" aria-label="${def.visible ? 'Hide' : 'Show'} ${safeName}" title="${def.visible ? 'Hide region' : 'Show region'}">
                <i class="fas fa-eye${def.visible ? '' : '-slash'} route-eye-btn region-eye-btn${def.visible ? ' is-on' : ''}"></i>
            </button>
            <input type="color" class="route-color-swatch" value="${def.color}" title="Region color" aria-label="Region color">
            <div class="route-name"></div>
            <button type="button" class="route-seg-count border-hex-count ${hexClass}"${hexCount > 0 ? '' : ' disabled'} title="${hexCount > 0 ? hexCount + ' hex(es) — click to frame them on the map' : 'No hexes'}">${hexLabel}</button>
            <button type="button" class="app-btn icon small region-more-btn" aria-label="More actions for ${safeName}" aria-haspopup="menu" aria-expanded="false" title="More"><i class="fas fa-ellipsis-vertical" aria-hidden="true"></i></button>
        `;
        row.querySelector('.route-name').textContent = _regionNameLines(def.name);

        const colorIn = row.querySelector('input[type="color"]');
        const eyeBtn = row.querySelector('.region-eye-btn');
        const eyeWrap = row.querySelector('.route-eye');
        row.addEventListener('click', (e) => {
            if (e.target.closest('.route-eye, .border-hex-count, .region-more-btn, .route-color-swatch')) return;
            _selectedRegionId = def.id;
            _markRegionRows();
        });
        colorIn.addEventListener('input', () => {
            def.color = colorIn.value;
            if (window.dbManager) window.dbManager.saveRegionDefinitions?.();
            requestAnimationFrame(draw);
        });
        eyeWrap.addEventListener('click', () => {
            def.visible = !def.visible;
            eyeBtn.classList.toggle('fa-eye', def.visible);
            eyeBtn.classList.toggle('fa-eye-slash', !def.visible);
            eyeBtn.classList.toggle('is-on', def.visible);
            eyeWrap.title = def.visible ? 'Hide region' : 'Show region';
            row.classList.toggle('is-hidden', !def.visible);
            if (window.dbManager) window.dbManager.saveRegionDefinitions?.();
            const allCb = document.getElementById('region-vis-all-check');
            if (allCb) {
                const defs2 = window.regionDefinitions || [];
                const vis2 = defs2.filter(d => d.visible).length;
                allCb.indeterminate = vis2 > 0 && vis2 < defs2.length;
                allCb.checked = vis2 === defs2.length;
            }
            requestAnimationFrame(draw);
        });
        const pill = row.querySelector('.border-hex-count');
        if (pill && hexCount > 0) {
            pill.addEventListener('click', () => {
                const ids = _regionHexIds(def.name);
                if (typeof fitHexesInView === 'function') fitHexesInView(ids);
            });
        }
        row.querySelector('.region-more-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            _openRegionMenu(def, e.currentTarget, hexCount);
        });
        list.appendChild(row);
    });

    if (typeof window.populateFilterRegionDropdown === 'function') window.populateFilterRegionDropdown();

    // Sync the "Show All" header checkbox to the current visibility state.
    const visAllCb = document.getElementById('region-vis-all-check');
    if (visAllCb) {
        const defs = window.regionDefinitions || [];
        const visCount = defs.filter(d => d.visible).length;
        visAllCb.indeterminate = visCount > 0 && visCount < defs.length;
        visAllCb.checked       = visCount === defs.length;
    }
};

// ── Toggle / close ────────────────────────────────────────────────────────────
window.toggleRegionWindow = function () {
    const win = document.getElementById('region-window');
    if (!win) return;
    if (win.classList.contains('visible')) {
        window.closeRegionWindow();
    } else {
        window.renderRegionWindow();
        win.classList.add('visible');
    }
};

window.closeRegionWindow = function () {
    const win = document.getElementById('region-window');
    if (win) win.classList.remove('visible');
};

// ── Refresh hex-count pills without full re-render ────────────────────────────
window.refreshRegionWindowCounts = function () {
    const win = document.getElementById('region-window');
    if (!win || !win.classList.contains('visible')) return;

    const hexCounts = new Map();
    hexStates.forEach(state => {
        if (state.cluster && state.cluster !== '----') {
            hexCounts.set(state.cluster, (hexCounts.get(state.cluster) || 0) + 1);
        }
    });

    document.querySelectorAll('#region-window-list .border-row').forEach(row => {
        const regionId = parseInt(row.dataset.regionId, 10);
        const def = (window.regionDefinitions || []).find(d => d.id === regionId);
        if (!def) return;
        const pill = row.querySelector('.border-hex-count');
        if (!pill) return;
        const count = hexCounts.get(def.name) || 0;
        pill.className   = `route-seg-count border-hex-count ${count > 0 ? 'used' : 'free'}`;
        pill.disabled    = count === 0;
        pill.textContent = count > 0 ? String(count) : '—';
        pill.title       = count > 0 ? `${count} hex(es) — click to frame them on the map` : 'No hexes';
    });
};

// ── Assign-modal: open (called from right-click context menu) ─────────────────
window.openAssignRegionModal = function () {
    document.getElementById('context-menu').classList.remove('visible');
    const count = currentActionHexes().length;
    if (count === 0) { showToast('No hexes selected.', 2000); return; }

    document.getElementById('region-assign-modal-count').textContent = count;

    const grid = document.getElementById('region-assign-grid');
    grid.innerHTML = '';

    // "Clear Region" option at the top of the list
    const clearBtn = document.createElement('button');
    clearBtn.className = 'border-assign-btn';
    clearBtn.style.color       = '#888888';
    clearBtn.style.borderColor = '#888888';
    clearBtn.innerHTML = `<span class="border-assign-num">✕</span>`
                       + `<span class="border-assign-name">Clear Region</span>`;
    clearBtn.addEventListener('click', () => {
        const hexList = currentActionHexes();
        saveHistoryState('Clear Region', { hexIds: hexList });
        hexList.forEach(hexId => {
            const s = hexStates.get(hexId);
            if (!s) return;
            s.cluster = '----';
        });
        if (typeof window.invalidateRegionFillCache === 'function') window.invalidateRegionFillCache();
        document.getElementById('region-assign-modal').style.display = 'none';
        window.renderRegionWindow();
        requestAnimationFrame(draw);
        showToast(`Region cleared for ${hexList.length} hex(es).`, 2500);
    });
    grid.appendChild(clearBtn);

    (window.regionDefinitions || getDefaultRegionDefinitions()).forEach(def => {
        const btn = document.createElement('button');
        btn.className = 'border-assign-btn';
        btn.style.color       = def.color;
        btn.style.borderColor = def.color;
        btn.innerHTML = `<span class="border-assign-num">#${def.id}</span>`
                      + `<span class="border-assign-name">${def.name}</span>`;
        btn.addEventListener('click', () => window.confirmAssignRegion(def.id));
        grid.appendChild(btn);
    });

    document.getElementById('region-assign-modal').style.display = 'flex';
};

// ── Assign-modal: confirm selection ──────────────────────────────────────────
window.confirmAssignRegion = function (regionId, hexList = currentActionHexes()) {
    const def = (window.regionDefinitions || []).find(d => d.id === regionId);
    if (!def) return;
    if (!hexList.length) { showToast('No hexes selected.', 2000); return; }
    saveHistoryState('Assign Region', { hexIds: hexList, regions: true });

    hexList.forEach(hexId => {
        let s = hexStates.get(hexId);
        if (!s) { s = { type: 'BLANK' }; hexStates.set(hexId, s); }
        if (window.regionPaths) {
            const sn = parseInt(hexId.split('-')[0], 10);
            if (s.cluster && s.cluster !== '----') window.regionPaths.delete(`${sn}:${s.cluster}`);
            window.regionPaths.delete(`${sn}:${def.name}`);
        }
        s.cluster = def.name;
    });
    if (typeof window.invalidateRegionFillCache === 'function') window.invalidateRegionFillCache();

    document.getElementById('region-assign-modal').style.display = 'none';
    window.ensureFreeRegionSlot();
    window.renderRegionWindow();
    if (window.dbManager) window.dbManager.saveRegionDefinitions?.();
    requestAnimationFrame(draw);
    showToast(`${hexList.length} hex(es) assigned to "${def.name}".`, 2500);
};

// ── Populate the hex-editor region dropdown ───────────────────────────────────
window.populateRegionDropdown = function (currentCluster) {
    const sel = document.getElementById('edit-region');
    if (!sel) return;
    sel.innerHTML = '<option value="----">— None —</option>';
    (window.regionDefinitions || getDefaultRegionDefinitions()).forEach(def => {
        const opt = document.createElement('option');
        opt.value       = def.name;
        opt.textContent = def.name;
        sel.appendChild(opt);
    });
    const val = (!currentCluster || currentCluster === '----') ? '----' : currentCluster;
    sel.value = val;
    // If value doesn't match any option (legacy free-text), add it as a temporary option
    if (sel.value !== val) {
        const opt = document.createElement('option');
        opt.value       = val;
        opt.textContent = val + ' (unassigned)';
        sel.insertBefore(opt, sel.children[1]);
        sel.value = val;
    }
};

// ── Wire up event listeners ───────────────────────────────────────────────────
function setupRegionWindow() {
    const addBtn = document.getElementById('btn-region-add');
    if (addBtn) addBtn.addEventListener('click', () => {
        if (typeof window.openRecordNameModal !== 'function') return;
        window.openRecordNameModal({
            title: 'New region',
            value: '',
            placeholder: 'Region name',
            okLabel: 'Add region',
            onOk: (name) => window.addRegionSlot(name)
        });
    });
    const sortSel = document.getElementById('region-sort');
    if (sortSel) sortSel.addEventListener('change', () => {
        _regionSort = sortSel.value;
        window.renderRegionWindow();
    });
    document.addEventListener('mousedown', (e) => {
        if (_regionMenuEl && _regionMenuEl.style.display !== 'none'
            && !_regionMenuEl.contains(e.target)
            && !(e.target.closest && e.target.closest('.region-more-btn'))) {
            _closeRegionMenu();
        }
    });

    const closeBtn = document.getElementById('btn-close-region-window');
    if (closeBtn) closeBtn.addEventListener('click', window.closeRegionWindow);

    const closeBtnFooter = document.getElementById('btn-close-region-window-footer');
    if (closeBtnFooter) closeBtnFooter.addEventListener('click', window.closeRegionWindow);

    const ctxOpenBtn = document.getElementById('ctx-open-region-window');
    if (ctxOpenBtn) {
        ctxOpenBtn.addEventListener('click', () => {
            document.getElementById('context-menu').classList.remove('visible');
            window.toggleRegionWindow();
        });
    }

    // Right-click "Assign Region" now opens the slot-grid modal
    const ctxAssignBtn = document.getElementById('ctx-assign-region');
    if (ctxAssignBtn) {
        // Remove the old listener by cloning and replacing the node
        const fresh = ctxAssignBtn.cloneNode(true);
        ctxAssignBtn.parentNode.replaceChild(fresh, ctxAssignBtn);
        fresh.addEventListener('click', window.openAssignRegionModal);
    }

    const cancelBtn = document.getElementById('btn-region-assign-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        document.getElementById('region-assign-modal').style.display = 'none';
    });

    const visAllCb = document.getElementById('region-vis-all-check');
    if (visAllCb) {
        visAllCb.addEventListener('change', () => {
            const show = visAllCb.checked;
            (window.regionDefinitions || []).forEach(def => { def.visible = show; });
            if (window.dbManager) window.dbManager.saveRegionDefinitions?.();
            document.querySelectorAll('#region-window-list .border-row').forEach(row => {
                const regionId = parseInt(row.dataset.regionId, 10);
                const d = (window.regionDefinitions || []).find(x => x.id === regionId);
                if (!d) return;
                const eye = row.querySelector('.region-eye-btn');
                const wrap = row.querySelector('.route-eye');
                if (eye) {
                    eye.classList.toggle('fa-eye', show);
                    eye.classList.toggle('fa-eye-slash', !show);
                    eye.classList.toggle('is-on', show);
                }
                if (wrap) wrap.title = show ? 'Hide region' : 'Show region';
                row.classList.toggle('is-hidden', !show);
            });
            visAllCb.indeterminate = false;
            requestAnimationFrame(draw);
        });
    }

    if (!window.regionDefinitions) window.regionDefinitions = getDefaultRegionDefinitions();
    if (!window.regionPaths)       window.regionPaths       = new Map();
}
