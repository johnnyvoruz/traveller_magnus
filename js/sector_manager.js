// ============================================================================
// SECTOR_MANAGER.JS - Left-click sector CRUD (name, add/remove, go, clear)
// Hex IDs encode slot as sY * gridWidth + sX + 1, so adding a column remaps
// later rows. Rows added on the south edge do not remap existing slots.
// ============================================================================

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
    grid.replaceChildren();

    for (let sY = 0; sY < gridHeight; sY++) {
        for (let sX = 0; sX < gridWidth; sX++) {
            const sectorNum = sY * gridWidth + sX + 1;
            const name = (window.sectorNames && window.sectorNames[sectorNum]) || '';
            const worlds = worldCounts.get(sectorNum) || 0;
            const tile = document.createElement('div');
            tile.className = 'sector-tile' + (worlds ? ' has-worlds' : '');
            tile.dataset.sector = String(sectorNum);

            const head = document.createElement('div');
            head.className = 'sector-tile-head';
            const numBtn = document.createElement('button');
            numBtn.type = 'button';
            numBtn.className = 'sector-tile-num';
            numBtn.textContent = String(sectorNum);
            numBtn.title = 'Go to this sector on the map';
            numBtn.addEventListener('click', () => {
                centerSectorInView(sectorNum);
                requestAnimationFrame(draw);
            });
            const goBtn = document.createElement('button');
            goBtn.type = 'button';
            goBtn.className = 'sector-tile-go';
            goBtn.title = 'Go to this sector on the map';
            goBtn.innerHTML = '<i class="fas fa-location-crosshairs" aria-hidden="true"></i>';
            goBtn.addEventListener('click', () => {
                centerSectorInView(sectorNum);
                requestAnimationFrame(draw);
            });
            head.append(numBtn, goBtn);

            const nameIn = document.createElement('input');
            nameIn.type = 'text';
            nameIn.className = 'sector-tile-name';
            nameIn.value = name;
            nameIn.placeholder = `Sector ${sectorNum}`;
            nameIn.setAttribute('aria-label', `Name for sector ${sectorNum}`);
            nameIn.addEventListener('change', () => {
                const val = nameIn.value.trim();
                if (val) window.sectorNames[sectorNum] = val;
                else delete window.sectorNames[sectorNum];
                if (window.dbManager) window.dbManager.saveSectorNames?.();
                requestAnimationFrame(draw);
            });

            const meta = document.createElement('div');
            meta.className = 'sector-tile-meta';
            const count = document.createElement('span');
            count.textContent = worlds ? `${worlds} system${worlds === 1 ? '' : 's'}` : 'Empty';
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'sector-tile-clear';
            clearBtn.textContent = 'Clear';
            clearBtn.title = 'Remove all hex data in this sector';
            clearBtn.disabled = worlds === 0 && countHexesInSlots([sectorNum]) === 0;
            clearBtn.addEventListener('click', () => window.clearSectorSlot(sectorNum));
            meta.append(count, clearBtn);

            tile.append(head, nameIn, meta);
            grid.appendChild(tile);
        }
    }

    if (sizeEl) sizeEl.textContent = `${gridWidth} × ${gridHeight} sectors`;

    const addCol = document.getElementById('btn-sector-add-col');
    const addRow = document.getElementById('btn-sector-add-row');
    const delCol = document.getElementById('btn-sector-del-col');
    const delRow = document.getElementById('btn-sector-del-row');
    if (addCol) addCol.disabled = gridWidth >= MAX_GRID_WIDTH;
    if (addRow) addRow.disabled = gridHeight >= MAX_GRID_HEIGHT;
    if (delCol) delCol.disabled = gridWidth <= 1;
    if (delRow) delRow.disabled = gridHeight <= 1;
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

window.clearSectorSlot = function (sectorNum) {
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
    if (!confirm(`Clear ${label}?${extra}\n\nThis can be undone with Ctrl+Z.`)) return;
    saveHistoryState(`Clear ${label}`);
    purgeSectorSlots([n]);
    if (window.dbManager) window.dbManager.scheduleSyncAll?.();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Cleared ${label}.`, 2500);
};

window.addSectorColumn = function () {
    if (gridWidth >= MAX_GRID_WIDTH) {
        showToast(`Column limit is ${MAX_GRID_WIDTH} (Universe width).`, 2500);
        return;
    }
    const oldW = gridWidth;
    remapAllHexIds(oldW, oldW + 1);
    gridWidth = oldW + 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Added a column on the east edge (${gridWidth} × ${gridHeight}). Undo history cleared.`, 3500);
};

window.addSectorRow = function () {
    if (gridHeight >= MAX_GRID_HEIGHT) {
        showToast(`Row limit is ${MAX_GRID_HEIGHT} (Universe height).`, 2500);
        return;
    }
    gridHeight += 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Added a row on the south edge (${gridWidth} × ${gridHeight}). Undo history cleared.`, 3500);
};

window.removeSectorColumn = function () {
    if (gridWidth <= 1) {
        showToast('The map needs at least one column.', 2000);
        return;
    }
    const slots = slotsInColumn(gridWidth - 1);
    const worlds = countSystemsInSlots(slots);
    const hexes = countHexesInSlots(slots);
    if (worlds || hexes) {
        const msg = worlds
            ? `Remove the east column? ${worlds} system${worlds === 1 ? '' : 's'} in ${slots.length} sector(s) will be deleted.\n\nUndo history will be cleared.`
            : `Remove the east column? Hex data in ${slots.length} sector(s) will be deleted.\n\nUndo history will be cleared.`;
        if (!confirm(msg)) return;
        purgeSectorSlots(slots);
    }
    const oldW = gridWidth;
    remapAllHexIds(oldW, oldW - 1);
    gridWidth = oldW - 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Removed the east column (${gridWidth} × ${gridHeight}).`, 3000);
};

window.removeSectorRow = function () {
    if (gridHeight <= 1) {
        showToast('The map needs at least one row.', 2000);
        return;
    }
    const slots = slotsInRow(gridHeight - 1);
    const worlds = countSystemsInSlots(slots);
    const hexes = countHexesInSlots(slots);
    if (worlds || hexes) {
        const msg = worlds
            ? `Remove the south row? ${worlds} system${worlds === 1 ? '' : 's'} in ${slots.length} sector(s) will be deleted.\n\nUndo history will be cleared.`
            : `Remove the south row? Hex data in ${slots.length} sector(s) will be deleted.\n\nUndo history will be cleared.`;
        if (!confirm(msg)) return;
        purgeSectorSlots(slots);
    }
    gridHeight -= 1;
    persistGridChange();
    window.renderSectorWindow();
    requestAnimationFrame(draw);
    showToast(`Removed the south row (${gridWidth} × ${gridHeight}).`, 3000);
};

function setupSectorWindow() {
    const closeBtn = document.getElementById('btn-close-sector-window');
    if (closeBtn) closeBtn.addEventListener('click', window.closeSectorWindow);
    const closeFooter = document.getElementById('btn-close-sector-window-footer');
    if (closeFooter) closeFooter.addEventListener('click', window.closeSectorWindow);
    document.getElementById('btn-sector-add-col')?.addEventListener('click', window.addSectorColumn);
    document.getElementById('btn-sector-add-row')?.addEventListener('click', window.addSectorRow);
    document.getElementById('btn-sector-del-col')?.addEventListener('click', window.removeSectorColumn);
    document.getElementById('btn-sector-del-row')?.addEventListener('click', window.removeSectorRow);
}
