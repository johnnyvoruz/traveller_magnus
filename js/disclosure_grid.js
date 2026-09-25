// ============================================================================
// DISCLOSURE_GRID.JS - Player Knowledge tray (shortcut: D)
//
// Bulk version of the selected-hex Player Knowledge menu: the same Default /
// independent tags, applied to every shown system (or to the current selection).
// The roster answers "what is every system in this subsector set to?"
// ============================================================================

const DisclosureGrid = (() => {

    const TRAY_ID = 'disclosure-tray';
    let _sortKey = 'hex';
    let _filterText = '';
    let _target = 'shown';
    let _shown = [];
    let _rosterDirty = true;
    let _refreshing = false;
    let _lastScope = null;
    let _bound = false;

    function _tray() { return document.getElementById(TRAY_ID); }
    function isOpen() { return !!(_tray() && !_tray().hidden); }

    function _systemsIn(sectorNum, subChar) {
        const out = [];
        hexStates.forEach((state, hexId) => {
            const p = hexId.split('-');
            if (parseInt(p[0], 10) !== sectorNum) return;
            if (subChar && p[1] !== subChar) return;
            if (!state || state.type === 'EMPTY') return;
            out.push({ hexId, hexCode: p[2], sub: p[1], state });
        });
        return out;
    }

    function _sectorsWithData() {
        const seen = new Map();
        hexStates.forEach((state, hexId) => {
            if (!state || state.type === 'EMPTY') return;
            const n = parseInt(hexId.split('-')[0], 10);
            seen.set(n, (seen.get(n) || 0) + 1);
        });
        return [...seen.keys()].sort((a, b) => a - b);
    }

    function _subsectorsIn(sectorNum) {
        const seen = new Set();
        hexStates.forEach((state, hexId) => {
            const p = hexId.split('-');
            if (parseInt(p[0], 10) === sectorNum && state && state.type !== 'EMPTY') seen.add(p[1]);
        });
        return [...seen].sort();
    }

    function _defaultScope() {
        if (typeof selectedHexes !== 'undefined' && selectedHexes.size) {
            const p = [...selectedHexes][0].split('-');
            return { sector: parseInt(p[0], 10), sub: p[1] };
        }
        const secs = _sectorsWithData();
        if (!secs.length) return { sector: null, sub: null };
        const subs = _subsectorsIn(secs[0]);
        return { sector: secs[0], sub: subs[0] || null };
    }

    function _systemName(state, hexCode) {
        return (typeof ExportCore !== 'undefined')
            ? ExportCore.resolveSystemName(state)
            : (state.name || `System ${hexCode}`);
    }

    function _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _tagLabel(row) {
        if (row.level == null) return 'Default';
        const on = DisclosureModel.LEVELS.filter(l => DisclosureModel.has(row.state, l.id));
        if (!on.length) return 'Default';
        if (on.length === 1 && on[0].id === '0') return 'Unknown';
        return on.map(l => l.name).join(' · ');
    }

    function _fillSectors() {
        const tray = _tray();
        if (!tray) return;
        const sel = tray.querySelector('#dg-sector');
        const cur = sel.value;
        sel.innerHTML = _sectorsWithData().map(n => {
            const nm = (window.sectorNames && window.sectorNames[n]) || `Sector ${n}`;
            return `<option value="${n}">${_esc(nm)}</option>`;
        }).join('');
        if (cur) sel.value = cur;
    }

    function _fillSubs() {
        const tray = _tray();
        if (!tray) return;
        const sel = tray.querySelector('#dg-sub');
        const sector = parseInt(tray.querySelector('#dg-sector').value, 10);
        const cur = sel.value;
        const subs = Number.isNaN(sector) ? [] : _subsectorsIn(sector);
        sel.innerHTML = '<option value="">All subsectors</option>'
            + subs.map(s => `<option value="${s}">${_esc(
                (typeof getSubsectorLabel === 'function') ? getSubsectorLabel(sector, s) : ('Subsector ' + s)
            )}</option>`).join('');
        if (cur && (cur === '' || subs.includes(cur))) sel.value = cur;
    }

    function _rememberScope() {
        const tray = _tray();
        if (!tray) return;
        const sector = parseInt(tray.querySelector('#dg-sector').value, 10);
        if (!isNaN(sector)) _lastScope = { sector, sub: tray.querySelector('#dg-sub').value || null };
    }

    function _collectRows() {
        const tray = _tray();
        if (!tray) { _shown = []; return; }
        const sector = parseInt(tray.querySelector('#dg-sector').value, 10);
        const sub = tray.querySelector('#dg-sub').value || null;
        let rows = Number.isNaN(sector) ? [] : _systemsIn(sector, sub).map(r => ({
            ...r,
            name: _systemName(r.state, r.hexCode),
            level: DisclosureModel.getRaw(r.state),
        }));
        if (_filterText) {
            rows = rows.filter(r =>
                r.name.toLowerCase().includes(_filterText) ||
                r.hexCode.toLowerCase().includes(_filterText));
        }
        rows.sort((a, b) => {
            if (_sortKey === 'name') return a.name.localeCompare(b.name);
            if (_sortKey === 'level') {
                const ak = a.level == null ? '' : a.level.join('');
                const bk = b.level == null ? '' : b.level.join('');
                if (ak !== bk) return ak.localeCompare(bk);
            }
            return a.hexCode.localeCompare(b.hexCode);
        });
        _shown = rows;
    }

    function _selectedHexes() {
        const ids = (typeof currentActionHexes === 'function')
            ? currentActionHexes()
            : [...(typeof selectedHexes !== 'undefined' ? selectedHexes : [])];
        return ids.filter(id => {
            const s = hexStates.get(id);
            return s && s.type !== 'EMPTY';
        });
    }

    function _targetHexes() {
        return _target === 'selected' ? _selectedHexes() : _shown.map(r => r.hexId);
    }

    function _syncTargetButtons() {
        const tray = _tray();
        if (!tray) return;
        const shownBtn = tray.querySelector('#dg-target-shown');
        const selectedBtn = tray.querySelector('#dg-target-selected');
        const selectedCount = _selectedHexes().length;
        shownBtn.textContent = `Shown (${_shown.length})`;
        selectedBtn.textContent = `Selected (${selectedCount})`;
        shownBtn.setAttribute('aria-pressed', String(_target === 'shown'));
        selectedBtn.setAttribute('aria-pressed', String(_target === 'selected'));
        const label = tray.querySelector('#dg-apply-label');
        if (_target === 'selected') {
            label.textContent = selectedCount
                ? `Set for ${selectedCount} selected`
                : 'Set for selected hexes';
        } else {
            label.textContent = _shown.length
                ? `Set for all ${_shown.length} shown`
                : 'Set for all shown';
        }
    }

    function _renderWarn() {
        const warn = _tray()?.querySelector('#dg-warn');
        if (!warn) return;
        const unset = _shown.filter(r => r.level == null).length;
        if (!_shown.length) {
            warn.hidden = true;
            return;
        }
        warn.hidden = false;
        if (unset > 0) {
            warn.className = 'disclosure-warn';
            warn.textContent =
                `${unset} of ${_shown.length} system(s) shown have never been set. `
                + `Unset systems export in FULL to players — they are not hidden.`;
        } else {
            warn.className = 'disclosure-warn clean';
            warn.textContent = `All ${_shown.length} system(s) shown have player knowledge set.`;
        }
    }

    function _renderPanel() {
        const panel = _tray()?.querySelector('#dg-panel');
        if (!panel) return;
        const hexes = _targetHexes();
        if (!hexes.length) {
            panel.classList.remove('is-set');
            panel.replaceChildren();
            const empty = document.createElement('p');
            empty.className = 'player-knowledge-empty';
            empty.textContent = _target === 'selected'
                ? 'Select hexes on the map, or click a system below.'
                : 'No populated systems in this scope.';
            panel.append(empty);
            return;
        }
        window.renderPlayerKnowledgePanel(panel, hexes, {
            hexes: () => _targetHexes(),
            emptyMessage: _target === 'selected'
                ? 'Select hexes, or click a system.'
                : 'No systems in this scope.',
        });
    }

    function _isSelected(hexId) {
        return typeof selectedHexes !== 'undefined' && selectedHexes.has(hexId);
    }

    function _renderRoster() {
        const tray = _tray();
        if (!tray) return;
        tray.querySelectorAll('.disclosure-roster-head [data-sort]').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.sort === _sortKey);
        });
        const body = tray.querySelector('#dg-body');
        if (!_shown.length) {
            body.innerHTML = '<p class="disclosure-roster-empty">No populated systems in this scope.</p>';
            return;
        }
        body.innerHTML = _shown.map(r => {
            const selected = _isSelected(r.hexId) ? ' is-selected' : '';
            const unset = r.level == null ? ' dg-unset' : '';
            return `<button type="button" class="disclosure-row${selected}${unset}" data-hex="${_esc(r.hexId)}">`
                + `<span class="dg-hex">${_esc(r.hexCode)}</span>`
                + `<span class="dg-name">${_esc(r.name)}</span>`
                + `<span class="dg-tags">${_esc(_tagLabel(r))}</span>`
                + `</button>`;
        }).join('');
    }

    function _updateRosterTags() {
        const body = _tray()?.querySelector('#dg-body');
        if (!body) return;
        if (!body.querySelector('.disclosure-row')) {
            _renderRoster();
            return;
        }
        const byId = new Map(_shown.map(r => [r.hexId, r]));
        body.querySelectorAll('.disclosure-row').forEach(row => {
            const r = byId.get(row.dataset.hex);
            if (!r) return;
            row.classList.toggle('dg-unset', r.level == null);
            row.classList.toggle('is-selected', _isSelected(r.hexId));
            const tags = row.querySelector('.dg-tags');
            if (tags) tags.textContent = _tagLabel(r);
        });
    }

    function _syncRowSelection() {
        const body = _tray()?.querySelector('#dg-body');
        if (!body) return;
        body.querySelectorAll('.disclosure-row').forEach(row => {
            row.classList.toggle('is-selected', _isSelected(row.dataset.hex));
        });
    }

    function _selectRow(hexId, additive) {
        if (typeof selectedHexes === 'undefined') return;
        if (!additive) selectedHexes.clear();
        if (additive && selectedHexes.has(hexId)) selectedHexes.delete(hexId);
        else selectedHexes.add(hexId);
        if (typeof centerHexInView === 'function') centerHexInView(hexId);
        requestAnimationFrame(draw);
    }

    function refresh() {
        if (!isOpen() || _refreshing) return;
        _refreshing = true;
        try {
            const list = _tray()?.querySelector('#dg-body');
            const scroll = list ? list.scrollTop : 0;
            _collectRows();
            _renderWarn();
            _syncTargetButtons();
            _renderPanel();
            if (_rosterDirty) {
                _renderRoster();
                _rosterDirty = false;
            } else {
                _updateRosterTags();
            }
            if (list) list.scrollTop = scroll;
        } finally {
            _refreshing = false;
        }
    }

    function syncSelection() {
        if (!isOpen()) return;
        _syncTargetButtons();
        _syncRowSelection();
        if (_target === 'selected') _renderPanel();
    }

    function open() {
        const tray = _tray();
        if (!tray) return;
        if (tray.hidden) {
            if (window.AppNavigation?.toggleTray) window.AppNavigation.toggleTray(TRAY_ID);
            else tray.hidden = false;
        }
        if (tray.hidden) return;
        _filterText = '';
        const search = tray.querySelector('#dg-search');
        if (search) search.value = '';
        _fillSectors();
        const scope = _lastScope || _defaultScope();
        if (scope.sector != null) {
            const ss = tray.querySelector('#dg-sector');
            if ([...ss.options].some(o => o.value === String(scope.sector))) ss.value = String(scope.sector);
        }
        _fillSubs();
        if (scope.sub) {
            const sb = tray.querySelector('#dg-sub');
            if ([...sb.options].some(o => o.value === scope.sub)) sb.value = scope.sub;
        }
        _rosterDirty = true;
        refresh();
    }

    function close() {
        const tray = _tray();
        if (!tray || tray.hidden) return;
        if (window.AppNavigation?.toggleTray) window.AppNavigation.toggleTray(TRAY_ID);
        else tray.hidden = true;
    }

    function toggle() { isOpen() ? close() : open(); }

    function setup() {
        const tray = _tray();
        if (!tray || _bound) return;
        _bound = true;
        tray.querySelector('#dg-sector').addEventListener('change', () => {
            _fillSubs(); _rememberScope(); _rosterDirty = true; refresh();
        });
        tray.querySelector('#dg-sub').addEventListener('change', () => {
            _rememberScope(); _rosterDirty = true; refresh();
        });
        tray.querySelector('#dg-search').addEventListener('input', (e) => {
            _filterText = e.target.value.trim().toLowerCase();
            _rosterDirty = true;
            refresh();
        });
        tray.querySelector('#dg-target-shown').addEventListener('click', () => {
            _target = 'shown';
            _syncTargetButtons();
            _renderPanel();
        });
        tray.querySelector('#dg-target-selected').addEventListener('click', () => {
            _target = 'selected';
            _syncTargetButtons();
            _renderPanel();
        });
        tray.querySelector('.disclosure-roster-head').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-sort]');
            if (!btn) return;
            _sortKey = btn.dataset.sort;
            _rosterDirty = true;
            refresh();
        });
        tray.querySelector('#dg-body').addEventListener('click', (e) => {
            const row = e.target.closest('.disclosure-row');
            if (!row) return;
            _selectRow(row.dataset.hex, e.shiftKey);
        });
        const ctxBtn = document.getElementById('ctx-open-disclosure-grid');
        if (ctxBtn) ctxBtn.addEventListener('click', () => {
            document.getElementById('context-menu')?.classList.remove('visible');
            open();
        });
    }

    return { open, close, toggle, isOpen, setup, refresh, syncSelection };
})();

window.DisclosureGrid = DisclosureGrid;
window.toggleDisclosureGrid = DisclosureGrid.toggle;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', DisclosureGrid.setup);
} else {
    DisclosureGrid.setup();
}
