// ============================================================================
// KEYBOARD_SHORTCUTS.JS - Hotkeys and Key Event Listeners
// ============================================================================

/**
 * Puts the route slots back from a history snapshot that carries them.
 *
 * Most snapshots do not: see the note in saveHistoryState(). Repainting the
 * Route Manager wholesale rather than calling refreshRouteWindowCounts() is
 * deliberate — restoring a deleted slot has to put its row back, and the count
 * refresh only updates rows that already exist.
 */
function _restoreRouteDefinitions(snap) {
    if (!snap.routeDefinitions) return;
    window.routeDefinitions = snap.routeDefinitions;
    if (window.dbManager) window.dbManager.saveRouteDefinitions?.();
    const win = document.getElementById('route-window');
    if (win && win.classList.contains('visible') && window.renderRouteWindow) {
        window.renderRouteWindow();
    }
}

function setupKeyboardShortcuts() {
    const actions = {
        select: () => {
            window.mapSelectionMode = !window.mapSelectionMode;
            document.querySelector('[data-map-tool="select"]').setAttribute('aria-pressed', String(window.mapSelectionMode));
            document.getElementById('map-canvas').classList.toggle('selection-mode', window.mapSelectionMode);
        },
        routes: () => window.toggleRouteWindow(),
        borders: () => window.toggleBorderWindow(),
        regions: () => window.toggleRegionWindow(),
        sectors: () => window.toggleSectorWindow()
    };
    document.querySelectorAll('[data-map-tool]').forEach(button => {
        button.addEventListener('click', () => actions[button.dataset.mapTool]());
    });
    document.getElementById('map-generate').addEventListener('change', e => {
        const generate = { ct: runCTNewMacro, mgt: runMgT2EMacro, t5: runT5Macro, rtt: runRTTMacro }[e.target.value];
        e.target.value = '';
        generate?.();
    });
    document.getElementById('btn-build-imported')?.addEventListener('click', () => {
        console.log('[MgtBuild] Build systems already on the map');
        window.startBackgroundMgtBuild?.();
    });
    const toolbar = document.getElementById('map-toolbar');
    // Reflect keyboard changes in the same visible controls.
    const syncTools = () => {
        for (const [tool, id] of Object.entries({ routes: 'route-window', borders: 'border-window', regions: 'region-window', sectors: 'sector-window' })) {
            toolbar.querySelector(`[data-map-tool="${tool}"]`)?.setAttribute('aria-pressed', String(!!document.getElementById(id)?.classList.contains('visible')));
        }
    };
    new MutationObserver(syncTools).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    syncTools();
    window.addEventListener('keydown', async (e) => {
        if (e.defaultPrevented && e.key === 'Escape') return;
        // Skip shortcuts if the user is typing in an input field or textarea, except for Escape
        const _t = e.target;
        const _inField = _t.tagName === 'INPUT' || _t.tagName === 'TEXTAREA' || _t.tagName === 'SELECT' || _t.isContentEditable;

        // Shift+F (suspend filter) additionally passes through from controls
        // that are not text entry. Clicking a radio or checkbox parks focus on
        // it, and the workflow this shortcut exists for — building a route with
        // a filter on — leaves focus sitting on the Route Manager's radios, so
        // the guard would otherwise swallow the key exactly when it is wanted.
        // A radio does not consume letter keys, so nothing is lost.
        const _nonTextControl = _t.tagName === 'INPUT' &&
            ['radio', 'checkbox', 'button', 'submit', 'reset', 'range', 'color', 'file']
                .includes((_t.type || '').toLowerCase());
        const _allowThrough = e.key === 'Escape' ||
            (e.shiftKey && e.key.toLowerCase() === 'f' && _nonTextControl);

        if (_inField && !_allowThrough) {
            return;
        }

        const key = e.key.toLowerCase();
        keysDown.add(key);

        if (key === 'r' || key === 'b' || key === 'g' || (key === 'd' && window.playerKnowledgeExperimental)) {
            e.preventDefault();
        }

        if (e.ctrlKey && e.key === 'Delete') {
            e.preventDefault();
            if (typeof clearCanvas === 'function') clearCanvas();

        } else if (e.ctrlKey && !e.altKey && key === 's') {
            e.preventDefault();
            const world = getMouseWorldCoords({ clientX: currentMouseX, clientY: currentMouseY });
            const coords = pixelToHex(world.x, world.y, baseHexSize);
            const hexId = getHexId(coords.q, coords.r);
            if (hexId) {
                const parts = hexId.split('-');
                contextSectorPrefix = parts[0];
                toggleSectorHexes();
            }
        } else if (e.ctrlKey && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            const world = getMouseWorldCoords({ clientX: currentMouseX, clientY: currentMouseY });
            const coords = pixelToHex(world.x, world.y, baseHexSize);
            const hexId = getHexId(coords.q, coords.r);
            if (hexId) {
                const parts = hexId.split('-');
                contextSubsectorPrefix = parts[0] + '-' + parts[1];
                toggleSubsectorHexes();
            }
        } else if (e.ctrlKey && e.altKey && key === 'm') {
            e.preventDefault();
            keysDown.clear(); // FIX: Prevent 'm' from getting stuck
            runMgT2EMacro();
        } else if (e.ctrlKey && e.altKey && key === 'c') {
            e.preventDefault();
            keysDown.clear(); // FIX: Prevent 'c' from getting stuck
            runCTNewMacro();
        } else if (e.ctrlKey && e.altKey && key === 'r') {
            e.preventDefault();
            keysDown.clear(); // FIX: Prevent 'r' from getting stuck
            runRTTMacro();
        } else if (e.ctrlKey && e.altKey && key === '5') {
            e.preventDefault();
            keysDown.clear();
            runT5Macro();
        } else if (e.code === 'Space' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.target.closest?.('button, a, summary')) return;
            if (window.SystemViewer?.isOpen?.() || window.SurfaceViewer?.isOpen?.() || window.ApproachViewer?.isOpen?.()) return;
            e.preventDefault();
            actions.select();
        } else if (e.key === 'Escape') {
            if (document.querySelector('.campaign-stardate-dialog[open], .atlas-crop-dialog[open]')) return;
            e.preventDefault();
            const contextMenu = document.getElementById('context-menu');
            const helpPanel = document.getElementById('help-panel');
            const settingsPanel = document.getElementById('settings-panel');
            const hexEditor = document.getElementById('hex-editor');

            // Priority 0: An armed map pick. Must come first — otherwise Escape
            // falls through to Priority 3 and closes the whole Route Manager
            // when the user only meant to cancel the pick.
            if (window.MapPick && window.MapPick.isArmed()) {
                window.MapPick.cancel();
                return;
            }

            // Priority 1: Context Menu
            if (contextMenu && contextMenu.classList.contains('visible')) {
                contextMenu.classList.remove('visible');
                return;
            }
            
            // Priority 2: Side Panels
            if (helpPanel && helpPanel.classList.contains('open')) {
                helpPanel.classList.remove('open');
                return;
            }
            if (settingsPanel && settingsPanel.classList.contains('open')) {
                settingsPanel.classList.remove('open');
                return;
            }
            
            // Priority 3: Floating Palettes
            if (hexEditor && hexEditor.classList.contains('visible')) {
                closeHexEditor();
                return;
            }
            if (typeof window.isOmniFilterOpen === 'function' && window.isOmniFilterOpen()) {
                window.closeOmniFilter();
                return;
            }
            const routeWindow = document.getElementById('route-window');
            if (routeWindow && routeWindow.classList.contains('visible')) {
                window.closeRouteWindow();
                return;
            }
            const borderWindow = document.getElementById('border-window');
            if (borderWindow && borderWindow.classList.contains('visible')) {
                window.closeBorderWindow();
                return;
            }
            const sectorWindow = document.getElementById('sector-window');
            if (sectorWindow && sectorWindow.classList.contains('visible')) {
                window.closeSectorWindow();
                return;
            }

            // Cleanup
            if (window.mapSelectionMode) actions.select();
            deselectAllHexes();
        } else if (key === 'f' && e.shiftKey && !e.ctrlKey && !e.altKey) {
            // MUST be tested before the bare 'f' branch below: `key` is
            // lowercased above, so Shift+F arrives here as 'f' and would
            // otherwise just open the filter pane.
            e.preventDefault();
            if (typeof window.toggleFilterSuspension === 'function') window.toggleFilterSuspension();
        } else if (key === 'f') {
            e.preventDefault();
            toggleFilterModal();
        } else if (key === 'r') {
            e.preventDefault();
            if (typeof window.toggleRouteWindow === 'function') window.toggleRouteWindow();
        } else if (key === 'b' && !e.ctrlKey) {
            e.preventDefault();
            if (typeof window.toggleBorderWindow === 'function') window.toggleBorderWindow();
        } else if (key === 'g' && !e.ctrlKey) {
            e.preventDefault();
            if (typeof window.toggleRegionWindow === 'function') window.toggleRegionWindow();
        } else if (key === 'd' && !e.ctrlKey && window.playerKnowledgeExperimental) {
            e.preventDefault();
            window.toggleDisclosureGrid?.();
        // NOTE: the 'A' key used to open an Allegiance Manager window. That
        // window was removed and #allegiance-window no longer exists, so the
        // shortcut swallowed the key and did nothing. Assigning allegiances is
        // still available from the right-click menu, and the allegiance field
        // and filter are unaffected.
        } else if (e.ctrlKey && key === 'z') {
            e.preventDefault();
            const from = e.shiftKey ? window.redoStack : window.undoStack;
            const to = e.shiftKey ? window.undoStack : window.redoStack;
            const snap = from[from.length - 1];
            if (!snap || !CampaignAtlas.confirmLeave()) return;
            try {
                const current = captureHistoryInverse(snap);
                const apply = () => {
                    from.pop(); to.push(current);
                    applyHistoryPatch(snap);
                    _restoreRouteDefinitions(snap);
                };
                if (snap.campaignAtlas) await CampaignAtlas.restoreHistory(snap.campaignAtlas, apply);
                else apply();
                showToast(`${e.shiftKey ? 'Redid' : 'Undid'}: ${snap.action}`, 2000);
                requestAnimationFrame(draw);
                if (window.dbManager) { window.dbManager.syncAllHexes(); window.dbManager.saveRoutes(); }
            } catch (err) { showToast(`Undo/redo could not be saved: ${err.message}. Nothing was changed.`, 8000); }
        }
    });

    window.addEventListener('keyup', (e) => {
        keysDown.delete(e.key.toLowerCase());
    });

    // FIX: Safety net to clear all keys if the window loses focus
    window.addEventListener('blur', () => {
        if (typeof keysDown !== 'undefined' && keysDown.clear) {
            keysDown.clear();
        }
    });
}
