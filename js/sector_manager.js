// ============================================================================
// SECTOR_MANAGER.JS - Spreadsheet of sectors.
// Columns are letters, rows are numbers. Right-click a header to insert or
// delete. Hex IDs encode slot as sY * gridWidth + sX + 1.
// ============================================================================

function _columnLetter(index) {
    let n = index + 1;
    let out = '';
    while (n > 0) {
        n -= 1;
        out = String.fromCharCode(65 + (n % 26)) + out;
        n = Math.floor(n / 26);
    }
    return out;
}

function _fitSectorName(el) {
    if (!el || el.clientWidth <= 0) return;
    // The card stretches the field, so a plain scrollHeight read is the card
    // height. Collapse it first, then shrink the type if one word still overflows.
    el.style.flex = '0 0 auto';
    el.style.height = '0px';
    el.style.fontSize = '';
    if (el.scrollWidth > el.clientWidth + 1) {
        const fitted = Math.max(8, 12 * (el.clientWidth - 1) / el.scrollWidth);
        el.style.fontSize = (Math.floor(fitted * 10) / 10) + 'px';
        if (el.scrollWidth > el.clientWidth + 1) {
            const again = Math.max(7, parseFloat(el.style.fontSize) * (el.clientWidth - 1) / el.scrollWidth);
            el.style.fontSize = (Math.floor(again * 10) / 10) + 'px';
        }
    }
    el.style.height = Math.max(28, el.scrollHeight) + 'px';
    el.style.flex = '';
}

// The full phrase ("439 systems") stays when the card has room. A 16-column
// row is narrower than that phrase, so the card shows the number alone.
function _fitSectorCount(count) {
    if (!count || !count.dataset.full || count.clientWidth <= 0) return;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;';
    probe.style.font = getComputedStyle(count).font;
    probe.textContent = count.dataset.full;
    document.body.appendChild(probe);
    const fullW = probe.getBoundingClientRect().width;
    probe.remove();
    const want = fullW > count.clientWidth + 1 ? count.dataset.short : count.dataset.full;
    if (count.textContent !== want) count.textContent = want;
}

let _sectorFitObserver = null;
function _fitSectorSheet() {
    const grid = document.getElementById('sector-window-grid');
    if (!grid) return;
    if (_sectorFitObserver) _sectorFitObserver.unobserve(grid);
    grid.querySelectorAll('.sector-tile-name').forEach(_fitSectorName);
    grid.querySelectorAll('.sector-tile-count').forEach(_fitSectorCount);
    if (_sectorFitObserver) _sectorFitObserver.observe(grid);
}
function _ensureSectorFitObserver() {
    const grid = document.getElementById('sector-window-grid');
    if (!grid || _sectorFitObserver || typeof ResizeObserver === 'undefined') return;
    _sectorFitObserver = new ResizeObserver(() => _fitSectorSheet());
    _sectorFitObserver.observe(grid);
}

let _sheetMenuEl = null;
function _openSheetMenu(x, y, items) {
    if (!_sheetMenuEl) {
        const el = document.createElement('div');
        el.id = 'sector-sheet-menu';
        el.className = 'app-menu';
        el.setAttribute('role', 'menu');
        el.style.display = 'none';
        document.body.appendChild(el);
        document.addEventListener('mousedown', (e) => {
            if (_sheetMenuEl && _sheetMenuEl.style.display !== 'none' && !_sheetMenuEl.contains(e.target)) {
                _sheetMenuEl.style.display = 'none';
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && _sheetMenuEl) _sheetMenuEl.style.display = 'none';
        });
        _sheetMenuEl = el;
    }
    const el = _sheetMenuEl;
    el.replaceChildren();
    items.forEach(item => {
        if (item.sep) {
            const sep = document.createElement('div');
            sep.className = 'app-menu-sep';
            el.appendChild(sep);
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.textContent = item.label;
        if (item.danger) btn.className = 'danger';
        btn.disabled = !!item.disabled;
        if (!item.disabled) btn.addEventListener('click', () => { el.style.display = 'none'; item.run(); });
        el.appendChild(btn);
    });
    el.style.display = 'block';
    const w = el.offsetWidth || 200;
    const h = el.offsetHeight || 120;
    el.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
}

window.renderSectorWindow = function () {
    const grid = document.getElementById('sector-window-grid');
    const sizeEl = document.getElementById('sector-window-size');
    if (!grid) return;

    const worldCounts = new Map();
    hexStates.forEach((state, hexId) => {
        if (!state || state.type !== 'SYSTEM_PRESENT') return;
        const slot = parseInt(hexId.split('-')[0], 10);
        if (!Number.isFinite(slot)) return;
        worldCounts.set(slot, (worldCounts.get(slot) || 0) + 1);
    });

    grid.style.setProperty('--sector-cols', String(gridWidth));
    grid.style.setProperty('--sector-rows', String(gridHeight));
    grid.replaceChildren();

    const corner = document.createElement('div');
    corner.className = 'sector-sheet-corner';
    corner.textContent = `${gridWidth}×${gridHeight}`;
    corner.title = `${gridWidth} columns × ${gridHeight} rows`;
    grid.appendChild(corner);

    for (let sX = 0; sX < gridWidth; sX++) {
        const col = document.createElement('button');
        col.type = 'button';
        col.className = 'sector-sheet-col';
        col.textContent = _columnLetter(sX);
        col.title = 'Right-click to insert or delete this column';
        col.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const letter = _columnLetter(sX);
            _openSheetMenu(e.clientX, e.clientY, [
                { label: 'Insert column before', disabled: gridWidth >= MAX_GRID_WIDTH, run: () => insertSectorColumn(sX) },
                { label: 'Insert column after', disabled: gridWidth >= MAX_GRID_WIDTH, run: () => insertSectorColumn(sX + 1) },
                { sep: true },
                { label: `Delete column ${letter}`, danger: true, disabled: gridWidth <= 1, run: () => removeSectorColumn(sX) }
            ]);
        });
        grid.appendChild(col);
    }

    for (let sY = 0; sY < gridHeight; sY++) {
        const rowHead = document.createElement('button');
        rowHead.type = 'button';
        rowHead.className = 'sector-sheet-row';
        rowHead.textContent = String(sY + 1);
        rowHead.title = 'Right-click to insert or delete this row';
        rowHead.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            _openSheetMenu(e.clientX, e.clientY, [
                { label: 'Insert row above', disabled: gridHeight >= MAX_GRID_HEIGHT, run: () => insertSectorRow(sY) },
                { label: 'Insert row below', disabled: gridHeight >= MAX_GRID_HEIGHT, run: () => insertSectorRow(sY + 1) },
                { sep: true },
                { label: `Delete row ${sY + 1}`, danger: true, disabled: gridHeight <= 1, run: () => removeSectorRow(sY) }
            ]);
        });
        grid.appendChild(rowHead);

        for (let sX = 0; sX < gridWidth; sX++) {
            const sectorNum = sY * gridWidth + sX + 1;
            const addr = _columnLetter(sX) + (sY + 1);
            const name = (window.sectorNames && window.sectorNames[sectorNum]) || '';
            const worlds = worldCounts.get(sectorNum) || 0;
            const tile = document.createElement('div');
            tile.className = 'sector-tile' + (worlds ? ' has-worlds' : '');
            tile.dataset.sector = String(sectorNum);

            const head = document.createElement('div');
            head.className = 'sector-tile-head';
            const idEl = document.createElement('span');
            idEl.className = 'sector-tile-id';
            idEl.textContent = String(sectorNum);
            idEl.title = 'Sector id';
            const addrEl = document.createElement('span');
            addrEl.className = 'sector-tile-addr';
            addrEl.textContent = `(${addr})`;
            const goBtn = document.createElement('button');
            goBtn.type = 'button';
            goBtn.className = 'sector-tile-go';
            goBtn.title = 'Go to this sector on the map';
            goBtn.innerHTML = '<i class="fas fa-location-crosshairs" aria-hidden="true"></i>';
            goBtn.addEventListener('click', () => {
                centerSectorInView(sectorNum);
                requestAnimationFrame(draw);
            });
            head.append(idEl, addrEl, goBtn);

            const nameIn = document.createElement('textarea');
            nameIn.className = 'sector-tile-name';
            nameIn.rows = 1;
            nameIn.value = name;
            nameIn.placeholder = `Sector ${sectorNum}`;
            nameIn.setAttribute('aria-label', `Name for sector ${addr}`);
            nameIn.title = name;
            nameIn.addEventListener('input', () => _fitSectorName(nameIn));
            nameIn.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                nameIn.blur();
            });
            nameIn.addEventListener('change', () => {
                const val = nameIn.value.replace(/\s+/g, ' ').trim();
                nameIn.value = val;
                _fitSectorName(nameIn);
                if (val) window.sectorNames[sectorNum] = val;
                else delete window.sectorNames[sectorNum];
                if (window.dbManager) window.dbManager.saveSectorNames?.();
                requestAnimationFrame(draw);
            });

            const meta = document.createElement('div');
            meta.className = 'sector-tile-meta';
            const reviewTags = window.sectorReview && window.sectorReview[sectorNum];
            const review = reviewTags && typeof window.describeSectorReview === 'function'
                ? window.describeSectorReview(reviewTags) : null;
            const left = document.createElement('span');
            left.style.cssText = 'display:flex; align-items:center; justify-content:center; gap:6px; min-width:0; flex:1 1 auto; overflow:hidden;';
            if (review) {
                const pill = document.createElement('span');
                pill.className = 'sector-review sector-review-' + review.tone;
                pill.textContent = review.label;
                pill.title = review.title;
                left.append(pill);
            }
            const count = document.createElement('span');
            count.className = 'sector-tile-count';
            const fullCount = worlds ? `${worlds} system${worlds === 1 ? '' : 's'}` : 'Empty';
            count.dataset.full = fullCount;
            count.dataset.short = worlds ? String(worlds) : 'Empty';
            count.title = fullCount;
            count.textContent = fullCount;
            left.append(count);
            meta.append(left);
            if (worlds || countHexesInSlots([sectorNum]) > 0) {
                const clearBtn = document.createElement('button');
                clearBtn.type = 'button';
                clearBtn.className = 'sector-tile-clear';
                clearBtn.textContent = 'Clear';
                clearBtn.title = 'Remove all hex data in this sector';
                clearBtn.addEventListener('click', () => window.clearSectorSlot(sectorNum));
                meta.append(clearBtn);
            }

            const nameWrap = document.createElement('div');
            nameWrap.className = 'sector-tile-name-wrap';
            nameWrap.appendChild(nameIn);
            tile.append(head, nameWrap, meta);
            grid.appendChild(tile);
            _fitSectorName(nameIn);
        }
    }
    _ensureSectorFitObserver();
    requestAnimationFrame(_fitSectorSheet);

    if (sizeEl) sizeEl.textContent = `${gridWidth} × ${gridHeight} sectors`;
};

window.toggleSectorWindow = function () {
    const win = document.getElementById('sector-window');
    if (!win) return;
    if (win.classList.contains('visible')) {
        window.closeSectorWindow();
    } else {
        window.renderSectorWindow();
        win.classList.add('visible');
    }
};

window.closeSectorWindow = function () {
    const win = document.getElementById('sector-window');
    if (win) win.classList.remove('visible');
};

window.clearSectorSlot = async function (sectorNum) {
    const n = parseInt(sectorNum, 10);
    if (!Number.isFinite(n) || n < 1) return;
    const worlds = countSystemsInSlots([n]);
    const hexes = countHexesInSlots([n]);
    const label = (window.sectorNames && window.sectorNames[n]) || `Sector ${n}`;
    if (!hexes && !worlds) {
        showToast(`${label} is already empty.`, 2000);
        return;
    }
    const extra = worlds ? ` ${worlds} system${worlds === 1 ? '' : 's'} will be deleted.` : '';
    const slot = window.Saves ? window.Saves.nextSlotLabel() : 'the next autosave';
    if (!confirm(`Clear ${label}?${extra}\n\nThe current map will be kept in ${slot}.`)) return;
    let gridSlot = null;
    if (window.Saves) gridSlot = await window.Saves.beforeBulk('Clear ' + label);
    try {
    purgeSectorSlots([n]);
    if (window.dbManager) window.dbManager.scheduleSyncAll?.();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Cleared ${label}.`, 2500);
    } finally {
        if (gridSlot && window.Saves && window.Saves.endBulk) window.Saves.endBulk();
    }
};

function _shiftColumn(oldW, atX, delta) {
    remapSectorSlots(oldW, oldSlot => {
        const sX = (oldSlot - 1) % oldW;
        const sY = Math.floor((oldSlot - 1) / oldW);
        if (delta < 0 && sX === atX) return null;
        const nextX = delta > 0 ? (sX >= atX ? sX + 1 : sX) : (sX > atX ? sX - 1 : sX);
        return sY * (oldW + delta) + nextX + 1;
    });
}

function _shiftRow(atY, delta) {
    const w = gridWidth;
    remapSectorSlots(w, oldSlot => {
        const sX = (oldSlot - 1) % w;
        const sY = Math.floor((oldSlot - 1) / w);
        if (delta < 0 && sY === atY) return null;
        const nextY = delta > 0 ? (sY >= atY ? sY + 1 : sY) : (sY > atY ? sY - 1 : sY);
        return nextY * w + sX + 1;
    });
}

async function insertSectorColumn(atX) {
    if (gridWidth >= MAX_GRID_WIDTH) {
        showToast(`Column limit is ${MAX_GRID_WIDTH}.`, 2500);
        return;
    }
    let gridSlot = null;
    if (window.Saves) gridSlot = await window.Saves.beforeBulk('Insert column ' + _columnLetter(atX));
    try {
    const oldW = gridWidth;
    _shiftColumn(oldW, atX, 1);
    gridWidth = oldW + 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Inserted column ${_columnLetter(atX)}.`, 3000);
    } finally {
        if (gridSlot && window.Saves && window.Saves.endBulk) window.Saves.endBulk();
    }
}

async function insertSectorRow(atY) {
    if (gridHeight >= MAX_GRID_HEIGHT) {
        showToast(`Row limit is ${MAX_GRID_HEIGHT}.`, 2500);
        return;
    }
    let gridSlot = null;
    if (window.Saves) gridSlot = await window.Saves.beforeBulk('Insert row ' + (atY + 1));
    try {
    _shiftRow(atY, 1);
    gridHeight += 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Inserted row ${atY + 1}.`, 3000);
    } finally {
        if (gridSlot && window.Saves && window.Saves.endBulk) window.Saves.endBulk();
    }
}

window.addSectorColumn = function () { insertSectorColumn(gridWidth); };
window.addSectorRow = function () { insertSectorRow(gridHeight); };

window.removeSectorColumn = async function (atX) {
    const index = Number.isFinite(atX) ? atX : gridWidth - 1;
    if (gridWidth <= 1) {
        showToast('The map needs at least one column.', 2000);
        return;
    }
    const slots = [];
    for (let sY = 0; sY < gridHeight; sY++) slots.push(sY * gridWidth + index + 1);
    const worlds = countSystemsInSlots(slots);
    const hexes = countHexesInSlots(slots);
    const letter = _columnLetter(index);
    let gridSlot = null;
    if (worlds || hexes) {
        const msg = worlds
            ? `Delete column ${letter}? ${worlds} system${worlds === 1 ? '' : 's'} will be deleted.\n\nThe current map will be kept in an autosave.`
            : `Delete column ${letter}? Hex data in that column will be deleted.\n\nThe current map will be kept in an autosave.`;
        if (!confirm(msg)) return;
        if (window.Saves) gridSlot = await window.Saves.beforeBulk('Delete column ' + letter);
        purgeSectorSlots(slots);
    }
    const oldW = gridWidth;
    _shiftColumn(oldW, index, -1);
    gridWidth = oldW - 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Deleted column ${letter}.`, 3000);
    if (gridSlot && window.Saves && window.Saves.endBulk) window.Saves.endBulk();
};

window.removeSectorRow = async function (atY) {
    const index = Number.isFinite(atY) ? atY : gridHeight - 1;
    if (gridHeight <= 1) {
        showToast('The map needs at least one row.', 2000);
        return;
    }
    const slots = [];
    for (let sX = 0; sX < gridWidth; sX++) slots.push(index * gridWidth + sX + 1);
    const worlds = countSystemsInSlots(slots);
    const hexes = countHexesInSlots(slots);
    let gridSlot = null;
    if (worlds || hexes) {
        const msg = worlds
            ? `Delete row ${index + 1}? ${worlds} system${worlds === 1 ? '' : 's'} will be deleted.\n\nThe current map will be kept in an autosave.`
            : `Delete row ${index + 1}? Hex data in that row will be deleted.\n\nThe current map will be kept in an autosave.`;
        if (!confirm(msg)) return;
        if (window.Saves) gridSlot = await window.Saves.beforeBulk('Delete row ' + (index + 1));
        purgeSectorSlots(slots);
    }
    _shiftRow(index, -1);
    gridHeight -= 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Deleted row ${index + 1}.`, 3000);
    if (gridSlot && window.Saves && window.Saves.endBulk) window.Saves.endBulk();
};

function setupSectorWindow() {
    const closeBtn = document.getElementById('btn-close-sector-window');
    if (closeBtn) closeBtn.addEventListener('click', window.closeSectorWindow);
    const closeFooter = document.getElementById('btn-close-sector-window-footer');
    if (closeFooter) closeFooter.addEventListener('click', window.closeSectorWindow);
}
