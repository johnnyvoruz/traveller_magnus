// ============================================================================
// INPUT_INIT.JS - Global UI State & Initialization
// ============================================================================

// UI State Variables
let width = window.innerWidth;
let height = window.innerHeight;

let isDragging = false;
let hasMoved = false;
let lastMouseX = 0;
let lastMouseY = 0;

let isPainting = false;
let paintAction = 'select';
let lastPaintedHexId = null;

let contextHexId = null;
let contextSectorPrefix = null;
let contextSubsectorPrefix = null;

// Hex Editor State
let editingHexId = null;

// Make Hex Editor Draggable
let isDraggingEditor = false;
let editorDragOffsetX = 0;
let editorDragOffsetY = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeInput() {
    // UI Elements
    const contextMenu = document.getElementById('context-menu');
    const hexEditor = document.getElementById('hex-editor');
    const hexEditorHeader = hexEditor.querySelector('h3');

    // Initialize Floating Palettes
    const routeWindow = document.getElementById('route-window');
    const routeHandle = routeWindow.querySelector('.modal-drag-handle');
    makeDraggable(routeWindow, routeHandle);

    const borderWindow = document.getElementById('border-window');
    const borderHandle = borderWindow.querySelector('.modal-drag-handle');
    makeDraggable(borderWindow, borderHandle);

    const regionWindow = document.getElementById('region-window');
    const regionHandle = regionWindow.querySelector('.modal-drag-handle');
    makeDraggable(regionWindow, regionHandle);

    const sectorWindow = document.getElementById('sector-window');
    const sectorHandle = sectorWindow.querySelector('.modal-drag-handle');
    makeDraggable(sectorWindow, sectorHandle);

    makeDraggable(hexEditor, hexEditorHeader);

    // Default Placement
    routeWindow.style.left = '10px';
    routeWindow.style.top = '110px';

    borderWindow.style.left = '10px';
    borderWindow.style.top = '110px';

    regionWindow.style.left = '10px';
    regionWindow.style.top = '110px';

    sectorWindow.style.left = '10px';
    sectorWindow.style.top = '110px';

    // For Hex Editor (Right-aligned)
    hexEditor.style.right = '400px';
    hexEditor.style.left = 'auto'; // Ensure it doesn't conflict with left
    hexEditor.style.top = '50px';

    document.addEventListener('mouseup', () => {
        // Global safety net handled inside makeDraggable
    });

    // Setup all event listeners (These functions will live in our other new files)
    setupAccordions();
    setupCanvasEvents();
    window.TradeMatch?.setup();
    setupKeyboardShortcuts();
    setupContextMenu();
    setupSettingsPanel();
    setupHelpToggle();
    SystemInspector.setup();
    CampaignAtlas.setup();
    setupHexEditor();
    setupSaveLoad();
    setupTWImport();
    setupAsabImportExport();

    setupSectorPicker();
    setupObsidianExport();
    setupSectorImporter();
    setupXmlMetadataImporter();
    setupRouteWindow();
    setupBorderWindow();
    setupRegionWindow();
    setupSectorWindow();
    setupDisclosureUI();
    setupNavigation();
}

// ============================================================================
// ACCORDION FUNCTIONALITY
// ============================================================================

function setupAccordions() {
    const accordions = document.querySelectorAll('.accordion-btn');
    accordions.forEach(acc => {
        acc.classList.remove('active');
        const panel = acc.nextElementSibling;
        if (panel && panel.classList.contains('accordion-content')) {
            panel.style.display = 'none';
            if (panel.id) acc.dataset.accordionPanel = panel.id;
        }

        acc.addEventListener('click', function () {
            const panelId = this.dataset.accordionPanel;
            const target = panelId ? document.getElementById(panelId) : null;
            const span = document.getElementById('system-inspector')?.dataset.span || 'column';
            const willOpen = !this.classList.contains('active');
            // Column width keeps a single open section. Wider panes leave the others open.
            if (span === 'column') {
                accordions.forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.accordion-content').forEach(node => { node.style.display = 'none'; });
            }
            this.classList.toggle('active', willOpen);
            if (target) target.style.display = willOpen ? 'block' : 'none';
        });
    });
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(message, duration = 3000) {
    console.log("Toast:", message);
    const container = document.getElementById('toast-container');
    if (!container) return;

    const sticky = !(duration > 0);
    if (sticky && [...container.children].some(node => node.dataset.sticky === '1' && node.textContent === message)) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    void toast.offsetWidth;
    toast.classList.add('show');

    const dismiss = () => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        });
    };
    if (sticky) {
        toast.dataset.sticky = '1';
        toast.title = 'Click to dismiss';
        toast.addEventListener('click', dismiss);
        return;
    }
    setTimeout(dismiss, duration);
}

// ============================================================================
// DRAGGABLE PALETTE LOGIC
// ============================================================================

function makeDraggable(element, handle) {
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;

    handle.addEventListener('mousedown', (e) => {
        // Don't drag if clicking buttons/inputs inside handle
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

        isDragging = true;
        
        // Initial offset
        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        
        // Bring to front
        bringToFront(element);

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        
        // Use fixed positioning relative to viewport
        element.style.left = (e.clientX - offsetX) + 'px';
        element.style.top = (e.clientY - offsetY) + 'px';
        element.style.right = 'auto'; // Reset right once moved
        element.style.bottom = 'auto';
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // Bring to front on click anywhere inside
    element.addEventListener('mousedown', () => {
        bringToFront(element);
    });
}

function bringToFront(element) {
    // Other palettes to back
    document.querySelectorAll('.draggable-palette').forEach(p => {
        p.style.zIndex = '1100';
    });
    // This one to front
    element.style.zIndex = '1200';
}

// ============================================================================
// UI HELPERS (Settings & Modals)
// ============================================================================

function openHelpModal() {
    if (window.AppNavigation?.prepare('help-panel') === false) return;
    if (window.SystemInspector?.isOpen() && !SystemInspector.close()) return;
    document.getElementById('context-menu').classList.remove('visible');
    // Mutually exclusive: close settings if open
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) settingsPanel.classList.remove('open');
    
    document.getElementById('help-panel').classList.add('open');
}



// Player knowledge is paused. The flag (Settings, default off) only shows or
// hides the entry points. Tags already stored on hexes are left alone.
function applyPlayerKnowledgeChrome(enabled) {
    const on = !!enabled;
    window.playerKnowledgeExperimental = on;
    const navBtn = document.getElementById('disclosure-toggle');
    if (navBtn) {
        navBtn.hidden = !on;
        if (!on) navBtn.setAttribute('aria-expanded', 'false');
    }
    if (!on) {
        const tray = document.getElementById('disclosure-tray');
        if (tray) tray.hidden = true;
        const menu = document.getElementById('map-action-players-menu');
        if (menu) menu.hidden = true;
        const playersBtn = document.getElementById('map-action-players');
        if (playersBtn) playersBtn.setAttribute('aria-expanded', 'false');
        const modal = document.getElementById('disclosure-assign-modal');
        if (modal) modal.style.display = 'none';
    }
    const group = document.getElementById('map-action-players-group');
    if (group) group.hidden = !on;
    for (const id of ['ctx-open-disclosure-grid', 'ctx-assign-disclosure', 'help-player-knowledge-key', 'help-player-knowledge']) {
        const el = document.getElementById(id);
        if (el) el.hidden = !on;
    }
    const playerOpt = document.querySelector('#obs-version option[value="player"]');
    if (playerOpt) playerOpt.hidden = !on;
    const versionSel = document.getElementById('obs-version');
    if (versionSel && !on && versionSel.value === 'player') {
        versionSel.value = 'gm';
        versionSel.dispatchEvent(new Event('change'));
    }
    if (window.AppNavigation) window.AppNavigation.layout();
}
window.applyPlayerKnowledgeChrome = applyPlayerKnowledgeChrome;

function setupNavigation() {
    const nav = document.getElementById('app-nav');
    const icons = {
        menu: 'bars', map: 'map', system: 'planet-ringed',
        campaign: 'book-sparkles', person: 'user', place: 'location-dot',
        business: 'store', organization: 'sitemap', job: 'briefcase',
        event: 'calendar-star', item: 'gem', note: 'note-sticky',
        route: 'route', border: 'draw-polygon',
        region: 'layer-group', sectors: 'table-cells',
        eye: 'eye', generate: 'wand-magic-sparkles', legend: 'book-atlas', saves: 'clock-rotate-left',
        settings: 'gear', help: 'circle-question'
    };
    const labels = { person: 'People', place: 'Places', business: 'Businesses', organization: 'Organizations', job: 'Jobs', event: 'Events', item: 'Items', note: 'Notes' };
    for (const [type, label] of Object.entries(labels)) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.navIcon = type; button.dataset.campaignType = type;
        button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'system-inspector');
        const span = document.createElement('span'); span.className = 'nav-label'; span.textContent = label;
        button.append(span); document.getElementById('campaign-nav').append(button);
        button.addEventListener('click', () => {
            if (SystemInspector.isOpen() && SystemInspector.currentWorkspace() === 'campaign' && CampaignAtlas.currentType() === type) SystemInspector.close();
            else CampaignAtlas.openType(type);
        });
    }
    for (const button of nav.querySelectorAll('[data-nav-icon]')) {
        const name = icons[button.dataset.navIcon];
        if (!name) continue;
        const icon = document.createElement('i');
        icon.className = `fa-solid fa-${name}`;
        icon.setAttribute('aria-hidden', 'true');
        button.prepend(icon);
    }
    const palettes = { 'route-window': 'toggleRouteWindow', 'border-window': 'toggleBorderWindow', 'region-window': 'toggleRegionWindow', 'sector-window': 'toggleSectorWindow' };
    const isVisible = id => document.getElementById(id)?.classList.contains('visible');
    function prepare(id) {
        if (id !== 'system-inspector' && SystemInspector.isOpen() && !SystemInspector.close()) return false;
        if (typeof window.closeOmniFilter === 'function') window.closeOmniFilter();
        for (const [other, toggle] of Object.entries(palettes)) if (other !== id && isVisible(other)) window[toggle]();
        for (const other of ['settings-panel', 'help-panel']) if (other !== id) document.getElementById(other).classList.remove('open');
        for (const tray of document.querySelectorAll('.nav-tray')) if (tray.id !== id) tray.hidden = true;
        if (innerWidth < 1000) nav.classList.remove('expanded');
        layout(); return true;
    }
    function layout() {
        // Width ignores the boot slide. A translated rail would otherwise report
        // a right edge of 0 and pull the map chrome over with it.
        const railRight = nav.getBoundingClientRect().width;
        document.documentElement.style.setProperty('--nav-width', `${railRight}px`);
        const inspector = document.querySelector('#system-inspector:not([hidden])');
        document.documentElement.style.setProperty('--inspector-right', inspector ? `${inspector.getBoundingClientRect().right}px` : '0px');
        const active = [document.querySelector('#system-inspector:not([hidden])'), ...document.querySelectorAll('.nav-tray:not([hidden]), .side-panel.open'), ...Object.keys(palettes).filter(isVisible).map(id => document.getElementById(id))].filter(Boolean);
        const edge = Math.max(railRight, ...active.map(node => node.getBoundingClientRect().right + 10));
        document.documentElement.style.setProperty('--workspace-left', `${Math.min(edge, innerWidth - 120)}px`);
        document.getElementById('nav-expand').setAttribute('aria-expanded', String(nav.classList.contains('expanded')));
        document.getElementById('nav-expand').setAttribute('aria-label', nav.classList.contains('expanded') ? 'Collapse navigation' : 'Expand navigation');
        for (const button of nav.querySelectorAll('[aria-controls]')) {
            if (button.getAttribute('aria-controls') === 'system-inspector') {
                const campaign = SystemInspector.isOpen() && SystemInspector.currentWorkspace() === 'campaign';
                const type = CampaignAtlas.currentType();
                button.setAttribute('aria-expanded', String(button.dataset.campaignType ? campaign && type === button.dataset.campaignType : button.id === 'campaign-toggle' ? campaign && !type : SystemInspector.isOpen() && !campaign));
            } else {
                const target = document.getElementById(button.getAttribute('aria-controls'));
                const open = !target ? false
                    : (target.classList.contains('nav-tray') || target.id === 'legend-tray') ? !target.hidden
                    : !!target.classList.contains('open');
                button.setAttribute('aria-expanded', String(open));
            }
        }
        window.SystemViewer?.resize();
    }
    function toggleTray(id) {
        const tray = document.getElementById(id);
        if (!tray.hidden) tray.hidden = true;
        else if (prepare(id)) tray.hidden = false;
        layout();
    }
    window.AppNavigation = { prepare, layout, toggleTray, labels, icons };
    for (const [id, name] of Object.entries(palettes)) {
        const original = window[name];
        if (typeof original !== 'function') continue;
        window[name] = function (...args) {
            if (!isVisible(id) && !prepare(id)) return;
            original.apply(this, args); layout();
        };
    }
    for (const id of ['settings', 'help']) document.getElementById(`${id}-toggle`).addEventListener('click', e => {
        if (!document.getElementById(`${id}-panel`).classList.contains('open') && !prepare(`${id}-panel`)) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    document.getElementById('nav-expand').addEventListener('click', () => { nav.classList.toggle('expanded'); layout(); });
    document.getElementById('generate-toggle').addEventListener('click', () => toggleTray('generation-tray'));
    document.getElementById('disclosure-toggle').addEventListener('click', () => {
        if (!window.playerKnowledgeExperimental) return;
        window.toggleDisclosureGrid();
    });
    function setLegendOpen(open) {
        const tray = document.getElementById('legend-tray');
        tray.hidden = !open;
        if (open) renderMapLegend();
        document.getElementById('legend-toggle').setAttribute('aria-expanded', String(open));
    }
    document.getElementById('legend-toggle').addEventListener('click', () => {
        setLegendOpen(document.getElementById('legend-tray').hidden);
    });
    document.getElementById('legend-close').addEventListener('click', () => setLegendOpen(false));
    document.getElementById('nav-map').addEventListener('click', () => SystemViewer.close());
    document.querySelectorAll('[data-close-tray]').forEach(button => button.addEventListener('click', () => { button.closest('.nav-tray').hidden = true; layout(); }));
    new MutationObserver(() => requestAnimationFrame(layout)).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    new ResizeObserver(layout).observe(nav);
    window.addEventListener('resize', layout);
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || e.defaultPrevented || e.target.closest('#omni-search')) return;
        if (document.querySelector('.campaign-stardate-dialog[open], .atlas-crop-dialog[open]')) return;
        if (document.getElementById('world-image-panel')) return;
        const trays = document.querySelectorAll('.nav-tray:not([hidden])');
        const legend = document.getElementById('legend-tray');
        if (!trays.length && legend.hidden) return;
        trays.forEach(tray => { tray.hidden = true; });
        if (!legend.hidden) legend.hidden = true;
        e.preventDefault(); e.stopImmediatePropagation(); layout();
    }, true);
    nav.inert = false;
    setupOmniSearch();
    setupMapActionBar();
    document.body.dataset.appReady = 'true';
    layout();
}

// ============================================================================
// APP STARTUP
// ============================================================================

function setupOmniSearch() {
    const root = document.getElementById('omni-search');
    const input = document.getElementById('omni-search-input');
    const popup = document.getElementById('omni-search-popup');
    const searchPane = document.getElementById('omni-search-pane');
    const filterPane = document.getElementById('omni-filter-pane');
    const filterToggle = document.getElementById('omni-filter-toggle');
    const list = document.getElementById('omni-search-results');
    const status = document.getElementById('omni-search-status');
    const clear = document.getElementById('omni-search-clear');
    let matches = [], active = -1, timer, mode = 'search';
    const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    function isFilterOpen() { return mode === 'filter' && !popup.hidden; }
    function dismiss() {
        clearTimeout(timer); popup.hidden = true; active = -1; mode = 'search';
        root.classList.remove('is-filter');
        searchPane.hidden = false; filterPane.hidden = true;
        filterToggle.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    }
    function showSearchPane() {
        mode = 'search';
        root.classList.remove('is-filter');
        searchPane.hidden = false; filterPane.hidden = true;
        filterToggle.setAttribute('aria-expanded', 'false');
        popup.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function showFilterPane() {
        mode = 'filter';
        root.classList.add('is-filter');
        searchPane.hidden = true; filterPane.hidden = false;
        filterToggle.setAttribute('aria-expanded', 'true');
        popup.hidden = false; input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        input.blur();
    }
    window.openOmniFilter = function () { showFilterPane(); };
    window.closeOmniFilter = function () { if (isFilterOpen()) dismiss(); };
    window.isOmniFilterOpen = function () { return isFilterOpen(); };
    function focusSystem(id) {
        // Search never enters orbit view; only double-clicking the map does.
        if (SystemViewer.isOpen()) {
            if (SystemViewer.currentHexId() === id) return;
            SystemViewer.close();
        }
        centerHexInView(id);
        draw();
    }
    function openResult(index) {
        const result = matches[index];
        if (!result || CampaignAtlas.isBusy()) return;
        if (result.kind === 'filter') {
            if (typeof window.toggleFilterModal === 'function') window.toggleFilterModal();
            return;
        }
        if (result.kind === 'system') {
            if (!SystemInspector.canLeave() || !SystemInspector.openForHex(result.id, 'system')) return;
            focusSystem(result.id);
        } else if (result.kind === 'campaign') {
            if (!CampaignAtlas.openRecord(result.id)) return;
            focusSystem(result.hexId);
        } else {
            result.button.click();
        }
        dismiss(); input.blur();
    }
    function activate(index) {
        active = index;
        [...list.children].forEach((row, i) => row.setAttribute('aria-selected', String(i === active)));
        const row = list.children[active];
        if (row) { input.setAttribute('aria-activedescendant', row.id); row.scrollIntoView({ block: 'nearest' }); }
        else input.removeAttribute('aria-activedescendant');
    }
    function search() {
        clearTimeout(timer); timer = null;
        const query = normalize(input.value.trim()), words = query.split(/\s+/).filter(Boolean);
        const candidates = [];
        function add(result, text) {
            const haystack = normalize(text);
            if (words.every(word => haystack.includes(word))) {
                const name = normalize(result.name);
                result.rank = name === query ? 0 : name.startsWith(query) ? 1 : 2;
                candidates.push(result);
            }
        }
        if (query) {
            for (const [id, state] of hexStates) {
                if (state.type !== 'SYSTEM_PRESENT') continue;
                const name = SystemInspector.systemName(id);
                const world = state.aowSystem?.mainworld || state.mgt2eData || state.ctData || state.t5Data || state.rttData || {};
                add({ kind: 'system', id, name, detail: `System · ${id}` }, `${name} ${id} ${world.name || ''} ${world.uwp || ''}`);
            }
            for (const record of Object.values(window.campaignAtlas.records)) {
                const system = SystemInspector.systemName(record.anchor.hexId);
                add({ kind: 'campaign', id: record.id, hexId: record.anchor.hexId, name: record.name,
                    detail: `${record.type} · ${system}${record.anchor.locationLabel ? ' · ' + record.anchor.locationLabel : ''}` },
                    `${record.name} ${record.type} ${record.summary} ${record.details} ${record.tags.join(' ')} ${system} ${record.anchor.hexId} ${record.anchor.locationLabel}`);
            }
        }
        add({ kind: 'filter', name: 'Filter worlds', detail: 'Tool · F' }, 'filter worlds hide suspend');
        for (const button of document.querySelectorAll('#app-nav button:not(:disabled), #hex-select-toggle')) {
            if (button.id === 'nav-expand' || !button.getClientRects().length) continue;
            const name = button.getAttribute('aria-label');
            add({ kind: 'tool', button, name, detail: 'Tool' }, name);
        }
        candidates.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
        matches = candidates.slice(0, 40); active = -1; list.replaceChildren();
        input.removeAttribute('aria-activedescendant');
        matches.forEach((result, index) => {
            const row = document.createElement('div'); row.id = `omni-result-${index}`;
            row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
            const name = document.createElement('strong'), detail = document.createElement('span');
            name.textContent = result.name; detail.textContent = result.detail; row.append(name, detail);
            row.addEventListener('mousedown', e => e.preventDefault());
            row.addEventListener('click', () => openResult(index));
            list.append(row);
        });
        status.textContent = !query ? 'Search systems, hex IDs, campaign records, or tools.' : candidates.length
            ? `${candidates.length} result${candidates.length === 1 ? '' : 's'}${candidates.length > 40 ? ' · showing the first 40; refine your search' : ''}`
            : 'No matches. Try a system name, hex ID, campaign tag, or tool.';
        clear.hidden = !input.value;
        showSearchPane();
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 100); });
    input.addEventListener('focus', search);
    filterToggle.addEventListener('mousedown', e => e.preventDefault());
    filterToggle.addEventListener('click', () => {
        if (typeof window.toggleFilterModal === 'function') window.toggleFilterModal();
    });
    document.getElementById('omni-filter-suspend').addEventListener('click', () => {
        if (typeof window.toggleFilterSuspension === 'function') window.toggleFilterSuspension();
    });
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
        if (typeof window.clearFilterInputs === 'function') window.clearFilterInputs();
    });
    // Capture before map/orbit Escape listeners so search never closes the view.
    root.addEventListener('keydown', e => {
        if (e.isComposing) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dismiss(); return; }
        if (e.target !== input) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation();
            if (popup.hidden || timer || mode !== 'search') { search(); timer = null; }
            if (matches.length) activate((active + (e.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + matches.length) % matches.length);
        } else if (e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            if (timer) { search(); timer = null; }
            openResult(active < 0 ? 0 : active);
        }
    }, true);
    clear.addEventListener('click', () => { input.value = ''; input.focus(); search(); });
    document.addEventListener('pointerdown', e => {
        if (root.contains(e.target) || isFilterOpen()) return;
        dismiss();
    });
    root.addEventListener('focusout', () => queueMicrotask(() => {
        if (isFilterOpen() || root.contains(document.activeElement)) return;
        dismiss();
    }));
    root.inert = false;
}

function collectMapLegend() {
    const sections = [];
    const routes = window.sectorRoutes || [];
    const routeItems = [];
    const seenRoutes = new Set();
    (window.routeDefinitions || []).forEach(def => {
        if (def.visible === false) return;
        const count = routes.filter(r => r.routeId === def.id).length;
        if (!count) return;
        seenRoutes.add(def.id);
        routeItems.push({ color: def.color || '#ffffff', label: def.name, swatch: 'line' });
    });
    routes.forEach(r => {
        if (r.routeId != null && seenRoutes.has(r.routeId)) return;
        const key = r.groupId || r.name || r.color || r.type;
        if (seenRoutes.has(key)) return;
        seenRoutes.add(key);
        routeItems.push({ color: r.color || '#ffffff', label: r.name || r.groupId || r.type || 'Route', swatch: 'line' });
    });
    if (routeItems.length) sections.push({ title: 'Routes', items: routeItems });

    const regionCounts = new Map();
    hexStates.forEach(state => {
        if (state.cluster && state.cluster !== '----') regionCounts.set(state.cluster, true);
    });
    const regionItems = (window.regionDefinitions || []).filter(def => def.visible !== false && regionCounts.has(def.name))
        .map(def => ({ color: def.color, label: def.name, swatch: 'fill' }));
    if (regionItems.length) sections.push({ title: 'Regions', items: regionItems });

    const borderCounts = new Map();
    (window.hexBorderAssignments || new Map()).forEach(id => borderCounts.set(id, true));
    const borderItems = (window.borderDefinitions || []).filter(def => def.visible !== false && borderCounts.has(def.id))
        .map(def => ({ color: def.color, label: def.name, swatch: 'outline' }));
    if (borderItems.length) sections.push({ title: 'Borders', items: borderItems });

    const filterItems = (window.activeFilterRules || []).filter(rule => rule.visible !== false).map(rule => ({
        color: rule.color || rule.ringColor || rule.bgFillColor || '#a0a8b0',
        label: rule.description || 'Filter',
        swatch: 'dot'
    }));
    if (filterItems.length) sections.push({ title: 'Filters', items: filterItems });

    let amber = false, red = false;
    hexStates.forEach(state => {
        if (state.type !== 'SYSTEM_PRESENT') return;
        const data = state.rttData || state.t5Data || state.mgt2eData || state.ctData || {};
        const zone = data.travelZone || state.travelZone;
        if (!zone || zone === 'Green' || zone === 'G') return;
        if (zone === 'Red' || zone === 'R') red = true;
        else amber = true;
    });
    const zoneItems = [];
    if (amber) zoneItems.push({ color: '#FFBF00', label: 'Amber zone', swatch: 'ring' });
    if (red) zoneItems.push({ color: '#FF0000', label: 'Red zone', swatch: 'ring' });
    if (zoneItems.length) sections.push({ title: 'Travel zones', items: zoneItems });
    return sections;
}

function renderMapLegend() {
    const host = document.getElementById('legend-content');
    if (!host) return;
    host.replaceChildren();
    const sections = collectMapLegend();
    if (!sections.length) {
        const empty = document.createElement('p');
        empty.className = 'legend-empty';
        empty.textContent = 'Nothing to key yet. Routes, regions, borders, filters, and travel zones appear here when they are on the map.';
        host.append(empty);
        return;
    }
    sections.forEach(section => {
        const group = document.createElement('section');
        group.className = 'legend-section';
        const heading = document.createElement('h3');
        heading.textContent = section.title;
        group.append(heading);
        section.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'legend-row';
            const swatch = document.createElement('span');
            swatch.className = `legend-swatch legend-swatch-${item.swatch}`;
            swatch.style.setProperty('--legend-color', item.color);
            const label = document.createElement('span');
            label.textContent = item.label;
            row.append(swatch, label);
            group.append(row);
        });
        host.append(group);
    });
}

function setupMapActionBar() {
    const bar = document.getElementById('map-action-bar');
    if (!bar) return;
    const countEl = document.getElementById('map-action-count');
    const deselect = document.getElementById('map-action-deselect');
    const autoClear = document.getElementById('map-action-auto-clear');
    const autoClearWrap = document.getElementById('map-action-auto-clear-wrap');
    const menus = {
        region: document.getElementById('map-action-region-menu'),
        players: document.getElementById('map-action-players-menu'),
        more: document.getElementById('map-action-more-menu')
    };
    const buttons = {
        region: document.getElementById('map-action-region'),
        players: document.getElementById('map-action-players'),
        more: document.getElementById('map-action-more')
    };
    function closeMenus() {
        for (const [name, menu] of Object.entries(menus)) {
            menu.hidden = true;
            buttons[name].setAttribute('aria-expanded', 'false');
        }
    }
    function openMenu(name) {
        const willOpen = menus[name].hidden;
        closeMenus();
        if (willOpen) {
            if (name === 'region') fillRegionMenu();
            if (name === 'players') fillPlayersMenu();
            if (name === 'more') {
                const dev = menus.more.querySelector('[data-expand="ctx-expand-socio-mgt2e-dev"]');
                if (dev) dev.hidden = window.devView !== true;
            }
            menus[name].hidden = false;
            buttons[name].setAttribute('aria-expanded', 'true');
        }
    }
    function fillRegionMenu() {
        const menu = menus.region;
        menu.replaceChildren();
        const add = (label, onClick) => {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.setAttribute('role', 'menuitem');
            btn.textContent = label; btn.addEventListener('click', onClick);
            menu.append(btn);
        };
        add('Clear region', () => {
            const hexList = currentActionHexes();
            if (!hexList.length) return;
            markChanged('Clear Region', { hexIds: hexList });
            hexList.forEach(hexId => { const s = hexStates.get(hexId); if (s) s.cluster = '----'; });
            if (typeof window.invalidateRegionFillCache === 'function') window.invalidateRegionFillCache();
            window.renderRegionWindow?.();
            requestAnimationFrame(draw);
            showToast(`Region cleared for ${hexList.length} hex(es).`, 2500);
            finishAction();
        });
        (window.regionDefinitions || []).forEach(def => {
            add(def.name, () => {
                window.confirmAssignRegion(def.id, currentActionHexes());
                finishAction();
            });
        });
    }
    function fillPlayersMenu() {
        window.renderPlayerKnowledgePanel(menus.players, currentActionHexes());
    }
    function finishAction() {
        closeMenus();
        if (autoClear.checked && selectedHexes.size) deselectAllHexes();
    }
    function withActionHexes(run) {
        const hexes = currentActionHexes();
        if (!hexes.length) { showToast('Select hexes, or click a system.', 2000); return; }
        run();
        finishAction();
    }
    menus.more.addEventListener('click', e => {
        const expandId = e.target.closest('[data-expand]')?.dataset.expand;
        const populate = e.target.closest('[data-populate]')?.dataset.populate;
        const edition = e.target.closest('[data-generate]')?.dataset.generate;
        if (!expandId && !populate && !edition) return;
        withActionHexes(() => {
            if (expandId) document.getElementById(expandId)?.click();
            else if (populate === 'sparse') autoPopulate(2);
            else if (populate === 'standard') autoPopulate(3);
            else if (populate === 'dense') autoPopulate(4);
            else if (populate === 'manual') document.getElementById('ctx-manual-system').click();
            else if (populate === 'empty') document.getElementById('ctx-manual-empty').click();
            else if (populate === 'clear') document.getElementById('ctx-manual-clear').click();
            else if (edition) {
                const generate = { ct: runCTNewMacro, mgt: runMgT2EMacro, t5: runT5Macro, rtt: runRTTMacro }[edition];
                generate?.();
            }
        });
    });
    buttons.region.addEventListener('click', () => openMenu('region'));
    buttons.players.addEventListener('click', () => openMenu('players'));
    buttons.more.addEventListener('click', () => openMenu('more'));
    document.getElementById('map-action-build').addEventListener('click', () => {
        closeMenus();
        window.runMgtBuild?.();
        finishAction();
    });
    deselect.addEventListener('click', () => { closeMenus(); deselectAllHexes(); });
    document.addEventListener('pointerdown', e => {
        if (bar.contains(e.target)) return;
        if (!menus.players.hidden && e.target.closest('#map-canvas')) return;
        closeMenus();
    });
    const origAdd = selectedHexes.add.bind(selectedHexes);
    const origDelete = selectedHexes.delete.bind(selectedHexes);
    const origClear = selectedHexes.clear.bind(selectedHexes);
    selectedHexes.add = function (id) { const out = origAdd(id); queueMicrotask(syncMapActionBar); return out; };
    selectedHexes.delete = function (id) { const out = origDelete(id); queueMicrotask(syncMapActionBar); return out; };
    selectedHexes.clear = function () { origClear(); queueMicrotask(syncMapActionBar); };
    window.syncMapActionBar = syncMapActionBar;
    function syncMapActionBar() {
        const selected = selectedHexes.size;
        const inspect = window.SystemInspector?.inspectedHexId?.();
        const active = selected || inspect;
        bar.hidden = !active;
        window.DisclosureGrid?.syncSelection?.();
        if (!active) { closeMenus(); return; }
        if (!menus.players.hidden) fillPlayersMenu();
        if (selected) {
            countEl.textContent = `${selected} hex${selected === 1 ? '' : 'es'} selected`;
            deselect.hidden = false;
            autoClearWrap.hidden = false;
        } else {
            countEl.textContent = SystemInspector.systemName(inspect);
            deselect.hidden = true;
            autoClearWrap.hidden = true;
        }
        const offer = window.mgtBuildOffer?.(currentActionHexes());
        const build = document.getElementById('map-action-build');
        build.hidden = !offer;
        if (offer) {
            build.textContent = offer.label;
            build.title = offer.title;
        }
    }
    syncMapActionBar();
}

function _releaseBoot(message) {
    const nav = document.getElementById('app-nav');
    if (nav) nav.inert = false;
    document.body.dataset.appReady = 'true';
    window.__mapBootDrawn = true;
    if (typeof window.__bootTryReveal === 'function') window.__bootTryReveal();
    if (message && typeof showToast === 'function') showToast(message, 0);
}

window.addEventListener('load', async () => {
    // Load persisted data from IndexedDB before initialising the UI.
    // Keep navigation inert while the saved map is being restored.
    // A failed restore must still wire up the UI: an un-inerted nav rail with
    // no handlers behind it is not "usable". The error is shown after boot.
    let bootError = null;
    let hadData = false;
    try {
        if (window.dbManager) hadData = await window.dbManager.loadFromDB();
    } catch (err) {
        bootError = err;
        console.error('[Boot] stored map could not be restored:', err);
    }
    try {
    if (window.dbManager) {
        if (hadData) {
            // Recompute the filter before the first draw.
            //
            // The filter's RESULT lives on each hex (state.isHiddenByFilter) and so
            // comes back with them from IndexedDB; the filter's INPUTS are plain DOM
            // fields and do not. Every other path that repopulates hexStates already
            // calls this — applyLoadedMapData, the T5 tab import, the OTU importer —
            // and startup was the one that did not, so the map reopened filtered by
            // criteria that existed nowhere in the UI: worlds hidden, the form empty,
            // hasAnyActiveFilter() answering false, Shift+F replying "No filter is
            // active", and route generation silently restricted to the survivors
            // (getFilteredHexIds reads the flags, not the fields).
            //
            // Recomputing from the empty form is what makes the two agree again, and
            // it self-heals a store already polluted by an earlier build.
            if (typeof window.applyActiveFilters === 'function') {
                window.applyActiveFilters();
            } else if (typeof draw === 'function') {
                requestAnimationFrame(draw);
            }
        }
    }

    initializeInput();
    if (typeof resize === 'function') {
        resize();
    }
    // The boot starfield waits for this. Revealing earlier fades in the
    // default 300×150 bitmap, stretched across the window by CSS.
    window.__mapBootDrawn = true;
    if (typeof window.__bootTryReveal === 'function') window.__bootTryReveal();
    } catch (err) {
        console.error('[Boot]', err);
        _releaseBoot(err && err.message ? err.message : 'The map could not be opened. Autosave is paused.');
        return;
    }
    if (bootError) {
        showToast(`The stored map could not be restored: ${bootError.message || bootError}. Autosave is paused until you load a map file or clear the canvas.`, 0);
    }
});
