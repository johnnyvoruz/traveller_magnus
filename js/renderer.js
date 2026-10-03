// =============================================================================
// RENDERER.JS - Canvas & Rendering Logic
// =============================================================================

let canvas;
let ctx;

// -----------------------------------------------------------------------------
// Player-map disclosure (Release 2, WP6)
// -----------------------------------------------------------------------------
// The subsector map is produced by captureSubsector() calling this same draw(),
// so without a gate here a players' export ships a picture of every UWP, trade
// code and starport class in the subsector — the one leak no text filter can
// touch, because it is pixels. See manifest 5.2.1 and fog_of_war_field_tags
// §9.3a, which specifies exactly what the map may show at each level:
//
//   (0) nothing        (a) star dot, travel-zone ring, allegiance colour
//   (c) + gas giant    (d) + system name
//   (g) + UWP, trade codes, starport class, naval/scout bases
//
// `_mapDisclosure` is null for every normal call, so the on-screen map and the
// referee export are completely unaffected — every gate short-circuits to true.
let _mapDisclosure = null;   // (hexId) => level string, or null for GM

function setMapDisclosure(fn) { _mapDisclosure = (typeof fn === 'function') ? fn : null; }

function _mapLevel(hexId) {
    return _mapDisclosure ? _mapDisclosure(hexId) : null;
}

// True on the GM path; otherwise only when the hex's level permits `required`.
function _mapShow(hexId, required) {
    if (!_mapDisclosure) return true;
    const lv = _mapDisclosure(hexId);
    return !!(window.DisclosureModel && window.DisclosureModel.atLeast(lv, required));
}

// -----------------------------------------------------------------------------
// Initialization Helper (Lazy Loading)
// -----------------------------------------------------------------------------
function initCanvas() {
    if (!canvas) {
        canvas = document.getElementById('map-canvas');
    }
    // Check if we need the context, regardless of when the canvas was found
    if (canvas && !ctx) {
        ctx = canvas.getContext('2d');
    }
    return canvas && ctx;
}

// -----------------------------------------------------------------------------
// Draw caches — Universe-scale maps (128 sectors, ~164k hexes) cannot rebuild
// derived geometry, scan every EMPTY hex, or re-trace political borders on
// every pan/zoom frame and still hit 60 fps.
// -----------------------------------------------------------------------------
const _hexGeomCache = new Map(); // hexId -> { q, r, x, y }
let _hexGeomGridW = -1;
let _hexGeomGridH = -1;

let _systemIndex = null;         // [{ id, q, r, x, y }]
let _systemIndexMap = null;
let _systemIndexDirty = true;

let _regionFillMap = null;       // hexId -> color
let _extraFillIds = [];          // manualBgColor / filter bgFillColor
let _fillCacheMap = null;
let _regionFillDirty = true;
let _regionDefStamp = '';

let _borderFillMap = null;       // hexId -> color
let _borderFillDirty = true;
let _borderDefStamp = '';
let _borderAssignMap = null;
let _borderGeomCache = null;     // [{ color, loops, minX, maxX, minY, maxY }]

// Zoomed-out fills: one Path2D per (layer, color) instead of fill() per hex.
// Universe-scale polity washes are 30k–80k hexes; 50k Path2D+fill calls is ~10 fps.
let _fillPathCache = [];
let _fillPathDirty = true;

// Zoomed-out routes: Path2D per color, rebuilt when the route list/defs change.
let _routeStrokeCache = { key: '', strokes: [] };

const HEX_COS = new Float64Array(6);
const HEX_SIN = new Float64Array(6);
for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    HEX_COS[i] = Math.cos(a);
    HEX_SIN[i] = Math.sin(a);
}

function _hexGeom(hexId) {
    if (_hexGeomGridW !== gridWidth || _hexGeomGridH !== gridHeight) {
        _hexGeomCache.clear();
        _hexGeomGridW = gridWidth;
        _hexGeomGridH = gridHeight;
    }
    let g = _hexGeomCache.get(hexId);
    if (g) return g;
    const coords = getHexCoords(hexId);
    if (!coords) return null;
    const size = baseHexSize;
    const widthStep = 1.5 * size;
    const heightStep = Math.sqrt(3) * size;
    g = {
        q: coords.q,
        r: coords.r,
        x: widthStep * coords.q,
        y: heightStep * (coords.r + ((coords.q & 1) ? 0.5 : 0))
    };
    _hexGeomCache.set(hexId, g);
    return g;
}

function _watchMapMutations(map, onMutate) {
    if (!map || map.__tmDrawWatched || typeof map.set !== 'function') return;
    const set = map.set.bind(map);
    const del = map.delete.bind(map);
    const clr = map.clear.bind(map);
    map.set = (k, v) => { onMutate(); return set(k, v); };
    map.delete = (k) => { onMutate(); return del(k); };
    map.clear = () => { onMutate(); return clr(); };
    map.__tmDrawWatched = true;
}

function _defsStamp(defs) {
    if (!defs || defs.length === 0) return '';
    let s = '';
    for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        s += d.id + '\t' + (d.color || '') + '\t' + (d.visible === false ? '0' : '1') + '\t' + (d.name || '') + '\t' + (d.style || '') + '\n';
    }
    return s;
}

window.invalidateSystemIndex = function () { _systemIndexDirty = true; _systemIndex = null; _invalidateViewCache(); };
window.invalidateRegionFillCache = function () {
    _regionFillDirty = true;
    _rnCacheSize = -1;
    _fillPathDirty = true;
    _invalidateViewCache();
};
window.invalidateBorderGeomCache = function () {
    _borderGeomCache = null;
    _borderFillDirty = true;
    _fillPathDirty = true;
    _invalidateViewCache();
};
window.invalidateRouteStrokeCache = function () { _routeStrokeCache = { key: '', strokes: [] }; _invalidateViewCache(); };
window.invalidateMapDrawCaches = function () {
    _systemIndexDirty = true;
    _systemIndex = null;
    _regionFillDirty = true;
    _rnCacheSize = -1;
    _borderGeomCache = null;
    _borderFillDirty = true;
    _fillPathDirty = true;
    _routeStrokeCache = { key: '', strokes: [] };
    _invalidateViewCache();
};

// Content LOD (zoom = our camera; ~75 px/parsec at zoom 1). TravellerMap
// substitutes layers at these scales rather than thinning the same geometry.
// Below HEX_FILLS a hex is <4px — per-hex Path2D washes cost more than they show.
const LOD_DOTS = 0.07;
const LOD_ROUTES = 0.10;
const LOD_GRID = 0.3;
const LOD_LABELS = 0.85;
const LOD_SNAP_DOTS = 0.05;
const LOD_SNAP_GRID = 0.22;

// Pan bitmap. Larger than the window by a margin on every side, so a drag
// copies pixels that are already drawn. The on-screen canvas never shows a
// strip of bare background where the map has not been painted yet.
// Kept under PAN_CACHE_BUDGET; a viewport that already fills the budget is
// drawn straight to the screen instead.
const PAN_CACHE_BUDGET = 64 * 1024 * 1024;
const _viewCache = {
    canvas: null,
    ctx: null,
    zoom: 0,
    cameraX: 0,
    cameraY: 0,
    dpr: 1,
    screenW: 0,
    screenH: 0,
    margin: 0,
    printMode: false,
    valid: false
};
let _drawRaf = 0;
let _paintingPanCache = false;
let _mapViewCssW = 0;
let _mapViewCssH = 0;
let _lodFrameAnimating = false;

function _invalidateViewCache() { _viewCache.valid = false; }

function _mapFrameCss() {
    return {
        w: _mapViewCssW || window.innerWidth,
        h: _mapViewCssH || window.innerHeight
    };
}

function scheduleDraw() {
    if (_drawRaf) return;
    _drawRaf = requestAnimationFrame(() => {
        _drawRaf = 0;
        draw();
    });
}
window.scheduleDraw = scheduleDraw;

function _panMarginCss() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 2 || h < 2) return 0;
    const bpp = 4 * dpr * dpr;
    if (w * h * bpp >= PAN_CACHE_BUDGET * 0.85) return 0;
    let lo = 0;
    let hi = Math.round(Math.min(w, h) * 0.5);
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const bytes = (w + 2 * mid) * (h + 2 * mid) * bpp;
        if (bytes <= PAN_CACHE_BUDGET) lo = mid;
        else hi = mid - 1;
    }
    return lo >= 32 ? lo : 0;
}

// CSS pixels of already-drawn map left around the window, or null when the
// cached bitmap cannot cover this view.
function _cacheSlackCss() {
    const cache = _viewCache;
    if (!cache.valid || !cache.canvas) return null;
    const dpr = window.devicePixelRatio || 1;
    if (cache.zoom !== zoom || cache.dpr !== dpr) return null;
    if (cache.screenW !== window.innerWidth || cache.screenH !== window.innerHeight) return null;
    if (cache.printMode !== !!window.printMode) return null;
    const sx = (cameraX - cache.cameraX) * zoom * dpr;
    const sy = (cameraY - cache.cameraY) * zoom * dpr;
    const sw = window.innerWidth * dpr;
    const sh = window.innerHeight * dpr;
    if (sx < -1 || sy < -1) return null;
    if (sx + sw > cache.canvas.width + 1 || sy + sh > cache.canvas.height + 1) return null;
    return Math.min(
        sx / dpr,
        sy / dpr,
        (cache.canvas.width - sx - sw) / dpr,
        (cache.canvas.height - sy - sh) / dpr
    );
}

function _rebuildPanCache(forcedMargin) {
    const margin = forcedMargin == null ? _panMarginCss() : forcedMargin;
    if (!(zoom > 0)) return false;
    if (forcedMargin == null && margin < 32) return false;
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth + margin * 2;
    const cssH = window.innerHeight + margin * 2;
    if (!_viewCache.canvas) {
        _viewCache.canvas = document.createElement('canvas');
        _viewCache.ctx = _viewCache.canvas.getContext('2d', { alpha: false });
    }
    const off = _viewCache.canvas;
    const devW = Math.max(1, Math.round(cssW * dpr));
    const devH = Math.max(1, Math.round(cssH * dpr));
    if (off.width !== devW) off.width = devW;
    if (off.height !== devH) off.height = devH;
    const screenCanvas = canvas;
    const screenCtx = ctx;
    const savedX = cameraX;
    const savedY = cameraY;
    _paintingPanCache = true;
    _mapViewCssW = cssW;
    _mapViewCssH = cssH;
    canvas = off;
    ctx = _viewCache.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    cameraX = savedX - margin / zoom;
    cameraY = savedY - margin / zoom;
    let painted = false;
    try {
        draw();
        painted = true;
    } finally {
        cameraX = savedX;
        cameraY = savedY;
        canvas = screenCanvas;
        ctx = screenCtx;
        _paintingPanCache = false;
        _mapViewCssW = 0;
        _mapViewCssH = 0;
    }
    if (!painted) return false;
    _viewCache.zoom = zoom;
    _viewCache.cameraX = savedX - margin / zoom;
    _viewCache.cameraY = savedY - margin / zoom;
    _viewCache.dpr = dpr;
    _viewCache.screenW = window.innerWidth;
    _viewCache.screenH = window.innerHeight;
    _viewCache.margin = margin;
    _viewCache.printMode = !!window.printMode;
    _viewCache.valid = true;
    return true;
}

function _presentPanCache() {
    const cache = _viewCache;
    const dpr = cache.dpr;
    let sx = Math.round((cameraX - cache.cameraX) * zoom * dpr);
    let sy = Math.round((cameraY - cache.cameraY) * zoom * dpr);
    let sw = window.innerWidth * dpr;
    let sh = window.innerHeight * dpr;
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }
    if (sx + sw > cache.canvas.width) sw = cache.canvas.width - sx;
    if (sy + sh > cache.canvas.height) sh = cache.canvas.height - sy;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (sw > 0 && sh > 0) ctx.drawImage(cache.canvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    // Sticky titles and territory names are laid out for the window, so they
    // are painted after the bitmap instead of being dragged along with it.
    _paintPinnedMapLabels();
}

// Draw the cached map at the current zoom, anchored to the camera, so a zoom
// wheel scales the picture that is already on screen. The sharp frame replaces
// it when the offscreen paint finishes. Gaps outside the cache stay the map
// background only until that frame; the visible canvas is not cleared first.
function _presentScaledCache() {
    const cache = _viewCache;
    if (!cache.valid || !cache.canvas || !(cache.zoom > 0) || !(zoom > 0)) return false;
    const dpr = window.devicePixelRatio || 1;
    if (cache.dpr !== dpr || cache.printMode !== !!window.printMode) return false;
    if (cache.screenW !== window.innerWidth || cache.screenH !== window.innerHeight) return false;
    const zScale = cache.zoom / zoom;
    let sx = (cameraX - cache.cameraX) * cache.zoom * dpr;
    let sy = (cameraY - cache.cameraY) * cache.zoom * dpr;
    let sw = canvas.width * zScale;
    let sh = canvas.height * zScale;
    let dx = 0;
    let dy = 0;
    let dw = canvas.width;
    let dh = canvas.height;
    const srcW = cache.canvas.width;
    const srcH = cache.canvas.height;
    if (sx < 0) {
        dx += -sx / zScale;
        dw -= -sx / zScale;
        sw += sx;
        sx = 0;
    }
    if (sy < 0) {
        dy += -sy / zScale;
        dh -= -sy / zScale;
        sh += sy;
        sy = 0;
    }
    if (sx + sw > srcW) {
        const cut = sx + sw - srcW;
        dw -= cut / zScale;
        sw -= cut;
    }
    if (sy + sh > srcH) {
        const cut = sy + sh - srcH;
        dh -= cut / zScale;
        sh -= cut;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    const bg = window.printMode ? '#ffffff' : '#0b0c10';
    ctx.fillStyle = bg;
    if (dx > 0.5) ctx.fillRect(0, 0, dx, canvas.height);
    if (dx + dw < canvas.width - 0.5) ctx.fillRect(dx + dw, 0, canvas.width - (dx + dw), canvas.height);
    if (dy > 0.5) ctx.fillRect(dx, 0, Math.max(0, dw), dy);
    if (dy + dh < canvas.height - 0.5) ctx.fillRect(dx, dy + dh, Math.max(0, dw), canvas.height - (dy + dh));
    if (sw > 1 && sh > 1 && dw > 1 && dh > 1) ctx.drawImage(cache.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
    _paintPinnedMapLabels();
    return true;
}

function _paintPinnedMapLabels() {
    // The scale blit runs before the sharp frame. Snap here so a zoom-out does
    // not lay out titles that this zoom has already turned off.
    _applyTextLod();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (_lod.subLabels.alpha > 0.001) {
        const size = baseHexSize;
        ctx.save();
        ctx.scale(zoom, zoom);
        ctx.translate(-cameraX, -cameraY);
        drawSubsectorTitles(_lod.subLabels.alpha, 1.5 * size, Math.sqrt(3) * size, size, false);
        ctx.restore();
    }
    drawBorderNames();
    drawRegionNames();
}

// While a pan is in progress, show the cached margin. Rebuild it only when
// the window is about to slide off the bitmap, then show the new one.
function _presentPanIfDragging() {
    if (canvas !== document.getElementById('map-canvas')) return false;
    if (typeof isDragging === 'undefined' || !isDragging) return false;
    if (typeof isPainting !== 'undefined' && isPainting) return false;
    if (typeof isAltDragging !== 'undefined' && isAltDragging) return false;
    const slack = _cacheSlackCss();
    const limit = _viewCache.margin ? Math.min(48, _viewCache.margin * 0.25) : 48;
    if (slack == null || slack < limit) {
        if (_viewCache.valid && _viewCache.zoom !== zoom) _presentScaledCache();
        if (!_rebuildPanCache()) return false;
    }
    const t0 = window.showMapPerf ? performance.now() : 0;
    _presentPanCache();
    if (window.showMapPerf) _drawPerfOverlay(performance.now() - t0, 0, 0, 0, 0, true);
    return true;
}

// Live frames paint offscreen and then copy. The on-screen canvas is never
// cleared at the start of a long render, which is what flashed black on zoom.
function _presentLiveFrame() {
    if (_presentPanIfDragging()) {
        if (_lodFrameAnimating) requestAnimationFrame(draw);
        return true;
    }
    if (_viewCache.valid && _viewCache.zoom !== zoom) _presentScaledCache();
    if (_rebuildPanCache() || _rebuildPanCache(0)) {
        _presentPanCache();
        if (_lodFrameAnimating) requestAnimationFrame(draw);
        return true;
    }
    return false;
}

function _starHash(x, y) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return n >>> 0;
}

function drawMacroStarfield(viewLeft, viewRight, viewTop, viewBottom, alpha) {
    if (alpha < 0.001) return;
    const size = baseHexSize;
    const widthStep = 1.5 * size;
    const heightStep = Math.sqrt(3) * size;
    const mapL = -size;
    const mapT = -size;
    const mapR = (gridWidth * 32 - 1) * widthStep + size;
    const mapB = (gridHeight * 40 - 1) * heightStep + heightStep / 2 + size;
    viewLeft = Math.max(viewLeft, mapL);
    viewTop = Math.max(viewTop, mapT);
    viewRight = Math.min(viewRight, mapR);
    viewBottom = Math.min(viewBottom, mapB);
    if (viewRight <= viewLeft || viewBottom <= viewTop) return;
    const cell = 56 / zoom;
    const col0 = Math.floor(viewLeft / cell) - 1;
    const col1 = Math.ceil(viewRight / cell) + 1;
    const row0 = Math.floor(viewTop / cell) - 1;
    const row1 = Math.ceil(viewBottom / cell) + 1;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = window.printMode ? '#4a4a4a' : '#d0d4d8';
    ctx.beginPath();
    for (let c = col0; c <= col1; c++) {
        for (let r = row0; r <= row1; r++) {
            const h = _starHash(c, r);
            if ((h & 0xff) > 90) continue;
            const x = (c + ((h >>> 8) & 0xff) / 255) * cell;
            const y = (r + ((h >>> 16) & 0xff) / 255) * cell;
            const rad = (0.7 + ((h >>> 24) & 7) * 0.18) / zoom;
            ctx.moveTo(x + rad, y);
            ctx.arc(x, y, rad, 0, Math.PI * 2);
        }
    }
    ctx.fill();
    ctx.restore();
}

function drawMacroPolityFills(viewLeft, viewRight, viewTop, viewBottom) {
    if (!_borderGeomCache) _rebuildBorderGeomCache();
    if (!_borderGeomCache || _borderGeomCache.length === 0) return;
    const pad = baseHexSize * 2;
    const step = Math.max(1, Math.round(4 / Math.max(zoom * baseHexSize, 0.01)));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5 / zoom;
    for (let i = 0; i < _borderGeomCache.length; i++) {
        const entry = _borderGeomCache[i];
        if (entry.maxX < viewLeft - pad || entry.minX > viewRight + pad ||
            entry.maxY < viewTop - pad || entry.minY > viewBottom + pad) continue;
        ctx.fillStyle = entry.color;
        ctx.strokeStyle = entry.color;
        for (let li = 0; li < entry.loops.length; li++) {
            const pts = entry.loops[li];
            if (pts.length < 6) continue;
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            const last = pts.length - 2;
            for (let p = 2 * step; p < last; p += 2 * step) ctx.lineTo(pts[p], pts[p + 1]);
            ctx.lineTo(pts[last], pts[last + 1]);
            ctx.closePath();
            ctx.globalAlpha = 0.22;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
        }
    }
    ctx.restore();
}

function _drawPerfOverlay(ms, fills, routes, borders, worlds, blit) {
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "12px 'Inter', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const fps = ms > 0 ? Math.round(1000 / ms) : 0;
    const label = (blit ? 'blit ' : '') + ms.toFixed(1) + ' ms  ' + fps + ' fps';
    const detail = blit ? 'pan cache' : (
        'F ' + fills.toFixed(0) +
        '  R ' + routes.toFixed(0) +
        '  B ' + borders.toFixed(0) +
        '  W ' + worlds.toFixed(0)
    );
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(8, 8, 168, 36);
    ctx.fillStyle = ms <= 16.7 ? '#66fcf1' : (ms <= 33 ? '#ffbf00' : '#ff4500');
    ctx.fillText(label, 14, 12);
    ctx.fillStyle = '#c5c6c7';
    ctx.fillText(detail, 14, 26);
    ctx.restore();
    window._mapDrawMs = ms;
    window._mapDrawPerf = { ms, fills, routes, borders, worlds, blit: !!blit };
}

// LOD fades — 500ms ease-out for dots and the hex grid. World labels, subsector
// titles, and sector names snap on and off: easing them rebuilds the pan bitmap
// and lays the titles out again on every frame of the fade.
const LOD_FADE_MS = 500;
const _lod = {
    dots:        { alpha: 0, target: null, from: 0, t0: 0 },
    grid:        { alpha: 0, target: null, from: 0, t0: 0 },
    labels:      { alpha: 0, target: null, from: 0, t0: 0 },
    sectorNames: { alpha: 0, target: null, from: 0, t0: 0 },
    subLabels:   { alpha: 0, target: null, from: 0, t0: 0 },
    regionNames: { alpha: 0, target: null, from: 0, t0: 0 },
    borderNames: { alpha: 0, target: null, from: 0, t0: 0 },
};

function _syncLodLayer(name, on, now, snap) {
    const layer = _lod[name];
    const t = on ? 1 : 0;
    if (layer.target === null || snap) {
        layer.alpha = t;
        layer.target = t;
        return;
    }
    if (layer.target === t) return;
    layer.from = layer.alpha;
    layer.t0 = now;
    layer.target = t;
}

// Text is redrawn from scratch. An in-between alpha does not reuse the last
// glyphs, so a fade is a full extra paint. On or off only.
function _snapLodLayer(name, on) {
    const layer = _lod[name];
    const t = on ? 1 : 0;
    layer.alpha = t;
    layer.target = t;
    layer.from = t;
}

function _applyTextLod() {
    const wantLabels = zoom >= LOD_LABELS;
    const namesOn = typeof showSectorNames !== 'undefined' && !!showSectorNames;
    _snapLodLayer('labels', wantLabels);
    _snapLodLayer('sectorNames', namesOn && !wantLabels && !!showSubsectorBorders);
    _snapLodLayer('subLabels', namesOn && wantLabels);
}

function _tickLod(now, snap) {
    let animating = false;
    for (const name in _lod) {
        const layer = _lod[name];
        if (layer.target === null) continue;
        if (snap) {
            layer.alpha = layer.target;
            continue;
        }
        if (layer.alpha === layer.target) continue;
        const u = Math.min(1, (now - layer.t0) / LOD_FADE_MS);
        const e = u * (2 - u);
        layer.alpha = layer.from + (layer.target - layer.from) * e;
        if (u >= 1) layer.alpha = layer.target;
        else animating = true;
    }
    return animating;
}

function _ensureSystemIndex() {
    if (_systemIndex && _systemIndexMap === hexStates && !_systemIndexDirty) return _systemIndex;
    const list = [];
    hexStates.forEach((state, id) => {
        if (!state || state.type !== 'SYSTEM_PRESENT') return;
        const g = _hexGeom(id);
        if (g) list.push({ id, q: g.q, r: g.r, x: g.x, y: g.y });
    });
    _systemIndex = list;
    _systemIndexMap = hexStates;
    _systemIndexDirty = false;
    return list;
}

function _ensureFillCaches() {
    _watchMapMutations(hexStates, () => {
        _systemIndexDirty = true;
        _regionFillDirty = true;
        _rnCacheSize = -1;
    });
    if (!_regionFillDirty && _regionFillMap && _fillCacheMap === hexStates) return;
    const regionByName = new Map(
        (window.regionDefinitions || [])
            .filter(d => d.visible !== false)
            .map(d => [d.name, d.color])
    );
    const regionMap = new Map();
    const extra = [];
    hexStates.forEach((state, hexId) => {
        if (!state) return;
        if (state.cluster && state.cluster !== '----') {
            const color = regionByName.get(state.cluster);
            if (color) regionMap.set(hexId, color);
        }
        if (state.manualBgColor || (state.custom_ui && state.custom_ui.bgFillColor)) extra.push(hexId);
    });
    _regionFillMap = regionMap;
    _extraFillIds = extra;
    _fillCacheMap = hexStates;
    _regionFillDirty = false;
    _fillPathDirty = true;
}

function _ensureBorderFillMap() {
    _watchMapMutations(window.hexBorderAssignments, () => {
        _borderGeomCache = null;
        _borderFillDirty = true;
    });
    if (window.hexBorderAssignments !== _borderAssignMap) {
        _borderAssignMap = window.hexBorderAssignments;
        _borderFillDirty = true;
        _borderGeomCache = null;
    }
    if (!_borderFillDirty && _borderFillMap) return _borderFillMap;
    const map = new Map();
    if (window.borderFillEnabled &&
        window.borderDefinitions && window.borderDefinitions.length > 0 &&
        window.hexBorderAssignments && window.hexBorderAssignments.size > 0) {
        const borderColorById = new Map();
        window.borderDefinitions
            .filter(d => d.visible !== false && d.color)
            .forEach(d => borderColorById.set(d.id, d.color));
        window.hexBorderAssignments.forEach((borderId, hexId) => {
            const color = borderColorById.get(borderId);
            if (color) map.set(hexId, color);
        });
    }
    _borderFillMap = map;
    _borderFillDirty = false;
    _fillPathDirty = true;
    return map;
}

function _addHexToPath(path, x, y, size) {
    path.moveTo(x + size * HEX_COS[0], y + size * HEX_SIN[0]);
    for (let i = 1; i < 6; i++) path.lineTo(x + size * HEX_COS[i], y + size * HEX_SIN[i]);
    path.closePath();
}

function _ensureFillPaths() {
    if (!_fillPathDirty && _fillPathCache) return _fillPathCache;
    const size = baseHexSize;
    const out = [];

    function addLayer(forEachHexColor, alpha) {
        const byColor = new Map();
        forEachHexColor((hexId, color) => {
            if (!color) return;
            const g = _hexGeom(hexId);
            if (!g) return;
            let e = byColor.get(color);
            if (!e) {
                e = {
                    color, alpha, path: new Path2D(),
                    minX: Infinity, maxX: -Infinity,
                    minY: Infinity, maxY: -Infinity
                };
                byColor.set(color, e);
            }
            _addHexToPath(e.path, g.x, g.y, size);
            if (g.x - size < e.minX) e.minX = g.x - size;
            if (g.x + size > e.maxX) e.maxX = g.x + size;
            if (g.y - size < e.minY) e.minY = g.y - size;
            if (g.y + size > e.maxY) e.maxY = g.y + size;
        });
        byColor.forEach(e => out.push(e));
    }

    addLayer((fn) => {
        if (_borderFillMap) _borderFillMap.forEach((color, hexId) => fn(hexId, color));
    }, 0.2);
    addLayer((fn) => {
        for (let i = 0; i < _extraFillIds.length; i++) {
            const hexId = _extraFillIds[i];
            const state = hexStates.get(hexId);
            if (state && state.manualBgColor) fn(hexId, state.manualBgColor);
        }
    }, 0.3);
    addLayer((fn) => {
        if (_regionFillMap) _regionFillMap.forEach((color, hexId) => fn(hexId, color));
    }, 0.3);
    addLayer((fn) => {
        for (let i = 0; i < _extraFillIds.length; i++) {
            const hexId = _extraFillIds[i];
            const state = hexStates.get(hexId);
            const color = state && state.custom_ui && state.custom_ui.bgFillColor;
            if (color) fn(hexId, color);
        }
    }, 0.3);

    _fillPathCache = out;
    _fillPathDirty = false;
    return out;
}

function _routeDash(style) {
    const s = (style || '').toLowerCase();
    if (s === 'dashed') return [8, 5];
    if (s === 'dotted') return [1.5, 3];
    return [];
}

function _appendRouteLine(path, route, gap) {
    const sPx = _hexGeom(route.startId);
    const ePx = _hexGeom(route.endId);
    if (!sPx || !ePx) return;
    const dx = ePx.x - sPx.x;
    const dy = ePx.y - sPx.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= gap * 2) return;
    const ux = dx / dist;
    const uy = dy / dist;
    path.moveTo(sPx.x + ux * gap, sPx.y + uy * gap);
    path.lineTo(ePx.x - ux * gap, ePx.y - uy * gap);
}

function _ensureRouteStrokes(showFilter, gap) {
    const routes = window.sectorRoutes;
    const defs = window.routeDefinitions || [];
    const n = routes ? routes.length : 0;
    const a = n ? routes[0] : null;
    const b = n ? routes[n - 1] : null;
    const key = [
        n,
        a && a.startId, a && a.endId, a && a.routeId, a && a.color,
        b && b.startId, b && b.endId, b && b.routeId, b && b.color,
        showFilter ? '1' : '0',
        _defsStamp(defs)
    ].join('\t');
    if (_routeStrokeCache.key === key && _routeStrokeCache.ref === routes) return _routeStrokeCache.strokes;

    const defMap = new Map(defs.map(d => [d.id, d]));
    const filterByColor = new Map();
    const defPaths = new Map();
    const legacyByType = new Map();

    for (let i = 0; i < n; i++) {
        const r = routes[i];
        if (r.routeId != null) {
            const def = defMap.get(r.routeId);
            if (def && def.visible === false) continue;
        }
        if (r.type === 'Filter') {
            if (!showFilter) continue;
            const def = r.routeId != null ? defMap.get(r.routeId) : null;
            const c = def ? def.color : (r.color || '#ffffff');
            let path = filterByColor.get(c);
            if (!path) { path = new Path2D(); filterByColor.set(c, path); }
            _appendRouteLine(path, r, gap);
        } else if (r.routeId != null) {
            const def = defMap.get(r.routeId);
            if (!def || def.visible === false) continue;
            let path = defPaths.get(def.id);
            if (!path) { path = new Path2D(); defPaths.set(def.id, path); }
            _appendRouteLine(path, r, gap);
        } else {
            const t = r.type || 'unknown';
            let path = legacyByType.get(t);
            if (!path) { path = new Path2D(); legacyByType.set(t, path); }
            _appendRouteLine(path, r, gap);
        }
    }

    const strokes = [];
    filterByColor.forEach((path, color) => strokes.push({ color, path, dash: [] }));
    for (let i = 0; i < defs.length; i++) {
        const def = defs[i];
        if (def.visible === false) continue;
        const path = defPaths.get(def.id);
        if (path) strokes.push({ color: def.color, path, dash: _routeDash(def.style) });
    }
    const typeColors = { Xboat: '#00ff00', Trade: '#ff0000', Secondary: '#ffff00' };
    legacyByType.forEach((path, type) => {
        strokes.push({ color: typeColors[type] || '#ffffff', path });
    });

    _routeStrokeCache = { key, strokes, ref: routes };
    return strokes;
}
// -----------------------------------------------------------------------------
// Rendering Functions
// -----------------------------------------------------------------------------

function resize() {
    if (!initCanvas()) return;

    // Use the global width/height if they exist, otherwise window defaults
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    _invalidateViewCache();
    draw();
}

function getHexPath(x, y, size) {
    const path = new Path2D();
    _addHexToPath(path, x, y, size);
    return path;
}

function draw() {
    // 1. Structural Safety Check
    if (!initCanvas()) return;
    if (!_paintingPanCache && canvas === document.getElementById('map-canvas')) {
        _lodFrameAnimating = false;
        if (_presentLiveFrame()) return;
    }

    const _perfOn = !!window.showMapPerf;
    const _drawT0 = _perfOn ? performance.now() : 0;
    let _perfFills = 0, _perfRoutes = 0, _perfBorders = 0, _perfWorlds = 0;
    const snapLod = !_paintingPanCache && canvas !== document.getElementById('map-canvas');

    // 2. Clear the canvas using the actual pixel dimensions
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 3. Fill the background color
    ctx.fillStyle = window.printMode ? '#ffffff' : '#0b0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // 4. Apply Camera Transformations
    // NOTE: We use width/height from the window directly for the viewport calculation
    ctx.scale(zoom, zoom);
    ctx.translate(-cameraX, -cameraY);

    // 5. Grid Styling
    ctx.strokeStyle = window.printMode ? '#cccccc' : '#1f2833';
    ctx.lineWidth = 1 / zoom;

    const size = baseHexSize;
    const widthStep = (3 / 2) * size;
    const heightStep = Math.sqrt(3) * size;

    // 6. Calculate visible bounds. A pan-cache paint uses the larger bitmap.
    const frame = _mapFrameCss();
    const viewLeft = cameraX;
    const viewRight = cameraX + frame.w / zoom;
    const viewTop = cameraY;
    const viewBottom = cameraY + frame.h / zoom;

    const qMin = Math.floor(viewLeft / widthStep) - 2;
    const qMax = Math.ceil(viewRight / widthStep) + 2;
    const rMin = Math.floor(viewTop / heightStep) - 2;
    const rMax = Math.ceil(viewBottom / heightStep) + 2;

    // (Moved to layered pass below)

    const MAX_GLOBAL_Q = gridWidth  * 32 - 1;
    const MAX_GLOBAL_R = gridHeight * 40 - 1;
    const visQ = Math.min(MAX_GLOBAL_Q, qMax) - Math.max(0, qMin) + 1;
    const visR = Math.min(MAX_GLOBAL_R, rMax) - Math.max(0, rMin) + 1;
    const visCells = visQ * visR;

    // LOD: dots and the hex grid fade. Text snaps on or off.
    // Below HEX_FILLS, hex washes and real routes are replaced with simplified
    // polity loops + a cheap starfield (TravellerMap Charted Space view).
    const wantDots = zoom >= LOD_DOTS && visCells <= 12000;
    const wantRoutes = zoom >= LOD_ROUTES;
    const wantGrid = zoom >= LOD_GRID;
    const now = performance.now();
    _applyTextLod();
    _syncLodLayer('dots', wantDots, now, snapLod);
    _syncLodLayer('grid', wantGrid, now, snapLod);
    _syncLodLayer('regionNames', !!window.regionNamesEnabled, now, snapLod);
    _syncLodLayer('borderNames', !!window.borderNamesEnabled, now, snapLod);
    const lodAnimating = _tickLod(now, snapLod);
    // Fading grid alpha still visits every on-screen cell. At universe scale
    // that is 40k–160k Path2D strokes.
    if (!wantGrid && zoom < LOD_SNAP_GRID) {
        _lod.grid.alpha = 0;
        _lod.grid.target = 0;
    }
    if (!wantDots && zoom < LOD_SNAP_DOTS) {
        _lod.dots.alpha = 0;
        _lod.dots.target = 0;
    }
    const showDots = _lod.dots.alpha > 0.001;
    const showGrid = _lod.grid.alpha > 0.001;
    const showText = _lod.labels.alpha > 0.001;
    const gridAlpha = _lod.grid.alpha;
    const labelsAlpha = _lod.labels.alpha;
    const sectorNameAlpha = _lod.sectorNames.alpha;
    const subLabelAlpha = _lod.subLabels.alpha;

    // Teal hex outline for the inspected system and for a selected campaign record.
    // Campaign records also dim other systems. Skip when that hex would not be drawn.
    function visibleFocusHex(id) {
        if (!id) return null;
        const focusState = hexStates.get(id);
        const focusData = focusState?.rttData || focusState?.t5Data || focusState?.mgt2eData || focusState?.ctData;
        if (!focusState || focusState.type !== 'SYSTEM_PRESENT'
            || (focusState.isHiddenByFilter && !window.filterSuspended)
            || (_mapDisclosure && _mapLevel(id) === '0')
            || (hideNoPlanetSystems && (focusData?.isStellarOnly || (focusState.aowSystem && !focusState.aowSystem.mainworld)))) {
            return null;
        }
        return id;
    }
    const campaignFocusHex = visibleFocusHex(window.CampaignAtlas?.focusedHexId?.());
    const outlineHex = campaignFocusHex || visibleFocusHex(window.SystemInspector?.inspectedHexId?.());

    const nextBorderStamp = _defsStamp(window.borderDefinitions)
        + (window.borderFillEnabled ? '1' : '0')
        + (window.hexBgFillVisible !== false ? '1' : '0');
    if (nextBorderStamp !== _borderDefStamp) {
        _borderDefStamp = nextBorderStamp;
        _borderFillDirty = true;
        _borderGeomCache = null;
    }
    const nextRegionStamp = _defsStamp(window.regionDefinitions);
    if (nextRegionStamp !== _regionDefStamp) {
        _regionDefStamp = nextRegionStamp;
        _regionFillDirty = true;
        _rnCacheSize = -1;
    }

    const fillsOn = window.hexBgFillVisible !== false;
    let visibleBorderFillMap = _borderFillMap || new Map();
    let visibleRegionMap = _regionFillMap || new Map();
    if (wantGrid) {
        _ensureFillCaches();
        visibleBorderFillMap = _ensureBorderFillMap();
        visibleRegionMap = _regionFillMap || new Map();
    }

    const useMacroFills = fillsOn && !wantGrid;
    const starfieldAlpha = (1 - _lod.dots.alpha) * (zoom < LOD_ROUTES || visCells > 12000 ? 1 : 0);
    if (starfieldAlpha > 0.001) {
        drawMacroStarfield(viewLeft, viewRight, viewTop, viewBottom, starfieldAlpha);
    }

    // =========================================================================
    // PASS 1: DRAW THE GRID & HEX BACKGROUNDS
    // =========================================================================
    function paintHexFill(hexId, path, stateObj) {
        if (fillsOn) {
            const fillColor = visibleBorderFillMap.get(hexId);
            if (fillColor) {
                ctx.save();
                ctx.globalAlpha = 0.2;
                ctx.fillStyle = fillColor;
                ctx.fill(path);
                ctx.restore();
            }
            if (stateObj && stateObj.manualBgColor) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = stateObj.manualBgColor;
                ctx.fill(path);
                ctx.restore();
            }
            const regionColor = visibleRegionMap.get(hexId);
            if (regionColor) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = regionColor;
                ctx.fill(path);
                ctx.restore();
            }
            if (stateObj && stateObj.custom_ui && stateObj.custom_ui.bgFillColor) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = stateObj.custom_ui.bgFillColor;
                ctx.fill(path);
                ctx.restore();
            }
        }
        if (selectedHexes.has(hexId)) {
            ctx.fillStyle = 'rgba(255, 69, 0, 0.3)';
            ctx.fill(path);
        }
    }

    ctx.beginPath();
    // Hex-outline fade is fine on a local view. At universe scale the fade
    // still visited every cell; cap that, but keep the dense pass whenever
    // zoom is actually in the grid LOD (including 4K at the 0.3 floor).
    const drawHexGrid = wantGrid || (showGrid && visQ > 0 && visR > 0 && visCells <= 8000);
    if (drawHexGrid) {
        // Hex outlines: viewport is a few thousand cells at the 0.3 floor.
        for (let q = Math.max(0, qMin); q <= Math.min(MAX_GLOBAL_Q, qMax); q++) {
            for (let r = Math.max(0, rMin); r <= Math.min(MAX_GLOBAL_R, rMax); r++) {
                const offset = (q & 1) ? 0.5 : 0;
                const cx = widthStep * q;
                const cy = heightStep * (r + offset);
                const hexId = getHexId(q, r);
                if (!hexId) continue;
                const path = getHexPath(cx, cy, size);
                paintHexFill(hexId, path, hexStates.get(hexId));
                const prevA = ctx.globalAlpha;
                ctx.globalAlpha = prevA * gridAlpha;
                ctx.strokeStyle = '#1f2833';
                ctx.lineWidth = 1 / zoom;
                ctx.stroke(path);
                ctx.globalAlpha = prevA;
            }
        }
    } else {
        // Zoomed out: simplified polity loops, never a 30k–80k hex Path2D.
        if (useMacroFills) drawMacroPolityFills(viewLeft, viewRight, viewTop, viewBottom);
        selectedHexes.forEach(hexId => {
            const g = _hexGeom(hexId);
            if (!g || g.q < qMin || g.q > qMax || g.r < rMin || g.r > rMax) return;
            ctx.fillStyle = 'rgba(255, 69, 0, 0.3)';
            ctx.fill(getHexPath(g.x, g.y, size));
        });
    }
    if (_perfOn) _perfFills = performance.now() - _drawT0;

    // =========================================================================
    // LAYER 2: INTERSTELLAR ROUTES (Sean Protocol: Visibility Decoupled)
    // Filter routes drawn first (underneath); manual routes drawn on top.
    // Side-by-side offset applied at zoom >= 0.3 when routes share a segment.
    // =========================================================================
    if (wantRoutes && window.sectorRoutes && window.sectorRoutes.length > 0) {
        if (window.isLoggingEnabled && typeof tSection === 'function') tSection("Render Sector Routes");

        ctx.save();
        ctx.lineWidth = 2 / zoom;
        const gap = 20;
        const routePad = 80;
        const needOffset = zoom >= 0.3;

        // Build definition map and per-route visibility helper
        const defs       = window.routeDefinitions || [];
        const defMap     = new Map(defs.map(d => [d.id, d]));
        const showFilter = document.getElementById('filter-route-filter')?.checked ?? true;

        function isRouteVisible(r) {
            if (r.routeId != null) {
                const def = defMap.get(r.routeId);
                if (def) return def.visible !== false;
            }
            if (r.type === 'Filter') return showFilter;
            return true; // Legacy routes without routeId always shown
        }

        if (!needOffset) {
            const strokes = _ensureRouteStrokes(showFilter, gap);
            for (let i = 0; i < strokes.length; i++) {
                ctx.strokeStyle = strokes[i].color;
                ctx.setLineDash(strokes[i].dash || []);
                ctx.stroke(strokes[i].path);
                ctx.setLineDash([]);
            }
        } else {
        // Pre-build segment usage map for side-by-side offset computation.
        // Only visible routes are included so offsets reflect what the user sees.
        // Corridor math is only used at zoom >= 0.3, so skip it when zoomed out.
        const segmentUsage = new Map();
        const CORRIDOR_BUCKETS = 12;
        const corridorUsage = new Map();
        window.sectorRoutes.forEach(r => {
            if (!isRouteVisible(r)) return;
            const key = `${r.startId}|${r.endId}`;
            if (!segmentUsage.has(key)) segmentUsage.set(key, []);
            segmentUsage.get(key).push(r);
        });
        window.sectorRoutes.forEach(r => {
            if (!isRouteVisible(r)) return;
            const sp = _hexGeom(r.startId);
            const ep = _hexGeom(r.endId);
            if (!sp || !ep) return;
            let angle = Math.atan2(ep.y - sp.y, ep.x - sp.x);
            if (angle < 0) angle += Math.PI;
            const bucket = Math.floor(angle / Math.PI * CORRIDOR_BUCKETS) % CORRIDOR_BUCKETS;
            for (const hexId of [r.startId, r.endId]) {
                const cKey = `${hexId}|${bucket}`;
                if (!corridorUsage.has(cKey)) corridorUsage.set(cKey, []);
                const arr = corridorUsage.get(cKey);
                if (!arr.includes(r)) arr.push(r);
            }
        });

        // Draw one route segment with perpendicular offset for side-by-side.
        function drawRouteSegment(route) {
            const sPx = _hexGeom(route.startId);
            const ePx = _hexGeom(route.endId);
            if (!sPx || !ePx) return;
            if ((sPx.x < viewLeft - routePad && ePx.x < viewLeft - routePad) ||
                (sPx.x > viewRight + routePad && ePx.x > viewRight + routePad) ||
                (sPx.y < viewTop - routePad && ePx.y < viewTop - routePad) ||
                (sPx.y > viewBottom + routePad && ePx.y > viewBottom + routePad)) return;

            const dx   = ePx.x - sPx.x;
            const dy   = ePx.y - sPx.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= gap * 2) return;

            const ux = dx / dist;
            const uy = dy / dist;
            let ox = 0;
            let oy = 0;

            let group = segmentUsage.get(`${route.startId}|${route.endId}`) || [];
            if (group.length <= 1) {
                let angle = Math.atan2(dy, dx);
                if (angle < 0) angle += Math.PI;
                const bucket = Math.floor(angle / Math.PI * CORRIDOR_BUCKETS) % CORRIDOR_BUCKETS;
                for (const hexId of [route.startId, route.endId]) {
                    const cGroup = corridorUsage.get(`${hexId}|${bucket}`) || [];
                    if (cGroup.length > group.length) group = cGroup;
                }
            }
            const count = group.length;
            if (count > 1) {
                const idx    = group.indexOf(route);
                const offset = (idx - (count - 1) / 2) * 5;
                ox = -uy * offset;
                oy =  ux * offset;
            }

            ctx.moveTo(sPx.x + ux * gap + ox, sPx.y + uy * gap + oy);
            ctx.lineTo(ePx.x - ux * gap + ox, ePx.y - uy * gap + oy);
        }

        const filterByColor = new Map();
        const byDefId = new Map();
        const legacyByType = new Map();
        for (let i = 0; i < window.sectorRoutes.length; i++) {
            const r = window.sectorRoutes[i];
            if (!isRouteVisible(r)) continue;
            if (r.type === 'Filter') {
                if (!showFilter) continue;
                const def = r.routeId != null ? defMap.get(r.routeId) : null;
                const c = def ? def.color : (r.color || '#ffffff');
                let arr = filterByColor.get(c);
                if (!arr) { arr = []; filterByColor.set(c, arr); }
                arr.push(r);
            } else if (r.routeId != null) {
                let arr = byDefId.get(r.routeId);
                if (!arr) { arr = []; byDefId.set(r.routeId, arr); }
                arr.push(r);
            } else {
                const t = r.type || 'unknown';
                let arr = legacyByType.get(t);
                if (!arr) { arr = []; legacyByType.set(t, arr); }
                arr.push(r);
            }
        }

        if (showFilter) {
            filterByColor.forEach((routeList, color) => {
                ctx.strokeStyle = color;
                ctx.beginPath();
                routeList.forEach(r => drawRouteSegment(r));
                ctx.stroke();
            });
        }

        defs.forEach(def => {
            if (def.visible === false) return;
            const defRoutes = byDefId.get(def.id);
            if (!defRoutes || defRoutes.length === 0) return;
            ctx.strokeStyle = def.color;
            ctx.setLineDash(_routeDash(def.style));
            ctx.beginPath();
            defRoutes.forEach(r => drawRouteSegment(r));
            ctx.stroke();
            ctx.setLineDash([]);
        });

        const typeColors = { Xboat: '#00ff00', Trade: '#ff0000', Secondary: '#ffff00' };
        legacyByType.forEach((routeList, type) => {
            ctx.strokeStyle = typeColors[type] || '#ffffff';
            ctx.beginPath();
            routeList.forEach(r => drawRouteSegment(r));
            ctx.stroke();
        });
        }

        // --- "Stopped short here" markers ---------------------------------
        // A route that ran out of reachable worlds ends at an ordinary-looking
        // hex. Without a mark, "this is where I was going" and "this is as far
        // as it could get" are indistinguishable on the map — which is exactly
        // the thing the user opened the map to find out.
        //
        // Drawn as a dashed open ring in the route's own colour: dashed reads as
        // unfinished and survives any palette the user picks, where a fixed
        // warning colour would collide with their own route colours. Drawn last
        // so it sits above every route line.
        if (typeof getRouteShortfall === 'function' && zoom >= 0.25) {
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 2;
            defs.forEach(def => {
                if (def.visible === false) return;
                const sf = getRouteShortfall(def.id);
                if (!sf) return;
                const coords = getHexCoords(sf.reachedId);
                if (!coords) return;
                const px = getHexPixel(coords.q, coords.r);
                ctx.strokeStyle = def.color || '#ffffff';
                ctx.beginPath();
                ctx.arc(px.x, px.y, gap * 0.85, 0, 2 * Math.PI);
                ctx.stroke();
            });
            ctx.restore();
        }

        ctx.restore();
    }
    if (_perfOn) _perfRoutes = performance.now() - _drawT0 - _perfFills;

    // Alt+Drag Route Preview
    if (isAltDragging && altDragStartId) {
        const startCoords = getHexCoords(altDragStartId);
        if (startCoords) {
            const sPx = getHexPixel(startCoords.q, startCoords.r);
            const worldMouse = { x: cameraX + currentMouseX / zoom, y: cameraY + currentMouseY / zoom };

            let previewColor = 'rgba(128, 128, 128, 0.5)';
            const previewDef = (window.routeDefinitions || []).find(d => d.id === altDragRouteId);
            if (previewDef && previewDef.color) {
                const hex = previewDef.color.replace('#', '');
                const rCh = parseInt(hex.substring(0, 2), 16);
                const gCh = parseInt(hex.substring(2, 4), 16);
                const bCh = parseInt(hex.substring(4, 6), 16);
                previewColor = `rgba(${rCh}, ${gCh}, ${bCh}, 0.5)`;
            }

            ctx.save();
            ctx.strokeStyle = previewColor;
            ctx.setLineDash([10, 5]); // Dashed line for preview
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.moveTo(sPx.x, sPx.y);
            ctx.lineTo(worldMouse.x, worldMouse.y);
            ctx.stroke();
            ctx.restore();
        }
    }

    // =========================================================================
    // PASS 1.5: BORDER GROUPS
    // =========================================================================
    if (!useMacroFills) drawBorderGroups();
    if (_perfOn) _perfBorders = performance.now() - _drawT0 - _perfFills - _perfRoutes;

    // PASS 2: DRAW WORLD CONTENT (Icons, Labels, Symbols)
    // =========================================================================
    
    // Sean Protocol: Optimization: Detect and Log Typography Pass Init once per draw cycle
    const hasTypoRules = window.activeFilterRules && window.activeFilterRules.some(r => r.isItalic || r.isUnderline);
    if (hasTypoRules && window.isLoggingEnabled && typeof writeLogLine === 'function') {
        writeLogLine("Typography Styling Bridge: Initializing Italics/Underline checks in render pass.");
    }

    // Sean Protocol: Capture Global Default Style once per frame to minimize spam
    const currentGlobalDefaultColor = (typeof window.captureGlobalDefaults === 'function') ?
        window.captureGlobalDefaults() : '#ffffff';

    function drawLodSystemDots(alphaMul) {
        if (alphaMul == null) alphaMul = 1;
        const systems = _ensureSystemIndex();
        const dotRadius = Math.max(1.5 / zoom, 10);
        const colorGroups = new Map();
        const dimGroups = new Map();
        for (let i = 0; i < systems.length; i++) {
            const it = systems[i];
            if (it.q < qMin || it.q > qMax || it.r < rMin || it.r > rMax) continue;
            const stateObj = hexStates.get(it.id);
            if (!stateObj || stateObj.type !== 'SYSTEM_PRESENT') continue;
            if (!window.filterSuspended && stateObj.isHiddenByFilter) continue;
            if (_mapDisclosure && _mapLevel(it.id) === '0') continue;
            const data = stateObj.rttData || stateObj.t5Data || stateObj.mgt2eData || stateObj.ctData;
            if (hideNoPlanetSystems) {
                const aowStellarOnly = stateObj.aowSystem && !stateObj.aowSystem.mainworld;
                if ((data && data.isStellarOnly) || aowStellarOnly) continue;
            }
            const custom = stateObj.custom_ui || {};
            const colors = custom.appliedColors && custom.appliedColors.length > 0 ? custom.appliedColors : null;
            const primary = selectedHexes.has(it.id) ? '#ffb399' : (colors ? colors[0] : currentGlobalDefaultColor);
            const dim = campaignFocusHex && it.id !== campaignFocusHex;
            const bucket = dim ? dimGroups : colorGroups;
            let arr = bucket.get(primary);
            if (!arr) { arr = []; bucket.set(primary, arr); }
            arr.push(it);
        }
        function fillGrouped(groups, alpha) {
            if (groups.size === 0) return;
            if (alpha !== 1) { ctx.save(); ctx.globalAlpha *= alpha; }
            groups.forEach((items, color) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                for (let i = 0; i < items.length; i++) {
                    const it = items[i];
                    ctx.moveTo(it.x + dotRadius, it.y);
                    ctx.arc(it.x, it.y, dotRadius, 0, Math.PI * 2);
                }
                ctx.fill();
            });
            if (alpha !== 1) ctx.restore();
        }
        fillGrouped(colorGroups, alphaMul);
        fillGrouped(dimGroups, 0.28 * alphaMul);
    }

    const lodDotAlpha = _lod.dots.alpha * (1 - labelsAlpha);
    if (lodDotAlpha > 0.001) drawLodSystemDots(lodDotAlpha);
    if (showText) for (let q = Math.max(0, qMin); q <= Math.min(MAX_GLOBAL_Q, qMax); q++) {
        for (let r = Math.max(0, rMin); r <= Math.min(MAX_GLOBAL_R, rMax); r++) {
            const offset = (q & 1) ? 0.5 : 0;
            let cx = widthStep * q;
            let cy = heightStep * (r + offset);

            const hexId = getHexId(q, r);
            if (!hexId) continue;
            if (!showDots) continue;

            const isSelected = selectedHexes.has(hexId);
            let stateObj = hexStates.get(hexId);
            if (typeof stateObj === 'string') {
                stateObj = { type: stateObj };
                hexStates.set(hexId, stateObj);
            }
            const stateType = stateObj ? stateObj.type : 'BLANK';
            // Shift+F bypasses the filter for viewing only — the flag itself is
            // left alone so everything that reads it (route generation, the
            // Route Manager's match count) keeps seeing the real filter.
            const isHidden = window.filterSuspended
                ? false
                : (stateObj ? stateObj.isHiddenByFilter : false);

            if (stateType === 'SYSTEM_PRESENT' && !isHidden) {
                const data = stateObj.rttData || stateObj.t5Data || stateObj.mgt2eData || stateObj.ctData;

                // Sean Protocol: Check if this "System Present" hex actually has no planets
                // and skip if the filter is active.
                // RTT: sets isStellarOnly on rttData when no bodies are generated.
                // AoW: hide if no mainworld was elected; gas-giant-only systems render as a blank dot.
                // Level (0): this system is not disclosed to players at all.
                // Nothing is drawn — no dot, no ring, no label. WP6.
                if (_mapDisclosure && _mapLevel(hexId) === '0') continue;

                if (hideNoPlanetSystems) {
                    const aowStellarOnly = stateObj.aowSystem &&
                        !stateObj.aowSystem.mainworld;
                    if ((data && data.isStellarOnly) || aowStellarOnly) continue;
                }

                const dimOther = campaignFocusHex && hexId !== campaignFocusHex;
                const fadeLabels = labelsAlpha < 1;
                if (fadeLabels || dimOther) {
                    ctx.save();
                    if (fadeLabels) ctx.globalAlpha *= labelsAlpha;
                    if (dimOther) ctx.globalAlpha *= 0.28;
                }

                if (!devView) {
                    // =============================================
                    // PRESENTATION VIEW
                    // =============================================
                    const baseWorldRadius = 10;
                    const minWorldRadius = 1.5 / zoom;
                    const dotRadius = Math.max(minWorldRadius, baseWorldRadius);

                    // --- Travel Zone Halo (Amber/Red) ---
                    if (showText && data && data.travelZone && data.travelZone !== 'Green' && data.travelZone !== 'G') {
                        const zoneColor = data.travelZone === 'Red' ? '#FF0000' : '#FFBF00';
                        ctx.save();
                        ctx.beginPath();
                        // Slightly larger than the world dot
                        const haloRadius = dotRadius + 5;
                        ctx.arc(cx, cy, haloRadius, 0, 2 * Math.PI);

                        // Faint fill (0.2 opacity relative to the current hex, including campaign dim)
                        const zoneAlpha = ctx.globalAlpha;
                        ctx.globalAlpha = zoneAlpha * 0.2;
                        ctx.fillStyle = zoneColor;
                        ctx.fill();

                        // Solid stroke (2-3px)
                        ctx.globalAlpha = zoneAlpha;
                        ctx.strokeStyle = zoneColor;
                        ctx.lineWidth = 2.5 / zoom;
                        ctx.stroke();

                        ctx.closePath();
                        ctx.restore();
                    }

                    const pTextColor = isSelected ? '#ffb399' : (window.printMode ? '#000000' : '#ffffff');
                    const pFontSmall = 10;  // world-space px (coordinate, UWP)
                    const pFontName = 12;  // world-space px (system name)
                    const pFontPort = 18;  // world-space px (starport letter)

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = pTextColor;

                    // 1. Hex coordinate — top of hex
                    if (showText) {
                        ctx.font = `${pFontSmall}px 'Inter', sans-serif`;
                        ctx.fillText(hexId, cx, cy - (size * 0.75));
                    }

                    if (data) {
                        // 2. Starport letter — above world dot
                        if (showText && data.starport && _mapShow(hexId, 'g')) {
                            ctx.font = `bold ${pFontPort}px 'Inter', sans-serif`;
                            ctx.fillStyle = pTextColor;
                            ctx.textBaseline = 'bottom';
                            ctx.fillText(data.starport, cx, cy - dotRadius - 2);
                            ctx.textBaseline = 'top';
                        }                        
                        
                        // 3. World dot (or asteroid cluster) with Custom UI Support
                        const custom = stateObj.custom_ui || {};
                        const colors = custom.appliedColors && custom.appliedColors.length > 0 ? custom.appliedColors : null;
                        
                        // Sean Protocol: Dynamically use the captured Global Default as baseline dot color
                        const baseColor = isSelected ? '#ffb399' : currentGlobalDefaultColor;
                        const primary = colors ? colors[0] : baseColor;
                        const iconStyle = custom.iconStyle || 'Classic';

                        if (!showText) {
                            // LOD: Simple dot using filter color — skip complex icon rendering.
                            ctx.beginPath();
                            ctx.arc(cx, cy, dotRadius, 0, 2 * Math.PI);
                            ctx.fillStyle = primary;
                            ctx.fill();
                            ctx.closePath();
                        } else if (iconStyle === 'Asteroid Belt') {
                            const aPositions = [
                                { dx: -8, dy: -2 }, { dx: 0, dy: -5 }, { dx: 8, dy: -2 },
                                { dx: -5, dy: 5 }, { dx: 5, dy: 4 }
                            ];
                            aPositions.forEach((p, index) => {
                                ctx.beginPath();
                                ctx.arc(cx + p.dx, cy + p.dy, 2.5, 0, 2 * Math.PI);
                                
                                // Magic Multi-Color Cycling
                                let rockColor = primary;
                                if (colors && colors.length > 0) {
                                    rockColor = colors[index % colors.length]; 
                                }
                                
                                ctx.fillStyle = rockColor;
                                ctx.fill();
                                ctx.closePath();
                            });
                        } else if (iconStyle === 'Rounded Rectangle') {
                            // Geometry fix: Calculate dimensions so the furthest corners fit exactly
                            // within the dotRadius circle that defines the Ring boundary.
                            const rectWidth = dotRadius * 1.6;
                            const rectHeight = dotRadius * 1.0;
                            const rx = cx - rectWidth / 2;
                            const ry = cy - rectHeight / 2;
                            const cornerRadius = dotRadius * 0.3; // Proportionally adjusted

                            ctx.save();
                            ctx.beginPath();
                            // Use modern roundRect if available, fallback to standard rect
                            if (ctx.roundRect) {
                                ctx.roundRect(rx, ry, rectWidth, rectHeight, cornerRadius);
                            } else {
                                ctx.rect(rx, ry, rectWidth, rectHeight);
                            }
                            ctx.clip(); // Mask the drawing area to the rounded shape

                            if (colors && colors.length > 0) {
                                const stripeWidth = rectWidth / colors.length;
                                for (let i = 0; i < colors.length; i++) {
                                    ctx.fillStyle = colors[i];
                                    ctx.fillRect(rx + (i * stripeWidth), ry, stripeWidth + 1, rectHeight); // +1 prevents rendering gaps
                                }
                            } else {
                                ctx.fillStyle = baseColor;
                                ctx.fillRect(rx, ry, rectWidth, rectHeight);
                            }
                            ctx.restore();
                        } else if (iconStyle === 'Square') {
                            // Geometry: Side length = dotRadius * 1.414 (sqrt 2) to fit corners exactly inside the ring
                            const side = dotRadius * 1.414;
                            const rx = cx - side / 2;
                            const ry = cy - side / 2;

                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(rx, ry, side, side);
                            ctx.clip(); // Mask for stripes

                            if (colors && colors.length > 0) {
                                const stripeWidth = side / colors.length;
                                for (let i = 0; i < colors.length; i++) {
                                    ctx.fillStyle = colors[i];
                                    ctx.fillRect(rx + (i * stripeWidth), ry, stripeWidth + 1, side);
                                }
                            } else {
                                ctx.fillStyle = baseColor;
                                ctx.fillRect(rx, ry, side, side);
                            }
                            ctx.restore();
                        } else if (iconStyle === 'Diamond') {
                            // Geometry: Four points touching the exact edge of the dotRadius ring
                            ctx.save();
                            ctx.beginPath();
                            ctx.moveTo(cx, cy - dotRadius); // Top
                            ctx.lineTo(cx + dotRadius, cy); // Right
                            ctx.lineTo(cx, cy + dotRadius); // Bottom
                            ctx.lineTo(cx - dotRadius, cy); // Left
                            ctx.closePath();
                            ctx.clip(); // Mask for stripes

                            if (colors && colors.length > 0) {
                                const bboxWidth = dotRadius * 2;
                                const rx = cx - dotRadius;
                                const ry = cy - dotRadius;
                                const stripeWidth = bboxWidth / colors.length;
                                for (let i = 0; i < colors.length; i++) {
                                    ctx.fillStyle = colors[i];
                                    ctx.fillRect(rx + (i * stripeWidth), ry, stripeWidth + 1, bboxWidth);
                                }
                            } else {
                                ctx.fillStyle = baseColor;
                                ctx.fill();
                            }
                            ctx.restore();
                        } else if (iconStyle === 'Octagon') {
                            // 8-point regular polygon inscribed in dotRadius
                            ctx.save();
                            ctx.beginPath();
                            for (let i = 0; i < 8; i++) {
                                const angle = (Math.PI / 4) * i - Math.PI / 8;
                                const px = cx + dotRadius * Math.cos(angle);
                                const py = cy + dotRadius * Math.sin(angle);
                                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                            }
                            ctx.closePath();
                            ctx.clip();

                            if (colors && colors.length > 0) {
                                const bboxWidth = dotRadius * 2;
                                const rx = cx - dotRadius;
                                const ry = cy - dotRadius;
                                const stripeWidth = bboxWidth / colors.length;
                                for (let i = 0; i < colors.length; i++) {
                                    ctx.fillStyle = colors[i];
                                    ctx.fillRect(rx + (i * stripeWidth), ry, stripeWidth + 1, bboxWidth);
                                }
                            } else {
                                ctx.fillStyle = baseColor;
                                ctx.fill();
                            }
                            ctx.restore();
                        } else if (iconStyle === 'Asteroid Grid') {
                            // 3-4-3 Structured Hex Grid Pattern
                            const gridPositions = [
                                { dx: -5, dy: -4.5 }, { dx: 0, dy: -4.5 }, { dx: 5, dy: -4.5 },         // Top 3
                                { dx: -7.5, dy: 0 }, { dx: -2.5, dy: 0 }, { dx: 2.5, dy: 0 }, { dx: 7.5, dy: 0 }, // Middle 4
                                { dx: -5, dy: 4.5 }, { dx: 0, dy: 4.5 }, { dx: 5, dy: 4.5 }           // Bottom 3
                            ];
                            
                            gridPositions.forEach((p, index) => {
                                ctx.beginPath();
                                ctx.arc(cx + p.dx, cy + p.dy, 1.8, 0, 2 * Math.PI);
                                
                                // Magic Multi-Color Cycling
                                let dotColor = primary;
                                if (colors && colors.length > 0) {
                                    dotColor = colors[index % colors.length]; 
                                }
                                
                                ctx.fillStyle = dotColor;
                                ctx.fill();
                                ctx.closePath();
                            });
                        } else if (iconStyle === 'Classic') {
                            if (colors && colors.length > 0) {
                                const sliceAngle = (2 * Math.PI) / colors.length;
                                for (let i = 0; i < colors.length; i++) {
                                    const startAngle = i * sliceAngle;
                                    const endAngle = (i + 1) * sliceAngle;
                                    ctx.beginPath();
                                    ctx.moveTo(cx, cy);
                                    ctx.arc(cx, cy, dotRadius, startAngle, endAngle);
                                    ctx.closePath();
                                    ctx.fillStyle = colors[i];
                                    ctx.fill();
                                }
                            } else {
                                // No rules: Solid Dot
                                ctx.beginPath();
                                ctx.arc(cx, cy, dotRadius, 0, 2 * Math.PI);
                                ctx.fillStyle = baseColor;
                                ctx.fill();
                                ctx.closePath();
                            }
                        } else if (iconStyle === 'Refined') {
                            // Glow Sphere
                            ctx.save();
                            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotRadius + 8);
                            grad.addColorStop(0, primary);
                            grad.addColorStop(0.3, primary);
                            grad.addColorStop(1, 'transparent');
                            ctx.fillStyle = grad;
                            ctx.beginPath();
                            ctx.arc(cx, cy, dotRadius + 8, 0, 2 * Math.PI);
                            ctx.fill();
                            // White core for systems
                            ctx.beginPath();
                            ctx.arc(cx, cy, dotRadius * 0.4, 0, 2 * Math.PI);
                            ctx.fillStyle = '#ffffff'; 
                            ctx.fill();
                            ctx.restore();
                        } else if (iconStyle === 'Minimal') {
                            // Crosshair
                            ctx.save();
                            ctx.strokeStyle = primary;
                            ctx.lineWidth = 1.5 / zoom;
                            ctx.beginPath();
                            const l = dotRadius + 5;
                            ctx.moveTo(cx - l, cy); ctx.lineTo(cx + l, cy);
                            ctx.moveTo(cx, cy - l); ctx.lineTo(cx, cy + l);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.arc(cx, cy, dotRadius * 0.5, 0, 2 * Math.PI);
                            ctx.strokeStyle = primary;
                            ctx.stroke();
                            ctx.restore();
                        }

                        // --- Draw the Ring (Applies to any shape) ---
                        if (showText && custom.ringColor) {
                            ctx.save();
                            ctx.beginPath();

                            // Align the ring's center path EXACTLY with the dot's edge.
                            ctx.arc(cx, cy, dotRadius, 0, 2 * Math.PI);

                            ctx.strokeStyle = custom.ringColor;

                            // NEW LOGIC: Scale thickness proportionally to the dot size, 
                            // rather than forcing a fixed screen thickness with '/ zoom'.
                            // This ensures the ring shrinks perfectly alongside the planet.
                            ctx.lineWidth = dotRadius * 0.3;

                            ctx.stroke();
                            ctx.closePath();
                            ctx.restore();
                        }

                        // 4. UWP string — just below dot. (g), WP6.
                        if (showText && data.uwp && _mapShow(hexId, 'g')) {
                            ctx.font = `${pFontSmall}px 'Inter', sans-serif`;
                            ctx.fillStyle = pTextColor;
                            ctx.textBaseline = 'top';
                            const displayUwp4 = (window.rttShowIndustry && stateObj.rttData && data.industry != null)
                                ? data.uwp.slice(0, -1) + data.industry
                                : data.uwp;
                            ctx.fillText(displayUwp4, cx, cy + dotRadius + 3);
                        }

                        // 5. System name — bottom of hex (Sean Protocol: Typography Suite)
                        // (d), WP6 — a named dot tells a player the system has
                        // been surveyed, which is exactly what (d) grants.
                        if (data.name && _mapShow(hexId, 'd')) {
                            const custom = stateObj.custom_ui || {};
                            let displayName = data.name;

                            if (custom.textCase === 'ALL CAPS') {
                                displayName = data.name.toUpperCase();
                            } else if (custom.textCase === 'lowercase') {
                                displayName = data.name.toLowerCase();
                            }

                            // Sean Protocol: Apply Italics
                            const fontStyle = custom.isItalic ? "italic " : "";
                            ctx.font = `${fontStyle}${pFontName}px 'Inter', sans-serif`;
                            ctx.fillStyle = pTextColor;
                            ctx.textBaseline = 'bottom';
                            
                            const textY = cy + (size * 0.75);
                            if (showText) {
                                ctx.fillText(displayName, cx, textY);

                                // Sean Protocol: Manual Underline (Canvas doesn't support text-decoration native)
                                if (custom.isUnderline) {
                                    const textWidth = ctx.measureText(displayName).width;
                                    const lineY = textY + 2; // Positioned 2px below baseline
                                    ctx.save();
                                    ctx.strokeStyle = pTextColor;
                                    ctx.lineWidth = 1 / zoom;
                                    ctx.beginPath();
                                    // X-Coordinates are relative to centered text (cx)
                                    ctx.moveTo(cx - textWidth / 2, lineY);
                                    ctx.lineTo(cx + textWidth / 2, lineY);
                                    ctx.stroke();
                                    ctx.restore();
                                }
                            }
                            
                            ctx.textBaseline = 'top';
                                             // ---- Symbols (relative to dot center) (Sean Protocol: GUI Optimization) ----
                        // ---- Symbols (relative to dot center) (Sean Protocol: GUI Optimization) ----
                        const symOffset = dotRadius + GUI_CONFIG.OFFSETS.SYM_GAP;

                        // 6. Gas Giant — Optimized Positioning & Variant Selection
                        if (showText && data.gasGiant && _mapShow(hexId, 'c')) {
                            const gx = cx + symOffset + GUI_CONFIG.GAS_GIANT.X_OFFSET;
                            const gy = cy + GUI_CONFIG.GAS_GIANT.Y_OFFSET;
                            const gr = GUI_CONFIG.GAS_GIANT.RADIUS;
                            
                            // Variant Selection Logic (Sean Protocol: Data-Driven)
                            let ggVariant = 'SOLID';
                            
                            // Condition 1: 'Sa' (Satellite/Ring) trade code is present
                            if (data.tradeCodes && data.tradeCodes.includes('Sa')) {
                                ggVariant = 'RINGED';
                            }

                            ctx.beginPath();
                            ctx.arc(gx, gy, gr, 0, 2 * Math.PI);
                            ctx.fillStyle = pTextColor;
                            ctx.fill();
                            
                            if (ggVariant === 'RINGED') {
                                // Ring (ellipse drawn as scaled arc)
                                ctx.save();
                                ctx.translate(gx, gy);
                                ctx.scale(GUI_CONFIG.GAS_GIANT.RING_SCALE_X, GUI_CONFIG.GAS_GIANT.RING_SCALE_Y);
                                ctx.beginPath();
                                ctx.arc(0, 0, gr + 2, 0, 2 * Math.PI);
                                ctx.strokeStyle = pTextColor;
                                ctx.lineWidth = GUI_CONFIG.GAS_GIANT.RING_WIDTH / zoom;
                                ctx.stroke();
                                ctx.restore();
                            }
                        }

                        // 7. Scout Base — filled triangle BOTTOM-LEFT of dot
                        if (showText && data.scoutBase && _mapShow(hexId, 'g')) {
                            const tx = cx - symOffset + GUI_CONFIG.OFFSETS.BASE_X_ADJ;
                            const ty = cy + symOffset * GUI_CONFIG.OFFSETS.SCOUT_Y_FACTOR;
                            const ts = GUI_CONFIG.BASE_ICONS.RADIUS;
                            ctx.beginPath();
                            ctx.moveTo(tx, ty - ts);
                            ctx.lineTo(tx + ts, ty + ts * 0.6);
                            ctx.lineTo(tx - ts, ty + ts * 0.6);
                            ctx.closePath();
                            ctx.fillStyle = pTextColor;
                            ctx.fill();
                        }

                        // Base codes other than N and S (K naval, M military, W way
                        // station, and the rest of the Second Survey list). N and S
                        // already have icons.
                        if (showText && data.baseCodes && /[^NS]/.test(data.baseCodes) && _mapShow(hexId, 'g')) {
                            ctx.save();
                            ctx.font = `${pFontSmall}px 'Inter', sans-serif`;
                            ctx.fillStyle = pTextColor;
                            ctx.textAlign = 'right';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(data.baseCodes, cx - symOffset - 2, cy);
                            ctx.restore();
                        }

                        // 8. Naval Base — 6-point star TOP-LEFT of dot
                        if (showText && data.navalBase && _mapShow(hexId, 'g')) {
                            const sx = cx - symOffset + GUI_CONFIG.OFFSETS.BASE_X_ADJ;
                            const sy = cy - symOffset * GUI_CONFIG.OFFSETS.NAVAL_Y_FACTOR;
                            const sr = GUI_CONFIG.BASE_ICONS.RADIUS;
                            const sir = sr * 0.45;
                            const pts = 6;
                            ctx.beginPath();
                            for (let i = 0; i < pts * 2; i++) {
                                const angle = (Math.PI / pts) * i - Math.PI / 2;
                                const r = i % 2 === 0 ? sr : sir;
                                const px = sx + Math.cos(angle) * r;
                                const py = sy + Math.sin(angle) * r;
                                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                            }
                            ctx.closePath();
                            ctx.fillStyle = pTextColor;
                            ctx.fill();
                        }
           }
                    } else {
                        // No data yet — use global baseline dot color
                        ctx.beginPath();
                        const dotRadius2 = Math.max(1.5 / zoom, 10);
                        ctx.arc(cx, cy, dotRadius2, 0, 2 * Math.PI);
                        ctx.fillStyle = currentGlobalDefaultColor;
                        ctx.fill();
                        ctx.closePath();
                    }

                } else {
                    // =============================================
                    // DEVELOPMENT VIEW (existing behaviour)
                    // =============================================
                    ctx.beginPath();
                    const baseWorldRadius = 10;
                    const minWorldRadius = 1.5 / zoom;
                    const dotRadius = Math.max(minWorldRadius, baseWorldRadius);

                    // --- Travel Zone Halo (Amber/Red) ---
                    if (data && data.travelZone && data.travelZone !== 'Green' && data.travelZone !== 'G') {
                        const zoneColor = data.travelZone === 'Red' ? '#FF0000' : '#FFBF00';
                        ctx.save();
                        ctx.beginPath();
                        const haloRadius = dotRadius + 5;
                        ctx.arc(cx, cy, haloRadius, 0, 2 * Math.PI);
                        const zoneAlpha = ctx.globalAlpha;
                        ctx.globalAlpha = zoneAlpha * 0.2;
                        ctx.fillStyle = zoneColor;
                        ctx.fill();
                        ctx.globalAlpha = zoneAlpha;
                        ctx.strokeStyle = zoneColor;
                        ctx.lineWidth = 2.5 / zoom;
                        ctx.stroke();
                        ctx.closePath();
                        ctx.restore();
                    }
                    ctx.arc(cx, cy, dotRadius, 0, 2 * Math.PI);
                    ctx.fillStyle = window.printMode ? '#000000' : '#ffffff';
                    ctx.fill();
                    ctx.closePath();

                    if (zoom > 0.4) {
                        ctx.textAlign = 'center';
                        const fontSize = 10 / zoom;
                        ctx.font = `${fontSize}px 'Inter', sans-serif`;
                        ctx.fillStyle = isSelected ? '#ffb399' : (window.printMode ? '#000000' : '#ffffff');
                        ctx.textBaseline = 'top';

                        let label = hexId;

                        // DEVELOPMENT VIEW. Gated too — devView is a user toggle
                        // and captureSubsector inherits whatever it is set to, so
                        // leaving this branch open would make the leak depend on a
                        // checkbox rather than on the disclosure level. WP6.
                        if (data && data.uwp && _mapShow(hexId, 'g')) {
                            let tcs = data.tradeCodes ? data.tradeCodes.join(" ") : "";
                            if (tcs.length > 0) tcs = " " + tcs;

                            const topLabel = (data.name && _mapShow(hexId, 'd'))
                                ? `${data.name} (${hexId})` : hexId;
                            const displayUwp910 = (window.rttShowIndustry && stateObj.rttData && data.industry != null)
                                ? data.uwp.slice(0, -1) + data.industry
                                : data.uwp;
                            ctx.fillText(topLabel, cx, cy - (size * 0.75));
                            const baseBit = data.baseCodes ? ' ' + data.baseCodes : '';
                            ctx.fillText(displayUwp910 + tcs + baseBit, cx, cy - (size * 0.75) + fontSize * 1.2);

                            if (stateObj.t5Socio) {
                                let sStrings = stateObj.t5Socio.displayStrings || [stateObj.t5Socio.displayString];
                                for (let si = 0; si < sStrings.length; si++) {
                                    ctx.fillText(sStrings[si], cx, cy - (size * 0.75) + fontSize * (2.4 + si * 1.2));
                                }
                            } else if (stateObj.mgtSocio) {
                                let sStrings = stateObj.mgtSocio.displayStrings || [stateObj.mgtSocio.displayString];
                                for (let si = 0; si < sStrings.length; si++) {
                                    ctx.fillText(sStrings[si], cx, cy - (size * 0.75) + fontSize * (2.4 + si * 1.2));
                                }
                            }
                        } else if (data) {
                            // Starport class is (g); below it fall back to the
                            // bare hex label rather than bracketing the class.
                            ctx.fillText(
                                (data.starport && _mapShow(hexId, 'g'))
                                    ? `${label} [${data.starport}]` : label,
                                cx, cy - (size * 0.75));
                        } else {
                            ctx.fillText(label, cx, cy - (size * 0.75));
                        }
                    }
                }
                if (fadeLabels || dimOther) ctx.restore();
            } else if (stateType === 'BLANK' && !isHidden) {
                // Text in center
                if (zoom > 0.4) {
                    ctx.save();
                    ctx.globalAlpha *= labelsAlpha;
                    ctx.textAlign = 'center';
                    const fontSize = 10 / zoom;
                    ctx.font = `${fontSize}px 'Inter', sans-serif`;
                    ctx.fillStyle = isSelected ? '#ff4500' : '#45a29e';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(hexId, cx, cy);
                    ctx.restore();
                }
            } else if (stateType === 'EMPTY') {
                // Empty hexes have no coordinates or contents shown
            }
        }
    }
    if (_perfOn) _perfWorlds = performance.now() - _drawT0 - _perfFills - _perfRoutes - _perfBorders;

    // Draw Sector & Subsector Borders
    if (showSubsectorBorders) {
        const totalWidth  = (gridWidth  * 32 - 1) * widthStep  + size;
        const totalHeight = (gridHeight * 40 - 1) * heightStep + (heightStep / 2) + size;

        // Subsector borders (thinner, darker)
        ctx.beginPath();
        for (let i = 1; i <= gridWidth * 4 - 1; i++) {
            const x = (i * 8 - 0.5) * widthStep;
            ctx.moveTo(x, -heightStep);
            ctx.lineTo(x, totalHeight);
        }
        for (let j = 1; j <= gridHeight * 4 - 1; j++) {
            const y = (j * 10 - 0.5) * heightStep;
            ctx.moveTo(-size, y);
            ctx.lineTo(totalWidth, y);
        }
        ctx.strokeStyle = window.printMode ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        // Sector borders (thicker, brighter)
        ctx.beginPath();
        for (let i = 4; i <= (gridWidth - 1) * 4; i += 4) {
            const x = (i * 8 - 0.5) * widthStep;
            ctx.moveTo(x, -heightStep);
            ctx.lineTo(x, totalHeight);
        }
        for (let j = 4; j <= (gridHeight - 1) * 4; j += 4) {
            const y = (j * 10 - 0.5) * heightStep;
            ctx.moveTo(-size, y);
            ctx.lineTo(totalWidth, y);
        }
        ctx.strokeStyle = window.printMode ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 3 / zoom;
        ctx.stroke();

        // Sector names — when zoomed out past the world-label threshold (fades)
        if (sectorNameAlpha > 0.001) {
            const fontSize = 32 * widthStep * 0.13;
            ctx.font = `bold italic ${fontSize}px 'Courier New', Courier, monospace`;
            ctx.fillStyle = window.printMode ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.60)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.save();
            ctx.globalAlpha *= sectorNameAlpha;

            for (let sY = 0; sY < gridHeight; sY++) {
                for (let sX = 0; sX < gridWidth; sX++) {
                    const sectorNum = sY * gridWidth + sX + 1;
                    const label = (window.sectorNames && window.sectorNames[sectorNum])
                        ? window.sectorNames[sectorNum]
                        : `Sector ${sectorNum}`;
                    const cx = (sX * 32 + 16) * widthStep;
                    const cy = (sY * 40 + 20) * heightStep;
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(-Math.PI / 6); // 30° — bottom-left to top-right
                    ctx.fillText(label, 0, 0);
                    ctx.restore();
                }
            }
            ctx.restore();
        }
    }

    if (subLabelAlpha > 0.001 && !_paintingPanCache) {
        drawSubsectorTitles(subLabelAlpha, widthStep, heightStep, size, snapLod);
    }

    // Selection / inspect / campaign outlines sit above neighboring hexes.
    // Pass 1 paints left-to-right, so a later hex's fill and grid line would
    // cover an earlier hex's stroke along the shared edge.
    if (selectedHexes.size > 0 || outlineHex) {
        selectedHexes.forEach(hexId => {
            const g = _hexGeom(hexId);
            if (!g) return;
            ctx.strokeStyle = '#ff4500';
            ctx.lineWidth = 2 / zoom;
            ctx.stroke(getHexPath(g.x, g.y, size));
        });
        if (outlineHex) {
            const g = _hexGeom(outlineHex);
            if (g) {
                ctx.strokeStyle = window.printMode ? '#09695e' : '#66fcf1';
                ctx.lineWidth = 2.5 / zoom;
                ctx.stroke(getHexPath(g.x, g.y, size));
            }
        }
    }

    ctx.restore();

    // Screen-space pills. World-space strokeText used a font of ~22/zoom px
    // (hundreds of pixels when zoomed out) and Chrome rasterizes that before
    // the camera scale — turning names on froze a full-OTU view.
    // The pan bitmap leaves these to _presentPanCache so they stay pinned
    // to the window instead of sliding with the copy.
    if (!_paintingPanCache) {
        drawBorderNames();
        drawRegionNames();
    }

    _lodFrameAnimating = !!(lodAnimating && !snapLod);
    if (_lodFrameAnimating && !_paintingPanCache && canvas === document.getElementById('map-canvas')) {
        requestAnimationFrame(draw);
    }

    // A direct paint of the live canvas bypassed the offscreen frame. Drop
    // the bitmap so the next gesture rebuilds it instead of sliding stale pixels.
    if (!_paintingPanCache && canvas === document.getElementById('map-canvas')) _invalidateViewCache();

    if (_perfOn && !snapLod && !_paintingPanCache) {
        _drawPerfOverlay(performance.now() - _drawT0, _perfFills, _perfRoutes, _perfBorders, _perfWorlds, false);
    }
}

// ============================================================================
// SUBSECTOR TITLES (zoomed-in chrome)
// "Sector - Subsector" stays on the map as a small cartouche pinned inside the
// visible part of its own subsector, like a sticky header. It prefers the
// top-left and slides along that area's edges to the first spot that covers
// no system. It never covers the system the user is looking at; when every
// spot would, the title is left off.
// ============================================================================

function _rectHitsCircle(rx, ry, rw, rh, cx, cy, rad) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < rad * rad;
}

function drawSubsectorTitles(alpha, widthStep, heightStep, size, offscreen) {
    const viewW = offscreen ? canvas.width : window.innerWidth;
    const viewH = offscreen ? canvas.height : window.innerHeight;
    const viewLeft = cameraX;
    const viewRight = cameraX + viewW / zoom;
    const viewTop = cameraY;
    const viewBottom = cameraY + viewH / zoom;

    let insetL = 12;
    let insetT = 0;
    if (!offscreen) {
        const leftPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-left')) || 68;
        insetL = leftPx + 12;
        const chrome = document.getElementById('map-chrome');
        const chromeBottom = chrome ? chrome.getBoundingClientRect().bottom : 48;
        insetT = Math.max(56, chromeBottom + 6);
    }

    const clipL = viewLeft + (offscreen ? 0 : (insetL - 12) / zoom);
    const clipT = viewTop + insetT / zoom;
    const minSpanX = 56 / zoom;
    const minSpanY = 24 / zoom;

    const col0 = Math.max(0, Math.floor((clipL / widthStep) / 8));
    const col1 = Math.min(gridWidth * 4 - 1, Math.floor((viewRight / widthStep) / 8));
    const row0 = Math.max(0, Math.floor((clipT / heightStep) / 10));
    const row1 = Math.min(gridHeight * 4 - 1, Math.floor((viewBottom / heightStep) / 10));
    if (col1 < col0 || row1 < row0) return;

    const maxQ = gridWidth * 32 - 1;
    const maxR = gridHeight * 40 - 1;
    const qA = Math.max(0, Math.floor((viewLeft - size) / widthStep) - 1);
    const qB = Math.min(maxQ, Math.ceil((viewRight + size) / widthStep) + 1);
    const rA = Math.max(0, Math.floor((viewTop - size) / heightStep) - 1);
    const rB = Math.min(maxR, Math.ceil((viewBottom + size) / heightStep) + 1);
    // Systems the user is looking at are never covered: the inspected or
    // campaign-focused hex, selected hexes, whatever sits at the view center,
    // and the point the user last zoomed toward.
    const inspected = window.SystemInspector?.inspectedHexId?.();
    const focused = window.CampaignAtlas?.focusedHexId?.();
    const focusPoints = [{ x: cameraX + viewW / 2 / zoom, y: cameraY + viewH / 2 / zoom }];
    if (!offscreen && window.mapZoomFocus) focusPoints.push(window.mapZoomFocus);
    const systems = [];
    for (let q = qA; q <= qB; q++) {
        for (let r = rA; r <= rB; r++) {
            const id = getHexId(q, r);
            const state = id && hexStates.get(id);
            if (!state || state.type !== 'SYSTEM_PRESENT' || state.isHiddenByFilter) continue;
            const pixel = getHexPixel(q, r);
            const guarded = !offscreen && (id === inspected || id === focused || selectedHexes.has(id)
                || focusPoints.some(p => Math.hypot(p.x - pixel.x, p.y - pixel.y) < size));
            systems.push({ x: (pixel.x - cameraX) * zoom, y: (pixel.y - cameraY) * zoom, guarded });
        }
    }
    // Glyph, name, and UWP fill most of a hex. A guarded system keeps its whole
    // hex, hex number included.
    const hitR = size * zoom * 0.8;
    const coreR = size * zoom * 0.35;
    const guardR = size * zoom;

    const entries = [];
    for (let subRow = row0; subRow <= row1; subRow++) {
        for (let subCol = col0; subCol <= col1; subCol++) {
            const sX = Math.floor(subCol / 4);
            const sY = Math.floor(subRow / 4);
            const subX = subCol % 4;
            const subY = subRow % 4;
            const sectorNum = sY * gridWidth + sX + 1;
            const letter = String.fromCharCode(65 + subY * 4 + subX);
            const sectorName = (window.sectorNames && window.sectorNames[sectorNum]) || `Sector ${sectorNum}`;
            const subName = (typeof getSubsectorName === 'function')
                ? getSubsectorName(sectorNum, letter)
                : `Subsector ${letter}`;

            const q0 = sX * 32 + subX * 8;
            const q1 = q0 + 7;
            const r0 = sY * 40 + subY * 10;
            const r1 = r0 + 9;
            const left = widthStep * q0 - size * 0.2;
            const right = widthStep * q1 + size * 0.8;
            const top = heightStep * r0 - size * 0.15;
            const bottom = heightStep * (r1 + 0.5) + size * 0.2;
            const visL = Math.max(left, clipL);
            const visR = Math.min(right, viewRight);
            const visT = Math.max(top, clipT);
            const visB = Math.min(bottom, viewBottom);
            if (visR - visL < minSpanX || visB - visT < minSpanY) continue;

            entries.push({
                label: sectorName + ' - ' + subName,
                sx0: (visL - cameraX) * zoom,
                sy0: (visT - cameraY) * zoom,
                sx1: (visR - cameraX) * zoom,
                sy1: (visB - cameraY) * zoom
            });
        }
    }
    if (!entries.length) return;

    ctx.save();
    const dpr = offscreen ? 1 : (window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const occupied = [];
    // How much of the map a pill at (x, y) hides: a system's glyph counts ten
    // times its hex number or name. Infinity when it would cover a guarded
    // system or another title. Stops counting once `limit` is reached.
    function cost(near, x, y, w, h, limit) {
        for (let i = 0; i < occupied.length; i++) {
            const o = occupied[i];
            if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return Infinity;
        }
        let n = 0;
        for (let i = 0; i < near.length; i++) {
            const s = near[i];
            if (s.guarded) {
                if (_rectHitsCircle(x, y, w, h, s.x, s.y, guardR)) return Infinity;
            } else if (_rectHitsCircle(x, y, w, h, s.x, s.y, hitR)) {
                n += _rectHitsCircle(x, y, w, h, s.x, s.y, coreR) ? 10 : 1;
                if (n >= limit) return n;
            }
        }
        return n;
    }
    // Spots along the inside edge of the subsector's visible area: the top
    // edge left to right, then the bottom edge, then down the sides. The title
    // reads as a header or footer of its subsector and never drifts toward the
    // middle of the view.
    function edgeSpots(entry, w, h) {
        const m = 4;
        const xL = entry.sx0 + m;
        const yT = entry.sy0 + m;
        const xR = Math.max(xL, entry.sx1 - w - m);
        const yB = Math.max(yT, entry.sy1 - h - m);
        const step = Math.max(12, h);
        const spots = [];
        const row = y => {
            for (let x = xL; ; x = Math.min(xR, x + step)) {
                spots.push({ x, y });
                if (x >= xR) break;
            }
        };
        row(yT);
        if (yB > yT) row(yB);
        for (let y = yT + step; y < yB; y += step) {
            spots.push({ x: xL, y });
            if (xR > xL) spots.push({ x: xR, y });
        }
        return spots;
    }

    const placements = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        let fontPx = 13;
        ctx.font = `600 ${fontPx}px 'Inter', sans-serif`;
        let textW = ctx.measureText(entry.label).width;
        const room = Math.min(entry.sx1 - entry.sx0, viewW - insetL) - 24;
        if (room > 0 && textW > room) {
            fontPx *= room / textW;
            if (fontPx < 9) continue;
            ctx.font = `600 ${fontPx}px 'Inter', sans-serif`;
            textW = ctx.measureText(entry.label).width;
        }
        const hPad = fontPx * 0.55;
        const vPad = fontPx * 0.32;
        const pillW = textW + hPad * 2;
        const pillH = fontPx + vPad * 2;
        const near = systems.filter(s =>
            s.x > entry.sx0 - guardR && s.x < entry.sx1 + guardR && s.y > entry.sy0 - guardR && s.y < entry.sy1 + guardR);
        const spots = edgeSpots(entry, pillW, pillH);
        let best = null;
        let bestCost = Infinity;
        for (let s = 0; s < spots.length && bestCost > 0; s++) {
            const c = cost(near, spots[s].x, spots[s].y, pillW, pillH, bestCost);
            if (c < bestCost) { best = spots[s]; bestCost = c; }
        }
        // Every spot would cover a guarded system or another title: leave it off.
        if (!best) continue;
        const pillX = best.x;
        const pillY = best.y;
        occupied.push({ x: pillX, y: pillY, w: pillW, h: pillH });
        // Center on the capital height so the pill reads balanced whether or
        // not the name has descenders.
        const capH = ctx.measureText('H').actualBoundingBoxAscent || fontPx * 0.72;
        placements.push({
            label: entry.label, fontPx, textW, hPad, vPad, pillW, pillH,
            textX: pillX + hPad, textY: pillY + (pillH + capH) / 2, pillX, pillY
        });
    }

    for (let i = 0; i < placements.length; i++) {
        const pill = placements[i];
        const radius = Math.min(pill.fontPx * 0.3, pill.pillH / 2);
        ctx.font = `600 ${pill.fontPx}px 'Inter', sans-serif`;
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = window.printMode ? '#ffffff' : '#000000';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(pill.pillX, pill.pillY, pill.pillW, pill.pillH, radius);
        else ctx.rect(pill.pillX, pill.pillY, pill.pillW, pill.pillH);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.95;
        ctx.fillStyle = window.printMode ? '#09695e' : '#66fcf1';
        ctx.fillText(pill.label, pill.textX, pill.textY);
    }

    ctx.restore();
}

// ============================================================================
// BORDER GROUP RENDERING
// Draws inset perimeter lines around groups of hexes sharing a border ID.
// Called from draw() as Pass 1.5 — after routes, before world content.
// ============================================================================

function _rebuildBorderGeomCache() {
    _borderGeomCache = [];
    if (!window.borderDefinitions || window.borderDefinitions.length === 0) return;
    if (!window.hexBorderAssignments || window.hexBorderAssignments.size === 0) return;

    const size        = baseHexSize;
    const INSET       = size * 0.1;
    const widthStep   = (3 / 2) * size;
    const heightStep  = Math.sqrt(3) * size;

    // Neighbor offset for each of the 6 sides, indexed by [sideIndex][qParity].
    // Derived from flat-top odd-q offset coordinate math (qParity 0=even, 1=odd).
    const NEIGHBOR = [
        [[1,  0], [1,  1]],  // side 0
        [[0,  1], [0,  1]],  // side 1
        [[-1, 0], [-1, 1]],  // side 2
        [[-1,-1], [-1, 0]],  // side 3
        [[0, -1], [0, -1]],  // side 4
        [[1, -1], [1,  0]],  // side 5
    ];

    function hexVertices(q, r) {
        const parity = q & 1;
        const cx = widthStep * q;
        const cy = heightStep * (r + (parity ? 0.5 : 0));
        const v = [];
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 180) * (60 * i);
            v.push({ x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) });
        }
        return v;
    }

    const groups = new Map();
    window.hexBorderAssignments.forEach((borderId, hexId) => {
        if (!groups.has(borderId)) groups.set(borderId, new Set());
        groups.get(borderId).add(hexId);
    });

    window.borderDefinitions.forEach(def => {
        if (def.visible === false) return;
        const hexSet = groups.get(def.id);
        if (!hexSet || hexSet.size === 0) return;

        const edges = [];
        hexSet.forEach(hexId => {
            const g = _hexGeom(hexId);
            if (!g) return;
            const { q, r, x: cx, y: cy } = g;
            const parity = q & 1;
            const verts = hexVertices(q, r);

            for (let side = 0; side < 6; side++) {
                const [dq, dr] = NEIGHBOR[side][parity];
                const nId = getHexId(q + dq, r + dr);
                if (nId && hexSet.has(nId)) continue;

                const v1 = verts[side];
                const v2 = verts[(side + 1) % 6];
                const mx = (v1.x + v2.x) / 2;
                const my = (v1.y + v2.y) / 2;
                const dx = cx - mx, dy = cy - my;
                const len = Math.sqrt(dx * dx + dy * dy);
                edges.push({ v1, v2, normal: { x: dx / len, y: dy / len } });
            }
        });

        if (edges.length === 0) return;

        function vKey(v) { return `${Math.round(v.x)},${Math.round(v.y)}`; }
        const byStart = new Map();
        edges.forEach((e, i) => byStart.set(vKey(e.v1), i));

        const visited = new Set();
        const loops   = [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        edges.forEach((_, startIdx) => {
            if (visited.has(startIdx)) return;
            const loop = [];
            let idx = startIdx;
            while (idx !== undefined && !visited.has(idx)) {
                visited.add(idx);
                const e = edges[idx];
                loop.push({ vertex: e.v1, normal: e.normal });
                idx = byStart.get(vKey(e.v2));
            }
            if (loop.length < 2) return;

            const pts = [];
            const n = loop.length;
            for (let i = 0; i < n; i++) {
                const { vertex: V, normal: nOut } = loop[i];
                const nIn  = loop[(i + n - 1) % n].normal;
                const dot   = nIn.x * nOut.x + nIn.y * nOut.y;
                const denom = 1 + dot;
                let ix, iy;
                if (Math.abs(denom) < 1e-6) {
                    ix = V.x + INSET * nOut.x;
                    iy = V.y + INSET * nOut.y;
                } else {
                    ix = V.x + INSET * (nIn.x + nOut.x) / denom;
                    iy = V.y + INSET * (nIn.y + nOut.y) / denom;
                }
                pts.push(ix, iy);
                if (ix < minX) minX = ix;
                if (ix > maxX) maxX = ix;
                if (iy < minY) minY = iy;
                if (iy > maxY) maxY = iy;
            }
            loops.push(pts);
        });

        if (loops.length > 0) {
            _borderGeomCache.push({ color: def.color, loops, minX, maxX, minY, maxY });
        }
    });
}

function drawBorderGroups() {
    if (!window.borderDefinitions || window.borderDefinitions.length === 0) return;
    if (!window.hexBorderAssignments || window.hexBorderAssignments.size === 0) return;

    if (!_borderGeomCache) _rebuildBorderGeomCache();
    if (!_borderGeomCache || _borderGeomCache.length === 0) return;

    const frame = _mapFrameCss();
    const viewLeft   = cameraX;
    const viewRight  = cameraX + frame.w / zoom;
    const viewTop    = cameraY;
    const viewBottom = cameraY + frame.h / zoom;
    const pad = baseHexSize * 2;

    ctx.save();
    ctx.lineWidth = 2.5 / zoom;
    ctx.lineJoin  = 'round';
    ctx.lineCap   = 'round';

    for (let i = 0; i < _borderGeomCache.length; i++) {
        const entry = _borderGeomCache[i];
        if (entry.maxX < viewLeft - pad || entry.minX > viewRight + pad ||
            entry.maxY < viewTop - pad || entry.minY > viewBottom + pad) continue;
        ctx.strokeStyle = entry.color;
        for (let li = 0; li < entry.loops.length; li++) {
            const pts = entry.loops[li];
            if (pts.length < 4) continue;
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1]);
            ctx.closePath();
            ctx.stroke();
        }
    }

    ctx.restore();
}

// ============================================================================
// BORDER NAME RENDERING
// Draws each border's name at the centroid of its hex group, scaled by size.
// Called from draw() after drawBorderGroups().
// ============================================================================

let _bnCacheSize = -1;
let _bnCacheMapRef = null;
const _bnCacheMap = new Map(); // borderId → { cx, cy, hexCount, minX, maxX, minY, maxY }

window.invalidateBorderNamesCache = function () { _bnCacheSize = -1; _bnCacheMapRef = null; };

function _rebuildBorderNamesCache() {
    _bnCacheMap.clear();
    if (!window.hexBorderAssignments || !window.borderDefinitions) return;

    const groups = new Map();
    window.hexBorderAssignments.forEach((borderId, hexId) => {
        const g = _hexGeom(hexId);
        if (!g) return;
        if (!groups.has(borderId)) groups.set(borderId, { sumX: 0, sumY: 0, count: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        const rec = groups.get(borderId);
        rec.sumX += g.x;
        rec.sumY += g.y;
        rec.count++;
        if (g.x < rec.minX) rec.minX = g.x;
        if (g.x > rec.maxX) rec.maxX = g.x;
        if (g.y < rec.minY) rec.minY = g.y;
        if (g.y > rec.maxY) rec.maxY = g.y;
    });

    groups.forEach(({ sumX, sumY, count, minX, maxX, minY, maxY }, borderId) => {
        _bnCacheMap.set(borderId, { cx: sumX / count, cy: sumY / count, hexCount: count, minX, maxX, minY, maxY });
    });
    _bnCacheSize = window.hexBorderAssignments.size;
    _bnCacheMapRef = window.hexBorderAssignments;
}

function _drawTerritoryLabels(items, alpha) {
    if (!items.length || alpha < 0.001) return;
    const live = canvas === document.getElementById('map-canvas');
    const viewW = live ? window.innerWidth : canvas.width;
    const viewH = live ? window.innerHeight : canvas.height;
    const dpr = live ? (window.devicePixelRatio || 1) : 1;
    const insetL = live ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-left')) || 68) : 0;
    const insetT = live ? 56 : 0;
    const MIN = 10, MAX = 22;
    const size = baseHexSize;
    const halo = window.printMode ? '#ffffff' : '#000000';

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const prepared = [];
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const sl = (it.minX - cameraX) * zoom;
        const sr = (it.maxX - cameraX) * zoom;
        const st = (it.minY - cameraY) * zoom;
        const sb = (it.maxY - cameraY) * zoom;
        const visL = Math.max(sl, insetL);
        const visR = Math.min(sr, viewW);
        const visT = Math.max(st, insetT);
        const visB = Math.min(sb, viewH);
        if (visR <= visL || visB <= visT) continue;
        const sx = Math.max(visL, Math.min(visR, (it.x - cameraX) * zoom));
        const sy = Math.max(visT, Math.min(visB, (it.y - cameraY) * zoom));
        const fontPx = Math.max(MIN, Math.min(MAX, Math.round(0.4 * size * Math.sqrt(it.hexCount) * zoom)));
        prepared.push({ sx, sy, fontPx, label: it.label, color: it.color });
    }
    prepared.sort((a, b) => a.fontPx - b.fontPx);

    let font = -1;
    for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i];
        if (p.fontPx !== font) {
            font = p.fontPx;
            ctx.font = `bold ${font}px 'Courier New', Courier, monospace`;
        }
        const w = ctx.measureText(p.label).width;
        const hPad = font * 0.35;
        const vPad = font * 0.20;
        const bgX = p.sx - w / 2 - hPad;
        const bgY = p.sy - font / 2 - vPad;
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = halo;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bgX, bgY, w + hPad * 2, font + vPad * 2, font * 0.25);
        else ctx.rect(bgX, bgY, w + hPad * 2, font + vPad * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillText(p.label, p.sx + 1, p.sy);
        ctx.fillText(p.label, p.sx - 1, p.sy);
        ctx.fillText(p.label, p.sx, p.sy + 1);
        ctx.fillText(p.label, p.sx, p.sy - 1);
        ctx.globalAlpha = alpha * 0.95;
        ctx.fillStyle = p.color;
        ctx.fillText(p.label, p.sx, p.sy);
    }
    ctx.restore();
}

function drawBorderNames() {
    const alpha = _lod.borderNames ? _lod.borderNames.alpha : (window.borderNamesEnabled ? 1 : 0);
    if (alpha < 0.001) return;
    if (!window.borderDefinitions || window.borderDefinitions.length === 0) return;
    if (!window.hexBorderAssignments || window.hexBorderAssignments.size === 0) return;

    if (window.hexBorderAssignments.size !== _bnCacheSize || _bnCacheMapRef !== window.hexBorderAssignments) {
        _rebuildBorderNamesCache();
    }

    const items = [];
    window.borderDefinitions.forEach(def => {
        if (def.visible === false) return;
        const info = _bnCacheMap.get(def.id);
        if (!info || info.hexCount === 0) return;
        items.push({
            x: info.cx, y: info.cy,
            minX: info.minX, maxX: info.maxX, minY: info.minY, maxY: info.maxY,
            hexCount: info.hexCount,
            label: def.name.toUpperCase(),
            color: def.color
        });
    });
    _drawTerritoryLabels(items, alpha);
}

// ============================================================================
// REGION NAME RENDERING
// Draws each region's name at the centroid of its hex group, scaled by size.
// Called from draw() after drawBorderNames().
// ============================================================================

let _rnCacheSize = -1;
let _rnCacheMapRef = null;
const _rnCacheMap = new Map(); // regionName → { cx, cy, hexCount, minX, maxX, minY, maxY }

function _rebuildRegionNamesCache() {
    _rnCacheMap.clear();
    const groups = new Map();
    hexStates.forEach((state, hexId) => {
        if (!state || !state.cluster || state.cluster === '----') return;
        const geom = _hexGeom(hexId);
        if (!geom) return;
        if (!groups.has(state.cluster)) groups.set(state.cluster, { sumX: 0, sumY: 0, count: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        const g = groups.get(state.cluster);
        g.sumX += geom.x;
        g.sumY += geom.y;
        g.count++;
        if (geom.x < g.minX) g.minX = geom.x;
        if (geom.x > g.maxX) g.maxX = geom.x;
        if (geom.y < g.minY) g.minY = geom.y;
        if (geom.y > g.maxY) g.maxY = geom.y;
    });

    groups.forEach(({ sumX, sumY, count, minX, maxX, minY, maxY }, name) => {
        _rnCacheMap.set(name, { cx: sumX / count, cy: sumY / count, hexCount: count, minX, maxX, minY, maxY });
    });
    _rnCacheSize = hexStates.size;
    _rnCacheMapRef = hexStates;
}

function drawRegionNames() {
    const alpha = _lod.regionNames ? _lod.regionNames.alpha : (window.regionNamesEnabled ? 1 : 0);
    if (alpha < 0.001) return;
    if (!hexStates || hexStates.size === 0) return;

    if (hexStates.size !== _rnCacheSize || _rnCacheMapRef !== hexStates) _rebuildRegionNamesCache();
    if (_rnCacheMap.size === 0) return;

    const defsByName = new Map((window.regionDefinitions || []).map(d => [d.name, d]));
    const items = [];
    _rnCacheMap.forEach((info, name) => {
        const def = defsByName.get(name);
        if (def && def.visible === false) return;
        if (!info || info.hexCount === 0) return;
        items.push({
            x: info.cx, y: info.cy,
            minX: info.minX, maxX: info.maxX, minY: info.minY, maxY: info.maxY,
            hexCount: info.hexCount,
            label: String(name).toUpperCase(),
            color: def && def.color ? def.color : '#c5c6c7'
        });
    });
    _drawTerritoryLabels(items, alpha);
}

// ============================================================================
// SUBSECTOR CAPTURE
// Renders the given subsector to an off-screen canvas and returns PNG bytes.
// Called by ObsidianExporter to embed a map image in the subsector index page.
// ============================================================================

// opts.withTransform — resolve `{ png, transform, hexPoly }` instead of bare PNG bytes,
// so a caller can lay a clickable overlay over the captured image (WP3 of the HTML
// export; see directives/html_extract_manifest.md 3.3). `hexPoly(q, r)` deliberately
// lives here rather than in the exporter: it reuses this file's own hex geometry, so
// the overlay cannot drift away from what was actually drawn.
async function captureSubsector(sectorNum, subsectorChar, outputWidth, outputHeight, opts) {
    outputWidth  = outputWidth  || 900;
    outputHeight = outputHeight || 1000;

    if (!initCanvas()) return null;   // ensure live globals are initialised

    // ── Compute subsector hex-grid bounds ─────────────────────────────────────
    const subIdx  = subsectorChar.charCodeAt(0) - 65;   // 0-15 (A-P)
    const subX    = subIdx % 4;
    const subY    = Math.floor(subIdx / 4);
    const sectorX = (sectorNum - 1) % gridWidth;
    const sectorY = Math.floor((sectorNum - 1) / gridWidth);

    const q0 = sectorX * 32 + subX * 8;
    const q1 = q0 + 7;
    const r0 = sectorY * 40 + subY * 10;
    const r1 = r0 + 9;

    // ── Compute world-pixel bounding box with a hex-radius margin ─────────────
    const size       = baseHexSize;
    const widthStep  = 1.5 * size;
    const heightStep = Math.sqrt(3) * size;
    const margin     = size * 1.5;

    const leftX   = widthStep * q0  - margin;
    const rightX  = widthStep * q1  + margin;
    const topY    = heightStep * r0 - margin;
    const bottomY = heightStep * (r1 + 0.5) + margin;
    const worldW  = rightX - leftX;
    const worldH  = bottomY - topY;

    // ── Zoom to fit the subsector, centred in the output canvas ───────────────
    const FILL_FRAC = 0.92;
    const capZoom   = Math.min(outputWidth / worldW, outputHeight / worldH) * FILL_FRAC;
    const capCamX   = leftX - (outputWidth  / capZoom - worldW) / 2;
    const capCamY   = topY  - (outputHeight / capZoom - worldH) / 2;

    // ── Save live renderer state ───────────────────────────────────────────────
    const savedCanvas = canvas;
    const savedCtx    = ctx;
    const savedZoom   = zoom;
    const savedCamX   = cameraX;
    const savedCamY   = cameraY;

    // ── Swap in off-screen canvas ──────────────────────────────────────────────
    const offscreen    = document.createElement('canvas');
    offscreen.width    = outputWidth;
    offscreen.height   = outputHeight;

    canvas  = offscreen;
    ctx     = offscreen.getContext('2d');
    zoom    = capZoom;
    cameraX = capCamX;
    cameraY = capCamY;

    // ── Render one frame ───────────────────────────────────────────────────────
    // WP6: opts.disclosure is (hexId) => level. Installed only for this frame
    // and restored in a finally, so a throw mid-draw can never leave the live
    // on-screen map fogged.
    const savedDisclosure = _mapDisclosure;
    try {
        setMapDisclosure(opts && opts.disclosure);
        draw();
    } finally {
        _mapDisclosure = savedDisclosure;
    }

    // ── Restore live renderer state ────────────────────────────────────────────
    canvas  = savedCanvas;
    ctx     = savedCtx;
    zoom    = savedZoom;
    cameraX = savedCamX;
    cameraY = savedCamY;

    // ── Return PNG bytes ───────────────────────────────────────────────────────
    return new Promise(resolve => {
        offscreen.toBlob(blob => {
            if (!blob) { resolve(null); return; }
            blob.arrayBuffer().then(buf => {
                const png = new Uint8Array(buf);
                if (!opts || !opts.withTransform) { resolve(png); return; }

                // World -> captured-image pixel space. Mirrors the draw() transform
                // applied above: ctx.scale(capZoom) then ctx.translate(-capCam).
                const toPx = (wx, wy) => [
                    (wx - capCamX) * capZoom,
                    (wy - capCamY) * capZoom,
                ];

                // Same centre and vertex math as the grid loop and getHexPath().
                const hexPoly = (q, r) => {
                    const cx = widthStep * q;
                    const cy = heightStep * (r + ((q & 1) ? 0.5 : 0));
                    const pts = [];
                    for (let i = 0; i < 6; i++) {
                        const a = (Math.PI / 180) * (60 * i);
                        const [px, py] = toPx(cx + size * Math.cos(a), cy + size * Math.sin(a));
                        pts.push([px, py]);
                    }
                    return pts;
                };

                resolve({
                    png,
                    transform: { zoom: capZoom, camX: capCamX, camY: capCamY, size,
                                 q0, q1, r0, r1, width: outputWidth, height: outputHeight },
                    hexPoly,
                });
            });
        }, 'image/png');
    });
}

// Listen for window resizing automatically
window.addEventListener('resize', resize);

// Chrome will not let a page block Ctrl+MouseWheel browser zoom via preventDefault
// (it's an intentional accessibility protection), so a scroll gesture that also
// carries a Ctrl modifier can change the page's zoom level out from under us. That
// desyncs the canvas's backing-buffer size from window.devicePixelRatio and produces
// corrupted, screen-position-fixed rendering until something forces a resize. There's
// no native 'devicepixelratiochange' event, so we re-arm a matchMedia listener each
// time it fires — the standard pattern for watching devicePixelRatio.
function _watchDevicePixelRatio() {
    const onChange = () => {
        resize();
        _watchDevicePixelRatio();
    };
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', onChange, { once: true });
}
_watchDevicePixelRatio();