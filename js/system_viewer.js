// =============================================================================
// SYSTEM_VIEWER.JS  —  Orrery Overlay
// Entered by double-clicking a system on the map.
// Supports MgT2E, CT, and T5 systems via normalisation.
// Exposes window.SystemViewer  { open, close, isOpen, handleWheel }
//
// Zoom model: orbital radii scale with _viewZoom. Body discs and moon/ring
// offsets grow with zoom relative to the fitted system view, so zooming in
// on a planet actually enlarges it. Double-click frames that body and its
// local children (a star’s worlds, a world’s moons).
//
// Disc size is a compressed reading of the stored diameter (solar diameters
// for stars, kilometres for worlds). Order is kept — a larger body draws
// larger — and a cap stops a supergiant filling the map. Orbits keep their
// AU spacing, shifted outward so the innermost ring starts outside the star
// disc. Neither transform writes back into the system.
//
// Lineup (Horizontal / Vertical) keeps the same bodies and arcs, but parks
// every orbiting body on one axis in orbit order so the system reads as a
// list. Full circles are still drawn; the fitted strip clips them into arcs.
// =============================================================================

'use strict';

const SystemViewer = (() => {

    // ── State ─────────────────────────────────────────────────────────────────
    let _lightMode = false;   // mirrors window.printMode at open() time

    let _overlay   = null;
    let _orrCanvas = null;
    let _orrCtx    = null;
    let _sys       = null;   // normalised system object
    let _hexId     = null;   // hex currently shown in the orrery
    let _tooltip   = null;
    let _tipDocked = false;   // hover card parked in the map's corner (orbit view)
    let _hitBodies = [];

    let _canvasW = 0;
    let _canvasH = 0;

    // Covers the worst realistic case: a tight companion pair (~0.05 AU) rendered
    // alongside a Far companion star (~300 AU) needs ~1900x to visually separate.
    const _MAX_ZOOM = 5000;

    // Dashed-stroke cost scales with circumference (canvas has to walk the whole path
    // to place each dash), so an orbit ring keeps costing more as _viewZoom grows —
    // unlike a plain stroke, which is cheap regardless of radius. At deep zoom a wide
    // companion's ring can reach into the hundreds of thousands of pixels, driving dash
    // segment counts high enough to freeze the render loop (confirmed empirically: a
    // 60-tick zoom-in froze the tab for 13+ minutes before this guard was added). Past
    // this radius the ring is also many multiples of any plausible viewport, so skipping
    // it costs nothing visually. ~80,000px keeps dash segments under ~50k/frame
    // ((2*pi*r)/10) — the ring stays visible at the pre-existing 200x zoom ceiling
    // (~57k px worst case), so this doesn't change behaviour below that; it only kicks
    // in at the deeper zoom this cap increase now allows.
    const _MAX_DASHED_RING_RADIUS = 80000;

    let _viewZoom = 1.0;
    let _viewOffX = 0;
    let _viewOffY = 0;
    let _minZoom = 1;
    let _systemFitZoom = 1;
    let _fitting = false;
    let _atFit = true;
    let _fitOffX = 0, _fitOffY = 0;

    let _dragging = false;
    let _dragLast = null;

    let _linearScale = false;
    let _orbitOpacity = 0.65;
    let _showOrbits = true;
    let _showDayNight = true;
    let _localClock = null;
    let _clockSecond = -1;
    let _selectedBody = null;
    let _trackedBody = null;
    let _tracking = false;
    let _pointerDown = null;
    let _pointerMoved = false;
    let _resizeObserver = null;

    let _hideMoons              = false;
    let _hideHZ                 = false;
    // Scan view: sensor reticles on every world and moon, and a slow sweep.
    let _scanView               = false;
    let _hideJumpLimit          = false;
    // AU scale of the world-set currently being drawn, so a body's own
    // 100-diameter ring can be sized on the same map as its orbit.
    let _orbitScale            = null;
    // Displayed eclipse depth per moon, so the shade eases instead of popping.
    const _eclipseShade = new Map();
    // Painted surfaces for day / night, keyed by body and size bucket, and the
    // paintings still waiting for frame time.
    const _surfaceCache = new Map();
    const _surfaceQueue = new Map();
    // How fast the clock is actually moving on screen (game days per second),
    // smoothed, so fast spin can blur instead of strobing.
    let _visualRate = 0;
    let _lastFrameDays = null;
    // frameBody redraws several times to measure; those passes skip the paint.
    let _measuringFrame = false;
    // GPU planets: a layout pass collects each visible world, PlanetGL shades
    // them all into tiles, then the painted frame copies the tiles in.
    let _collectingPlanets = false;
    let _planetRequests = [];
    let _planetTiles = false;
    let _followPending = false;
    let _frameDt = 1 / 60;
    let _hideMainworldHighlight = false;
    // 'orbits' draws the live orrery. 'row' and 'column' line bodies up in
    // orbit order (star first) with even slots so each one stays readable.
    let _lineup = 'orbits';
    let _lineupDisc = 1;

    let _animFrameId   = null;
    let _lastFrameTime = 0;

    // In-game clock
    let _gameYear        = 0;
    let _gameDay         = 1;    // float, range [1, 366)
    let _speedDaysPerSec = 1 / 86400; // in-game days per real second; real time to start

    // DOM refs updated each frame
    let _yearInput = null;
    let _dayInput  = null;
    let _timeInput = null;
    let _shuttleRate = 0;
    let _stopShuttle = null;
    let _alignmentRun = 0;
    let _invalidateAlignment = null;

    let _paused   = false;
    let _pauseBtn = null;

    const GOLDEN = 2.39996;   // golden angle (rad) for spiral angular spacing

    // Same kilometre the Mongoose stellar engine uses for the 100-diameter limit.
    const _SUN_DIAM_KM = 1392700;
    const _AU_KM = 149597870.7;
    // 1 D☉ at the fitted view. Exponent 0.42: Earth ~5 px, a large gas giant
    // ~14 px, a G dwarf ~33 px, an M5 dwarf ~17 px. Capped below.
    const _SOL_RADIUS_PX = 34;
    const _SIZE_EXP = 0.42;

    // ── Fallback orbit→AU table ───────────────────────────────────────────────
    const _FALLBACK_ORBIT_AU = [
        0, 0.2, 0.4, 0.7, 1.0, 1.6, 2.8, 5.2, 10.0, 20.0, 40.0, 77.0, 154.0, 308.0
    ];

    // ── Spectral type colours ─────────────────────────────────────────────────
    const _STAR_COLORS = {
        O: '#9bb0ff', B: '#aabfff', A: '#cad7ff',
        F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1',
        M: '#ffcc6f', D: '#dce0ff', BD: '#a56432'
    };
    // Darker, saturated equivalents for white-background mode (originals wash out).
    const _STAR_COLORS_LIGHT = {
        O: '#3a5cc2', B: '#5070cc', A: '#6080b8',
        F: '#b88a00', G: '#c86800', K: '#c04800',
        M: '#b82800', D: '#6070a0', BD: '#7a4010'
    };

    // Body discs and satellite offsets grow once the view is closer than the
    // fitted system. Fit itself uses scale 1 so the whole orrery still lands
    // in the viewport.
    function _zoomScale() {
        const fit = _systemFitZoom || 1;
        if (_lineup !== 'orbits') {
            const disc = _lineupDisc || 1;
            if (_fitting) return disc;
            return disc * Math.max(1, _viewZoom / fit);
        }
        if (_fitting) return 1;
        return Math.max(1, _viewZoom / fit);
    }

    function _pxFromDiamKm(diamKm) {
        if (!(diamKm > 0)) return null;
        return _SOL_RADIUS_PX * Math.pow(diamKm / _SUN_DIAM_KM, _SIZE_EXP);
    }

    // Base pixels at the fitted view, before zoom / lineup disc scale.
    function _starBasePx(s) {
        const fromDiam = _pxFromDiamKm((s && s.diam > 0) ? s.diam * _SUN_DIAM_KM : 0);
        let r = fromDiam;
        if (r == null) {
            const cls = (s && s.sClass) || 'V';
            r = 28;
            if (cls === 'Ia' || cls === 'Ib') r = 52;
            else if (cls === 'II' || cls === 'III') r = 40;
            else if (cls === 'IV') r = 32;
            else if (s && s.sType === 'BD') r = 12;
            else if (s && s.sType === 'D') r = 8;
            else if (s && s.sType === 'M') r = 18;
            else if (s && s.sType === 'K') r = 22;
        }
        return Math.max(4, Math.min(58, r));
    }

    function _worldBasePx(w) {
        let r = _pxFromDiamKm(w && w.diamKm);
        if (r == null) {
            r = 4.5;
            if (w && w.type === 'Gas Giant') {
                if (w.ggType === 'GL') r = 14;
                else if (w.ggType === 'GM') r = 10;
                else r = 8;
            } else if (w && w.type === 'Mainworld') r = 6;
            else if (w && w.worldType === 'Worldlet') r = 3;
        }
        return Math.max(2.4, Math.min(22, r));
    }

    function _moonBasePx(m) {
        const isMainworld = m && m.type === 'Mainworld';
        let r = _pxFromDiamKm(m && m.diamKm);
        if (r == null) r = isMainworld ? 4.2 : 2.6;
        return Math.max(2, Math.min(10, r));
    }

    function _starBodyRadius(s) {
        return _starBasePx(s) * _zoomScale();
    }

    function _worldBodyRadius(w) {
        return _worldBasePx(w) * _zoomScale();
    }

    function _satelliteRadius(m) {
        return _moonBasePx(m) * _zoomScale();
    }

    // Pixel radius at which a body's orbit is drawn, so the ring clears the
    // parent star's disc. starRadiusPx already includes zoom.
    function _orbitHole(starRadiusPx) {
        return (starRadiusPx || 0) + 14 * _zoomScale();
    }

    // A ringed world keeps its moons clear of its rings: the rings reach about
    // twice the planet's radius, and the moons are spaced out beyond them.
    const _RING_OUTER = 2.05;
    function _hasRings(world) {
        return !_hideMoons && !!world && ((world.rings || []).length > 0 || (world.moons || []).some(m => m.size === 'R'));
    }
    function _moonOrbitRadius(planetR, index, world = null) {
        const base = _hasRings(world) ? planetR * (_RING_OUTER + 0.1) : planetR;
        return base + (10 + index * 6) * _zoomScale();
    }

    // Flat rings (no GPU): spread across the same band the shaded rings fill.
    function _ringOrbitRadius(planetR, index, count = 1) {
        return planetR * (1.3 + 0.7 * (index + 1) / (count + 1));
    }

    // ── Colour helpers ────────────────────────────────────────────────────────

    function _starColor(s) {
        const map = _lightMode ? _STAR_COLORS_LIGHT : _STAR_COLORS;
        return map[s.sType] || (_lightMode ? '#606060' : '#ffffff');
    }

    function _worldColor(w) {
        if (w.type === 'Gas Giant') {
            if (w.ggType === 'GL') return '#c8a97a';
            if (w.ggType === 'GM') return '#d4b98a';
            return '#e0cc9a';
        }
        if (w.type === 'Planetoid Belt') return '#888888';
        return '#a0a0b0';
    }

    function _drawMainworldStar(ctx, x, y, bodyR) {
        if (_hideMainworldHighlight) return;
        const z = _zoomScale();
        let outer = Math.min(Math.max(3.5, 4.5 * z), Math.max(3, bodyR * 0.45));
        let cx = x;
        let cy = y;
        // Up close the star would cover the surface, so it becomes a badge on the rim.
        if (bodyR > 16) {
            outer = 8;
            cx = x + bodyR * 0.74;
            cy = y - bodyR * 0.74;
        }
        const inner = outer * 0.38;
        ctx.save();
        ctx.fillStyle = _lightMode ? '#0d6b64' : '#66fcf1';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
            const b = a + Math.PI / 5;
            if (i === 0) ctx.moveTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
            else ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
            ctx.lineTo(cx + Math.cos(b) * inner, cy + Math.sin(b) * inner);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // ── Orbit / AU helpers ────────────────────────────────────────────────────

    function _orbitToAU(orbitId) {
        const tbl = (window.MgT2EData && window.MgT2EData.stellar && window.MgT2EData.stellar.orbitAu)
                    || _FALLBACK_ORBIT_AU;
        const idx  = Math.floor(orbitId);
        const frac = orbitId - idx;
        const max  = tbl.length - 1;
        const lo   = tbl[Math.min(idx, max)];
        const hi   = idx < max ? tbl[idx + 1] : lo;
        return lo + frac * (hi - lo);
    }

    // Returns the AU distance of a companion star, supporting normalised orbitAU
    // (set by CT/T5 normalisers) or falling back to _orbitToAU(s.orbitId).
    function _starCompanionAU(s) {
        return (s.orbitAU !== undefined && s.orbitAU !== null)
            ? s.orbitAU
            : _orbitToAU(s.orbitId || 0.5);
    }

    // Fraction of the way from the star's clearance ring to the outer edge.
    // Linear mode keeps AU proportions in that span. Log mode is the default.
    function _unitT(au, maxAU) {
        if (!(au > 0) || !(maxAU > 0)) return 0;
        if (_linearScale) return Math.min(1, au / maxAU);
        return Math.log(1 + au) / Math.log(1 + maxAU);
    }

    // holePx is the parent star's clearance. The outer edge never shrinks
    // inside that hole, so a tight companion system still has a ladder of
    // orbits outside its star.
    function _scaleR(au, maxAU, maxPx, holePx) {
        const hole = Math.max(0, holePx || 0);
        const outer = Math.max(maxPx || 0, hole > 0 ? hole / 0.58 : 0);
        const span = outer - hole;
        if (span <= 0) return hole;
        return hole + span * _unitT(au, maxAU);
    }

    // Room granted to a companion's own planets. Stays at 28% of the
    // companion's orbit when that already clears the companion's disc.
    function _subSystemRadius(star, orbitR) {
        const needed = _orbitHole(_starBodyRadius(star)) / 0.58;
        const share = (orbitR || 0) * 0.28;
        return Math.max(share, needed);
    }

    // ── Deterministic epoch hash ──────────────────────────────────────────────
    // FNV-1a body + MurmurHash3 finalizer for full avalanche.
    // Without the finalizer, keys differing only in a trailing digit (e.g. ':0'
    // vs ':1') produce raw hash values that differ by only ~16 million, causing
    // all moons of a planet to cluster at nearly the same angle.
    function _hashEpoch(key) {
        let h = 2166136261;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h  = Math.imul(h, 16777619) >>> 0;
        }
        h ^= h >>> 16;
        h  = Math.imul(h, 0x85ebca6b) >>> 0;
        h ^= h >>> 13;
        h  = Math.imul(h, 0xc2b2ae35) >>> 0;
        h ^= h >>> 16;
        return (h / 0x100000000) * 2 * Math.PI;
    }

    // ── Physical period helpers ───────────────────────────────────────────────

    // Kepler's 3rd law: period in years for au (AU) around starMass (M☉).
    function _keplerYears(au, starMass) {
        if (au <= 0 || starMass <= 0) return 1;
        return Math.sqrt(Math.pow(au, 3) / starMass);
    }

    // Period in years for a normalised world object.
    function _worldPeriodYears(w, starMass) {
        if (w.periodYears && w.periodYears > 0) return w.periodYears;
        return _keplerYears(w.au || 1, starMass || 1);
    }

    // Period in years for a moon.  Uses periodHrs if stored; otherwise derives
    // from pd (planetary diameters from parent centre) via Kepler in SI units.
    function _moonPeriodYears(m, parentWorld) {
        if (m.periodHrs && m.periodHrs > 0) return m.periodHrs / (365.25 * 24);
        const G            = 6.674e-11;
        const M_EARTH_KG   = 5.972e24;
        const parentMassKg = (parentWorld.mass || 1) * M_EARTH_KG;
        const parentDiamKm = parentWorld.diamKm || 12742;
        const pd           = m.pd || 20;
        const r_m          = pd * parentDiamKm * 1000;   // orbital radius metres
        const T_sec        = 2 * Math.PI * Math.sqrt(Math.pow(r_m, 3) / (G * parentMassKg));
        return T_sec / (365.25 * 24 * 3600);
    }

    // Push current _gameYear / _gameDay into the header inputs.
    // Skip an input while it has focus so the user can type or use the spinner without being overwritten.
    function _updateDateDisplay() {
        if (_yearInput && document.activeElement !== _yearInput) _yearInput.value = _gameYear;
        if (_dayInput  && document.activeElement !== _dayInput)  _dayInput.value  = Math.max(1, Math.floor(_gameDay));
        if (_timeInput && document.activeElement !== _timeInput) _timeInput.value = _clockText((_gameDay - Math.floor(_gameDay)) * 86400);
        _syncStardateFields();
    }

    function _clockText(seconds) {
        seconds = Math.floor(seconds + 1e-5) % 86400;
        return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
            .map(n => String(n).padStart(2, '0')).join(':');
    }
    function _totalDays() { return _gameYear * 365 + _gameDay - 1; }
    function _setDays(days) {
        if (!Number.isFinite(days)) return;
        _gameYear = Math.floor(days / 365);
        _gameDay = days - _gameYear * 365 + 1;
        window.campaignTime = { days: _totalDays() };
        _scheduleCampaignTimeSave();
        _updateDateDisplay();
    }
    function _dateText(days) {
        const year = Math.floor(days / 365), day = days - year * 365;
        return `Year ${formatDisplayNumber(year, 0)} · Day ${Math.floor(day) + 1} · ${_clockText((day % 1) * 86400)}`;
    }

    // ── System normalisation ──────────────────────────────────────────────────
    // Each normaliser returns a common object:
    // {
    //   edition: string,
    //   age: number,
    //   hzAU: number,          ← HZ centre in AU (used directly, bypasses hzco)
    //   stars: [{
    //     name, sType, sClass, subType, mass, diam, temp, lum,
    //     role, separation, orbitId, orbitAU  ← orbitAU: AU from primary (companions)
    //   }],
    //   worlds: [{
    //     type, ggType, au, parentStarIdx, orbitType, eccentricity,
    //     mass, diamKm, gravity, meanTempK,
    //     moons: [{type, name, uwp, starport, tl, tradeCodes, travelZone,
    //              diamKm, mass, gravity, meanTempK, size, pd}],
    //     uwp, name, starport, tl, tradeCodes, travelZone, orbitId
    //   }]
    // }

    function _detectSystem(state) {
        if (state.aowSystem && state.aowSystem.stars && state.aowSystem.stars.length > 0)
            return { raw: state.aowSystem, edition: 'AoW' };
        if (state.mgtSystem && state.mgtSystem.stars && state.mgtSystem.stars.length > 0)
            return { raw: state.mgtSystem, edition: 'MgT2E' };
        if (state.ctSystem  && state.ctSystem.stars  && state.ctSystem.stars.length  > 0)
            return { raw: state.ctSystem,  edition: 'CT'    };
        if (state.t5System  && state.t5System.stars  && state.t5System.stars.length  > 0)
            return { raw: state.t5System,  edition: 'T5'    };
        if (state.rttSystem && state.rttSystem.stars && state.rttSystem.stars.length > 0)
            return { raw: state.rttSystem, edition: 'RTT'   };
        return null;
    }

    // MgT2E: normalise worlds to handle both current and older JSON save formats.
    // Older saves may be missing orbitType, parentStarIdx, and use type:'Planet'.
    function _normalizeMgT2E(sys) {
        const hzAU = _orbitToAU(sys.hzco || 3);
        const mw   = sys.mainworld;
        const mwId = mw && mw._id;
        const worlds = (sys.worlds || []).map(w => {
            const isMainworld = _isSameWorld(w, mw) || w.type === 'Mainworld';
            let type = isMainworld ? 'Mainworld' : w.type;
            if (type === 'Planet') type = 'Terrestrial Planet';
            // generateAtmospherics replaces moon objects (w.moons[j] = syncRes with type:'Satellite'),
            // detaching them from sys.mainworld. Re-identify lunar mainworlds by _id.
            const moons = (w.moons || []).map(m => {
                const moonIsMainworld = (mwId && m._id === mwId) || m.type === 'Mainworld';
                return moonIsMainworld ? Object.assign({}, m, { type: 'Mainworld' }) : m;
            });
            return Object.assign({}, w, {
                type,
                moons,
                orbitType:     w.orbitType     || 'S-Type',
                parentStarIdx: w.parentStarIdx ?? 0,
                travelZone:    w.travelZone    || w.travelCode || 'G',
            });
        });
        return Object.assign({}, sys, { edition: 'MgT2E', hzAU, worlds });
    }

    // A UWP physical digit (0–9, A–F). Gas-giant words ("Large") and ring
    // letters ("R") are not map size codes, so they stay off the body.
    function _surfaceDigit(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && /^[0-9A-Fa-f]$/.test(value.trim())) return value.trim().toUpperCase();
        return null;
    }

    // Shared moon normaliser for CT and T5 (both use world.satellites[]).
    function _normMoon(m, mainworldRef) {
        const isMainworld = _isSameWorld(m, mainworldRef);
        return {
            type:        isMainworld ? 'Mainworld' : (m.type || 'Satellite'),
            name:        m.name       || null,
            uwp:         m.uwp        || null,
            starport:    m.starport   || null,
            tl:          m.tl         ?? null,
            tradeCodes:  m.tradeCodes || [],
            travelZone:  m.travelZone || m.zone || 'G',
            diamKm:      m.diamKm     || null,
            mass:        m.mass       || null,
            gravity:     m.gravity    || null,
            meanTempK:   m.meanTempK  || null,
            siderealHours: (typeof m.siderealHours === 'number') ? m.siderealHours : null,
            axialTilt:   (typeof m.axialTilt === 'number') ? m.axialTilt : null,
            tidallyLocked: m.tidallyLocked === true,
            isTwilightZone: m.isTwilightZone === true,
            rotationPeriod: m.rotationPeriod ?? null,
            size:        _surfaceDigit(m.size),
            atm:         _surfaceDigit(m.atm),
            hydro:       _surfaceDigit(m.hydro),
            pd:          m.pd         || null,
        };
    }

    function _isSameWorld(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        return a.uwp && b.uwp && a.uwp === b.uwp && a.name === b.name;
    }

    // ── CT normaliser ─────────────────────────────────────────────────────────

    function _normalizeCT(sys) {
        const mw = sys.mainworld;

        // Stars
        const stars = (sys.stars || []).map((s, i) => {
            // CT companion orbit may be 'Close', 'Far', or a number (native stochastic
            // generation) — but a System-Editor-authored/repositioned companion never carries
            // those fields at all, only `orbitId` (the shared drag-and-drop position key also
            // used for worlds). Without this fallback, a companion added or dragged in the
            // editor always rendered at the same hardcoded distance in the orrery no matter
            // where it was dropped, because none of the native-format checks ever matched.
            // Mirrors the equivalent read-side fallback in system_editor.js's
            // _buildWorkingCopyFromState (orbitAU derivation for CT/RTT stars).
            let orbitAU = null;
            if (i > 0) {
                if (typeof s.orbit === 'number') orbitAU = _orbitToAU(s.orbit);
                else if (s.distAU)               orbitAU = s.distAU;
                else if (s.orbit === 'Close')     orbitAU = 0.05;
                else if (s.orbitAU != null)       orbitAU = s.orbitAU;
                else if (s.orbitId != null)       orbitAU = _orbitToAU(s.orbitId);
                else                              orbitAU = 10;
            }
            return {
                name:           s.name || `${s.type}${s.decimal ?? ''} ${s.size}`,
                sType:          s.type  || 'G',
                sClass:         s.size  || 'V',
                subType:        s.decimal ?? 5,
                mass:           s.mass        || 1,
                diam:           s.diam        || 1,
                temp:           null,
                lum:            s.luminosity  || 1,
                role:           s.role || (i === 0 ? 'Primary' : 'Companion'),
                separation:     i > 0 ? (typeof s.orbit === 'string' ? s.orbit : null) : null,
                orbitId:        typeof s.orbit === 'number' ? s.orbit : null,
                orbitAU,
                parentStarIdx:  s.parentStarIdx ?? 0,
            };
        });

        // Worlds — flattened from sys.orbits[]. Read the body's own w.distAU (always freshly
        // recomputed from the current orbit every generation pass — ct_bottomup_generator.js's
        // internalPhysicalPass) rather than slot.distAU (a write-time-only echo of the seed
        // that's never refreshed after a Preview — see OW-25). Matches the pattern captured
        // planets already use correctly, two lines below.
        const worlds = [];
        (sys.orbits || []).forEach(slot => {
            const w = slot.contents;
            if (!w || w.type === 'Empty') return;
            worlds.push(_normCTWorld(w, w.distAU || 0, mw));
        });
        // Captured planets (anomalies)
        (sys.capturedPlanets || []).forEach(w => {
            if (w && w.type !== 'Empty') worlds.push(_normCTWorld(w, w.distAU || 0, mw));
        });

        // Far companions carry their own independent orbit sequence in nestedSystem (set by
        // ct_bottomup_generator.js's generateSystemOrbits or the System Editor's CT write()
        // adapter) — flatten those bodies too, tagged with the companion's own star index, so
        // the existing sub-orrery drawing code (_drawWorldSet's `w.parentStarIdx === sIdx`
        // filter, below) picks them up. Without this a Far companion's own bodies were
        // invisible in the orrery even after the System Editor/accordion could show them (OW-19).
        (sys.stars || []).forEach((s, i) => {
            if (i === 0 || !s.nestedSystem) return;
            (s.nestedSystem.orbits || []).forEach(slot => {
                const w = slot.contents;
                if (!w || w.type === 'Empty') return;
                worlds.push(_normCTWorld(w, w.distAU || 0, mw, i));
            });
            (s.nestedSystem.capturedPlanets || []).forEach(w => {
                if (w && w.type !== 'Empty') worlds.push(_normCTWorld(w, w.distAU || 0, mw, i));
            });
        });

        // HZ centre: prefer sys.hzco — the orbit number CT's generator actually resolved and
        // used for zone classification/placement (ct_bottomup_generator.js's
        // generateSystemOrbits), which respects any System Editor override. Falling back to a
        // live zoneHTable lookup here (as this code used to do unconditionally) meant an
        // edited system's HZ override never moved the ring, since this recomputed straight from
        // the primary's size/type every time regardless of what the generator/editor resolved.
        // sys.hzco is only ever absent (undefined, not null) for systems that predate this field
        // — chiefly Top-Down-generated ones (ct_topdown_generator.js doesn't set it) — so those
        // still fall back to the direct table lookup below.
        const primary = (sys.stars || [])[0];
        let hzAU = null;
        let hzKnownAbsent = false;
        if (sys.hzco !== undefined) {
            if (sys.hzco != null) hzAU = _orbitToAU(sys.hzco);
            // sys.hzco === null means the generator resolved no HZ (RAW ZONE_H_TABLE negative,
            // and no override forced one) — same "known absent" semantics as the table lookup
            // below, not a missing value to fall back from.
            else hzKnownAbsent = true;
        } else if (primary && typeof zoneHTable !== 'undefined' && zoneHTable[primary.size]) {
            const hzOrbitNum = zoneHTable[primary.size][`${primary.type}${primary.decimal}`];
            if (hzOrbitNum != null) {
                if (hzOrbitNum >= 0) hzAU = _orbitToAU(hzOrbitNum);
                // ZONE_H_TABLE uses negative values (e.g. M5/M9 under size 'V', most of 'VI'
                // and 'D') as a deliberate RAW signal that this star type has no classical
                // habitable zone at all — not a lookup failure. _orbitToAU(-1) previously read
                // past the start of the orbit-AU array (tbl[-1] === undefined), producing NaN,
                // which crashed _drawHZBand's ctx.createRadialGradient (non-finite radius) and
                // aborted the whole orrery render before stars/worlds were drawn. Leave hzAU
                // null here — no ring should be drawn, and the mainworld-distance fallback
                // below is skipped too, since falling back there would incorrectly imply a
                // habitable zone exists when RAW says it doesn't.
                else hzKnownAbsent = true;
            }
        }
        if (hzAU == null && !hzKnownAbsent) hzAU = (mw && mw.distAU) ? mw.distAU : 1.0;

        return { edition: 'CT', age: sys.age || 0, hzAU, stars, worlds };
    }

    function _normCTWorld(w, au, mainworldRef, parentStarIdx) {
        const isMainworld = _isSameWorld(w, mainworldRef) || w.type === 'Mainworld';
        let type  = isMainworld ? 'Mainworld' : (w.type || 'Terrestrial Planet');
        let ggType = null;
        if (w.type === 'Gas Giant') {
            type   = 'Gas Giant';
            ggType = (w.size === 'S') ? 'GS' : 'GL';
        }
        return {
            type, ggType,
            au:            au || w.distAU || 0,
            parentStarIdx: parentStarIdx || 0,
            orbitType:     'S-Type',
            eccentricity:  0,
            mass:          w.mass     || null,
            diamKm:        w.diamKm   || null,
            gravity:       w.gravity  || null,
            meanTempK:     w.meanTempK|| null,
            siderealHours: (typeof w.siderealHours === 'number') ? w.siderealHours : null,
            axialTilt:     (typeof w.axialTilt === 'number') ? w.axialTilt : null,
            tidallyLocked: w.tidallyLocked === true,
            isTwilightZone: w.isTwilightZone === true,
            rotationPeriod: w.rotationPeriod ?? null,
            size:          _surfaceDigit(w.size),
            atm:           _surfaceDigit(w.atm),
            hydro:         _surfaceDigit(w.hydro),
            moons:         (w.satellites || []).map(m => _normMoon(m, mainworldRef)),
            uwp:           w.uwp      || null,
            name:          w.name     || null,
            starport:      w.starport || null,
            tl:            w.tl       ?? null,
            tradeCodes:    w.tradeCodes || [],
            travelZone:    w.travelZone || w.zone || 'G',
            orbitId:       w.orbit    ?? null,
        };
    }

    // ── T5 normaliser ─────────────────────────────────────────────────────────

    function _normalizeT5(sys) {
        const mw = sys.mainworld;

        // Stars
        const stars = (sys.stars || []).map((s, i) => ({
            name:          s.name || `${s.type}${s.decimal ?? ''} ${s.size}`,
            sType:         s.type  || 'G',
            sClass:        s.size  || 'V',
            subType:       s.decimal ?? 5,
            mass:          s.mass        || 1,
            diam:          s.diam        || 1,
            temp:          null,
            lum:           s.luminosity  || 1,
            role:          s.role || (i === 0 ? 'Primary' : 'Companion'),
            separation:    i > 0 ? (s.role || null) : null,
            orbitId:       s.orbitID     || null,
            orbitAU:       i > 0 ? (s.distAU || null) : null,
            parentStarIdx: s.parentStarIdx ?? 0,
        }));

        // Worlds — flat list (imported systems) or per-star orbit slots (generated).
        // Imported systems set sys.worlds; generated systems only have orbit slots.
        const worlds = [];
        if (sys.worlds && sys.worlds.length > 0) {
            sys.worlds.forEach(w => worlds.push(_normT5World(w, w.distAU || 0, w.parentStarIdx || 0, mw)));
        } else {
            (sys.stars || []).forEach((s, si) => {
                (s.orbits || []).forEach(slot => {
                    const w = slot.contents;
                    if (!w || w.type === 'Empty') return;
                    worlds.push(_normT5World(w, slot.distAU || 0, si, mw));
                });
            });
        }

        // HZ centre: prefer the star-physics-derived HZ orbit (getStarHZ in
        // t5_topdown_generator.js, fixed by the primary's spectral type/size — independent
        // of which body is flagged mainworld). Fall back to the mainworld's own distance
        // only for older saves generated before sys.hzOrbit was persisted.
        let hzAU = (sys.hzOrbit != null) ? _orbitToAU(sys.hzOrbit) : null;
        if (hzAU == null) hzAU = (mw && mw.distAU) ? mw.distAU : 1.0;

        return { edition: 'T5', age: sys.age || 0, hzAU, stars, worlds };
    }

    function _normT5World(w, au, parentStarIdx, mainworldRef) {
        const isMainworld = _isSameWorld(w, mainworldRef) || w.type === 'Mainworld';
        let type  = 'Terrestrial Planet';
        let ggType = null;
        if (isMainworld) {
            type = 'Mainworld';
        } else if (w.type === 'Large Gas Giant') {
            type = 'Gas Giant'; ggType = 'GL';
        } else if (w.type === 'Small Gas Giant') {
            type = 'Gas Giant'; ggType = 'GS';
        } else if (w.type === 'Gas Giant') {
            type = 'Gas Giant'; ggType = w.ggType || 'GM';
        } else if (w.type === 'Ice Giant') {
            type = 'Gas Giant'; ggType = 'GS';
        } else if (w.type === 'Planetoid Belt') {
            type = 'Planetoid Belt';
        } else if (w.type === 'Ring') {
            type = 'Planetoid Belt';
        }
        return {
            type, ggType,
            worldType:     w.worldType || null,
            au:            au || w.distAU || 0,
            parentStarIdx,
            orbitType:     'S-Type',
            eccentricity:  0,
            // T5 RAW gives a Gas Giant a literal 'Variable (Giant)' string for `mass` (see
            // calculateT5PhysicalStats, t5_world_engine.js) instead of a number, alongside a
            // separate numeric `massEarths` (317.8, the same fixed value for every tier — T5
            // doesn't vary it by size) — every other T5 body type has a real numeric `mass`.
            // Passing the string straight through broke two things downstream: the tooltip's
            // `w.mass.toFixed(2)` threw a TypeError (aborting the tooltip entirely, so hovering a
            // Gas Giant showed nothing), and _moonPeriodYears' `mass * M_EARTH_KG` coerced the
            // string to NaN, sending every one of that Gas Giant's moons to a NaN screen position
            // (invisible and unhoverable) — see OW-56.
            //
            // A freshly-added Gas Giant (System Editor, before its first full physics resolution)
            // has neither `mass` nor `massEarths` set yet, so this used to fall through to
            // `_moonPeriodYears`' own `parentWorld.mass || 1` default — treating the not-yet-
            // resolved Gas Giant as a 1-Earth-mass body. Since orbital period scales as
            // 1/√mass, that made its moons visibly spin very fast in the live preview, then snap
            // to their correct, much slower speed the instant the Gas Giant's real ~318-Earth-mass
            // got resolved (Preview/Save) — jarring, even though the end state was always correct
            // (OW-60). Default an unresolved Gas Giant to the same 317.8 T5 already uses once
            // resolved, so there's nothing left to visibly snap to.
            mass:          (typeof w.mass === 'number' ? w.mass : w.massEarths) ?? (type === 'Gas Giant' ? 317.8 : null),
            // Same gap as the mass default above (OW-60), just never covered by that fix: a
            // freshly-added Gas Giant (System Editor, before its first full physics resolution)
            // has no diamKm yet either, so this fell through to _moonPeriodYears' own
            // `parentWorld.diamKm || 12742` default — Earth's diameter, roughly 15-20x smaller
            // than a real Gas Giant's (calculateT5PhysicalStats: diamKm = sizeVal * 10000,
            // ~210,000-310,000 km depending on size letter). Since orbital radius scales with
            // parent diameter and period scales as radius^1.5, that made an unresolved GG's
            // moons visibly whip around far too fast in the live preview, snapping to their
            // correct, much slower speed once Preview/Save resolved a real diamKm. 215000 matches
            // a brand-new '+GG' body's default tier (ggType 'GS'/Small — system_editor.js's
            // _addBody — sizes 'M'/'N', 210000/220000 km) so there's nothing to visibly snap to,
            // mirroring the mass default's own reasoning exactly.
            diamKm:        w.diamKm    || (type === 'Gas Giant' ? 215000 : null),
            gravity:       w.gravity   || null,
            meanTempK:     w.meanTempK || null,
            siderealHours: (typeof w.siderealHours === 'number') ? w.siderealHours : null,
            axialTilt:     (typeof w.axialTilt === 'number') ? w.axialTilt : null,
            tidallyLocked: w.tidallyLocked === true,
            rotationPeriod: w.rotationPeriod ?? null,
            size:          _surfaceDigit(w.size),
            atm:           _surfaceDigit(w.atm),
            hydro:         _surfaceDigit(w.hydro),
            moons:         (w.satellites || []).map(m => _normMoon(m, mainworldRef)),
            uwp:           w.uwp       || null,
            name:          w.name      || null,
            starport:      w.starport  || null,
            tl:            w.tl        ?? null,
            tradeCodes:    w.tradeCodes || [],
            travelZone:    w.travelZone || 'G',
            orbitId:       null,
        };
    }

    // ── RTT normaliser ────────────────────────────────────────────────────────
    // RTT stores worlds per-star under star.planetarySystem.orbits[].
    // No AU distances — synthesised from zone (Epistellar/Inner/Outer) + orbit index.

    // Approximate AU per zone index (0-based within zone)
    const _RTT_ZONE_AU = {
        Epistellar: { base: 0.10, step: 0.10 },
        Inner:      { base: 0.50, step: 0.70 },
        Outer:      { base: 5.00, step: 8.00 },
    };

    // Companion separation label → approximate AU
    const _RTT_COMPANION_AU = { Tight: 0.05, Close: 0.5, Moderate: 5, Distant: 60 };

    function _normalizeRTT(sys) {
        const stars = (sys.stars || []).map((s, i) => {
            // RTT uses type:'L' for brown dwarfs; luminosityClass:'D' for white dwarfs
            let sType  = s.type || 'G';
            if (sType === 'L')                sType = 'BD';
            else if (s.luminosityClass === 'D') sType = 'D';

            const sClass  = (s.luminosityClass === 've' || s.luminosityClass === 'Ve') ? 'V' : (s.luminosityClass || 'V');
            const orbitAU = i > 0 ? (_RTT_COMPANION_AU[s.orbitType] ?? 5) : null;

            return {
                name:          s.classification || `${s.type}-${s.luminosityClass}`,
                sType, sClass,
                subType:       5,
                mass:          s.mass || 1,
                diam:          s.diam || 1,
                temp:          null,
                lum:           s.lum  || 1,
                role:          s.role || (i === 0 ? 'Primary' : 'Companion'),
                separation:    i > 0 ? (s.orbitType || null) : null,
                orbitId:       null,
                orbitAU,
                parentStarIdx: s.parentStarIdx ?? 0,
            };
        });

        const worlds = [];
        (sys.stars || []).forEach((s, si) => {
            if (!s.planetarySystem) return;
            const zoneCounts = {};
            const sorted = [...(s.planetarySystem.orbits || [])].sort((a, b) => (a.orbitNumber || 0) - (b.orbitNumber || 0));
            sorted.forEach(body => {
                const zone    = body.zone || 'Inner';
                const idx     = zoneCounts[zone] = (zoneCounts[zone] || 0);
                zoneCounts[zone]++;
                const z       = _RTT_ZONE_AU[zone] || _RTT_ZONE_AU.Inner;
                const au      = z.base + idx * z.step;
                worlds.push(_normRTTWorld(body, au, si));
            });
        });

        const mw   = worlds.find(w => w.type === 'Mainworld');
        const hzAU = mw ? mw.au : 1.0;
        return { edition: 'RTT', age: sys.age || 0, hzAU, stars, worlds };
    }

    function _normRTTWorld(body, au, parentStarIdx) {
        const isMainworld = body.isMainworld === true;
        let type   = 'Terrestrial Planet';
        let ggType = null;

        if (isMainworld) {
            type = 'Mainworld';
        } else if (body.type === 'Jovian Planet' || body.worldClass === 'Jovian' || body.worldClass === 'Chthonian') {
            type = 'Gas Giant'; ggType = 'GL';
        } else if (body.type === 'Helian Planet') {
            type = 'Gas Giant'; ggType = 'GS';
        } else if (body.type === 'Asteroid Belt') {
            type = 'Planetoid Belt';
        }

        // Build a compact UWP string if the body has social data
        let uwp = null;
        const _eh = (v) => (typeof window.getEHexLetter === 'function') ? window.getEHexLetter(v || 0) : String(v || 0);
        if (body.starport && body.population != null) {
            const sz = (typeof body.size === 'number') ? _eh(body.size) : (body.size || '0');
            uwp = `${body.starport}${sz}${_eh(body.atmosphere)}${_eh(body.hydrosphere)}` +
                  `${_eh(body.population)}${_eh(body.government)}${_eh(body.lawLevel)}-${_eh(body.tl)}`;
        }

        const moons = (body.satellites || []).map(m => ({
            type:       m.isMainworld ? 'Mainworld' : 'Satellite',
            name:       m.name       || null,
            uwp:        null,
            starport:   m.starport   || null,
            tl:         m.tl         ?? null,
            tradeCodes: m.tradeCodes || [],
            travelZone: 'G',
            diamKm:     m.diamKm     || null,
            mass:       null,
            gravity:    m.gravity    || null,
            meanTempK:  m.meanTempK  || null,
            size:       _surfaceDigit(m.size),
            atm:        _surfaceDigit(m.atmosphere ?? m.atm),
            hydro:      _surfaceDigit(m.hydrosphere ?? m.hydro),
            pd:         null,
        }));

        return {
            type, ggType, au, parentStarIdx,
            orbitType:    'S-Type',
            eccentricity: 0,
            mass:         null,
            diamKm:       body.diamKm    || null,
            gravity:      body.gravity   || null,
            meanTempK:    body.meanTempK || null,
            siderealHours: (typeof body.siderealHours === 'number') ? body.siderealHours : null,
            axialTilt:    (typeof body.axialTilt === 'number') ? body.axialTilt : null,
            tidallyLocked: body.tidallyLocked === true,
            rotationPeriod: body.rotationPeriod ?? null,
            size:         _surfaceDigit(body.size),
            atm:          _surfaceDigit(body.atmosphere ?? body.atm),
            hydro:        _surfaceDigit(body.hydrosphere ?? body.hydro),
            moons,
            uwp,
            name:         body.name      || null,
            starport:     body.starport  || null,
            tl:           body.tl        ?? null,
            tradeCodes:   body.tradeCodes || [],
            travelZone:   (body.bases || []).includes('Z') ? 'Red' : 'G',
            orbitId:      null,
        };
    }

    // ── AoW normaliser ────────────────────────────────────────────────────────

    function _normalizeAoW(sys) {
        const mw = sys.mainworld;

        // sys.hzco is never computed by the AoW generator (see OW-9 note above), so derive
        // the HZ ring directly from the primary's real solar luminosity — same inverse-square
        // approximation MgT2E uses for HZCO (HZ AU = sqrt(luminosity in L☉)), applied straight
        // in AU since AoW bodies already carry real orbitalRadius rather than an abstract orbit
        // number. Unlike RTT (which only tracks a luminosity *class* letter, not a numeric solar
        // luminosity), AoW's star-physics solver already produces `star.luminosity` for every
        // star, so this needs no new data — only falls back to the mainworld's own orbit if
        // luminosity is somehow missing (e.g. an unresolved/partial star).
        const primaryLum = (sys.stars && sys.stars[0]) ? sys.stars[0].luminosity : null;
        const mwAU = mw ? (mw.orbitalRadius ?? mw.orbitId ?? 1.0) : 1.0;
        const hzAU = (primaryLum != null && primaryLum > 0) ? Math.sqrt(primaryLum) : mwAU;

        // Companion orbit AU from sys.orbits[], sorted by R ascending
        const sortedOrbits = [...(sys.orbits || [])].sort((a, b) => a.R - b.R);

        const stars = (sys.stars || []).map((star, idx) => {
            let sType = 'G', subType = 5, sClass = 'V';
            const sc = star.spectralClassification || '';
            if (star.state === 'White Dwarf') {
                sType = 'D'; subType = 0; sClass = '';
            } else if (star.state === 'Brown Dwarf') {
                sType = 'BD'; subType = 0; sClass = '';
            } else {
                const m = sc.match(/^([OBAFGKM])(\d+)\s*(Ia|Ib|II|III|IV|V)$/i);
                if (m) { sType = m[1].toUpperCase(); subType = parseInt(m[2]); sClass = m[3]; }
            }
            const orbitAU = (idx > 0 && sortedOrbits[idx - 1]) ? sortedOrbits[idx - 1].R : null;
            return {
                role:          idx === 0 ? 'Primary' : 'Companion',
                sType, subType, sClass,
                mass:          star.wdMass || star.initialMass || 1.0,
                lum:           star.luminosity ?? null,
                diam:          (star.radius > 0) ? (star.radius * 2 * _AU_KM) / _SUN_DIAM_KM : null,
                age:           sys.systemAge ?? null,
                orbitAU,
                name:          (star.label ? `${star.label}: ` : '') + (sc || '?'),
            };
        });

        const worlds = (sys.worlds || []).map(w => {
            const isMainworld = w === mw || w.type === 'Mainworld';
            let type   = isMainworld ? 'Mainworld' : (w.type || 'Terrestrial Planet');
            let ggType = null;
            if (type === 'Gas Giant') {
                const em = w.mass || 0;
                ggType = em >= 200 ? 'GL' : em >= 50 ? 'GM' : 'GS';
            }

            const au      = w.orbitalRadius ?? w.orbitId ?? null;
            const diamKm  = (w.radius != null) ? Math.round(w.radius * 2) : null;

            const moons = (w.satellites || []).map(m => ({
                type:      m.type || 'Satellite',
                name:      m.name       ?? null,
                pd:        null,
                uwp:       m.uwp        ?? null,
                starport:  m.starport   ?? null,
                tl:        m.tl         ?? null,
                tradeCodes: m.tradeCodes || [],
                travelZone: m.travelZone || 'G',
                diamKm:    (m.radius != null) ? Math.round(m.radius * 2) : null,
                mass:      m.mass       ?? null,
                rotationPeriod: (typeof m.rotationPeriod === 'number') ? m.rotationPeriod : null,
                orbitalPeriod: (typeof m.orbitalPeriod === 'number') ? m.orbitalPeriod : null,
                gravity:   m.gravity    ?? null,
                meanTempK: m.avgSurfaceTemp ?? null,
                size:      _surfaceDigit(m.size),
                atm:       _surfaceDigit(m.atmCode ?? m.atm),
                hydro:     _surfaceDigit(m.hydroCode ?? m.hydro),
            }));

            const parentStarIdx = Math.min(w.parentStarIdx ?? 0, Math.max(0, stars.length - 1));

            return {
                type, ggType,
                au, orbitId: au,
                parentStarIdx,
                orbitType:    'S-Type',
                eccentricity: w.eccentricity ?? 0,
                diamKm,
                mass:         w.mass       ?? null,
                gravity:      w.gravity    ?? null,
                meanTempK:    w.avgSurfaceTemp ?? null,
                rotationPeriod: (typeof w.rotationPeriod === 'number') ? w.rotationPeriod : null,
                orbitalPeriod: (typeof w.orbitalPeriod === 'number') ? w.orbitalPeriod : null,
                size:         w.size       ?? null,
                atm:          w.atmCode    ?? w.atm ?? null,
                hydro:        w.hydroCode  ?? w.hydro ?? null,
                uwp:          w.uwp        || '',
                name:         w.name       || '',
                starport:     w.starport   || '',
                tl:           w.tl         ?? null,
                tradeCodes:   w.tradeCodes || [],
                travelZone:   w.travelZone || 'G',
                moons,
            };
        });

        return { edition: 'AoW', age: sys.systemAge ?? null, hzAU, stars, worlds };
    }

    // ── Surface viewer helpers ────────────────────────────────────────────────

    function _isTerrestrial(w) {
        if (w.type === 'Gas Giant')      return false;
        if (w.type === 'Planetoid Belt') return false;
        if (w.uwp && w.uwp[1] === '0')  return false;   // size-0 belt mainworld
        return true;
    }

    function _findTerrestrialUnderCursor(mx, my) {
        for (let i = _hitBodies.length - 1; i >= 0; i--) {
            const b = _hitBodies[i];
            if (b.kind !== 'world' && b.kind !== 'moon') continue;
            if (!_isTerrestrial(b.body)) continue;
            const dx = mx - b.cx, dy = my - b.cy;
            if (Math.sqrt(dx * dx + dy * dy) <= b.r) return b.body;
        }
        return null;
    }

    // ── Centre-hex detection ──────────────────────────────────────────────────

    function _centerHexId() {
        const cx = cameraX + (window.innerWidth  / 2) / zoom;
        const cy = cameraY + (window.innerHeight / 2) / zoom;
        const coords = pixelToHex(cx, cy, baseHexSize);
        return getHexId(coords.q, coords.r);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    function isOpen() { return _overlay !== null; }

    // Re-normalises the system data from hexStates without closing or resetting any
    // viewer state (zoom, pan, pause, hideMoons, speed, year, etc.).
    // Used by the System Editor's Preview so viewer settings survive each preview cycle.
    function refresh(hexId) {
        if (!_overlay || hexId !== _hexId) return;
        const state = (typeof hexStates !== 'undefined') ? hexStates.get(hexId) : null;
        if (!state) return;
        const found = _detectSystem(state);
        if (!found) return;
        _invalidateAlignment?.();
        const trackKey = _tracking && _trackedBody ? locationForBody(_trackedBody)?.key : null;
        const selectedKey = _selectedBody ? locationForBody(_selectedBody)?.key : null;
        if      (found.edition === 'AoW')   _sys = _normalizeAoW(found.raw);
        else if (found.edition === 'MgT2E') _sys = _normalizeMgT2E(found.raw);
        else if (found.edition === 'CT')    _sys = _normalizeCT(found.raw);
        else if (found.edition === 'T5')    _sys = _normalizeT5(found.raw);
        else                                _sys = _normalizeRTT(found.raw);
        _hitBodies = [];
        const entries = locationEntries();
        _selectedBody = selectedKey ? entries.find(e => e.key === selectedKey)?.body || null : null;
        _trackedBody = trackKey ? entries.find(e => e.key === trackKey)?.body || null : null;
        _tracking = !!_trackedBody;
        if (!_tracking) _atFit = true;
        if (_tooltip) _tooltip.style.display = 'none';
    }

    function open(explicitHexId, inspectorTab = window.SystemInspector?.currentWorkspace() || 'system') {
        const hexId = explicitHexId || _centerHexId();
        if (!hexId) return;
        const state = hexStates.get(hexId);
        if (!state) return;

        const found = _detectSystem(state);
        if (!found) return;  // no system expansion — silently do nothing
        if (window.SystemInspector && !SystemInspector.openForHex(hexId, inspectorTab)) return;
        if (_overlay && _hexId === hexId) return;
        if (_overlay) close();

        let normalised;
        if      (found.edition === 'AoW')   normalised = _normalizeAoW(found.raw);
        else if (found.edition === 'MgT2E') normalised = _normalizeMgT2E(found.raw);
        else if (found.edition === 'CT')    normalised = _normalizeCT(found.raw);
        else if (found.edition === 'T5')    normalised = _normalizeT5(found.raw);
        else                                normalised = _normalizeRTT(found.raw);

        _sys         = normalised;
        _hexId       = hexId;
        _lightMode   = !!window.printMode;
        _viewZoom    = 1.0;
        _viewOffX    = 0;
        _viewOffY    = 0;
        _atFit      = true;
        _tracking    = false;
        _trackedBody = null;
        _systemFitZoom = 1;
        _fitting     = false;
        _paused      = false;
        _setDays(campaignClockDays());
        document.body.classList.add('orrery-open');
        _buildOverlay(hexId);
        window.SystemInspector?.refresh(true);
        _startLoop();
    }

    function close() {
        if (!_overlay) return;
        _alignmentRun++; _invalidateAlignment = null;
        window.CampaignAtlas?.cancelPick();
        window.CampaignAtlas?.clearLocator();
        document.body.classList.remove('orrery-open');
        _flushCampaignTimeSave();
        document.getElementById('nav-map').hidden = true;
        _localClock = null;
        _stopShuttle?.(); _stopShuttle = null; _timeInput = null;
        window.removeEventListener('mousemove', _onWindowMouseMove);
        window.removeEventListener('mouseup',   _onWindowMouseUp);
        cancelAnimationFrame(_animFrameId);
        _resizeObserver?.disconnect();
        _resizeObserver = null;
        _selectedBody = null;
        _trackedBody = null;
        _tracking    = false;
        _systemFitZoom = 1;
        _fitting     = false;
        _overlay.remove();
        _overlay     = null;
        _orrCanvas   = null;
        _orrCtx      = null;
        _sys         = null;
        _eclipseShade.clear();
        _surfaceCache.clear();
        _surfaceQueue.clear();
        _visualRate = 0;
        _lastFrameDays = null;
        _hexId       = null;
        _tooltip     = null;
        _hitBodies   = [];
        _canvasW     = 0;
        _canvasH     = 0;
        _viewZoom    = 1.0;
        _viewOffX    = 0;
        _viewOffY    = 0;
        _dragging      = false;
        _dragLast      = null;
        _animFrameId   = null;
        _lastFrameTime = 0;
        _gameYear      = 0;
        _gameDay       = 1;
        _yearInput     = null;
        _dayInput      = null;
        _paused        = false;
        _pauseBtn      = null;
        _hideMoons              = false;
        _hideHZ                 = false;
        _hideJumpLimit          = false;
        _hideMainworldHighlight = false;
        if (typeof SystemEditor !== 'undefined') SystemEditor.close();
        window.SystemInspector?.refresh(true);
        window.CampaignAtlas?.syncMapFocus({ forcePan: true });
    }

    function handleWheel() { /* Map wheel gestures never change views. */ }

    // ── Play / Pause ──────────────────────────────────────────────────────────

    function _togglePause() {
        _stopShuttle?.();
        _paused = !_paused;
        _syncPause();
    }
    function _syncPause() {
        if (!_pauseBtn) return;
        _pauseBtn.innerHTML = _paused
            ? '<i class="fas fa-play" aria-hidden="true"></i>'
            : '<i class="fas fa-pause" aria-hidden="true"></i>';
        _pauseBtn.setAttribute('aria-label', _paused ? 'Play simulation' : 'Pause simulation');
        _pauseBtn.setAttribute('aria-pressed', String(!_paused));
    }

    function _updateLocalClock() {
        const second = Math.floor(Date.now() / 1000);
        if (!_localClock || second === _clockSecond) return;
        const date = new Date();
        _localClock.textContent = `Local ${date.toLocaleTimeString()}`;
        _localClock.dateTime = date.toISOString();
        _clockSecond = second;
    }

    // ── DOM Construction ──────────────────────────────────────────────────────

    // Phases and periods are the same helpers the orrery paints with. A lineup is
    // those circular orbits, not a physical ephemeris. Display years are 365 days.
    const _ALIGNMENT_HORIZON_YEARS = 200000;

    function _alignmentBodies(includeMoons) {
        const phases = [];
        let planetCount = 0, starCount = 0;
        if (!_sys) return { phases, planetCount, starCount };
        const stars = _sys.stars || [];
        const add = (key, period, name, kind) => {
            if (!(Number.isFinite(period) && period > 0)) return;
            phases.push({ phase: _hashEpoch(key), omega: 2 * Math.PI / (period * 365.25), name, kind });
            if (kind === 'star') starCount++;
            else if (kind === 'planet') planetCount++;
        };
        stars.slice(1).forEach((s, i) => add(`${_hexId}:star:${i + 1}`,
            s.periodYears || _keplerYears(Math.max(_starCompanionAU(s), 0.05), stars[s.parentStarIdx ?? 0]?.mass || 1),
            s.name || `Star ${i + 2}`, 'star'));
        (_sys.worlds || []).filter(w => w.type !== 'Empty').forEach((w, i) => {
            if (w.type === 'Planetoid Belt' || _isMainworldBelt(w)) return;
            add(`${_hexId}:world:${i}`, _worldPeriodYears(w, stars[w.parentStarIdx ?? 0]?.mass || 1), w.name || `World ${i + 1}`, 'planet');
            if (!includeMoons) return;
            (w.moons || []).filter(m => m.type !== 'Empty').forEach((m, j) => {
                if (m.size !== 'R' && m.type !== 'Ring') add(`${_hexId}:moon:${i}:${j}`, _moonPeriodYears(m, w), m.name || `Moon ${j + 1}`, 'moon');
            });
        });
        return { phases, planetCount, starCount };
    }
    function _phaseSpread(phases, days, modulus) {
        const angles = phases.map(p => ((p.phase + p.omega * days) % modulus + modulus) % modulus).sort((a, b) => a - b);
        let gap = angles[0] + modulus - angles[angles.length - 1];
        for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
        return (modulus - gap) * 180 / Math.PI;
    }
    function _alignDist(psi, modulus) {
        const x = ((psi % modulus) + modulus) % modulus;
        return x < modulus - x ? x : modulus - x;
    }
    // 'in'  — the body stays within epsilon of the reference for the whole window
    // 'out' — it never gets that close
    // 'cut' — the window has to be split at the body's crossings
    function _alignBand(body, lo, hi, epsilon, modulus) {
        const sweep = Math.abs(body.dw) * (hi - lo);
        if (!(sweep > 0)) return _alignDist(body.dphi + body.dw * lo, modulus) <= epsilon ? 'in' : 'out';
        if (sweep >= modulus) return 'cut';
        const left = Math.min(body.dphi + body.dw * lo, body.dphi + body.dw * hi);
        const right = Math.max(body.dphi + body.dw * lo, body.dphi + body.dw * hi);
        let minD = Infinity, maxD = 0;
        if (Math.ceil(left / modulus - 1e-12) <= Math.floor(right / modulus + 1e-12)) minD = 0;
        for (const p of [left, right]) {
            const d = _alignDist(p, modulus);
            if (d < minD) minD = d;
            if (d > maxD) maxD = d;
        }
        const anti = modulus / 2 + Math.ceil((left - modulus / 2) / modulus - 1e-12) * modulus;
        if (anti >= left - 1e-9 && anti <= right + 1e-9) maxD = modulus / 2;
        if (maxD <= epsilon + 1e-12) return 'in';
        if (minD > epsilon + 1e-12) return 'out';
        return 'cut';
    }
    function _polishSpread(phases, lo, hi, modulus) {
        const omegas = phases.map(p => p.omega);
        const rate = Math.max(...omegas) - Math.min(...omegas);
        const step = (0.12 * Math.PI / 180) / Math.max(rate, 1e-15);
        const n = Math.min(700, Math.max(16, Math.ceil((hi - lo) / step)));
        let bestT = (lo + hi) / 2, bestS = Infinity;
        for (let i = 0; i <= n; i++) {
            const t = lo + (hi - lo) * i / n;
            const s = _phaseSpread(phases, t, modulus);
            if (s < bestS) { bestS = s; bestT = t; }
        }
        let a = Math.max(lo, bestT - (hi - lo) / n);
        let b = Math.min(hi, bestT + (hi - lo) / n);
        for (let i = 0; i < 24; i++) {
            const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
            if (_phaseSpread(phases, m1, modulus) < _phaseSpread(phases, m2, modulus)) b = m2;
            else a = m1;
        }
        const days = (a + b) / 2;
        return { days, spread: _phaseSpread(phases, days, modulus) };
    }
    // Earliest moment in (start, end] when the bodies share a line through the
    // star no wider than `epsilon` radians. Opposite sides of the star count,
    // because the folded circle has circumference π. Being within epsilon of
    // one reference body only guarantees an arc of 2ε, so a candidate window
    // is kept only when its own tightest moment is inside the tolerance.
    function _earliestLine(phases, start, end, epsilon, modulus, budget) {
        let ref = phases[0];
        for (const p of phases) if (p.omega < ref.omega) ref = p;
        const others = phases.filter(p => p !== ref).map(p => ({
            dw: p.omega - ref.omega, dphi: p.phase - ref.phase
        })).sort((a, b) => Math.abs(a.dw) - Math.abs(b.dw));
        const toleranceDeg = epsilon * 180 / Math.PI;
        let visits = 0;
        const walk = (level, lo, hi) => {
            if (budget.hit) return null;
            if (++visits > budget.max) { budget.hit = true; return null; }
            if (!(hi > lo)) return null;
            if (level === others.length) {
                const ev = _polishSpread(phases, lo, hi, modulus);
                if (!(ev.days > start && ev.days <= end) || ev.spread > toleranceDeg + 0.02) return null;
                if (lo <= start + 1e-7) {
                    const inward = Math.min(hi, lo + Math.max((hi - lo) * 0.05, 1e-4));
                    const leaving = _phaseSpread(phases, lo, modulus) <= _phaseSpread(phases, inward, modulus) + 1e-6;
                    if (leaving && ev.days <= lo + (hi - lo) * 0.15) return null;
                }
                return ev;
            }
            const body = others[level];
            if (Math.abs(body.dw) < 1e-15) {
                if (_alignDist(body.dphi, modulus) > epsilon) return null;
                return walk(level + 1, lo, hi);
            }
            const status = _alignBand(body, lo, hi, epsilon, modulus);
            if (status === 'out') return null;
            if (status === 'in') return walk(level + 1, lo, hi);
            const half = epsilon / Math.abs(body.dw);
            const dir = body.dw > 0 ? 1 : -1;
            const target = ((lo - half) * body.dw + body.dphi) / modulus;
            let k = body.dw > 0 ? Math.ceil(target - 1e-9) : Math.floor(target + 1e-9);
            let guard = 0;
            while (guard++ < 5000000) {
                const c = (k * modulus - body.dphi) / body.dw;
                if (c - half > hi + 1e-8) return null;
                if (c + half > start && c + half >= lo) {
                    const a = Math.max(lo, c - half), b = Math.min(hi, c + half);
                    if (b > a) {
                        const hit = walk(level + 1, a, b);
                        if (hit) return hit;
                    }
                }
                k += dir;
                if ((++visits & 65535) === 0 && visits > budget.max) { budget.hit = true; return null; }
            }
            budget.hit = true;
            return null;
        };
        const ev = walk(0, start, end);
        budget.visits = (budget.visits || 0) + visits;
        return ev;
    }
    function _twoBodyLine(phases, start, modulus) {
        const diff = phases[1].phase - phases[0].phase, velocity = phases[1].omega - phases[0].omega;
        const turns = (diff + velocity * start) / modulus;
        const target = velocity > 0 ? Math.ceil(turns - 1e-10) : Math.floor(turns + 1e-10);
        const next = Math.max(start, (target * modulus - diff) / velocity);
        const recurrence = modulus / Math.abs(velocity);
        return {
            exact: true, recurrence,
            best: { days: next, spread: _phaseSpread(phases, next, modulus) },
            next: { days: next + recurrence, spread: _phaseSpread(phases, next + recurrence, modulus) }
        };
    }
    async function searchAlignments({ includeMoons = false, sameSide = false, tolerance = null, strict = false, horizonDays = _ALIGNMENT_HORIZON_YEARS * 365, startDays = _totalDays() } = {}) {
        const run = ++_alignmentRun;
        const found = _alignmentBodies(includeMoons);
        const phases = found.phases;
        const modulus = sameSide ? Math.PI * 2 : Math.PI;
        horizonDays = Math.max(1, Number(horizonDays) || _ALIGNMENT_HORIZON_YEARS * 365);
        const result = {
            bodies: phases.length, planetCount: found.planetCount, starCount: found.starCount,
            names: phases.map(p => p.name), horizonDays, scannedDays: horizonDays, truncated: false,
            startDays, matches: [], constant: false, exact: false, recurrence: null, best: null, next: null
        };
        await new Promise(resolve => setTimeout(resolve, 0));
        if (run !== _alignmentRun) return null;
        if (phases.length < 2) return { ...result, constant: true };
        const rates = phases.map(p => p.omega);
        if (Math.max(...rates) - Math.min(...rates) < 1e-14) {
            return { ...result, constant: true, best: { days: startDays, spread: _phaseSpread(phases, startDays, modulus) } };
        }
        if (phases.length === 2) {
            const pair = _twoBodyLine(phases, startDays, modulus);
            return { ...result, ...pair, matches: [pair.best, pair.next] };
        }
        const end = startDays + horizonDays;
        const budget = { max: 8000000, hit: false, visits: 0 };
        const alive = () => run === _alignmentRun && !budget.hit;
        let best = null;
        const asked = Number(tolerance);
        if (Number.isFinite(asked) && asked > 0) best = _earliestLine(phases, startDays, end, asked * Math.PI / 180, modulus, budget);
        // A strict search stays at the closeness already shown. The open search
        // falls through and finds the tightest line the horizon contains.
        if (!best && !strict && alive()) {
            let lo = 0.35, hi = 170, probes = 0;
            while (hi - lo > 0.3 && probes < 16 && alive()) {
                const mid = (lo + hi) / 2;
                probes++;
                const hit = _earliestLine(phases, startDays, end, mid * Math.PI / 180, modulus, budget);
                if (budget.hit) break;
                if (hit) { best = hit; hi = Math.min(mid, hit.spread); }
                else lo = mid;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        if (run !== _alignmentRun) return null;
        result.truncated = budget.hit;
        if (!best) return result;
        const bar = strict && Number.isFinite(asked) ? asked : Math.max(best.spread + 0.35, best.spread * 1.12);
        const next = _earliestLine(phases, best.days + 0.5, best.days + 0.5 + horizonDays, bar * Math.PI / 180, modulus, budget);
        if (run !== _alignmentRun) return null;
        result.best = best;
        result.next = next;
        result.tolerance = bar;
        result.matches = next ? [best, next] : [best];
        result.truncated = budget.hit;
        return result;
    }
    function _alignmentWho(result) {
        const planets = result.planetCount === 1 ? 'The planet'
            : result.planetCount === 2 ? 'Both planets'
            : `All ${result.planetCount} planets`;
        if (!result.starCount) return planets;
        const stars = result.starCount === 1 ? 'the companion star' : `${result.starCount} companion stars`;
        if (!result.planetCount) return result.starCount === 1 ? 'The companion star' : `All ${result.starCount} companion stars`;
        return `${planets} and ${stars}`;
    }
    function _laterText(days) {
        const years = days / 365;
        if (years >= 0.95) {
            const nearest = Math.round(years);
            const whole = Math.abs(years - nearest) < 0.06;
            const text = formatDisplayNumber(years, years >= 20 || whole ? 0 : 1);
            return `${text} ${whole && nearest === 1 ? 'year' : 'years'} later`;
        }
        if (days >= 2) return `${formatDisplayNumber(days, days >= 10 ? 0 : 1)} days later`;
        const hours = days * 24;
        if (hours >= 2) return `${formatDisplayNumber(hours, 1)} hours later`;
        return `${formatDisplayNumber(days * 1440, 0)} minutes later`;
    }
    function _showLineup(days) {
        _stopShuttle?.();
        _paused = true;
        _syncPause();
        _setDays(days);
        if (_lineup !== 'orbits') _setLineup('orbits');
        else fitView();
    }
    function _buildAlignmentControls() {
        const el = (tag, text, cls) => {
            const node = document.createElement(tag);
            if (cls) node.className = cls;
            if (text) node.textContent = text;
            return node;
        };
        const details = el('details'); details.className = 'sv-alignment sv-pop';
        const summary = el('summary'); summary.className = 'sv-pop-btn';
        summary.innerHTML = '<i class="fa-solid fa-arrows-to-dot" aria-hidden="true"></i><span>Line up</span>';
        summary.title = 'Jump to the next time the planets sit on one line';
        const panel = el('div', '', 'sv-pop-panel');
        details.append(summary, panel);
        panel.append(el('p', `Jumps to the next time every planet sits on one line through the star. Companion stars are included. Moons, belts, and rings are left out. The search follows these circular orbits and looks ${_ALIGNMENT_HORIZON_YEARS.toLocaleString('en-US')} years ahead.`));
        const controls = el('div', '', 'sv-alignment-controls');
        const search = el('button', 'Line up the planets', 'sv-alignment-go'); search.type = 'button';
        const cancel = el('button', 'Cancel', 'sv-alignment-cancel'); cancel.type = 'button'; cancel.hidden = true;
        const results = el('div', '', 'sv-alignment-results'); results.setAttribute('role', 'status');
        const invalidate = () => { _alignmentRun++; search.disabled = false; cancel.hidden = true; results.replaceChildren(); };
        _invalidateAlignment = invalidate;
        cancel.addEventListener('click', invalidate);
        const paint = (result, shown) => {
            results.replaceChildren();
            if (!result) { results.append(el('p', 'Search cancelled. Line them up again to use the current system.')); return; }
            if (result.bodies < 2) {
                results.append(el('p', 'This system needs at least two orbiting planets before there is a lineup to find. Belts and rings have no single position, so they are skipped.'));
                return;
            }
            if (result.constant && !shown) {
                const spread = result.best ? result.best.spread : 0;
                const who = _alignmentWho(result);
                const verb = result.bodies === 1 ? 'holds' : 'hold';
                results.append(el('p', `${who} ${verb} a fixed spread of ${formatDisplayNumber(spread, 1)}°. There is no later date when they line up differently.`));
                return;
            }
            if (!result.best && !shown) {
                results.append(el('p', result.truncated
                    ? 'The search stopped early. Line them up again to continue from this date.'
                    : `No lineup turned up in the next ${formatDisplayNumber(result.horizonDays / 365, 0)} years.`));
                return;
            }
            const current = shown || result.best;
            const upcoming = shown ? result.best : result.next;
            results.append(el('p', _dateText(current.days), 'sv-alignment-date'));
            const spread = current.spread;
            const who = _alignmentWho(result);
            const horizon = formatDisplayNumber(result.horizonDays / 365, 0);
            let sentence;
            if (spread < 0.05) sentence = `${who} are exactly on one line through the star.`;
            else if (spread <= 12) sentence = `${who} are on one line through the star, within ${formatDisplayNumber(spread, spread < 10 ? 1 : 0)}°.`;
            else if (spread <= 25) sentence = `${who} gather into a ${formatDisplayNumber(spread, 0)}° line through the star.`;
            else sentence = `${who} are ${formatDisplayNumber(spread, 0)}° from a straight line. That is as close as this search gets.`;
            results.append(el('p', sentence));
            if (result.exact && result.recurrence) {
                const every = _laterText(result.recurrence).replace(/ later$/, '');
                results.append(el('p', `The same line repeats ${every === '1 year' ? 'every year' : `every ${every}`}.`, 'sv-alignment-next'));
            }
            if (upcoming) {
                results.append(el('p', `Next time: ${_dateText(upcoming.days)}, ${_laterText(upcoming.days - current.days)}.`, 'sv-alignment-next'));
                const jump = el('button', 'Show the next lineup');
                jump.type = 'button';
                const bar = result.tolerance;
                jump.addEventListener('click', () => runSearch(upcoming.days + 1 / 86400, upcoming, bar));
                results.append(jump);
                const scroller = jump.closest('.sv-pop-panel');
                if (scroller) scroller.scrollTop = scroller.scrollHeight;
            } else {
                results.append(el('p', `The next lineup this close is more than ${horizon} years after this one.`, 'sv-alignment-next'));
            }
        };
        const runSearch = async (startDays, shown, matchSpread) => {
            search.disabled = true; cancel.hidden = false;
            results.textContent = shown ? 'Looking for the lineup after this one…' : 'Searching ahead for a lineup…';
            let run;
            try {
                const pending = searchAlignments(shown
                    ? { startDays, tolerance: matchSpread, strict: true }
                    : { startDays });
                run = _alignmentRun;
                const result = await pending;
                if (!details.isConnected || run !== _alignmentRun) return;
                paint(result, shown || null);
                const landed = shown || result?.best;
                if (landed && result && result.bodies >= 2 && !result.constant) _showLineup(shown ? shown.days : result.best.days);
            } catch (error) { results.textContent = `Search failed: ${error.message}`; }
            finally { if (run === _alignmentRun) { search.disabled = false; cancel.hidden = true; } }
        };
        search.addEventListener('click', () => runSearch(_totalDays() + 1 / 86400, null));
        controls.append(search, cancel);
        panel.append(controls, results);
        return details;
    }

    function _buildTimeControls() {
        const row = document.createElement('div'); row.className = 'sv-time-controls';
        const make = (tag, text) => { const el = document.createElement(tag); if (text) el.textContent = text; return el; };
        const jog = (input, labelText) => {
            const label = make('label', labelText);
            const slot = make('span'); slot.className = 'sv-jog-slot';
            input.className = 'sv-jog';
            slot.append(input); label.append(slot); row.append(label);
            return label;
        };
        const scrub = make('input'); scrub.type = 'range'; scrub.min = '-30'; scrub.max = '30'; scrub.step = '0.001'; scrub.value = '0';
        scrub.setAttribute('aria-label', 'Scrub time, thirty days backward or forward');
        scrub.title = 'Drag backward or forward up to 30 days. Release to snap back.';
        let scrubStart = null;
        scrub.addEventListener('input', () => {
            if (scrubStart === null) scrubStart = _totalDays();
            _stopShuttle?.(); _paused = true; _syncPause();
            _setDays(scrubStart + Number(scrub.value));
            scrub.setAttribute('aria-valuetext', _dateText(_totalDays()));
        });
        const releaseScrub = () => { scrubStart = null; scrub.value = '0'; };
        scrub.addEventListener('change', releaseScrub); scrub.addEventListener('blur', releaseScrub);
        jog(scrub, 'Scrub ±30 d');
        const shuttle = make('input'); shuttle.type = 'range'; shuttle.min = '-100'; shuttle.max = '100'; shuttle.step = '1'; shuttle.value = '0';
        shuttle.setAttribute('aria-label', 'Time shuttle, reverse or forward');
        shuttle.title = 'Hold left to reverse or right to advance. Release to snap back and stop.';
        const rate = make('output', 'Stopped');
        rate.hidden = true;
        const limit = make('select'); limit.setAttribute('aria-label', 'Maximum shuttle speed');
        for (const n of [1, 10, 365, 3650]) { const option = make('option', `${formatDisplayNumber(n, 0)} d/s`); option.value = n; limit.append(option); }
        limit.value = '365';
        let shuttleKeyHeld = false;
        const showRate = () => {
            rate.hidden = !_shuttleRate;
            rate.textContent = _shuttleRate ? `${formatDisplayNumber(_shuttleRate, 2)} d/s` : 'Stopped';
            shuttle.setAttribute('aria-valuetext', rate.textContent);
        };
        const updateShuttle = () => {
            _paused = true; _syncPause();
            _shuttleRate = Math.pow(Number(shuttle.value) / 100, 3) * Number(limit.value);
            showRate();
        };
        _stopShuttle = () => { shuttleKeyHeld = false; _shuttleRate = 0; shuttle.value = '0'; showRate(); };
        shuttle.addEventListener('input', updateShuttle);
        limit.addEventListener('change', updateShuttle);
        shuttle.addEventListener('change', () => { if (!shuttleKeyHeld) _stopShuttle?.(); });
        for (const event of ['pointerup', 'pointercancel', 'blur']) shuttle.addEventListener(event, () => _stopShuttle?.());
        shuttle.addEventListener('pointerdown', e => shuttle.setPointerCapture(e.pointerId));
        shuttle.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) shuttleKeyHeld = true; });
        shuttle.addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) _stopShuttle?.(); });
        jog(shuttle, 'Shuttle');
        row.append(limit, rate);
        _updateDateDisplay();
        return row;
    }

    function _buildOverlay(hexId) {
        const sys      = _sys;
        const age      = formatDisplayNumber(sys.age || 0, 2);
        const edition  = sys.edition || '';

        // Palette: dark (default) or light (print mode)
        const P = _lightMode
            ? { bg: '#ffffff', border: '#45a29e88', text: '#1a1a2e', accent: '#0d6b64',
                sub: '#4a5568', hint: '#6b7280', badge: '#45a29e', badgeBorder: '#45a29eaa' }
            : { bg: '#000000', border: '#45a29e55', text: '#c5c6c7', accent: '#66fcf1',
                sub: '#8a8f94', hint: '#55686b', badge: '#45a29e', badgeBorder: '#45a29e55' };

        _overlay = document.createElement('div');
        _overlay.id = 'system-viewer-overlay';
        Object.assign(_overlay.style, {
            position: 'fixed', inset: '0', zIndex: '9000',
            background: P.bg,
            display: 'flex', flexDirection: 'column',
            fontFamily: 'Inter, sans-serif',
            color: P.text, userSelect: 'none'
        });

        const viewNav = document.createElement('div');
        viewNav.className = 'sv-view-nav';
        const back = document.createElement('button');
        back.type = 'button'; back.id = 'sv-back-sector';
        back.innerHTML = '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Sector</span>';
        back.setAttribute('aria-label', 'Back to sector');
        back.title = 'Back to the sector map (Esc)';
        back.addEventListener('click', () => {
            close();
            document.getElementById('atlas-toggle').focus({ preventScroll: true });
        });
        const sysName = window.SystemInspector?.systemName?.(hexId) || hexId;
        // Same hierarchy as the inspector header: name and hex tag, then a
        // quieter line with the location, edition, and age.
        const identity = document.createElement('div');
        identity.className = 'sv-identity';
        const titleRow = document.createElement('div');
        titleRow.className = 'sv-identity-title';
        const nameEl = document.createElement('span');
        nameEl.className = 'sv-identity-name';
        nameEl.textContent = sysName;
        titleRow.append(nameEl);
        if (sysName !== hexId) {
            const hexEl = document.createElement('span');
            hexEl.className = 'atlas-hex';
            hexEl.textContent = hexId;
            titleRow.append(hexEl);
        }
        const meta = document.createElement('div');
        meta.className = 'sv-identity-meta';
        const place = window.SystemInspector?.locationLine?.(hexId);
        if (place) {
            const placeEl = document.createElement('span');
            placeEl.className = 'sv-identity-place';
            placeEl.textContent = place;
            meta.append(placeEl);
        }
        if (edition) {
            const editionBadge = document.createElement('span');
            editionBadge.className = 'sv-badge';
            editionBadge.textContent = edition;
            meta.append(editionBadge);
        }
        const ageEl = document.createElement('span');
        ageEl.className = 'sv-identity-age';
        ageEl.textContent = `${age} Gyr`;
        ageEl.title = 'System age';
        meta.append(ageEl);
        identity.append(titleRow, meta);
        viewNav.append(back, identity);
        if (edition === 'MgT2E' || edition === 'CT' || edition === 'T5') {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.id = 'sv-edit-btn';
            editBtn.className = 'sv-edit';
            editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i><span>Edit system</span>';
            editBtn.addEventListener('click', () => {
                if (typeof SystemEditor !== 'undefined') SystemEditor.openEdit(_hexId);
            });
            viewNav.append(editBtn);
        }
        _overlay.append(viewNav);

        // ── Controls ──────────────────────────────────────────────────────────
        // Two rows: time first, then what the view shows. Tools that are used
        // now and then open as popovers over the canvas, so it keeps its height.
        const header = document.createElement('div');
        header.className = 'system-viewer-header';
        const make = (tag, cls, text) => {
            const node = document.createElement(tag);
            if (cls) node.className = cls;
            if (text != null) node.textContent = text;
            return node;
        };
        const faIcon = name => {
            const node = make('i', `fa-solid fa-${name}`);
            node.setAttribute('aria-hidden', 'true');
            return node;
        };
        const popovers = [];
        const trackPopover = details => {
            details.addEventListener('toggle', () => {
                if (details.open) popovers.forEach(other => { if (other !== details) other.open = false; });
            });
            popovers.push(details);
        };
        const popover = (iconName, label, title, cls = '') => {
            const details = make('details', `sv-pop ${cls}`.trim());
            const summary = make('summary', 'sv-pop-btn');
            summary.append(faIcon(iconName));
            if (label) summary.append(make('span', null, label));
            else summary.setAttribute('aria-label', title);
            summary.title = title;
            const panel = make('div', 'sv-pop-panel');
            details.append(summary, panel);
            trackPopover(details);
            return { details, panel };
        };
        _overlay.addEventListener('pointerdown', e => {
            popovers.forEach(details => { if (details.open && !details.contains(e.target)) details.open = false; });
        });

        // Row 1 — time.
        const iconBtn = (icon, label, onClick) => {
            const btn = make('button', 'sv-icon-btn');
            btn.type = 'button';
            btn.setAttribute('aria-label', label);
            btn.title = label;
            btn.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i>`;
            btn.addEventListener('click', onClick);
            return btn;
        };
        const skip = delta => {
            _stopShuttle?.();
            _paused = true;
            _syncPause();
            _setDays(_totalDays() + delta);
        };
        _pauseBtn = iconBtn('fa-pause', 'Pause simulation', _togglePause);
        _pauseBtn.classList.add('sv-play-btn');
        _pauseBtn.setAttribute('aria-pressed', 'true');
        _pauseBtn.title = 'Play / pause (Space)';
        const transport = make('div', 'sv-transport');
        transport.append(
            iconBtn('fa-backward', 'Skip back one hour', () => skip(-1 / 24)),
            _pauseBtn,
            iconBtn('fa-forward', 'Skip forward one hour', () => skip(1 / 24))
        );

        const field = (labelText, input, cls = '') => {
            const wrap = make('label', `sv-timecode-field ${cls}`.trim());
            const lbl = make('span', null, labelText);
            wrap.append(lbl, input);
            return { wrap, lbl };
        };
        _yearInput = document.createElement('input');
        _yearInput.type = 'number'; _yearInput.value = String(_gameYear); _yearInput.step = '1';
        _yearInput.addEventListener('change', () => {
            _setDays((parseInt(_yearInput.value) || 0) * 365 + _gameDay - 1);
            _yearInput.value = _gameYear;
        });
        _dayInput = document.createElement('input');
        _dayInput.type = 'number'; _dayInput.value = String(Math.floor(_gameDay)); _dayInput.min = '1'; _dayInput.max = '365'; _dayInput.step = '1';
        _dayInput.addEventListener('change', () => {
            const d = parseInt(_dayInput.value) || 1;
            _setDays(_gameYear * 365 + Math.min(365, Math.max(1, d)) - 1 + _gameDay % 1);
            _dayInput.value = Math.floor(_gameDay);
        });
        _timeInput = document.createElement('input');
        _timeInput.type = 'time';
        _timeInput.step = '1';
        _timeInput.setAttribute('aria-label', 'Simulation time');
        _timeInput.addEventListener('change', () => {
            if (!_timeInput.value) { _updateDateDisplay(); return; }
            const parts = _timeInput.value.split(':').map(Number);
            _setDays(Math.floor(_totalDays()) + (parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)) / 86400);
        });
        const year = field('Year', _yearInput, 'sv-field-year');
        const day = field('Day', _dayInput, 'sv-field-day');
        const time = field('Time', _timeInput, 'sv-field-time');
        year.lbl.id = 'sv-year-label'; _yearInput.setAttribute('aria-labelledby', year.lbl.id);
        day.lbl.id = 'sv-day-label'; _dayInput.setAttribute('aria-labelledby', day.lbl.id);
        _yearInput.title = 'Year'; _dayInput.title = 'Day of the year'; _timeInput.title = 'Time of day';
        const timecode = make('div', 'sv-timecode');
        timecode.append(year.wrap, day.wrap, time.wrap);

        // One speed slider on a log scale, from real time (a game second per
        // second) to a year per second.
        const REAL_TIME = 1 / 86400, FASTEST = 365;
        const _sliderToSpeed = v => REAL_TIME * Math.pow(FASTEST / REAL_TIME, v / 1000);
        const _speedToSlider = s => Math.log(s / REAL_TIME) / Math.log(FASTEST / REAL_TIME) * 1000;
        const _fmtSpeed = daysPerSec => {
            const secs = daysPerSec * 86400;
            if (secs < 1.5) return 'Real time';
            if (secs < 60) return `${formatDisplayNumber(secs, 0)} s/s`;
            if (secs < 3600) return `${formatDisplayNumber(secs / 60, secs < 600 ? 1 : 0)} min/s`;
            if (secs < 86400) return `${formatDisplayNumber(secs / 3600, secs < 36000 ? 1 : 0)} h/s`;
            if (daysPerSec < 364.5) return `${formatDisplayNumber(daysPerSec, daysPerSec < 10 ? 1 : 0)} d/s`;
            return '1 yr/s';
        };
        const speedWrap = make('div', 'sv-speed');
        speedWrap.title = 'Simulation speed: game time per real second';
        const realTime = make('button', 'sv-speed-reset');
        realTime.type = 'button';
        realTime.append(faIcon('clock'));
        realTime.setAttribute('aria-label', 'Real time');
        realTime.title = 'Back to real time: one game second per second';
        const speedSlider = make('input');
        speedSlider.type = 'range'; speedSlider.min = '0'; speedSlider.max = '1000'; speedSlider.step = '1';
        speedSlider.setAttribute('aria-label', 'Simulation speed');
        speedSlider.value = String(Math.round(_speedToSlider(_speedDaysPerSec)));
        const speedVal = make('output', 'sv-speed-value');
        const syncSpeed = () => {
            const text = _fmtSpeed(_speedDaysPerSec);
            speedVal.textContent = text;
            speedVal.title = `${formatDisplayNumber(_speedDaysPerSec * 86400, 0)}× real time`;
            speedSlider.setAttribute('aria-valuetext', text);
            realTime.setAttribute('aria-pressed', String(_speedDaysPerSec * 86400 < 1.5));
        };
        speedSlider.addEventListener('input', () => {
            _speedDaysPerSec = _sliderToSpeed(parseFloat(speedSlider.value));
            syncSpeed();
        });
        realTime.addEventListener('click', () => {
            _speedDaysPerSec = REAL_TIME;
            speedSlider.value = '0';
            syncSpeed();
        });
        syncSpeed();
        speedWrap.append(realTime, speedSlider, speedVal);

        const timePop = popover('clock-rotate-left', 'Scrub', 'Scrub and shuttle through time');
        _localClock = make('time', 'sv-local-clock');
        _localClock.title = 'Your computer’s local time, independent of simulation speed';
        _clockSecond = -1;
        _updateLocalClock();
        timePop.panel.append(
            make('p', 'sv-pop-note', 'Scrub drags up to 30 days either way. The shuttle runs time backward or forward while held. Both snap back when you let go.'),
            _buildTimeControls(),
            _localClock
        );
        const alignment = _buildAlignmentControls();
        trackPopover(alignment);

        const timeRow = make('div', 'sv-row');
        const timeMain = make('div', 'sv-row-group');
        timeMain.append(transport, timecode, speedWrap);
        const timeTools = make('div', 'sv-row-group sv-row-end');
        timeTools.append(timePop.details, alignment);
        timeRow.append(timeMain, timeTools);

        // Row 2 — view.
        const lineupGroup = make('div', 'sv-layout');
        lineupGroup.setAttribute('role', 'group');
        lineupGroup.setAttribute('aria-label', 'Lineup');
        const lineupModes = [
            ['orbits', 'Orbits', 'bullseye', 'Bodies at their current orbital positions'],
            ['row', 'Row', 'grip-lines-vertical', 'Line planets up left to right, star on the left, even spacing in orbit order'],
            ['column', 'Column', 'grip-lines', 'Line planets up top to bottom, star at the top, even spacing in orbit order']
        ];
        for (const [mode, label, iconName, title] of lineupModes) {
            const btn = make('button');
            btn.type = 'button';
            btn.append(faIcon(iconName), make('span', null, label));
            btn.title = title;
            btn.dataset.layout = mode;
            btn.setAttribute('aria-pressed', _lineup === mode ? 'true' : 'false');
            btn.addEventListener('click', () => _setLineup(mode));
            lineupGroup.append(btn);
        }

        // Layers are real checkboxes, styled as chips, and read as "show".
        const layer = (iconName, label, title, checked, onChange, id) => {
            const wrap = make('label', 'sv-toggle');
            wrap.title = title;
            const input = make('input');
            input.type = 'checkbox';
            input.checked = checked;
            if (id) input.id = id;
            input.addEventListener('change', () => onChange(input.checked));
            wrap.append(input, faIcon(iconName), make('span', null, label));
            return wrap;
        };
        const layers = make('div', 'sv-layers');
        layers.setAttribute('role', 'group');
        layers.setAttribute('aria-label', 'Show on the map');
        layers.append(
            layer('solar-system', 'Paths', 'Orbit paths for worlds and moons', _showOrbits, v => { _showOrbits = v; }, 'sv-show-orbits'),
            layer('moon', 'Moons', 'Moons and rings around each world', !_hideMoons, v => { _hideMoons = !v; }),
            layer('seedling', 'Habitable', 'Habitable zone: green band around the habitable-zone center. Worlds here can have liquid water. It is a climate band, not a safe-jump line. The generator uses that center orbit when it places a mainworld and when it rolls temperature, density, and belt composition.',
                !_hideHZ, v => { _hideHZ = !v; }),
            layer('circle-dashed', 'Jump limit', 'Blue circle at 100 diameters from a star or world. A jump drive cannot engage inside it, so a ship inside the line has to fly out to the circle first.',
                !_hideJumpLimit, v => { _hideJumpLimit = !v; }),
            layer('circle-half-stroke', 'Day / night', 'Illustrative lighting facing the host star. Surface markings turn with each body’s sidereal day, so a spinning world slides under the night side. A tidally locked world keeps one face toward the star. Does not model axial tilt, eclipses, or weather.',
                _showDayNight, v => { _showDayNight = v; }),
            layer('radar', 'Scan', 'Scan view: sensor outlines and designations on every world and moon, and a slow sweep around the primary. Makes small and night-side worlds easy to find.',
                _scanView, v => { _scanView = v; })
        );

        const viewPop = popover('sliders', 'View', 'Scale and orbit ring strength');
        const linearWrap = make('label', 'sv-pop-check');
        linearWrap.title = 'Space orbits in proportion to their AU. The star’s drawn size still holds the innermost orbit outside the disc.';
        const linearCheck = make('input');
        linearCheck.type = 'checkbox';
        linearCheck.checked = _linearScale;
        linearCheck.addEventListener('change', () => {
            _linearScale = linearCheck.checked;
            fitView();
        });
        linearWrap.append(linearCheck, make('span', null, 'Linear scale (true AU spacing)'));
        const markWrap = make('label', 'sv-pop-check');
        markWrap.title = 'The cyan star that marks the mainworld';
        const markCheck = make('input');
        markCheck.type = 'checkbox';
        markCheck.checked = !_hideMainworldHighlight;
        markCheck.addEventListener('change', () => { _hideMainworldHighlight = !markCheck.checked; });
        markWrap.append(markCheck, make('span', null, 'Mark the mainworld'));
        const orbitWrap = make('label', 'sv-pop-range');
        const orbitSlider = make('input');
        orbitSlider.type = 'range'; orbitSlider.min = '0.1'; orbitSlider.max = '1'; orbitSlider.step = '0.05';
        orbitSlider.value = String(_orbitOpacity);
        orbitSlider.addEventListener('input', () => { _orbitOpacity = parseFloat(orbitSlider.value); });
        orbitWrap.append(make('span', null, 'Orbit ring strength'), orbitSlider);
        viewPop.panel.append(linearWrap, markWrap, orbitWrap);

        const resetView = make('button', 'sv-fit');
        resetView.type = 'button';
        resetView.append(faIcon('expand'), make('span', null, 'Fit'));
        resetView.title = 'Fit the whole system in view';
        resetView.addEventListener('click', fitView);

        const helpPop = popover('keyboard', '', 'Mouse and keyboard', 'sv-help');
        const keys = make('dl', 'sv-keys');
        [['Scroll', 'Zoom'], ['Drag', 'Pan'], ['Click', 'Select and follow a body'], ['Double-click', 'Frame a body and its moons'],
            ['Space', 'Play / pause'], ['Esc', 'Back to the sector map']].forEach(([key, action]) => {
            const row = make('div');
            row.append(make('dt', null, key), make('dd', null, action));
            keys.append(row);
        });
        helpPop.panel.append(keys);

        const viewRow = make('div', 'sv-row');
        const viewMain = make('div', 'sv-row-group');
        viewMain.append(lineupGroup, layers);
        const viewTools = make('div', 'sv-row-group sv-row-end');
        viewTools.append(viewPop.details);
        // Fit floats over the canvas corner, where it stays in reach at any zoom.
        resetView.classList.add('sv-floating');
        viewRow.append(viewMain, viewTools);

        header.append(timeRow, viewRow);
        helpPop.details.classList.add('sv-nav-help');
        viewNav.insertBefore(helpPop.details, viewNav.querySelector('.sv-edit'));
        _overlay.append(header);
        document.getElementById('nav-map').hidden = false;

        _orrCanvas = document.createElement('canvas');
        _orrCanvas.id = 'orrery-canvas';
        _orrCanvas.tabIndex = 0;
        _syncCanvasLabel();
        Object.assign(_orrCanvas.style, { display: 'block', cursor: 'default', flex: '1 1 auto', minHeight: '0', width: '100%' });
        _overlay.appendChild(_orrCanvas);

        _tooltip = document.createElement('div');
        Object.assign(_tooltip.style, {
            position: 'fixed', display: 'none', pointerEvents: 'none',
            background: _lightMode ? 'rgba(255,255,255,0.97)' : 'rgba(10,14,20,0.95)',
            border: `1px solid ${P.badge}`,
            color: P.text,
            padding: '8px 12px', fontSize: '12px', lineHeight: '1.65',
            maxWidth: '280px', zIndex: '9100', fontFamily: 'inherit'
        });
        _overlay.appendChild(_tooltip);
        _overlay.appendChild(resetView);

        document.body.appendChild(_overlay);

        _canvasW = window.innerWidth;
        _canvasH = window.innerHeight;
        _orrCanvas.style.width  = _canvasW + 'px';
        _orrCanvas.style.height = _canvasH + 'px';

        const dpr = window.devicePixelRatio || 1;
        _orrCanvas.width  = Math.round(_canvasW * dpr);
        _orrCanvas.height = Math.round(_canvasH * dpr);
        _orrCtx = _orrCanvas.getContext('2d');
        _orrCtx.scale(dpr, dpr);
        _resizeObserver = new ResizeObserver(resize);
        _resizeObserver.observe(_overlay);
        _resizeObserver.observe(viewNav);
        _resizeObserver.observe(header);
        resize();

        _orrCanvas.addEventListener('wheel',      _onWheel,     { passive: false });
        _orrCanvas.addEventListener('mousedown',  _onMouseDown);
        _orrCanvas.addEventListener('mousemove',  _onMouseMove);
        _orrCanvas.addEventListener('dblclick',   _onDblClick);
        _orrCanvas.addEventListener('mouseleave', () => {
            _hideTooltip();
            if (!_dragging && _orrCanvas) _orrCanvas.style.cursor = 'default';
        });
        window.addEventListener('mousemove', _onWindowMouseMove);
        window.addEventListener('mouseup',   _onWindowMouseUp);
    }

    // ── Orrery Draw ───────────────────────────────────────────────────────────

    function _redraw() { /* animation loop redraws every frame */ }

    function _startLoop() {
        _lastFrameTime = performance.now();
        function tick(now) {
            const rate = _shuttleRate || (_paused ? 0 : _speedDaysPerSec);
            if (rate) _setDays(_totalDays() + Math.min((now - _lastFrameTime) / 1000, 0.25) * rate);
            const dt = Math.max(0.001, (now - _lastFrameTime) / 1000);
            _trackVisualRate(dt);
            _frameDt += (Math.min(0.1, dt) - _frameDt) * 0.25;
            _lastFrameTime = now;
            _paintQueuedSurfaces(6);
            _updateLocalClock();
            if (_atFit) _fitCamera();
            if (_tracking && _trackedBody) {
                if (_planetGLReady()) _followPending = true;
                else _probeFollow();
            }
            _drawOrrery();
            _animFrameId = requestAnimationFrame(tick);
        }
        _animFrameId = requestAnimationFrame(tick);
    }

    // Following a body needs its position before the frame is painted. A pass
    // on a 1×1 canvas lays out the bodies without painting any of them, so
    // the frame itself is drawn once.
    let _probeCtx = null;
    function _probeFollow() {
        if (!_probeCtx) {
            const probe = document.createElement('canvas');
            probe.width = probe.height = 1;
            _probeCtx = probe.getContext('2d');
        }
        const real = _orrCtx;
        _orrCtx = _probeCtx;
        _measuringFrame = true;
        try { _drawOrrery(); } finally {
            _orrCtx = real;
            _measuringFrame = false;
        }
        _followSelected();
    }

    // Scrubbing and the shuttle move the clock outside the play rate, so the
    // rate is read from the clock itself. A jump (a typed date, an alignment)
    // is a cut, not motion, and does not blur.
    function _trackVisualRate(dt) {
        const days = _totalDays();
        const moved = _lastFrameDays == null ? 0 : Math.abs(days - _lastFrameDays);
        _lastFrameDays = days;
        const instant = moved / dt;
        if (instant > 20000) return;
        _visualRate += (Math.min(instant, 3650) - _visualRate) * Math.min(1, dt / 0.18);
    }

    function _setLineup(mode) {
        if (mode !== 'row' && mode !== 'column') mode = 'orbits';
        if (_lineup === mode) return;
        _lineup = mode;
        document.querySelectorAll('#system-viewer-overlay .sv-layout button').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.layout === mode ? 'true' : 'false');
        });
        _syncCanvasLabel();
        fitView();
    }

    function _syncCanvasLabel() {
        if (!_orrCanvas) return;
        const layout = _lineup === 'row'
            ? 'Planets lined up horizontally, star on the left.'
            : _lineup === 'column'
                ? 'Planets lined up vertically, star at the top.'
                : 'System orbits.';
        _orrCanvas.setAttribute('aria-label',
            `${layout} Click a body to follow it; double-click to frame it and its local orbits; drag to pan; scroll zooms; Space plays or pauses.`);
    }

    // Scan view. Each world and moon gets a reticle: a faint ring, four turning
    // brackets, and (where there is room) its designation. In orbit layout a
    // sweep circles the primary every eight seconds and each reticle brightens
    // as it passes.
    const _SCAN_SWEEP_SECONDS = 8;
    function _scanLabel(body) {
        const name = String(body.name || body.type || '');
        const system = window.SystemInspector?.systemName?.(_hexId) || '';
        return system && name.startsWith(system + ' ') ? name.slice(system.length + 1) : name;
    }
    function _drawScanOverlay(ctx, centre) {
        if (!_scanView || ctx === _probeCtx || _collectingPlanets || _measuringFrame) return;
        const now = _motionOk() ? performance.now() / 1000 : 0;
        const teal = _lightMode ? '13, 107, 100' : '102, 252, 241';
        const sweep = ((now / _SCAN_SWEEP_SECONDS) % 1) * Math.PI * 2;
        ctx.save();
        if (centre && _motionOk() && !_lightMode) {
            // The sweep: a soft wedge trailing a bright leading edge.
            const trail = 0.7;
            const wedge = ctx.createConicGradient(sweep - trail, centre.x, centre.y);
            wedge.addColorStop(0, `rgba(${teal}, 0)`);
            wedge.addColorStop(trail / (Math.PI * 2), `rgba(${teal}, 0.035)`);
            wedge.addColorStop(trail / (Math.PI * 2) + 0.0005, `rgba(${teal}, 0)`);
            wedge.addColorStop(1, `rgba(${teal}, 0)`);
            ctx.fillStyle = wedge;
            ctx.fillRect(0, 0, _canvasW, _canvasH);
            const reach = Math.hypot(Math.max(centre.x, _canvasW - centre.x), Math.max(centre.y, _canvasH - centre.y));
            ctx.strokeStyle = `rgba(${teal}, 0.22)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(centre.x, centre.y);
            ctx.lineTo(centre.x + Math.cos(sweep) * reach, centre.y + Math.sin(sweep) * reach);
            ctx.stroke();
        }
        ctx.font = '600 10px ui-monospace, "Cascadia Mono", Consolas, monospace';
        ctx.textBaseline = 'alphabetic';
        for (const hit of _hitBodies) {
            if ((hit.kind !== 'world' && hit.kind !== 'moon') || hit.innerR !== undefined) continue;
            const { cx, cy } = hit;
            const visual = hit.visualR ?? hit.r;
            if (cx < -40 || cy < -40 || cx > _canvasW + 40 || cy > _canvasH + 40) continue;
            const moon = hit.kind === 'moon';
            const main = hit.body?.type === 'Mainworld';
            // Brighten as the sweep passes, then fade over a second or so.
            let ping = 0;
            if (centre && _motionOk()) {
                const since = ((sweep - Math.atan2(cy - centre.y, cx - centre.x)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                ping = Math.exp(-since * 2.2);
            }
            const base = (moon ? 0.42 : 0.68) + (main ? 0.2 : 0);
            const alpha = Math.min(1, base + ping * 0.45);
            // A moon too small to show detail gets a quiet ring, not brackets,
            // so a crowded moon system stays readable.
            if (moon && visual < 2.5 && !main) {
                ctx.strokeStyle = `rgba(${teal}, ${(alpha * 0.55).toFixed(3)})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, 4 + ping * 2, 0, Math.PI * 2);
                ctx.stroke();
                continue;
            }
            const R = Math.max(visual + 5, moon ? 7 : 9) + ping * 3;
            ctx.strokeStyle = `rgba(${teal}, ${(alpha * 0.32).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = `rgba(${teal}, ${alpha.toFixed(3)})`;
            ctx.lineWidth = main ? 2 : 1.5;
            const turn = now * (moon ? 0.5 : 0.3) + (cx * 0.013 + cy * 0.007);
            for (let k = 0; k < 4; k++) {
                const a = turn + k * Math.PI / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, R + 3, a - 0.3, a + 0.3);
                ctx.stroke();
            }
            if (_lineup !== 'orbits' || (moon && R < 12)) continue;
            // Designation up and to the right, on a short leader.
            const corner = (R + 3) * Math.SQRT1_2;
            const lx = cx + corner + 6, ly = cy - corner - 6;
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(${teal}, ${(alpha * 0.55).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(cx + corner, cy - corner);
            ctx.lineTo(lx - 2, ly + 3);
            ctx.stroke();
            ctx.fillStyle = `rgba(${teal}, ${Math.min(1, alpha + 0.1).toFixed(3)})`;
            ctx.fillText(_scanLabel(hit.body), lx, ly);
        }
        ctx.restore();
    }

    // Selection: a target lock. On selecting, four brackets swing in from wide
    // and snap onto the body while the ring draws itself around it; then a
    // turning range scale, counter-rotating arcs, a soft glow, a periodic
    // ping, and a readout tag with the body's name and profile hold the lock.
    let _lockBody = null, _lockStart = 0;
    const _LOCK_MS = 650;
    function _selectionLabel(body) {
        const name = String(body.name || body.type || 'Body');
        const spectral = body.sType != null && !body.uwp ? [body.sType, body.subType, body.sClass].filter(v => v != null && v !== '').join('') : '';
        const detail = body.uwp || spectral || (body.ggType ? `Gas Giant ${body.ggType}` : body.worldType || body.type || '');
        return [name, detail && detail !== name ? detail : ''];
    }
    function _drawSelection(ctx) {
        const body = (_tracking && _trackedBody) || _selectedBody;
        const selected = body ? _hitBodies.find(hit => hit.body === body) : null;
        if (!selected || ctx === _probeCtx) return;
        const motion = _motionOk();
        const now = performance.now();
        if (_lockBody !== body) { _lockBody = body; _lockStart = now; }
        const k = motion ? Math.min(1, (now - _lockStart) / _LOCK_MS) : 1;
        const easeOut = 1 - Math.pow(1 - k, 3);
        // A slight overshoot as the brackets land.
        const snap = motion ? 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2) : 1;
        const time = motion ? now / 1000 : 0;
        const gold = _lightMode ? '147, 82, 0' : '255, 206, 115';
        const teal = _lightMode ? '9, 105, 94' : '102, 252, 241';
        const band = selected.innerR !== undefined;
        let { cx, cy } = selected;
        let R = (selected.visualR ?? selected.r) + 5;
        ctx.save();
        if (band) {
            // A belt or ring runs the whole way round, so the lock sits on one
            // point of it (the top, where its label is, or the point nearest
            // the middle of the view when the top is off screen) and the band's
            // two edges are traced in gold.
            const mid = (selected.r + selected.innerR) / 2;
            let angle = -Math.PI / 2;
            if (cy - mid < -20) angle = Math.atan2(_canvasH / 2 - cy, _canvasW / 2 - cx);
            ctx.strokeStyle = `rgba(${gold}, ${(0.55 * easeOut).toFixed(3)})`;
            ctx.lineWidth = 1;
            for (const edge of [selected.innerR, selected.r]) if (edge > 2) _strokeVisibleCircle(ctx, cx, cy, edge);
            cx += Math.cos(angle) * mid;
            cy += Math.sin(angle) * mid;
            R = Math.max(9, (selected.r - selected.innerR) / 2 + 4);
        }
        // Glow under the lock.
        if (!_lightMode) {
            const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R + 22);
            glow.addColorStop(0, `rgba(${gold}, ${(0.16 * easeOut).toFixed(3)})`);
            glow.addColorStop(1, `rgba(${gold}, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, R + 22, 0, Math.PI * 2);
            ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2, true);
            ctx.fill();
        }
        // The ring draws itself on.
        ctx.strokeStyle = `rgba(${gold}, 0.95)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * easeOut);
        ctx.stroke();
        // Range scale: 72 ticks, every sixth long, turning slowly, with gaps
        // where the brackets sit.
        const scaleR = R + 8;
        const turn = time * 0.12;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${gold}, ${(0.5 * easeOut).toFixed(3)})`;
        ctx.beginPath();
        for (let i = 0; i < 72; i++) {
            const a = turn + i * Math.PI / 36;
            const fromBracket = Math.abs(((a - Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4);
            if (fromBracket < 0.22) continue;
            const len = i % 6 === 0 ? 5 : 2.5;
            ctx.moveTo(cx + Math.cos(a) * scaleR, cy + Math.sin(a) * scaleR);
            ctx.lineTo(cx + Math.cos(a) * (scaleR + len), cy + Math.sin(a) * (scaleR + len));
        }
        ctx.stroke();
        // Three counter-rotating arcs further out.
        const arcR = R + 17;
        ctx.strokeStyle = `rgba(${teal}, ${(0.55 * easeOut).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const a = -time * 0.35 + i * Math.PI * 2 / 3;
            ctx.beginPath();
            ctx.arc(cx, cy, arcR, a, a + 0.75);
            ctx.stroke();
        }
        // Brackets swing in from wide and a quarter-turn round, then breathe.
        const breathe = k >= 1 && motion ? Math.sin(time * 2.4) * 1.2 : 0;
        const bracketR = (R + 4) * (1 + 1.1 * (1 - snap)) + breathe;
        const spin = (1 - easeOut) * Math.PI / 2;
        const arm = Math.max(5, Math.min(12, R * 0.35));
        ctx.strokeStyle = `rgba(${gold}, ${Math.min(1, 0.2 + easeOut).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'square';
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2 + spin;
            const bx = cx + Math.cos(a) * bracketR * Math.SQRT2 * 0.78, by = cy + Math.sin(a) * bracketR * Math.SQRT2 * 0.78;
            const ux = -Math.cos(a), uy = -Math.sin(a);
            // An L: two arms running back along the square's edges.
            const ax = Math.sign(ux) || 1, ay = Math.sign(uy) || 1;
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(spin);
            ctx.beginPath();
            ctx.moveTo(ax * arm, 0);
            ctx.lineTo(0, 0);
            ctx.lineTo(0, ay * arm);
            ctx.stroke();
            ctx.restore();
        }
        ctx.lineCap = 'butt';
        // Cardinal notches pointing in.
        ctx.strokeStyle = `rgba(${gold}, ${(0.8 * easeOut).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            ctx.moveTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3));
            ctx.lineTo(cx + Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7));
        }
        ctx.stroke();
        // The readout tag, up and to the right on a leader (left, near the edge).
        if (k > 0.35 && _lineup === 'orbits') {
            const [name, detail] = _selectionLabel(selected.body);
            const show = Math.min(1, (k - 0.35) / 0.4);
            ctx.font = '700 11px ui-monospace, "Cascadia Mono", Consolas, monospace';
            const nameW = ctx.measureText(name.toUpperCase()).width;
            ctx.font = '10px ui-monospace, "Cascadia Mono", Consolas, monospace';
            const detailW = detail ? ctx.measureText(detail).width : 0;
            const w = Math.max(nameW, detailW) + 16, h = detail ? 34 : 20;
            const corner = (arcR + 2) * Math.SQRT1_2;
            const flip = cx + corner + 22 + w > _canvasW - 8;
            const dir = flip ? -1 : 1;
            const ex = cx + dir * corner, ey = cy - corner;
            const kx = ex + dir * 14, ky = ey - 14;
            const tx = flip ? kx - 8 - w : kx + 8, ty = ky - h / 2;
            ctx.globalAlpha = show;
            ctx.strokeStyle = `rgba(${gold}, 0.75)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ex, ey); ctx.lineTo(kx, ky); ctx.lineTo(kx + dir * 8, ky);
            ctx.stroke();
            ctx.fillStyle = _lightMode ? 'rgba(255, 255, 255, 0.92)' : 'rgba(8, 14, 18, 0.82)';
            ctx.strokeStyle = `rgba(${gold}, 0.8)`;
            ctx.beginPath();
            ctx.roundRect(tx, ty, w, h, 3);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = `rgba(${gold}, 1)`;
            ctx.fillRect(flip ? tx + w - 3 : tx, ty, 3, h);
            ctx.textBaseline = 'alphabetic';
            ctx.font = '700 11px ui-monospace, "Cascadia Mono", Consolas, monospace';
            ctx.fillText(name.toUpperCase(), tx + 8, ty + 14);
            if (detail) {
                ctx.font = '10px ui-monospace, "Cascadia Mono", Consolas, monospace';
                ctx.fillStyle = `rgba(${teal}, 0.95)`;
                ctx.fillText(detail, tx + 8, ty + 28);
            }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
        _drawFocusPulse(ctx, { cx, cy }, R);
    }

    // Primary-orbit bodies match the orrery: P-type, or S-type around star 0.
    function _isPrimaryWorld(w) {
        if (w.orbitType === 'P-Type') return true;
        return w.orbitType === 'S-Type' && Number(w.parentStarIdx ?? 0) === 0;
    }

    function _lineupNodes() {
        const stars = _sys?.stars || [];
        const worlds = (_sys?.worlds || []).filter(w => w.type !== 'Empty');
        const nodes = [];
        if (stars[0]) nodes.push({ kind: 'star', body: stars[0], starIndex: 0, sortAu: -1, order: -1, hzAu: null });
        const items = [];
        let order = 0;
        worlds.filter(_isPrimaryWorld).forEach(w => {
            items.push({
                kind: (w.type === 'Planetoid Belt' || _isMainworldBelt(w)) ? 'belt' : 'world',
                body: w,
                sortAu: w.au || 0,
                order: order++,
                hzAu: w.au || 0
            });
        });
        stars.slice(1).forEach((s, i) => {
            const starIndex = i + 1;
            const parent = Number(s.parentStarIdx ?? 0);
            const parentAu = parent > 0 ? _starCompanionAU(stars[parent] || s) : 0;
            const au = parent > 0
                ? parentAu + 0.0001 + _starCompanionAU(s) * 0.00001
                : _starCompanionAU(s);
            items.push({
                kind: 'star', body: s, starIndex,
                sortAu: au, order: order++,
                hzAu: parent > 0 ? parentAu : au
            });
            worlds.filter(w => w.orbitType === 'S-Type' && Number(w.parentStarIdx) === starIndex)
                .forEach(w => {
                    items.push({
                        kind: (w.type === 'Planetoid Belt' || _isMainworldBelt(w)) ? 'belt' : 'world',
                        body: w,
                        sortAu: au + 0.000001 * (1 + (w.au || 0)),
                        order: order++,
                        hzAu: w.au || 0,
                        hzStar: starIndex
                    });
                });
        });
        items.sort((a, b) => a.sortAu - b.sortAu || a.order - b.order);
        return nodes.concat(items);
    }

    // Disc scale is chosen so a gas giant plus its moons fits in its slot and
    // still leaves a gutter for the caption. Positions themselves are even.
    function _lineupMetrics(nodes, W, H) {
        const horizontal = _lineup === 'row';
        const along = Math.max(1, horizontal ? W : H);
        const cross = Math.max(1, horizontal ? H : W);
        const pad = 44;
        const slot = Math.max(8, (along - pad * 2) / Math.max(1, nodes.length));
        const labelGutter = horizontal ? 52 : Math.min(210, Math.max(108, cross * 0.36));
        const crossPos = Math.max(24, (cross - labelGutter) / 2);
        let moonGap = 0;
        if (!_hideMoons) {
            for (const node of nodes) {
                if (node.kind === 'star') continue;
                const moons = (node.body.moons || []).filter(m => m.type !== 'Empty').length;
                const rings = (node.body.rings || []).length;
                const idx = Math.max(moons, rings) - 1;
                if (idx >= 0) moonGap = Math.max(moonGap, 10 + idx * 6);
            }
        }
        const room = Math.max(12, crossPos - 12);
        const byRoom = room / (14 + moonGap);
        const bySlot = (slot * 0.42) / (14 + moonGap);
        let starBase = 28;
        for (const node of nodes) {
            if (node.kind === 'star') starBase = Math.max(starBase, _starBasePx(node.body));
        }
        const byStar = (slot * 0.32) / starBase;
        _lineupDisc = Math.max(0.45, Math.min(byRoom, bySlot, byStar, 2.4));
        return { horizontal, pad, slot, crossPos, labelGutter };
    }

    function _lineupScreen(lx, ly, W, H) {
        return {
            x: W / 2 + _viewOffX + (lx - W / 2) * _viewZoom,
            y: H / 2 + _viewOffY + (ly - H / 2) * _viewZoom
        };
    }

    function _lineupCaption(node) {
        const body = node.body || {};
        if (node.kind === 'star') {
            const spec = body.name || [body.sType, body.sClass].filter(Boolean).join(' ') || 'Star';
            return body.separation ? `${spec} (${body.separation})` : spec;
        }
        if (body.name) return body.name;
        if (node.kind === 'belt') return 'Planetoid belt';
        return body.type || 'World';
    }

    function _lineupReach(node) {
        if (node.kind === 'star') return _starBodyRadius(node.body);
        if (node.kind === 'belt') return Math.max(16, 14 * _viewZoom);
        const r = _worldBodyRadius(node.body);
        if (_hideMoons) return r;
        let reach = r;
        const moons = (node.body.moons || []).filter(m => m.type !== 'Empty');
        moons.forEach((m, mi) => { reach = Math.max(reach, _moonOrbitRadius(r, mi, node.body)); });
        (node.body.rings || []).forEach((rg, ri, all) => { reach = Math.max(reach, _ringOrbitRadius(r, ri, all.length)); });
        return reach;
    }

    // A star's habitable-zone centre in AU, by the generator's rule
    // (computeWorldHzco in mgt2e_stellar_engine.js). The primary's is the
    // system's, which already counts a close companion's light; any other
    // star's comes from its own luminosity, √L. Null when that is unknown.
    function _starHzAU(starIndex = 0) {
        if (!_sys) return null;
        if (!starIndex) return Number.isFinite(_sys.hzAU) ? _sys.hzAU : null;
        const lum = Number(_sys.stars?.[starIndex]?.lum);
        return Number.isFinite(lum) && lum > 0 ? Math.sqrt(lum) : null;
    }
    function _inHabitableZone(au, starIndex = 0) {
        const hz = _starHzAU(starIndex);
        if (hz == null || au == null || !Number.isFinite(au)) return false;
        return au >= hz * 0.70 && au <= hz * 1.55;
    }

    function _drawLineupBelt(ctx, node, p, metrics, maxReach, W, H) {
        const { horizontal, crossPos } = metrics;
        const reachV = maxReach / Math.max(_viewZoom, 0.0001);
        // Stop the band short of the caption row (below a horizontal lineup,
        // beside a vertical one) so the rocks don't sit on the names.
        const halfLen = horizontal
            ? Math.max(18, Math.min(reachV * 0.72, H * 0.2))
            : Math.max(14, Math.min(reachV * 0.65, Math.max(12, crossPos - 10)));
        const halfThick = Math.max(8, 11 * _lineupDisc);
        let h = 2166136261;
        const key = `${_hexId || ''}:${node.body.name || ''}:${node.body.au || 0}`;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        const rand = () => {
            h ^= h >>> 16;
            h = Math.imul(h, 0x7feb352d) >>> 0;
            h ^= h >>> 15;
            h = Math.imul(h, 0x846ca68b) >>> 0;
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        };
        ctx.save();
        for (let i = 0; i < 72; i++) {
            const alongJitter = (rand() * 2 - 1) * halfThick;
            const crossJitter = (rand() * 2 - 1) * halfLen;
            const vx = node.lx + (horizontal ? alongJitter : crossJitter);
            const vy = node.ly + (horizontal ? crossJitter : alongJitter);
            const dot = _lineupScreen(vx, vy, W, H);
            const big = rand() < 0.16;
            ctx.globalAlpha = 0.35 + rand() * 0.55;
            ctx.fillStyle = _lightMode ? '#3d4a4e' : '#e4e8ea';
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, (big ? 1.8 : 0.85) * _viewZoom, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        const isMW = _isMainworldBelt(node.body);
        if (isMW) _drawMainworldStar(ctx, p.x, p.y, Math.max(4, 6 * _lineupDisc * _viewZoom));
        const hitR = Math.max(14, 12 * _lineupDisc * _viewZoom);
        _hitBodies.push({
            kind: isMW ? 'world' : 'belt', body: node.body,
            cx: p.x, cy: p.y, r: hitR, visualR: hitR * 0.65
        });
        for (let i = -2; i <= 2; i++) {
            if (i === 0) continue;
            const vx = node.lx + (horizontal ? 0 : halfLen * i / 3);
            const vy = node.ly + (horizontal ? halfLen * i / 3 : 0);
            const q = _lineupScreen(vx, vy, W, H);
            _hitBodies.push({
                kind: isMW ? 'world' : 'belt', body: node.body,
                cx: q.x, cy: q.y, r: Math.max(12, 10 * _viewZoom), visualR: hitR * 0.65
            });
        }
    }

    function _drawLineupLabel(ctx, node, metrics, maxReach, W, H) {
        const text = _lineupCaption(node);
        if (!text) return;
        const { horizontal, slot, crossPos } = metrics;
        const isMW = node.body.type === 'Mainworld' || _isMainworldBelt(node.body);
        const fontPx = Math.max(12, Math.min(20, 13 * _viewZoom));
        const virtual = crossPos + maxReach / Math.max(_viewZoom, 0.0001) + 16;
        const at = horizontal
            ? _lineupScreen(node.lx, virtual, W, H)
            : _lineupScreen(virtual, node.ly, W, H);
        const maxW = horizontal
            ? Math.max(24, slot * 0.92 * _viewZoom)
            : W - at.x - 6;
        if (!(maxW >= 16) || at.x > W - 4 || at.y > H - 4 || at.y < 0) return;
        ctx.save();
        ctx.font = `600 ${fontPx}px Inter, sans-serif`;
        ctx.fillStyle = (isMW && !_hideMainworldHighlight)
            ? (_lightMode ? '#0d6b64' : '#66fcf1')
            : (_lightMode ? '#1a1a2e' : '#d5d8dc');
        let label = text;
        if (ctx.measureText(label).width > maxW) {
            while (label.length > 1 && ctx.measureText(label + '…').width > maxW) label = label.slice(0, -1);
            label = label.replace(/\s+$/, '') + '…';
        }
        if (horizontal) {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, at.x, at.y);
        } else {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, at.x, at.y);
        }
        ctx.restore();
    }

    function _drawLineup(measureOnly = false) {
        const W = _canvasW;
        const H = _canvasH;
        const ctx = _orrCtx;
        const nodes = _lineupNodes();
        const metrics = _lineupMetrics(nodes, W, H);
        const { horizontal, pad, slot, crossPos } = metrics;
        nodes.forEach((node, i) => {
            const alongPos = pad + slot * (i + 0.5);
            node.lx = horizontal ? alongPos : crossPos;
            node.ly = horizontal ? crossPos : alongPos;
        });
        let maxReach = 0;
        nodes.forEach(node => { maxReach = Math.max(maxReach, _lineupReach(node)); });

        if (measureOnly) {
            const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
            const include = (x, y, r) => {
                bounds.left = Math.min(bounds.left, x - r);
                bounds.right = Math.max(bounds.right, x + r);
                bounds.top = Math.min(bounds.top, y - r);
                bounds.bottom = Math.max(bounds.bottom, y + r);
            };
            nodes.forEach(node => {
                const p = _lineupScreen(node.lx, node.ly, W, H);
                include(p.x, p.y, _lineupReach(node) + 24);
            });
            if (!Number.isFinite(bounds.left)) include(W / 2, H / 2, 20);
            return bounds;
        }

        ctx.clearRect(0, 0, W, H);
        _hitBodies = [];
        if (!_lightMode) _drawStarField(ctx, W, H);

        const starNode = nodes.find(n => n.kind === 'star' && n.starIndex === 0) || nodes[0];
        const starAt = starNode ? _lineupScreen(starNode.lx, starNode.ly, W, H) : { x: W / 2, y: H / 2 };

        if (!_hideHZ) {
            nodes.forEach(node => {
                if (!_inHabitableZone(node.hzAu, node.hzStar || 0)) return;
                const c = _lineupScreen(node.lx, node.ly, W, H);
                const pw = slot * 0.9 * _viewZoom;
                const ph = Math.min((horizontal ? H : W) * 0.7, maxReach * 2 + 28 * _viewZoom);
                ctx.save();
                ctx.fillStyle = _hzColor(0.2);
                ctx.strokeStyle = _hzColor(0.8);
                ctx.lineWidth = 1.5;
                ctx.setLineDash([7, 4]);
                ctx.beginPath();
                ctx.roundRect(c.x - pw / 2, c.y - ph / 2, pw, ph, Math.min(16, 8 * _viewZoom));
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        }

        if (_showOrbits && _orbitOpacity > 0 && starNode) {
            const worldAlpha = _lightMode ? _orbitOpacity * 0.75 : _orbitOpacity * 0.55;
            nodes.forEach(node => {
                if (node === starNode) return;
                const p = _lineupScreen(node.lx, node.ly, W, H);
                const radius = Math.hypot(p.x - starAt.x, p.y - starAt.y);
                if (radius < 2) return;
                ctx.beginPath();
                ctx.arc(starAt.x, starAt.y, radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(69, 162, 158, ${worldAlpha.toFixed(3)})`;
                ctx.lineWidth = 1 + _orbitOpacity * 1.5;
                ctx.stroke();
            });
        }

        const elapsedYears = _totalDays() / 365.25;
        const worldIdxMap = new Map(((_sys?.worlds || []).filter(w => w.type !== 'Empty')).map((w, i) => [w, i]));
        nodes.forEach(node => {
            const p = _lineupScreen(node.lx, node.ly, W, H);
            if (node.kind === 'belt') {
                _drawLineupBelt(ctx, node, p, metrics, maxReach, W, H);
                return;
            }
            if (node.kind === 'star') {
                _drawStar(ctx, node.body, p.x, p.y, node.starIndex || 0);
                _hitBodies.push({
                    kind: 'star', body: node.body,
                    cx: p.x, cy: p.y,
                    r: _starBodyRadius(node.body) + 8 * _zoomScale(),
                    visualR: _starBodyRadius(node.body)
                });
                return;
            }
            _drawWorld(ctx, node.body, p.x, p.y, elapsedYears, worldIdxMap.get(node.body) ?? 0, starAt.x, starAt.y);
        });
        nodes.forEach(node => _drawLineupLabel(ctx, node, metrics, maxReach, W, H));
        _drawScanOverlay(ctx, null);
        _drawSelection(ctx);
        return null;
    }

    function _planetGLReady() {
        return _showDayNight && !!window.PlanetGL && !!window.PlanetProfile && PlanetGL.available();
    }
    function _drawOrrery(measureOnly = false) {
        if (measureOnly || _measuringFrame || !_planetGLReady()) return _paintOrrery(measureOnly);
        _collectPlanets();
        if (_followPending) { _followPending = false; _followSelected(); }
        PlanetGL.render(_planetRequests);
        _planetTiles = true;
        try { return _paintOrrery(false); } finally { _planetTiles = false; }
    }
    // Lays the frame out on the 1×1 probe, recording every world to shade.
    function _collectPlanets() {
        if (!_probeCtx) {
            const probe = document.createElement('canvas');
            probe.width = probe.height = 1;
            _probeCtx = probe.getContext('2d');
        }
        const real = _orrCtx;
        _orrCtx = _probeCtx;
        _planetRequests = [];
        _collectingPlanets = true;
        try { _paintOrrery(false); } finally {
            _orrCtx = real;
            _collectingPlanets = false;
        }
        // Eclipses: a moon can shade its world, and the world its moons.
        const byBody = new Map(_planetRequests.map(req => [req.key, req]));
        for (const req of _planetRequests) {
            const related = [];
            if (req.parent && byBody.has(req.parent)) related.push(byBody.get(req.parent));
            for (const other of _planetRequests) if (other.parent === req.key) related.push(other);
            related.sort((a, b) => Math.hypot(a.x - req.x, a.y - req.y) - Math.hypot(b.x - req.x, b.y - req.y));
            req.casters = related.slice(0, 4).map(o => [(o.x - req.x) / req.r, (o.y - req.y) / req.r, o.r / req.r]);
        }
        _planetRequests = _planetRequests.filter(req => !req.hidden);
    }
    // Light from the primary, tinted by its spectral class.
    function _sunColor() {
        const hex = _STAR_COLORS[_sys?.stars?.[0]?.sType] || '#ffffff';
        const n = parseInt(hex.slice(1), 16);
        const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
        return rgb.map(v => 0.45 + v * 0.55);
    }
    // A world, halo and all, that cannot reach the canvas.
    function _offCanvas(x, y, r) {
        const reach = r * 1.25 + 2;
        return x + reach < 0 || y + reach < 0 || x - reach > _canvasW || y - reach > _canvasH;
    }
    function _collectPlanet(x, y, r, body, elapsedYears, starX, starY, parent) {
        const kind = window.PlanetProfile.kind(body);
        if (r < 2.5 || !kind || kind === 'star' || kind === 'belt' || kind === 'ring') return;
        const profile = PlanetProfile.of(body, _surfaceId(body, kind));
        const starAngle = Math.atan2(starY - y, starX - x);
        const TAU = Math.PI * 2;
        // Rings: MgT keeps them on the world, CT as ring-sized moons. They are
        // laid inside the first real moon's orbit, broader the more there are.
        let ring = null;
        const moons = (body.moons || []).filter(m => m.type !== 'Empty');
        const ringCount = (body.rings || []).length + moons.filter(m => m.size === 'R').length;
        if (ringCount > 0 && !_hideMoons) {
            const first = moons.findIndex(m => m.size !== 'R');
            const limit = first >= 0 ? (_moonOrbitRadius(r, first, body) - _satelliteRadius(moons[first]) - 2) / r : _RING_OUTER;
            const outer = Math.max(1.4, Math.min(limit, 1.6 + 0.2 * Math.min(ringCount, 4), _RING_OUTER));
            // Ring particles are shown circling the inner edge every seven hours.
            const ringHours = 7;
            const ringTurns = elapsedYears * 365.25 * 24 / ringHours;
            const ringSweep = TAU * (_visualRate * 24 / ringHours) * _frameDt;
            ring = { inner: 1.22, outer, fill: Math.min(1, 0.55 + ringCount * 0.15),
                phase: _motionOk() ? (ringTurns % 1) * TAU : 0,
                detail: 1 - Math.max(0, Math.min(1, (ringSweep - 0.05) / 0.4)) };
        }
        const reachFactor = Math.max(1.16, ring ? ring.outer * 1.01 : 0);
        // Off-canvas worlds still cast eclipses, so they are kept as casters only.
        const hidden = _offCanvas(x, y, r * reachFactor / 1.25);
        const hours = profile.rotation.hours;
        const locked = profile.rotation.locked;
        let spin = 0, cloudSpin = 0, sweep = 0;
        if (locked) {
            spin = cloudSpin = starAngle;
        } else if (hours > 0 && _motionOk()) {
            // Whole turns are dropped in double precision; the GPU only sees the angle.
            const turns = elapsedYears * 365.25 * 24 / hours;
            spin = (turns % 1) * TAU;
            cloudSpin = ((turns * 1.03) % 1) * TAU;
            sweep = Math.min(TAU, TAU * (_visualRate * 24 / hours) * _frameDt);
        }
        const dpr = window.devicePixelRatio || 1;
        // A world larger than the tile limit is shaded smaller and scaled up;
        // at that size the surface is already at its sharpest cube map.
        const full = r * dpr;
        const scale = Math.min(1, 1100 / full, 2000 / (full * reachFactor));
        const radius = full * scale;
        const samples = sweep > 0.02 ? Math.min(radius < 10 ? 6 : radius < 60 ? 24 : 32, Math.ceil(sweep / 0.035) + 1) : 1;
        _planetRequests.push({
            key: body, profile, radius, scale, hidden, ring, spin, cloudSpin, sweep, samples,
            tilt: locked ? 0 : profile.rotation.tilt,
            light: [Math.cos(starAngle), Math.sin(starAngle)],
            sun: _sunColor(), casters: [], lightMode: _lightMode,
            x, y, r, parent: parent || null
        });
    }
    function _paintOrrery(measureOnly = false) {
        if (!_orrCtx || !_canvasW || !_canvasH) return;
        if (_lineup !== 'orbits') return _drawLineup(measureOnly);
        const W   = _canvasW;
        const H   = _canvasH;
        const ctx = _orrCtx;

        const sys    = _sys;
        const stars  = sys.stars || [];
        const worlds = (sys.worlds || []).filter(w => w.type !== 'Empty');

        // Max AU in system → calibrate base log scale
        let maxAU = 1;
        worlds.forEach(w => { if ((w.au || 0) > maxAU) maxAU = w.au; });
        stars.slice(1).forEach(s => {
            const au = _starCompanionAU(s);
            if (au > maxAU) maxAU = au;
        });
        maxAU = Math.max(maxAU * 1.18, 2);

        const margin     = 70;
        const baseMaxR   = Math.max(10, Math.min(W, H) / 2 - margin);
        const scaledMaxR = baseMaxR * _viewZoom;

        const originX = W / 2 + _viewOffX;
        const originY = H / 2 + _viewOffY;

        // Primary worlds — defined early so the companion ring pre-computation can reference them
        const primaryWorlds = worlds.filter(w =>
            w.orbitType === 'P-Type' ||
            (w.orbitType === 'S-Type' && (w.parentStarIdx === 0 || w.parentStarIdx === undefined))
        );

        // Pre-compute companion orbit ring radii that honour the true AU order.
        // A close companion gets a minimum visibility bump, but that bump is capped so
        // its ring never visually crosses outside any body at a larger AU from the same parent.
        // Sub-companions (orbiting a secondary star, not the primary) keep a small fixed floor.
        const _COMP_MIN_PX  = 20;  // desired minimum ring radius for visibility
        const _COMP_ABS_MIN =  4;  // absolute floor — ring never drawn smaller than this
        const _COMP_GAP     =  3;  // pixel gap to maintain between adjacent rings
        const _compRingR    = new Map();
        const _parentHole = (s) => _orbitHole(_starBodyRadius(stars[s.parentStarIdx ?? 0] || stars[0] || {}));
        const primaryHole = _orbitHole(_starBodyRadius(stars[0] || {}));
        stars.slice(1).forEach(s => {
            const pIdx   = s.parentStarIdx ?? 0;
            const compAU = _starCompanionAU(s);
            const hole   = _parentHole(s);
            const natR   = _scaleR(compAU, maxAU, scaledMaxR, hole);
            if (_linearScale || pIdx !== 0) {
                // Linear mode or sub-companion: simple floor, no ordering constraint needed
                _compRingR.set(s, natR);
                return;
            }
            // Primary companion: find pixel radius of nearest outer body in primary orbit
            let outerMinR = Infinity;
            primaryWorlds.forEach(w => {
                if ((w.au || 0) > compAU)
                    outerMinR = Math.min(outerMinR, _scaleR(w.au || 0, maxAU, scaledMaxR, primaryHole));
            });
            stars.slice(1).forEach(t => {
                if (t !== s && (t.parentStarIdx ?? 0) === 0 && _starCompanionAU(t) > compAU)
                    outerMinR = Math.min(outerMinR, _scaleR(_starCompanionAU(t), maxAU, scaledMaxR, primaryHole));
            });
            let r = Math.max(natR, _COMP_MIN_PX, hole);
            if (outerMinR !== Infinity && r >= outerMinR - _COMP_GAP)
                r = Math.max(natR, outerMinR - _COMP_GAP - 1);
            _compRingR.set(s, Math.max(r, _COMP_ABS_MIN));
        });

        // Companion star screen positions
        const companions = stars.slice(1);
        // Secondary stars' zone labels, drawn last so no body covers them.
        const hzLabels = [];
        const starPos    = new Map();
        starPos.set(0, { cx: originX, cy: originY });

        // Elapsed in-game years drives all orbital angles
        const elapsed_years = _totalDays() / 365.25;

        // Build a stable world→index map for epoch hashing
        const worldIdxMap = new Map(worlds.map((w, i) => [w, i]));

        // Companion star positions — physical Kepler periods
        companions.forEach((s, i) => {
            const compAU    = _starCompanionAU(s);
            const dist      = _compRingR.get(s);
            const parentMass = (stars[s.parentStarIdx ?? 0] || {}).mass || 1;
            const period    = s.periodYears || _keplerYears(Math.max(compAU, 0.05), parentMass);
            const epoch     = _hashEpoch(_hexId + ':star:' + (i + 1));
            const angle     = epoch + (2 * Math.PI / period) * elapsed_years;
            const parentPos = starPos.get(s.parentStarIdx ?? 0) || { cx: originX, cy: originY };
            starPos.set(i + 1, {
                cx: parentPos.cx + dist * Math.cos(angle),
                cy: parentPos.cy + dist * Math.sin(angle)
            });
        });

        if (measureOnly) {
            const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
            const include = (x, y, r, label = '') => {
                const labelHalf = Math.min(180, String(label).length * 3.5);
                bounds.left = Math.min(bounds.left, x - Math.max(r, labelHalf));
                bounds.right = Math.max(bounds.right, x + Math.max(r, labelHalf));
                bounds.top = Math.min(bounds.top, y - r - 20);
                bounds.bottom = Math.max(bounds.bottom, y + r + 28);
            };
            const includeWorlds = (list, x, y, max, pixels, hole) => list.forEach(w => {
                const moonCount = _hideMoons ? 0 : (w.moons || []).filter(m => m.type !== 'Empty').length + (w.rings || []).length;
                const local = (moonCount ? 20 + moonCount * 6 : 10) * _zoomScale();
                const extent = Math.max(_worldBodyRadius(w) + local, Math.min(180, String(w.name || '').length * 3.5));
                include(x, y, _scaleR(w.au || 0, max, pixels, hole) + extent, w.name);
            });
            stars.forEach((s, i) => {
                const pos = starPos.get(i);
                include(pos.cx, pos.cy, _starBodyRadius(s) + 10 * _zoomScale(), s.name);
                if (i) {
                    const parent = starPos.get(s.parentStarIdx ?? 0) || starPos.get(0);
                    include(parent.cx, parent.cy, _compRingR.get(s) + 4);
                    const list = worlds.filter(w => w.orbitType === 'S-Type' && w.parentStarIdx === i);
                    const max = list.reduce((m, w) => Math.max(m, w.au || 0), 0.01) * 1.2;
                    const subR = _subSystemRadius(s, _compRingR.get(s));
                    includeWorlds(list, pos.cx, pos.cy, max, subR, _orbitHole(_starBodyRadius(s)));
                }
            });
            includeWorlds(primaryWorlds, originX, originY, maxAU, scaledMaxR, primaryHole);
            if (!_hideJumpLimit && stars[0]) {
                const jumpR = _scaleR(_starHundredDau(stars[0]), maxAU, scaledMaxR, primaryHole);
                if (jumpR > 0 && jumpR < scaledMaxR * 1.25) include(originX, originY, jumpR + 36, '100D jump');
            }
            if (!Number.isFinite(bounds.left)) include(originX, originY, 15);
            return bounds;
        }
        ctx.clearRect(0, 0, W, H);
        _hitBodies = [];
        if (!_lightMode) _drawStarField(ctx, W, H);

        // HZ band — hzAU is set by the normaliser for all editions
        const hzAU      = sys.hzAU !== undefined ? sys.hzAU : _orbitToAU(sys.hzco || 3);
        const hzInnerPx = _scaleR(hzAU * 0.70, maxAU, scaledMaxR, primaryHole);
        const hzOuterPx = _scaleR(hzAU * 1.55, maxAU, scaledMaxR, primaryHole);
        if (!_hideHZ) _drawHZBand(ctx, originX, originY, hzInnerPx, hzOuterPx);

        if (!_hideJumpLimit && _lineup === 'orbits') {
            const jumpRings = [];
            const queueJump = (cx, cy, r, label) => {
                if (r >= 6 && r <= _MAX_DASHED_RING_RADIUS) jumpRings.push({ cx, cy, r, label });
            };
            const queueWorldJumps = (list, cx, cy, maxAU, maxPx, hole, starMass) => {
                list.forEach(w => {
                    if (!(w.diamKm > 0) || w.type === 'Planetoid Belt' || _isMainworldBelt(w)) return;
                    const at = _worldScreen(w, cx, cy, maxAU, maxPx, hole, elapsed_years, starMass, worldIdxMap);
                    const ring = _hundredDpx(w.au || 0, _hundredDau(w.diamKm), maxAU, maxPx, hole);
                    if (ring > _worldBodyRadius(w) + 5) queueJump(at.x, at.y, ring, '');
                });
            };
            const primaryD = _starHundredDau(stars[0]);
            queueJump(originX, originY,
                _visibleJumpRadius(_scaleR(primaryD, maxAU, scaledMaxR, primaryHole), stars[0]),
                '100D jump');
            const primaryStarMass = ((stars[0] || {}).mass) || 1;
            queueWorldJumps(primaryWorlds, originX, originY, maxAU, scaledMaxR, primaryHole, primaryStarMass);
            companions.forEach((s, i) => {
                const pos = starPos.get(i + 1);
                if (!pos) return;
                const dAu = _starHundredDau(s);
                const at = _starCompanionAU(s);
                const truePx = _hundredDpx(at, dAu, maxAU, scaledMaxR, primaryHole);
                queueJump(pos.cx, pos.cy, _visibleJumpRadius(truePx, s), '100D jump');
                const sIdx = i + 1;
                const sWorlds = worlds.filter(w => w.orbitType === 'S-Type' && w.parentStarIdx === sIdx);
                if (!sWorlds.length) return;
                const subMaxAU = sWorlds.reduce((m, w) => Math.max(m, w.au || 0), 0.01) * 1.2;
                const subMaxR = _subSystemRadius(s, _compRingR.get(s));
                const subHole = _orbitHole(_starBodyRadius(s));
                queueWorldJumps(sWorlds, pos.cx, pos.cy, subMaxAU, subMaxR, subHole, s.mass || 1);
            });
            _visibleJumpCircles(jumpRings).forEach(ring => _drawJumpLimit(ctx, ring.cx, ring.cy, ring.r, ring.label));
        }

        // Companion orbit rings + sub-orreries
        companions.forEach((s, i) => {
            const sIdx      = i + 1;
            const pos       = starPos.get(sIdx);
            const orbitR    = _compRingR.get(s);
            const parentPos = starPos.get(s.parentStarIdx ?? 0) || { cx: originX, cy: originY };

            if (_showOrbits && _orbitOpacity > 0 && orbitR <= _MAX_DASHED_RING_RADIUS) {
                const orbitAlpha = _lightMode ? _orbitOpacity * 0.80 : _orbitOpacity * 0.55;
                ctx.strokeStyle = `rgba(69, 162, 158, ${orbitAlpha.toFixed(3)})`;
                ctx.lineWidth   = 1 + _orbitOpacity * 1.5;
                ctx.setLineDash([4, 6]);
                _strokeVisibleCircle(ctx, parentPos.cx, parentPos.cy, orbitR, 10);
                ctx.setLineDash([]);
            }

            const sWorlds = worlds.filter(
                w => w.orbitType === 'S-Type' && w.parentStarIdx === sIdx
            );
            // This star's own habitable zone, on its subsystem's scale. A star
            // with no worlds is scaled so the zone sits inside its subsystem.
            const starHz = s.separation === 'Companion' ? null : _starHzAU(sIdx);
            if (starHz && !_hideHZ) {
                const hzMaxAU = sWorlds.length ? sWorlds.reduce((m, w) => Math.max(m, w.au || 0), 0.01) * 1.2 : starHz * 1.55 * 1.25;
                const hzMaxR = _subSystemRadius(stars[sIdx], orbitR);
                const hzHole = _orbitHole(_starBodyRadius(stars[sIdx]));
                const inner = _scaleR(starHz * 0.70, hzMaxAU, hzMaxR, hzHole);
                const outer = _scaleR(starHz * 1.55, hzMaxAU, hzMaxR, hzHole);
                _drawHZBand(ctx, pos.cx, pos.cy, inner, outer);
                hzLabels.push([pos.cx, pos.cy, inner, outer, `HABITABLE ZONE · ${_scanLabel(stars[sIdx])}`]);
            }
            if (sWorlds.length > 0) {
                const subMaxAU    = sWorlds.reduce((m, w) => Math.max(m, w.au || 0), 0.01) * 1.2;
                const subMaxR     = _subSystemRadius(stars[sIdx], orbitR);
                const compStarMass = ((stars[sIdx] || {}).mass) || 1;
                const subHole     = _orbitHole(_starBodyRadius(stars[sIdx]));
                _drawWorldSet(ctx, sWorlds, pos.cx, pos.cy, subMaxAU, subMaxR, elapsed_years, compStarMass, worldIdxMap, subHole);
            }
        });

        // Primary worlds
        if (primaryWorlds.length > 0) {
            const primaryStarMass = ((stars[0] || {}).mass) || 1;
            _drawWorldSet(ctx, primaryWorlds, originX, originY, maxAU, scaledMaxR, elapsed_years, primaryStarMass, worldIdxMap, primaryHole);
        }

        // Stars — topmost layer
        stars.forEach((s, i) => {
            const pos = starPos.get(i);
            _drawStar(ctx, s, pos.cx, pos.cy, i);
            _hitBodies.push({
                kind: 'star', body: s,
                cx: pos.cx, cy: pos.cy,
                r: _starBodyRadius(s) + 8 * _zoomScale(),
                visualR: _starBodyRadius(s)
            });
        });
        // The zone's label goes over the bodies so a planet cannot hide it.
        if (!_hideHZ) {
            _drawHZLabel(ctx, originX, originY, hzInnerPx, hzOuterPx);
            hzLabels.forEach(([x, y, inner, outer, text]) => _drawHZLabel(ctx, x, y, inner, outer, text));
        }
        _drawScanOverlay(ctx, { x: originX, y: originY });
        _drawSelection(ctx);
    }

    // Same 1.8s ease-out ring as the campaign locator pulse, drawn in canvas
    // so it stays locked to the selected/tracked body as it orbits.
    function _drawFocusPulse(ctx, hit, baseR) {
        if (!_motionOk()) return;
        const rgb = window.printMode || _lightMode ? '9, 105, 94' : '102, 252, 241';
        ctx.save();
        // Two pings, half a beat apart, every 2.4 s.
        for (const offset of [0, 0.22]) {
            const t = ((performance.now() / 2400) + 1 - offset) % 1;
            if (t > 0.6) continue;
            const ease = 1 - Math.pow(1 - t / 0.6, 3);
            ctx.strokeStyle = `rgba(${rgb}, ${((1 - ease) * (offset ? 0.35 : 0.6)).toFixed(3)})`;
            ctx.lineWidth = offset ? 1 : 1.5;
            ctx.beginPath();
            ctx.arc(hit.cx, hit.cy, baseR + 4 + ease * (baseR * 0.8 + 26), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── World set ─────────────────────────────────────────────────────────────

    // A size-0 mainworld is an asteroid cluster — draw as a belt ring.
    function _isMainworldBelt(w) {
        if (w.type !== 'Mainworld') return false;
        if (w.size === 0) return true;
        if (w.uwp && w.uwp[1] === '0') return true;
        return false;
    }

    // 100 diameters, in AU. Same kilometre the journey-time math uses.
    function _hundredDau(diamKm) {
        return (diamKm > 0) ? (100 * diamKm) / _AU_KM : 0;
    }

    function _starHundredDau(s) {
        return _hundredDau((s && s.diam > 0) ? s.diam * _SUN_DIAM_KM : 0);
    }

    // Pixel radius of a circle of `deltaAu` centered on a body that already
    // sits at `au` on this map. The star's own limit is the special case au = 0.
    function _hundredDpx(au, deltaAu, maxAU, maxPx, hole) {
        if (!(deltaAu > 0)) return 0;
        const outer = _scaleR((au || 0) + deltaAu, maxAU, maxPx, hole);
        const inner = _scaleR(au || 0, maxAU, maxPx, hole);
        return Math.abs(outer - inner);
    }

    // The drawn star is larger than its true disc. A 100D ring that the AU
    // scale squeezes inside that disc — easy for a companion on the log map —
    // is lifted to just outside the corona. A ring that already clears the
    // star, as on the linear scale, stays where the AU scale put it.
    function _visibleJumpRadius(truePx, star) {
        const body = _starBodyRadius(star);
        const clear = body * 1.62;
        return Math.max(truePx || 0, clear);
    }

    // A jump circle fully inside another one never changes where a ship can
    // engage, so the inner line is dropped.
    function _jumpCircleContains(outer, inner) {
        return Math.hypot(outer.cx - inner.cx, outer.cy - inner.cy) + inner.r <= outer.r + 1;
    }

    function _visibleJumpCircles(rings) {
        return rings.filter((inner, i) => !rings.some((outer, j) =>
            j !== i && outer.r > inner.r && _jumpCircleContains(outer, inner)
        ));
    }

    // The part of a circle that can reach the canvas, as [start, end] angles,
    // or null when none of it can. Zoomed in, an orbit can be tens of
    // thousands of pixels across; stroking (and dashing) all of it every
    // frame is what makes a close-up stutter, so only the visible span is drawn.
    function _arcSpan(cx, cy, r, margin = 6) {
        const W = _canvasW, H = _canvasH;
        const near = Math.hypot(cx - Math.max(0, Math.min(W, cx)), cy - Math.max(0, Math.min(H, cy)));
        const far = Math.max(Math.hypot(cx, cy), Math.hypot(cx - W, cy), Math.hypot(cx, cy - H), Math.hypot(cx - W, cy - H));
        if (r + margin < near || r - margin > far) return null;
        const inside = cx >= 0 && cx <= W && cy >= 0 && cy <= H;
        if (inside || r < 3000) return [0, Math.PI * 2];
        // From a centre off the canvas, the canvas spans less than a half-turn.
        const mid = Math.atan2(H / 2 - cy, W / 2 - cx);
        let lo = 0, hi = 0;
        for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
            const d = Math.atan2(y - cy, x - cx) - mid;
            const wrapped = Math.atan2(Math.sin(d), Math.cos(d));
            lo = Math.min(lo, wrapped); hi = Math.max(hi, wrapped);
        }
        const pad = margin / r + 0.002;
        return [mid + lo - pad, mid + hi + pad];
    }
    // Strokes the visible part of a circle. A dash pattern keeps its phase
    // from angle 0, so dashes do not crawl as the span moves with the camera.
    function _strokeVisibleCircle(ctx, cx, cy, r, dashLength = 0, dashOffset = 0) {
        const span = _arcSpan(cx, cy, r, ctx.lineWidth + 4);
        if (!span) return;
        ctx.beginPath();
        ctx.arc(cx, cy, r, span[0], span[1]);
        if (dashLength) ctx.lineDashOffset = ((dashOffset + span[0] * r) % dashLength + dashLength) % dashLength;
        ctx.stroke();
        if (dashLength) ctx.lineDashOffset = 0;
    }

    function _drawJumpLimit(ctx, cx, cy, r, label) {
        if (!(r >= 6) || r > _MAX_DASHED_RING_RADIUS) return;
        ctx.save();
        ctx.strokeStyle = _lightMode ? 'rgba(20, 92, 186, 0.9)' : 'rgba(120, 186, 255, 0.95)';
        ctx.lineWidth = 1.5;
        _strokeVisibleCircle(ctx, cx, cy, r);
        if (label && r >= 22 && r < 2000) {
            ctx.font = '11px Inter, sans-serif';
            ctx.fillStyle = _lightMode ? '#145cba' : '#9ecbff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx + 4, cy - r - 2);
        }
        ctx.restore();
    }

    // 0 outside the parent's shadow, 1 deep inside it. The edge is a smooth
    // ramp, so a moon dims as it slides behind the parent instead of flipping.
    function _shadowCover(bx, by, px, py, parentR, starX, starY) {
        const sx = starX - bx;
        const sy = starY - by;
        const seg2 = sx * sx + sy * sy;
        if (seg2 < 4) return 0;
        const t = ((px - bx) * sx + (py - by) * sy) / seg2;
        if (t <= 0 || t >= 1) return 0;
        const qx = bx + t * sx;
        const qy = by + t * sy;
        const miss = Math.hypot(px - qx, py - qy);
        const margin = Math.max(3, parentR * 0.45);
        const outer = parentR + margin;
        if (miss >= outer) return 0;
        const inner = Math.max(0, parentR * 0.45);
        if (miss <= inner) return 1;
        const u = (outer - miss) / (outer - inner);
        return u * u * (3 - 2 * u);
    }

    // Follow the geometric shadow with a short ease, so a fast time step
    // still fades instead of popping. Reduced-motion skips the fade.
    function _easeEclipse(key, target) {
        if (!_motionOk()) return target;
        const now = performance.now();
        let rec = _eclipseShade.get(key);
        if (!rec) {
            rec = { value: target, at: now };
            _eclipseShade.set(key, rec);
            return target;
        }
        const dt = Math.min(0.05, Math.max(0, (now - rec.at) / 1000));
        rec.at = now;
        const blend = 1 - Math.exp(-dt / 0.16);
        rec.value += (target - rec.value) * blend;
        if (Math.abs(rec.value - target) < 0.01) rec.value = target;
        return rec.value;
    }

    function _worldScreen(w, cx, cy, maxAU, maxPx, holePx, elapsed_years, starMass, worldIdxMap) {
        const orbitR = _scaleR(w.au || 0, maxAU, maxPx, holePx);
        const wIdx = worldIdxMap.get(w) ?? 0;
        const period = _worldPeriodYears(w, starMass);
        const angle = _hashEpoch(_hexId + ':world:' + wIdx) + (2 * Math.PI / period) * elapsed_years;
        return {
            x: cx + orbitR * Math.cos(angle),
            y: cy + orbitR * Math.sin(angle),
            orbitR, wIdx
        };
    }

    function _drawWorldSet(ctx, worldList, cx, cy, maxAU, maxPx, elapsed_years, starMass, worldIdxMap, holePx) {
        const prevScale = _orbitScale;
        _orbitScale = { maxAU, maxPx, hole: holePx || 0 };
        const isBelt = w => w.type === 'Planetoid Belt' || _isMainworldBelt(w);
        const belts  = worldList.filter(isBelt);
        const bodies = worldList.filter(w => !isBelt(w));

        belts.forEach(w => {
            const r      = _scaleR(w.au || 0, maxAU, maxPx, holePx);
            const isMW   = _isMainworldBelt(w);
            const wIdx   = worldIdxMap.get(w) ?? 0;
            const period = _worldPeriodYears(w, starMass);
            const epoch  = _hashEpoch(_hexId + ':world:' + wIdx);
            const angle  = epoch + (2 * Math.PI / period) * elapsed_years;
            _drawBeltRing(ctx, cx, cy, r, false, -(angle * r));
            if (isMW && !_hideMainworldHighlight) {
                _drawMainworldStar(ctx, cx, cy - r, 2);
                if (w.name) {
                    ctx.save();
                    ctx.fillStyle = _lightMode ? '#0d6b64' : '#66fcf1';
                    ctx.font      = '11px Inter, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(w.name, cx, cy - r - 10);
                    ctx.restore();
                }
            }
            _hitBodies.push({
                kind: isMW ? 'world' : 'belt',
                body: w, cx, cy, r: r + 7 * _zoomScale(), innerR: Math.max(0, r - 7 * _zoomScale())
            });
        });

        if (_showOrbits && _orbitOpacity > 0) bodies.forEach(w => {
            const r = _scaleR(w.au || 0, maxAU, maxPx, holePx);
            if (r < 2) return;
            const worldAlpha = _lightMode ? _orbitOpacity * 0.65 : _orbitOpacity * 0.40;
            ctx.strokeStyle = `rgba(69, 162, 158, ${worldAlpha.toFixed(3)})`;
            ctx.lineWidth   = 1 + _orbitOpacity * 1.5;
            _strokeVisibleCircle(ctx, cx, cy, r);
        });

        bodies.forEach(w => {
            const at = _worldScreen(w, cx, cy, maxAU, maxPx, holePx, elapsed_years, starMass, worldIdxMap);
            _drawWorld(ctx, w, at.x, at.y, elapsed_years, at.wIdx, cx, cy);
        });
        _orbitScale = prevScale;
    }

    // ── Element drawing ───────────────────────────────────────────────────────

    // Deep space behind the system, so dark worlds read against something:
    // a faint nebula and galactic band (painted once on the GPU, different for
    // every system) under a field of small stars of mixed colour, denser along
    // the band. It is a little larger than the canvas and drifts slowly with
    // the camera, which gives the field depth.
    const _BACKDROP_MARGIN = 0.06;
    const _NEBULAE = [
        [[40, 150, 170], [170, 60, 150], [150, 170, 210]],
        [[190, 110, 50], [110, 60, 170], [200, 170, 140]],
        [[40, 170, 150], [60, 110, 190], [160, 200, 200]],
        [[170, 50, 70], [60, 80, 180], [190, 160, 170]],
        [[150, 140, 60], [40, 140, 150], [190, 190, 160]]
    ];
    const _FIELD_COLOURS = ['#9bb0ff', '#cad7ff', '#f8f7ff', '#fff4ea', '#fff4ea', '#ffd2a1', '#ffcc6f'];
    let _backdrop = null;
    function _buildBackdrop(W, H) {
        const dpr = window.devicePixelRatio || 1;
        const mx = Math.round(W * _BACKDROP_MARGIN), my = Math.round(H * _BACKDROP_MARGIN);
        const BW = W + mx * 2, BH = H + my * 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(BW * dpr));
        canvas.height = Math.max(1, Math.round(BH * dpr));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const rand = _rng(_seedOf(`backdrop|${_hexId || ''}`));
        const palette = _NEBULAE[Math.floor(rand() * _NEBULAE.length)];
        const bandAngle = rand() * Math.PI, bandOffset = (rand() - 0.5) * 0.5;
        const nebula = window.PlanetGL?.available?.()
            ? PlanetGL.paintBackdrop(canvas.width / 4, canvas.height / 4, [rand() * 60, rand() * 60, rand() * 60], palette, [bandAngle, bandOffset], 0.34)
            : null;
        if (nebula) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(nebula, 0, 0, canvas.width, canvas.height);
        } else {
            // Without the GPU: a few broad, faint glows in the same colours.
            for (let i = 0; i < 4; i++) {
                const [r, g, b] = palette[i % 3];
                const x = rand() * canvas.width, y = rand() * canvas.height, radius = (0.3 + rand() * 0.4) * canvas.width;
                const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
                glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.05)`);
                glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                ctx.fillStyle = glow;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
        ctx.scale(dpr, dpr);
        // Stars, in the same frame the nebula's band was laid out in (y up).
        const bandNormal = [-Math.sin(bandAngle), Math.cos(bandAngle)];
        const centreX = 0.5 * BW / BH;
        const count = Math.round(BW * BH / 800);
        for (let i = 0; i < count; i++) {
            const x = rand() * BW, y = rand() * BH;
            const across = (x / BH - centreX) * bandNormal[0] + ((BH - y) / BH - 0.5) * bandNormal[1] - bandOffset;
            if (rand() > 0.3 + 0.7 * Math.exp(-across * across / 0.05)) continue;
            ctx.globalAlpha = 0.05 + Math.pow(rand(), 3) * 0.45;
            ctx.fillStyle = _FIELD_COLOURS[Math.floor(rand() * _FIELD_COLOURS.length)];
            ctx.beginPath();
            ctx.arc(x, y, 0.3 + Math.pow(rand(), 4) * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        // A few brighter stars with a soft glow.
        for (let i = 0; i < Math.round(BW * BH / 60000); i++) {
            const x = rand() * BW, y = rand() * BH;
            const colour = _FIELD_COLOURS[Math.floor(rand() * _FIELD_COLOURS.length)];
            const glow = ctx.createRadialGradient(x, y, 0, x, y, 3 + rand() * 3);
            glow.addColorStop(0, colour);
            glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.globalAlpha = 0.14 + rand() * 0.12;
            ctx.fillStyle = glow;
            ctx.fillRect(x - 6, y - 6, 12, 12);
            ctx.globalAlpha = 0.55 + rand() * 0.3;
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.arc(x, y, 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
        return { canvas, w: W, h: H, dpr, hex: _hexId, mx, my, bw: BW, bh: BH };
    }
    function _drawStarField(ctx, W, H) {
        if (ctx === _probeCtx) return;
        const dpr = window.devicePixelRatio || 1;
        if (!_backdrop || _backdrop.w !== W || _backdrop.h !== H || _backdrop.dpr !== dpr || _backdrop.hex !== _hexId) {
            _backdrop = _buildBackdrop(W, H);
        }
        const { mx, my } = _backdrop;
        const ox = Math.max(-mx, Math.min(mx, _viewOffX * 0.02));
        const oy = Math.max(-my, Math.min(my, _viewOffY * 0.02));
        ctx.drawImage(_backdrop.canvas, -mx + ox, -my + oy, _backdrop.bw, _backdrop.bh);
    }

    function _hzColor(alpha) {
        return _lightMode ? `rgba(22,128,58,${alpha})` : `rgba(88,214,120,${alpha})`;
    }
    // Filled band with dashed edges at both limits. _drawHZLabel names it,
    // after the bodies are drawn.
    function _drawHZBand(ctx, cx, cy, innerR, outerR) {
        if (outerR <= innerR || innerR < 0) return;
        const inner = Math.max(0, innerR);
        const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outerR);
        grad.addColorStop(0,   _hzColor(0.16));
        grad.addColorStop(0.5, _hzColor(_lightMode ? 0.24 : 0.28));
        grad.addColorStop(1,   _hzColor(0.16));
        const span = _arcSpan(cx, cy, outerR);
        const fromCentre = Math.hypot(cx - _canvasW / 2, cy - _canvasH / 2);
        // The canvas sits wholly in the hole: nothing of the band shows.
        if (inner > 0 && !_arcSpan(cx, cy, inner) && fromCentre < inner) return;
        if (!span) {
            // The canvas sits wholly inside the band: fill it.
            if (fromCentre < outerR) {
                ctx.save();
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.rect(0, 0, _canvasW, _canvasH);
                const hole = inner > 0 ? _arcSpan(cx, cy, inner) : null;
                if (hole) {
                    // A slice from the centre, so the whole hole in view is cut,
                    // not just the sliver between the arc and its chord.
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, inner, hole[0], hole[1]);
                    ctx.closePath();
                }
                ctx.fill(hole ? 'evenodd' : 'nonzero');
                ctx.restore();
            }
            return;
        }
        ctx.save();
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (span[1] - span[0] >= Math.PI * 2) {
            ctx.arc(cx, cy, outerR, 0, Math.PI * 2, false);
            ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
        } else {
            ctx.arc(cx, cy, outerR, span[0], span[1], false);
            ctx.arc(cx, cy, inner, span[1], span[0], true);
            ctx.closePath();
        }
        ctx.fill();
        ctx.strokeStyle = _hzColor(_lightMode ? 0.85 : 0.8);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        for (const r of [inner, outerR]) {
            if (r >= 2) _strokeVisibleCircle(ctx, cx, cy, r, 11);
        }
        ctx.setLineDash([]);
        ctx.restore();
    }
    function _drawHZLabel(ctx, cx, cy, innerR, outerR, text = 'HABITABLE ZONE') {
        const inner = Math.max(0, innerR);
        const mid = (inner + outerR) / 2;
        ctx.save();
        if (outerR - inner >= 9 && mid >= 40) {
            // A dark pill keeps the label legible over planets and orbit paths.
            ctx.font = '700 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if ('letterSpacing' in ctx) ctx.letterSpacing = '1.2px';
            const width = ctx.measureText(text).width + 14;
            ctx.fillStyle = _lightMode ? 'rgba(255,255,255,0.9)' : 'rgba(6,18,14,0.85)';
            ctx.strokeStyle = _hzColor(0.8);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(cx - width / 2, cy - mid - 8, width, 16, 8);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = _hzColor(1);
            ctx.fillText(text, cx, cy - mid + 0.5);
        }
        ctx.restore();
    }

    function _drawStar(ctx, s, cx, cy, idx) {
        const r     = _starBodyRadius(s);
        const color = _starColor(s);

        ctx.save();
        // Corona stays just past the limb. The orbit clearance sits further out,
        // so the glow fades before the first planet.
        const glowReach = r * (_lineup === 'orbits' ? 1.38 : 1.45);
        const glow = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, glowReach);
        glow.addColorStop(0, color + (_lightMode ? '66' : 'aa'));
        glow.addColorStop(1, color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowReach, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const disc = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        disc.addColorStop(0,   '#ffffff');
        disc.addColorStop(0.4, color);
        disc.addColorStop(1,   color + 'bb');
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        if (_lineup !== 'orbits') return;
        ctx.save();
        ctx.fillStyle = _lightMode ? '#1a1a2e' : '#c5c6c7';
        ctx.font      = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.name, cx, cy + r + 15);
        if (idx > 0 && s.separation) {
            ctx.fillStyle = _lightMode ? '#4a5568' : '#65706e';
            ctx.font      = '10px Inter, sans-serif';
            ctx.fillText(s.separation, cx, cy + r + 27);
        }
        ctx.restore();
    }

    // A planetary ring — a thin static stroked circle, not an animated orbiting dot. Shared by
    // CT (a moon-slot whose size roll came up 'R', living inside w.moons[]/satellites[]) and
    // MgT2E (the same RAW rule, but stored separately on the planet as w.rings[] rather than
    // inside w.moons[] — see mgt2e_world_engine.js's moon-size-roll-of-'R' branches). Distinct
    // styling from _drawBeltRing's dashed belt line (solid, thinner, silvery) so the two read as
    // different things at a glance.
    function _drawStaticRing(ctx, px, py, dist) {
        ctx.beginPath();
        ctx.arc(px, py, dist, 0, Math.PI * 2);
        ctx.strokeStyle = _lightMode ? '#8a8f9488' : '#c8ccd0aa';
        ctx.lineWidth   = 1;
        ctx.stroke();
    }

    // Signed hours. MgT stores siderealHours (retrograde is axial tilt past 90°).
    // AoW stores rotationPeriod in hours. CT stores a string such as "18h" or "2d".
    function _siderealHours(body) {
        if (!body) return null;
        if (typeof body.siderealHours === 'number' && Number.isFinite(body.siderealHours) && body.siderealHours !== 0)
            return Math.abs(body.siderealHours);
        if (typeof body.rotationPeriod === 'number' && Number.isFinite(body.rotationPeriod) && body.rotationPeriod > 0)
            return body.rotationPeriod;
        if (typeof body.rotationPeriod === 'string') {
            const m = body.rotationPeriod.match(/([\d.]+)\s*([hdw])/i);
            if (m) {
                const n = parseFloat(m[1]);
                const u = m[2].toLowerCase();
                if (u === 'h') return n;
                if (u === 'd') return n * 24;
                if (u === 'w') return n * 168;
            }
        }
        return null;
    }

    function _isTideLocked(body) {
        if (!body) return false;
        if (body.tidallyLocked || body.isTwilightZone) return true;
        if (typeof body.rotationPeriod === 'string' && /tidal/i.test(body.rotationPeriod)) return true;
        if (typeof body.rotationPeriod === 'number' && typeof body.orbitalPeriod === 'number'
            && Math.abs(body.rotationPeriod - body.orbitalPeriod) < 0.001) return true;
        return false;
    }

    const _reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
    function _motionOk() {
        return !_reducedMotion?.matches;
    }

    // starAngle points from the body toward its light source. A locked body
    // keeps that face; a spinning body turns under a star-fixed night side.
    function _spinAngle(body, elapsedYears, starAngle) {
        if (_isTideLocked(body)) return starAngle;
        if (!_motionOk()) return 0;
        const hours = _siderealHours(body);
        if (!(hours > 0)) return 0;
        const sign = body.axialTilt > 90 ? -1 : 1;
        return sign * ((elapsedYears * 365.25 * 24) / hours) * Math.PI * 2;
    }

    // ── Painted worlds (day / night) ───────────────────────────────────────
    // Presentation only. Orbit view looks down on the ecliptic, so each world
    // is seen pole-on: it turns about the disc centre, its latitudes are
    // circles (z, toward the viewer, is the sine of latitude), and its
    // terminator is a straight line through the middle.
    //
    // A world is painted once per size bucket from its own atmosphere,
    // hydrographics, temperature, and biomass, then rotated each frame.
    // Light depends only on where the star is, so the shading and the
    // atmosphere are computed per pixel once and turned to face the star.
    function _hexDigit(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && /^[0-9A-Fa-f]$/.test(value.trim())) return parseInt(value.trim(), 16);
        return null;
    }
    function _uwpDigit(body, index) {
        return typeof body.uwp === 'string' ? _hexDigit(body.uwp[index]) : null;
    }
    // Also read by the inspector's body icons, so a world looks the same in both.
    function surfaceKind(body) {
        return window.PlanetProfile ? PlanetProfile.kind(body) : null;
    }
    function _atmDigit(body) { return _hexDigit(body.atmCode) ?? _hexDigit(body.atm) ?? _uwpDigit(body, 2); }
    function _hydroDigit(body) { return _hexDigit(body.hydroCode) ?? _hexDigit(body.hydro) ?? _uwpDigit(body, 3); }

    // How strongly an atmosphere scatters light, by atmosphere digit. A look,
    // not a physical model: trace air barely shows, dense air glows.
    const _AIR_STRENGTH = [0, 0.15, 0.3, 0.35, 0.55, 0.6, 0.8, 0.85, 1.0, 1.05, 1.2, 1.3, 1.3, 1.4, 0.8, 1.1];
    const _BAND_KELVIN = { Frozen: 200, Cold: 250, Cool: 278, Temperate: 295, Warm: 320, Hot: 380, Boiling: 420 };
    // Everything a painting needs to know about one world.
    function _climate(body, kind) {
        const atm = _atmDigit(body);
        const hydro = _hydroDigit(body);
        const kelvin = Number(body.meanTempK) || _BAND_KELVIN[body.tempBand] || (kind === 'ice' ? 200 : kind === 'hot' ? 600 : 288);
        const meanC = kelvin - 273.15;
        const water = (hydro ?? 0) / 10;
        // MgT biomass says whether anything grows; other editions fall back to
        // a breathable, wet, mild world.
        const life = body.biomass != null && body.biomass !== ''
            ? Number(body.biomass) > 0
            : (atm != null && atm >= 4 && atm <= 9 && (hydro ?? 0) >= 2 && meanC > -25 && meanC < 50);
        let air = kind === 'gas' ? 0.7 : _AIR_STRENGTH[Math.max(0, Math.min(15, atm ?? 0))] || 0;
        if (kind === 'barren') air = 0;
        const pop = _hexDigit(body.pop) ?? _hexDigit(body.popCode) ?? _uwpDigit(body, 4) ?? 0;
        return { atm: atm ?? 0, hydro: hydro ?? 0, water, kelvin, meanC, life, air, pop };
    }
    // Rim colour of each kind's air: Rayleigh blue for breathable air, dust
    // for thin dry air, sulphur for corrosive air.
    function _airColor(kind, climate, body) {
        if (kind === 'gas') {
            const type = body.ggType || '';
            return type === 'GS' ? [120, 190, 255] : [255, 224, 176];
        }
        if (kind === 'exotic') return [236, 206, 120];
        if (kind === 'hot') return [255, 150, 80];
        if (kind === 'rad') return [190, 236, 120];
        if (kind === 'storm') return [160, 196, 255];
        if (kind === 'desert' && climate.atm <= 3) return [236, 184, 140];
        if (kind === 'ice') return [180, 214, 255];
        return [104, 164, 255];
    }

    function _seedOf(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h;
    }
    function _rng(seed) {
        let h = seed >>> 0 || 1;
        return () => {
            h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
            h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        };
    }
    // Seeded 3D value noise. Sampling on the sphere keeps features round
    // near the rim instead of stretching them.
    function _noise3(seed) {
        const hash = (x, y, z) => {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441) ^ seed;
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) * 2.3283064365386963e-10;
        };
        return (x, y, z) => {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const a = hash(xi, yi, zi), b = hash(xi + 1, yi, zi), c = hash(xi, yi + 1, zi), d = hash(xi + 1, yi + 1, zi);
            const e = hash(xi, yi, zi + 1), f = hash(xi + 1, yi, zi + 1), g = hash(xi, yi + 1, zi + 1), k = hash(xi + 1, yi + 1, zi + 1);
            const x00 = a + (b - a) * u, x10 = c + (d - c) * u, x01 = e + (f - e) * u, x11 = g + (k - g) * u;
            const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
            return y0 + (y1 - y0) * w;
        };
    }
    function _fbm(noise, x, y, z, octaves) {
        let sum = 0, amp = 0.5, freq = 1, norm = 0;
        for (let i = 0; i < octaves; i++) {
            sum += amp * noise(x * freq, y * freq, z * freq);
            norm += amp; amp *= 0.5; freq *= 2.03;
        }
        return sum / norm;
    }
    // Sharp crests: mountain chains, lineae, lava channels.
    function _ridged(noise, x, y, z, octaves) {
        let sum = 0, amp = 0.5, freq = 1, norm = 0, prev = 1;
        for (let i = 0; i < octaves; i++) {
            let n = 1 - Math.abs(noise(x * freq, y * freq, z * freq) * 2 - 1);
            n *= n;
            sum += n * amp * prev;
            prev = n; norm += amp; amp *= 0.5; freq *= 2.1;
        }
        return sum / norm;
    }
    const _mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const _smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    function _ramp(stops, t) {
        if (t <= stops[0][0]) return stops[0][1];
        for (let i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
                return _mixRGB(c0, c1, (t - t0) / (t1 - t0));
            }
        }
        return stops[stops.length - 1][1];
    }
    // Vegetation by local temperature (°C): tundra scrub, boreal, temperate, tropical.
    const _FOREST = [[-8, [86, 92, 72]], [2, [44, 78, 48]], [14, [58, 104, 50]], [26, [28, 88, 38]]];
    const _GRASS = [[-8, [150, 146, 128]], [4, [138, 132, 96]], [14, [150, 150, 88]], [26, [196, 172, 104]]];
    const _ARID = [[-10, [168, 160, 146]], [10, [192, 168, 124]], [30, [216, 184, 128]]];
    const _OXIDE = [[0, [104, 58, 40]], [0.35, [160, 88, 56]], [0.7, [194, 124, 80]], [1, [222, 172, 128]]];
    const _BARE = [[0, [88, 82, 74]], [0.5, [128, 118, 100]], [1, [174, 164, 146]]];
    const _GAS_LOOKS = {
        GS: { zone: [176, 216, 230], belt: [106, 160, 200], pole: [74, 118, 170], storm: [60, 90, 150] },
        GM: { zone: [238, 222, 180], belt: [198, 166, 116], pole: [150, 140, 120], storm: [220, 204, 170] },
        GL: { zone: [240, 226, 198], belt: [188, 128, 84], pole: [118, 108, 110], storm: [198, 96, 62] }
    };

    function _surfaceId(body, kind) {
        return `${_hexId || ''}|${body.name || ''}|${body.type || ''}|${body.uwp || ''}|${body.diamKm || body.diam || ''}|${body.au ?? ''}|${body.pd ?? ''}|${kind}`;
    }
    const _disc = (px, py, size) => {
        const u = (px + 0.5) / size * 2 - 1, v = (py + 0.5) / size * 2 - 1;
        const d2 = u * u + v * v;
        return d2 > 1 ? null : [u, v, Math.sqrt(1 - d2)];
    };
    function _canvas(size) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        return canvas;
    }
    // A generator: it yields every few rows so a large painting is spread
    // across frames instead of stalling one.
    function* _paintWorldSteps(body, kind, size) {
        const climate = _climate(body, kind);
        const seed = _seedOf(_surfaceId(body, kind));
        const rand = _rng(seed);
        const shape = _noise3(seed);
        const warp = _noise3(seed ^ 0x27d4eb2f);
        const ridge = _noise3(seed ^ 0x165667b1);
        const wet = _noise3(seed ^ 0x9e3779b9);
        const grain = _noise3(seed ^ 0x85ebca6b);
        const rowsPerStep = Math.max(2, Math.round(4096 / size));
        const o = [rand() * 60, rand() * 60, rand() * 60];
        const count = size * size;
        const height = new Float32Array(count).fill(-1);
        const rough = new Float32Array(count);
        const damp = new Float32Array(count);
        const terran = kind === 'ocean' || kind === 'temperate' || kind === 'desert';

        // Pass 1: height, ridges, moisture.
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                const p = _disc(px, py, size);
                if (!p) continue;
                const [u, v, z] = p, i = py * size + px;
                if (kind === 'gas') {
                    height[i] = _fbm(shape, u * 3 + o[0], v * 3 + o[1], z * 14 + o[2], 4);
                    rough[i] = _fbm(warp, u * 1.5 + o[1], v * 1.5 + o[2], z * 5 + o[0], 3);
                    continue;
                }
                const s = 1.7;
                const qx = _fbm(warp, u * s + o[0], v * s + o[1], z * s + o[2], 3) - 0.5;
                const qy = _fbm(warp, u * s + o[2], v * s + o[0], z * s + o[1], 3) - 0.5;
                height[i] = _fbm(shape, (u + qx * 0.9) * 2.1 + o[1], (v + qy * 0.9) * 2.1 + o[2], z * 2.1 + o[0], 6);
                rough[i] = _ridged(ridge, u * 3.4 + o[2], v * 3.4 + o[0], z * 3.4 + o[1], 5);
                damp[i] = _fbm(wet, u * 2.4 + o[0], v * 2.4 + o[2], z * 2.4 + o[1], 3);
            }
            if (py % rowsPerStep === rowsPerStep - 1) yield;
        }
        // Sea level from a sample, so the low ground covers the world's water share.
        const samples = [];
        for (let n = 0; n < 2000; n++) {
            const h = height[Math.floor(rand() * count)];
            if (h >= 0) samples.push(h);
        }
        samples.sort((a, b) => a - b);
        const share = terran ? Math.min(0.97, Math.max(0.02, climate.water))
            : ({ barren: 0.35, ice: 0.4, hot: 0.3, exotic: 0.4, storm: 0.5, rad: 0.35 }[kind] ?? 0.4);
        const sea = samples[Math.floor((samples.length - 1) * share)] ?? 0.5;
        const hasWater = terran && climate.hydro >= 1 && climate.kelvin < 373;
        const oxide = kind === 'desert' && climate.atm <= 3;
        const gas = _GAS_LOOKS[body.ggType] || _GAS_LOOKS.GL;

        const surface = _canvas(size), ctx = surface.getContext('2d');
        const image = ctx.createImageData(size, size), data = image.data;
        const ocean = hasWater ? _canvas(size) : null;
        const oceanImage = ocean ? ocean.getContext('2d').createImageData(size, size) : null;
        const lava = kind === 'hot' ? _canvas(size) : null;
        const lavaImage = lava ? lava.getContext('2d').createImageData(size, size) : null;
        const elevation = (i) => {
            const h = height[i];
            if (h < 0) return 0;
            const land = Math.max(0, (h - sea) / Math.max(0.001, 1 - sea));
            return land + rough[i] * 0.28 * _smooth(0, 0.25, land);
        };

        // Pass 2: colour, with relief shading from the height field.
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                const i = py * size + px, h = height[i], k = i * 4;
                if (h < 0) continue;
                const [u, v, z] = _disc(px, py, size);
                const fine = _fbm(grain, u * 14, v * 14, z * 14, 2) - 0.5;
                let rgb;
                let relief = 1;
                if (kind === 'gas') {
                    // Zones and belts spaced by latitude, so equatorial bands crowd
                    // toward the rim. Uneven widths, and edges stirred into eddies.
                    const lat = Math.asin(Math.min(1, z + (h - 0.5) * 0.06 + (rough[i] - 0.5) * 0.04));
                    const pattern = Math.sin(lat * (10 + (seed % 5)) + (seed % 11))
                        + 0.55 * Math.sin(lat * 23 + (seed % 3)) + 0.35 * Math.sin(lat * 5.3 + 1);
                    const beltness = _smooth(-0.35, 0.55, pattern);
                    rgb = _mixRGB(gas.zone, gas.belt, beltness * (0.55 + rough[i] * 0.6));
                    // Polar regions lose the bands to a mottle of storms.
                    const polar = _smooth(0.78, 0.94, z);
                    if (polar > 0) rgb = _mixRGB(rgb, _mixRGB(gas.pole, gas.zone, _smooth(0.35, 0.7, h)), polar * 0.85);
                    relief = 1 + fine * 0.14;
                } else {
                    const land = h >= sea;
                    const e = elevation(i);
                    // Local temperature: warm equator (the rim), cold poles (the centre), cold heights.
                    const localC = climate.meanC + 15 - 45 * z * z - e * 28;
                    if (terran) {
                        if (!land && hasWater) {
                            const depth = (sea - h) / Math.max(0.001, sea);
                            rgb = _mixRGB([54, 146, 166], [10, 36, 90], _smooth(0.02, 0.3, depth));
                            if (localC < -6) rgb = _mixRGB(rgb, [226, 236, 244], _smooth(-6, -14, localC));
                            else if (oceanImage) oceanImage.data[k + 3] = 255;
                        } else if (!land) {
                            rgb = oxide ? [150, 110, 86] : [168, 152, 128];
                        } else if (climate.life) {
                            const moist = damp[i] - Math.exp(-(((z - 0.45) / 0.14) ** 2)) * 0.28 + (climate.water - 0.5) * 0.3;
                            rgb = _mixRGB(_ramp(_GRASS, localC), _ramp(_FOREST, localC), _smooth(0.38, 0.6, moist));
                            if (moist < 0.3) rgb = _mixRGB(rgb, _ramp(_ARID, localC), _smooth(0.3, 0.18, moist));
                        } else {
                            rgb = _ramp(oxide ? _OXIDE : _BARE, Math.min(1, e * 1.4 + (damp[i] - 0.5) * 0.5));
                        }
                        if (land) {
                            rgb = _mixRGB(rgb, [124, 114, 102], _smooth(0.35, 0.7, e) * 0.7);
                            if (hasWater && e < 0.012 && localC > 4) rgb = _mixRGB(rgb, [220, 204, 160], 0.6);
                            if (localC < -8) rgb = _mixRGB(rgb, [240, 244, 248], _smooth(-8, -16, localC));
                        }
                    } else if (kind === 'barren') {
                        rgb = _ramp([[0, [66, 68, 72]], [0.45, [104, 106, 110]], [0.55, [136, 138, 142]], [1, [184, 186, 190]]], h);
                        if (climate.kelvin > 350) rgb = _mixRGB(rgb, [150, 120, 96], 0.25);
                    } else if (kind === 'ice') {
                        rgb = _ramp([[0, [146, 170, 194]], [0.5, [212, 224, 234]], [1, [246, 249, 252]]], h);
                        rgb = _mixRGB(rgb, [164, 112, 90], _smooth(0.72, 0.95, rough[i]) * 0.65);
                    } else if (kind === 'hot') {
                        rgb = _ramp([[0, [34, 22, 20]], [0.6, [70, 44, 34]], [1, [110, 80, 60]]], h);
                        const melt = Math.max(_smooth(0.74, 0.92, rough[i]), _smooth(sea, sea - 0.06, h));
                        if (melt > 0) {
                            rgb = _mixRGB(rgb, [255, 140, 50], melt * 0.85);
                            lavaImage.data[k] = 255; lavaImage.data[k + 1] = 120 + melt * 90; lavaImage.data[k + 2] = 40;
                            lavaImage.data[k + 3] = melt * 255;
                        }
                    } else if (kind === 'exotic') {
                        rgb = _ramp([[0, [82, 80, 38]], [0.5, [138, 128, 64]], [1, [184, 170, 96]]], h);
                    } else if (kind === 'storm') {
                        rgb = _ramp([[0, [60, 70, 100]], [1, [140, 150, 184]]], h);
                    } else {
                        rgb = _ramp([[0, [56, 72, 38]], [0.6, [110, 130, 62]], [1, [162, 184, 96]]], h);
                    }
                    // Relief: slopes darken a little, measured per unit of radius so
                    // every size bucket shades alike, and it reads at any sun angle.
                    const right = px + 1 < size && height[i + 1] >= 0 ? elevation(i + 1) : e;
                    const down = py + 1 < size && height[i + size] >= 0 ? elevation(i + size) : e;
                    const perRadius = size / 2;
                    const slope = Math.hypot(right - e, down - e) * perRadius;
                    const facet = Math.max(-0.1, Math.min(0.1, (e - right) * perRadius * 0.06));
                    relief = 1 - Math.min(0.2, slope * 0.06) + facet + fine * 0.1;
                }
                data[k] = Math.max(0, Math.min(255, rgb[0] * relief));
                data[k + 1] = Math.max(0, Math.min(255, rgb[1] * relief));
                data[k + 2] = Math.max(0, Math.min(255, rgb[2] * relief));
                data[k + 3] = 255;
            }
            if (py % rowsPerStep === rowsPerStep - 1) yield;
        }
        ctx.putImageData(image, 0, 0);
        if (ocean) ocean.getContext('2d').putImageData(oceanImage, 0, 0);
        if (lava) lava.getContext('2d').putImageData(lavaImage, 0, 0);
        yield;

        const half = size / 2;
        if (kind === 'barren' || kind === 'rad' || (kind === 'desert' && !climate.life && climate.atm <= 3)) {
            // Craters, most of them small: a dark floor, a pale rim, and a few bright young rays.
            const craters = kind === 'barren' ? 60 : 22;
            for (let n = 0; n < craters; n++) {
                const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.94;
                const cr = size * 0.09 * Math.pow(rand(), 2.4) * (1 - d * 0.45) + size * 0.004;
                const cx = half + Math.cos(a) * d * half, cy = half + Math.sin(a) * d * half;
                const floor = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
                floor.addColorStop(0, 'rgba(30, 30, 34, 0.38)');
                floor.addColorStop(0.8, 'rgba(30, 30, 34, 0.22)');
                floor.addColorStop(1, 'rgba(30, 30, 34, 0)');
                ctx.fillStyle = floor;
                ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(236, 236, 240, 0.22)';
                ctx.lineWidth = Math.max(0.5, cr * 0.16);
                ctx.beginPath(); ctx.arc(cx, cy, cr * 0.95, 0, Math.PI * 2); ctx.stroke();
                if (cr > size * 0.03 && rand() < 0.2) {
                    const rays = ctx.createRadialGradient(cx, cy, cr, cx, cy, cr * 3);
                    rays.addColorStop(0, 'rgba(240, 240, 244, 0.16)');
                    rays.addColorStop(1, 'rgba(240, 240, 244, 0)');
                    ctx.fillStyle = rays;
                    ctx.beginPath(); ctx.arc(cx, cy, cr * 3, 0, Math.PI * 2); ctx.fill();
                }
            }
        }
        if (kind === 'gas') {
            // A ring of cyclones around the pole, each a pale core in a dark collar.
            const ringCount = 5 + Math.floor(rand() * 4);
            for (let n = 0; n < ringCount + 1; n++) {
                const a = n / ringCount * Math.PI * 2 + rand() * 0.4, d = n === ringCount ? 0 : 0.13 + rand() * 0.06;
                const cr = size * (0.028 + rand() * 0.018);
                const cx = half + Math.cos(a) * d * half, cy = half + Math.sin(a) * d * half;
                const swirl = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
                swirl.addColorStop(0, `rgba(${gas.zone.join(',')}, 0.55)`);
                swirl.addColorStop(0.55, `rgba(${gas.pole.join(',')}, 0.45)`);
                swirl.addColorStop(1, `rgba(${gas.pole.join(',')}, 0)`);
                ctx.fillStyle = swirl;
                ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
            }
            // Storm ovals ride their latitude, so they are laid along it.
            for (let n = 0; n < 3; n++) {
                const a = rand() * Math.PI * 2, d = 0.4 + rand() * 0.45;
                const sr = size * (n === 0 ? 0.075 : 0.03 + rand() * 0.02);
                const cx = half + Math.cos(a) * d * half, cy = half + Math.sin(a) * d * half;
                ctx.save();
                ctx.translate(cx, cy); ctx.rotate(a + Math.PI / 2); ctx.scale(1.8, 1);
                const storm = ctx.createRadialGradient(0, 0, 0, 0, 0, sr);
                const tone = n === 0 ? gas.storm : gas.zone;
                storm.addColorStop(0, `rgba(${tone.join(',')}, 0.9)`);
                storm.addColorStop(0.7, `rgba(${tone.join(',')}, 0.55)`);
                storm.addColorStop(1, `rgba(${tone.join(',')}, 0)`);
                ctx.fillStyle = storm;
                ctx.beginPath(); ctx.arc(0, 0, sr, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        }

        const world = { surface, blur: null, clouds: null, shade: null, ocean, lava, lights: null,
            profile: { air: climate.air > 0 ? _airColor(kind, climate, body) : null, strength: climate.air, gas: kind === 'gas' } };

        // Clouds: zonal streaks and a few cyclones, cover set by the air and water.
        let cover = 0;
        if (kind === 'exotic' || (kind === 'hot' && climate.atm >= 10)) cover = 0.92;
        else if (kind === 'storm') cover = 0.8;
        else if (terran && !oxide) cover = Math.min(0.72, 0.1 + climate.air * 0.38 * (0.5 + climate.water));
        else if (oxide) cover = climate.air * 0.12;
        else if (kind === 'ice' || kind === 'rad') cover = climate.air * 0.2;
        if (cover > 0.03) {
            const cloudNoise = _noise3(seed ^ 0x5bd1e995);
            const cloudWarp = _noise3(seed ^ 0x3c6ef372);
            const vortices = [];
            for (let n = 0; n < 3; n++) {
                const a = rand() * Math.PI * 2, d = 0.3 + rand() * 0.55;
                vortices.push([Math.cos(a) * d, Math.sin(a) * d, 0.08 + rand() * 0.1, (rand() < 0.5 ? -1 : 1) * (3 + rand() * 3)]);
            }
            const density = new Float32Array(count);
            for (let py = 0; py < size; py++) {
                for (let px = 0; px < size; px++) {
                    const p = _disc(px, py, size);
                    if (!p) continue;
                    let [u, v, z] = p;
                    for (const [vx, vy, vr, turn] of vortices) {
                        const dx = u - vx, dy = v - vy, fall = Math.exp(-(dx * dx + dy * dy) / (vr * vr));
                        if (fall < 0.01) continue;
                        const ang = turn * fall, c = Math.cos(ang), s = Math.sin(ang);
                        u = vx + dx * c - dy * s; v = vy + dx * s + dy * c;
                    }
                    const w = _fbm(cloudWarp, u * 2 + 7, v * 2 + 3, z * 6, 3) - 0.5;
                    density[py * size + px] = _fbm(cloudNoise, (u + w * 0.5) * 2.6, (v + w * 0.5) * 2.6, z * 8 + w, 5);
                }
                if (py % rowsPerStep === rowsPerStep - 1) yield;
            }
            const values = [];
            for (let n = 0; n < 2000; n++) {
                const i = Math.floor(rand() * count);
                if (height[i] >= 0) values.push(density[i]);
            }
            values.sort((a, b) => a - b);
            const edge = values[Math.floor((values.length - 1) * (1 - cover))] ?? 0.6;
            const tone = kind === 'exotic' || kind === 'hot' ? [238, 222, 168] : kind === 'storm' ? [226, 232, 246] : oxide ? [240, 214, 190] : [255, 255, 255];
            const clouds = _canvas(size), cctx = clouds.getContext('2d');
            const shade = _canvas(size), sctx = shade.getContext('2d');
            const cimg = cctx.createImageData(size, size), simg = sctx.createImageData(size, size);
            for (let i = 0; i < count; i++) {
                if (height[i] < 0) continue;
                const a = _smooth(edge - 0.02, edge + 0.12, density[i]);
                if (!a) continue;
                const k = i * 4;
                const lift = 0.86 + _smooth(edge, edge + 0.25, density[i]) * 0.14;
                cimg.data[k] = tone[0] * lift; cimg.data[k + 1] = tone[1] * lift; cimg.data[k + 2] = tone[2] * lift;
                cimg.data[k + 3] = a * 235;
                simg.data[k + 3] = a * 150;
            }
            cctx.putImageData(cimg, 0, 0);
            sctx.putImageData(simg, 0, 0);
            world.clouds = clouds;
            world.shade = shade;
            yield;
        }

        // City lights come from population alone: none on an empty world, and
        // roughly doubling with each population digit. Lights gather in
        // cities of falling size, on dry ground where the world has seas.
        if (climate.pop > 0) {
            const lights = _canvas(size), lctx = lights.getContext('2d');
            const dryOnly = hasWater;
            const ground = (px, py) => {
                if (px < 0 || py < 0 || px >= size || py >= size) return false;
                const h = height[Math.floor(py) * size + Math.floor(px)];
                return h >= 0 && (!dryOnly || h >= sea);
            };
            const total = Math.round(3 * Math.pow(1.95, climate.pop));
            const cityCount = Math.min(64, 1 + climate.pop * 4);
            const cities = [];
            for (let tries = 0; cities.length < cityCount && tries < cityCount * 40; tries++) {
                const px = rand() * size, py = rand() * size;
                if (ground(px, py)) cities.push([px, py]);
            }
            // Zipf: the largest city holds the most lights.
            const shares = cities.map((_, n) => 1 / (n + 1));
            const shareSum = shares.reduce((a, b) => a + b, 0) || 1;
            const dot = Math.max(0.45, size / 440);
            const bright = Math.min(1, 0.45 + climate.pop * 0.06);
            for (let c = 0; c < cities.length; c++) {
                const [cx, cy] = cities[c];
                const lightsHere = Math.max(1, Math.round(total * shares[c] / shareSum));
                const spread = size * (0.006 + 0.03 * Math.sqrt(shares[c]));
                for (let n = 0; n < lightsHere; n++) {
                    const a = rand() * Math.PI * 2, d = spread * Math.sqrt(-2 * Math.log(1 - rand() * 0.98)) * 0.55;
                    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
                    if (!ground(px, py)) continue;
                    const r = dot * (0.6 + rand() * 1.1);
                    const glow = lctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
                    glow.addColorStop(0, `rgba(255, 214, 150, ${(bright * (0.55 + rand() * 0.45)).toFixed(2)})`);
                    glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
                    lctx.fillStyle = glow;
                    lctx.fillRect(px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
                }
                yield;
            }
            world.lights = lights;
        }
        return world;
    }
    function _paintWorld(body, kind, size) {
        const steps = _paintWorldSteps(body, kind, size);
        let step = steps.next();
        while (!step.done) step = steps.next();
        return step.value;
    }
    // The painting averaged over a full turn: what a fast spin looks like.
    function _blurredSurface(world) {
        if (world.blur) return world.blur;
        const size = world.surface.width;
        const blur = _canvas(size);
        const ctx = blur.getContext('2d');
        ctx.translate(size / 2, size / 2);
        const steps = 36;
        for (let i = 0; i < steps; i++) {
            ctx.globalAlpha = 1 / (i + 1);
            ctx.rotate(Math.PI * 2 / steps);
            ctx.drawImage(world.surface, -size / 2, -size / 2);
        }
        world.blur = blur;
        return blur;
    }

    // ── Light, fixed to the star ──────────────────────────────────────────
    // In a frame where +x points at the star, a pole-on sphere at (x, y) has
    // normal (x, y, z): sunlight is Lambert on x, the view is along z. So the
    // night side, the twilight, the haze, and the halo never change shape;
    // they are drawn once and turned toward the star.
    const _LIGHT_SIZE = 256;
    const _HALO = 0.16;
    const _lightCache = new Map();
    function _lightLayers(profile) {
        const key = `${_lightMode ? 'L' : 'D'}|${profile.gas ? 'g' : 'r'}|${profile.air ? profile.air.join(',') : '-'}|${profile.strength}`;
        let layers = _lightCache.get(key);
        if (layers) return layers;
        const size = _LIGHT_SIZE;
        const strength = profile.strength || 0;
        const ambient = _lightMode ? 0.45 : 0.045;
        const wrap = 0.04 + Math.min(strength, 1.4) * 0.1;
        const ink = _lightMode ? [96, 104, 118] : [2, 5, 12];
        const night = _canvas(size), nctx = night.getContext('2d'), nimg = nctx.createImageData(size, size);
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                const p = _disc(px, py, size);
                if (!p) continue;
                const [x, , z] = p;
                const diffuse = Math.pow(Math.max(0, Math.min(1, (x + wrap) / (1 + wrap))), 0.85);
                let light = ambient + (1 - ambient) * diffuse;
                light *= profile.gas ? 0.72 + 0.28 * Math.sqrt(z) : 0.9 + 0.1 * z;
                const k = (py * size + px) * 4;
                nimg.data[k] = ink[0]; nimg.data[k + 1] = ink[1]; nimg.data[k + 2] = ink[2];
                nimg.data[k + 3] = Math.round((1 - light) * 255);
            }
        }
        nctx.putImageData(nimg, 0, 0);
        layers = { night, glow: null };
        if (profile.air && strength > 0 && !_lightMode) {
            // Additive: haze thickening toward the limb, a sunset band at the
            // terminator, and a thin lit halo that wraps a little into the dark.
            const gsize = Math.round(size * (1 + _HALO));
            const glow = _canvas(gsize), gctx = glow.getContext('2d'), gimg = gctx.createImageData(gsize, gsize);
            const [ar, ag, ab] = profile.air;
            const shell = 0.03 + Math.min(strength, 1.4) * 0.035;
            const reach = 1 + _HALO;
            for (let py = 0; py < gsize; py++) {
                for (let px = 0; px < gsize; px++) {
                    const x = ((px + 0.5) / gsize * 2 - 1) * reach, y = ((py + 0.5) / gsize * 2 - 1) * reach;
                    const d = Math.hypot(x, y);
                    if (d > reach) continue;
                    const facing = x / Math.max(d, 0.0001);
                    const sunset = Math.exp(-(((facing + 0.02) / 0.14) ** 2)) * (profile.gas ? 0.2 : 0.65);
                    const cr = ar + (255 - ar) * sunset, cg = ag + (140 - ag) * sunset, cb = ab + (80 - ab) * sunset;
                    let amount;
                    if (d <= 1) {
                        const z = Math.sqrt(1 - d * d);
                        const path = Math.min(7, 1 / Math.max(z, 0.07));
                        amount = strength * 0.075 * Math.pow(path, 0.95) * _smooth(-0.22, 0.45, x);
                    } else {
                        const altitude = (d - 1) / shell;
                        const limb = strength * 0.075 * Math.pow(7, 0.95);
                        amount = limb * Math.exp(-altitude * 1.6) * (1 + 0.6 * Math.exp(-altitude * 6))
                            * _smooth(-0.45, 0.45, facing) * _smooth(reach, 1 + _HALO * 0.45, d);
                    }
                    if (amount < 0.004) continue;
                    const k = (py * gsize + px) * 4;
                    gimg.data[k] = Math.min(255, cr * amount);
                    gimg.data[k + 1] = Math.min(255, cg * amount);
                    gimg.data[k + 2] = Math.min(255, cb * amount);
                    gimg.data[k + 3] = 255;
                }
            }
            gctx.putImageData(gimg, 0, 0);
            layers.glow = glow;
        }
        _lightCache.set(key, layers);
        return layers;
    }
    // Where emitted light shows, in the star frame: city lights only by
    // night, lava always but brightest by night.
    let _nightMasks = null;
    function _emissionMasks() {
        if (_nightMasks) return _nightMasks;
        const size = 128;
        const make = (dayLevel) => {
            const canvas = _canvas(size), ctx = canvas.getContext('2d'), img = ctx.createImageData(size, size);
            for (let py = 0; py < size; py++) {
                for (let px = 0; px < size; px++) {
                    const p = _disc(px, py, size);
                    if (!p) continue;
                    img.data[(py * size + px) * 4 + 3] = 255 * (dayLevel + (1 - dayLevel) * _smooth(0.06, -0.14, p[0]));
                }
            }
            ctx.putImageData(img, 0, 0);
            return canvas;
        };
        _nightMasks = { city: make(0), lava: make(0.35) };
        return _nightMasks;
    }
    // One scratch canvas masks a rotating layer against a star-fixed one.
    let _scratch = null;
    function _maskedLayer(layer, turn, mask, r, makeFirst) {
        const dpr = window.devicePixelRatio || 1;
        const size = Math.max(8, Math.ceil(r * 2 * dpr));
        if (!_scratch) _scratch = _canvas(size);
        if (_scratch.width < size) _scratch.width = _scratch.height = size;
        const sctx = _scratch.getContext('2d');
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        sctx.globalAlpha = 1;
        sctx.clearRect(0, 0, size, size);
        if (makeFirst) makeFirst(sctx, size);
        else {
            sctx.translate(size / 2, size / 2);
            sctx.rotate(turn);
            sctx.drawImage(layer, -size / 2, -size / 2, size, size);
            sctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        sctx.globalCompositeOperation = 'destination-in';
        if (mask) sctx.drawImage(mask, 0, 0, size, size);
        else {
            sctx.translate(size / 2, size / 2);
            sctx.rotate(turn);
            sctx.drawImage(layer, -size / 2, -size / 2, size, size);
            sctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        return size;
    }

    const _SURFACE_SIZES = [32, 64, 128, 256, 512];
    const _SURFACE_BUDGET = 24e6;
    let _surfacePixels = 0;
    function _surfaceSize(radius) {
        const px = radius * 2 * (window.devicePixelRatio || 1);
        return _SURFACE_SIZES.find(size => size >= px) || 512;
    }
    function _worldPixels(world) {
        const layers = [world.surface, world.clouds, world.shade, world.ocean, world.lava, world.lights, world.blur].filter(Boolean).length;
        return world.surface.width * world.surface.width * layers;
    }
    function _cacheWorld(key, world) {
        _surfaceCache.set(key, world);
        _surfacePixels += _worldPixels(world);
        for (const [old, stale] of _surfaceCache) {
            if (_surfacePixels <= _SURFACE_BUDGET || old === key) break;
            _surfaceCache.delete(old);
            _surfacePixels -= _worldPixels(stale);
        }
    }
    // The best painting on hand. A tiny one is painted at once, so a world
    // never shows bare; sharper ones are painted in frame time.
    function _surfaceFor(body, kind, radius) {
        const id = _surfaceId(body, kind);
        const want = _surfaceSize(radius);
        const key = `${id}@${want}`;
        const ready = _surfaceCache.get(key);
        if (ready) {
            _surfaceCache.delete(key);
            _surfaceCache.set(key, ready);
            return ready;
        }
        if (!_surfaceQueue.has(key)) _surfaceQueue.set(key, { body, kind, size: want, steps: null });
        for (const size of [..._SURFACE_SIZES].reverse()) {
            const have = _surfaceCache.get(`${id}@${size}`);
            if (have) return have;
        }
        const first = _paintWorld(body, kind, 32);
        _cacheWorld(`${id}@32`, first);
        _surfaceQueue.delete(`${id}@32`);
        return first;
    }
    function _paintQueuedSurfaces(budgetMs) {
        if (!_surfaceQueue.size) return;
        const start = performance.now();
        for (const [key, job] of _surfaceQueue) {
            if (_surfaceCache.has(key)) { _surfaceQueue.delete(key); continue; }
            job.steps ||= _paintWorldSteps(job.body, job.kind, job.size);
            let step = job.steps.next();
            while (!step.done && performance.now() - start < budgetMs) step = job.steps.next();
            if (!step.done) return;
            _surfaceQueue.delete(key);
            _cacheWorld(key, step.value);
        }
    }
    // 0 while a turn is easy to follow, 1 once it would strobe (about 3 turns
    // a second on screen).
    function _spinBlur(body) {
        if (!_motionOk() || _isTideLocked(body)) return 0;
        const hours = _siderealHours(body);
        if (!(hours > 0)) return 0;
        const t = Math.max(0, Math.min(1, (_visualRate * 24 / hours - 0.8) / 2.2));
        return t * t * (3 - 2 * t);
    }

    // Fallback for bodies too small to paint: the flat night half.
    function _shadeNight(ctx, x, y, radius, starX, starY) {
        if (!_showDayNight) return;
        const angle = Math.atan2(starY - y, starX - x) + Math.PI;
        ctx.save();
        ctx.fillStyle = _lightMode ? 'rgba(109, 116, 128, 0.55)' : 'rgba(0, 5, 15, 0.72)';
        ctx.beginPath();
        ctx.arc(x, y, radius, angle - Math.PI / 2, angle + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function _drawLitDisc(ctx, x, y, r, color, body, elapsedYears, starX, starY, parent = null) {
        if (_collectingPlanets) {
            _collectPlanet(x, y, r, body, elapsedYears, starX, starY, parent);
            return false;
        }
        if (_planetTiles && _offCanvas(x, y, r * 2.2)) return true;
        const tile = _planetTiles ? PlanetGL.tile(body) : null;
        if (tile) {
            const half = tile.size / 2 / (window.devicePixelRatio || 1) / tile.scale;
            ctx.drawImage(PlanetGL.canvas, tile.sx, tile.sy, tile.size, tile.size, x - half, y - half, half * 2, half * 2);
            return true;
        }
        const kind = _showDayNight && r >= 2.5 && !_measuringFrame ? surfaceKind(body) : null;
        if (!kind || kind === 'star' || kind === 'belt' || kind === 'ring') {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            _shadeNight(ctx, x, y, r, starX, starY);
            return;
        }
        const world = _surfaceFor(body, kind, r);
        const light = _lightLayers(world.profile);
        const starAngle = Math.atan2(starY - y, starX - x);
        const spin = _spinAngle(body, elapsedYears, starAngle);
        const blur = _spinBlur(body);
        const turn = spin - starAngle;
        ctx.save();
        ctx.translate(x, y);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        // Ground, turning with the world's sidereal day.
        ctx.save();
        ctx.rotate(spin);
        if (blur < 1) ctx.drawImage(world.surface, -r, -r, r * 2, r * 2);
        if (blur > 0) {
            ctx.globalAlpha = blur;
            ctx.drawImage(_blurredSurface(world), -r, -r, r * 2, r * 2);
        }
        ctx.restore();
        ctx.rotate(starAngle);
        // Sun glint on open water, where the star's reflection meets the eye.
        if (world.ocean && r >= 12 && blur < 1 && !_lightMode) {
            const size = _maskedLayer(world.ocean, turn, null, r, (sctx, s) => {
                const gx = s / 2 + s / 2 * 0.7, gy = s / 2;
                const glint = sctx.createRadialGradient(gx, gy, 0, gx, gy, s * 0.16);
                glint.addColorStop(0, 'rgba(255, 246, 226, 0.75)');
                glint.addColorStop(0.35, 'rgba(255, 236, 200, 0.25)');
                glint.addColorStop(1, 'rgba(255, 236, 200, 0)');
                sctx.fillStyle = glint;
                sctx.fillRect(0, 0, s, s);
            });
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 1 - blur;
            ctx.drawImage(_scratch, 0, 0, size, size, -r, -r, r * 2, r * 2);
            ctx.restore();
        }
        // Weather runs a little ahead of the ground; its shadow falls away from the star.
        if (world.clouds) {
            const drift = spin * 1.08 - starAngle;
            const alpha = 1 - blur * 0.85;
            ctx.save();
            ctx.translate(-r * 0.025, 0);
            ctx.rotate(drift);
            ctx.globalAlpha = alpha * 0.8;
            ctx.drawImage(world.shade, -r, -r, r * 2, r * 2);
            ctx.restore();
            ctx.save();
            ctx.rotate(drift);
            ctx.globalAlpha = alpha;
            ctx.drawImage(world.clouds, -r, -r, r * 2, r * 2);
            ctx.restore();
        }
        // Night, twilight, and the dimming toward the limb.
        ctx.drawImage(light.night, -r, -r, r * 2, r * 2);
        // Emitted light after dark: cities, and lava that never quite goes out.
        if (!_lightMode && r >= 4) {
            const masks = _emissionMasks();
            for (const [layer, mask, strength] of [[world.lights, masks.city, 0.95], [world.lava, masks.lava, 0.9]]) {
                if (!layer) continue;
                const size = _maskedLayer(layer, turn, mask, r);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = strength * (1 - blur * 0.8);
                ctx.drawImage(_scratch, 0, 0, size, size, -r, -r, r * 2, r * 2);
                ctx.restore();
            }
        }
        ctx.restore();
        // Air: haze across the disc and the lit halo past the limb.
        if (light.glow && r >= 3) {
            const reach = r * (1 + _HALO);
            ctx.rotate(starAngle);
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(light.glow, -reach, -reach, reach * 2, reach * 2);
        }
        ctx.restore();
    }

    // Plain-text rotation for the inspector, from the same rules as the tooltip.
    function rotationText(body) {
        if (_isTideLocked(body)) return 'Tidally locked';
        const hours = _siderealHours(body);
        if (!(hours > 0)) return '';
        return `${formatDisplayNumber(hours, 1, 'h')}${body.axialTilt > 90 ? ', retrograde' : ''}`;
    }

    function _rotationNote(body) {
        if (_isTideLocked(body)) return '<div>Rotation: tidally locked</div>';
        const hours = _siderealHours(body);
        if (!(hours > 0)) return '';
        const retro = body.axialTilt > 90 ? ', retrograde' : '';
        return `<div>Sidereal day: ${formatDisplayNumber(hours, 1, 'h')}${retro}</div>`;
    }

    // A highport: a station in low orbit, drawn as a small lit structure, not a
    // moon. Its period comes from the world's own size and gravity (a circular
    // orbit a few hundred kilometres up); it circles in the equatorial plane
    // and passes behind the world and through its shadow.
    function _highportPeriodYears(body) {
        const radiusM = Number(body.diamKm) > 0 ? body.diamKm * 500 : null;
        const g = Number(body.gravity) > 0 ? body.gravity * 9.81 : null;
        const seconds = radiusM && g ? 2 * Math.PI * Math.sqrt(Math.pow(radiusM * 1.06, 3) / (g * radiusM * radiusM)) : 90 * 60;
        return seconds / (365.25 * 86400);
    }
    // Highport art: one painted station per starport class (assets/starports),
    // loaded the first time a highport is drawn. Each entry crops the art to
    // its opaque bounds, names the hub the station turns about, and places its
    // navigation lights (red to port, green to starboard, by the side of the
    // hub each tip lies on) and white anti-collision strobes on the real spar
    // tips of that painting. Coordinates are fractions of the cropped half
    // width and half height, from the crop's centre. Class D has no art of
    // its own and borrows E's.
    const _HIGHPORT_ART = {
        A: { file: 'highport-a.png', crop: [22, 22, 359, 364], pivot: [0, 0],
             nav: [[0.92, -0.89], [0.92, 0.89], [-0.92, 0.89], [-0.92, -0.89]],
             strobe: [[0, -0.98], [0.98, 0], [0, 0.98], [-0.98, 0]] },
        B: { file: 'highport-b.png', crop: [17, 17, 282, 286], pivot: [0, 0],
             nav: [[0.9, -0.85], [0.85, 0.9], [-0.86, 0.9], [-0.9, -0.85]],
             strobe: [[0, -0.98], [0.98, 0], [0, 0.98], [-0.98, 0]] },
        C: { file: 'highport-c.png', crop: [16, 17, 267, 244], pivot: [0.1, 0],
             nav: [[0.96, -0.94], [0.96, 0.95], [-1, -0.05]],
             strobe: [[0.96, -0.48], [0.99, 0.42]] },
        E: { file: 'highport-e.png', crop: [12, 12, 178, 206], pivot: [0, 0.2],
             nav: [[1, 0.2], [-1, 0.19]],
             strobe: [[0.04, -0.98], [0, 1]] }
    };
    _HIGHPORT_ART.D = _HIGHPORT_ART.E;
    function _highportArt(cls) {
        const art = _HIGHPORT_ART[cls] || _HIGHPORT_ART.E;
        if (!art.img) {
            art.img = new Image();
            art.img.onload = () => { art.ready = true; };
            art.img.src = 'assets/starports/' + art.file;
        }
        return art;
    }
    // The painting is a few hundred pixels across and shows on screen at a
    // few dozen at most, so each on-screen size gets one careful downscale,
    // kept, instead of a fresh resample every frame. A shaded copy (the hull
    // in the world's shadow, windows still faintly lit) is made alongside.
    const _highportMips = new Map();
    function _highportSprite(art, widthPx) {
        const w = Math.max(4, Math.min(320, Math.ceil(widthPx / 4) * 4));
        const key = `${art.file}:${w}`;
        let mip = _highportMips.get(key);
        if (mip) return mip;
        const [sx, sy, sw, sh] = art.crop;
        const h = Math.max(4, Math.round(w * sh / sw));
        const lit = _canvas(w); lit.height = h;
        const c = lit.getContext('2d');
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(art.img, sx, sy, sw, sh, 0, 0, w, h);
        const dark = _canvas(w); dark.height = h;
        const d = dark.getContext('2d');
        d.drawImage(lit, 0, 0);
        d.globalCompositeOperation = 'source-atop';
        d.fillStyle = 'rgba(10, 18, 36, 0.5)';
        d.fillRect(0, 0, w, h);
        mip = { lit, dark, w, h };
        _highportMips.set(key, mip);
        return mip;
    }
    // The station's orbit lasts about ninety minutes, so at any time rate
    // beyond a few minutes per second it would jump around the world several
    // times a second. Its drawn angle follows the true one at up to a turn
    // every six seconds or so and falls behind past that: scenery that moves
    // gracefully rather than scenery that strobes. Nothing reads it back.
    const _highportAngles = new WeakMap();
    function _highportAngle(body, want) {
        const MAX_RATE = 1.1;   // radians per second of wall time
        let st = _highportAngles.get(body);
        if (!st) { st = { angle: want, want }; _highportAngles.set(body, st); return want; }
        const delta = want - st.want;
        st.want = want;
        const cap = MAX_RATE * Math.max(_frameDt, 1 / 240);
        st.angle += Math.max(-cap, Math.min(cap, delta));
        return st.angle;
    }
    function _drawHighport(ctx, body, x, y, r, elapsedYears, starX, starY, front) {
        if (_collectingPlanets || _lineup !== 'orbits' || !window.PlanetProfile) return;
        const kind = PlanetProfile.kind(body);
        if (!kind || kind === 'belt') return;
        const profile = PlanetProfile.of(body, _surfaceId(body, kind));
        if (!profile.port?.high || r < 1.5) return;
        const basis = window.PlanetGL?.axisBasis ? PlanetGL.axisBasis(profile, profile.rotation.locked ? 0 : profile.rotation.tilt)
            : { e1: [1, 0, 0], e2: [0, 1, 0] };
        const orbitR = Math.max(r * 1.3, r + 7);
        const t = _highportAngle(body, _hashEpoch(`${_hexId}:highport`) + (2 * Math.PI / _highportPeriodYears(body)) * elapsedYears);
        const vx = Math.cos(t) * basis.e1[0] + Math.sin(t) * basis.e2[0];
        const vy = Math.cos(t) * basis.e1[1] + Math.sin(t) * basis.e2[1];
        const vz = Math.cos(t) * basis.e1[2] + Math.sin(t) * basis.e2[2];
        const sx = x + vx * orbitR, sy = y + vy * orbitR;
        // Drawn in two passes: the far half before the world, the near half after.
        const behind = vz < 0;
        if (behind === front) {
            if (front && _showOrbits && _orbitOpacity > 0) {
                // The station's path, faint, as an ellipse in the equatorial plane.
                ctx.save();
                ctx.strokeStyle = `rgba(190, 240, 255, ${(0.18 * _orbitOpacity).toFixed(3)})`;
                ctx.setLineDash([2, 4]);
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let k = 0; k <= 64; k++) {
                    const a = k / 64 * Math.PI * 2;
                    const px = x + (Math.cos(a) * basis.e1[0] + Math.sin(a) * basis.e2[0]) * orbitR;
                    const py = y + (Math.cos(a) * basis.e1[1] + Math.sin(a) * basis.e2[1]) * orbitR;
                    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
                }
                ctx.stroke();
                ctx.restore();
            }
            return;
        }
        if (behind && Math.hypot(sx - x, sy - y) < r) return;
        // In the world's shadow: the station's own lights stay on, the sunlit hull goes dark.
        const toStar = Math.atan2(starY - y, starX - x);
        const along = vx * Math.cos(toStar) + vy * Math.sin(toStar);
        const across = Math.abs(-vx * Math.sin(toStar) + vy * Math.cos(toStar)) * orbitR;
        const shaded = along < 0 && across < r;
        // Half width of the station on screen: a quarter of the world's radius,
        // never below 4 px so it reads, never above 18 so it stays a station.
        const size = Math.max(4, Math.min(18, r * 0.24));
        const now = _motionOk() ? performance.now() / 1000 : 0;
        const phase = _hashEpoch(`${_hexId}:highport:lights`);
        const art = _highportArt(profile.port.cls);
        const [cr, cg, cb] = profile.port.color;
        const aspect = art.crop[3] / art.crop[2];
        const sizeY = size * aspect;
        const ox = -art.pivot[0] * size, oy = -art.pivot[1] * sizeY;   // hub to the station's point
        const lampR = Math.max(0.7, size * 0.075);                       // one navigation light
        ctx.save();
        ctx.translate(sx, sy);
        // Running lights: the whole station's wash, breathing slowly.
        const breathe = 0.85 + 0.15 * Math.sin(now * 1.3 + phase);
        const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
        wash.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${((shaded ? 0.22 : 0.34) * breathe).toFixed(3)})`);
        wash.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${((shaded ? 0.08 : 0.12) * breathe).toFixed(3)})`);
        wash.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = wash;
        ctx.fillRect(-size * 2.6, -size * 2.6, size * 5.2, size * 5.2);
        // The station turns slowly about its hub, on the wall clock alone: the
        // orbital angle steps in jumps whenever simulated time runs faster
        // than real time, and a spin tied to it snaps instead of turning.
        ctx.rotate(now * 0.25 + phase);
        if (art.ready) {
            const dpr = window.devicePixelRatio || 1;
            const mip = _highportSprite(art, size * 2 * dpr);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(shaded ? mip.dark : mip.lit, ox - size, oy - sizeY, size * 2, sizeY * 2);
        }
        // The hub's own glow, pulsing, over the painted core.
        ctx.globalCompositeOperation = 'lighter';
        const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now * 2.1 + phase));
        const hub = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.3);
        hub.addColorStop(0, `rgba(255, 250, 225, ${(0.6 * pulse).toFixed(3)})`);
        hub.addColorStop(0.45, `rgba(${cr}, ${cg}, ${cb}, ${(0.25 * pulse).toFixed(3)})`);
        hub.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = hub;
        ctx.fillRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);
        const lamp = (lx, ly, rgb, on) => {
            const a = on ? 1 : 0.22;
            const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, lampR * 2.6);
            halo.addColorStop(0, `rgba(${rgb}, ${(0.4 * a).toFixed(3)})`);
            halo.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = halo;
            ctx.fillRect(lx - lampR * 2.6, ly - lampR * 2.6, lampR * 5.2, lampR * 5.2);
            ctx.fillStyle = `rgba(${rgb}, ${(0.95 * a).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(lx, ly, lampR, 0, Math.PI * 2); ctx.fill();
        };
        // Navigation lights: red to port, green to starboard, blinking in turn.
        const blink = Math.floor(now * 1.2 + phase) % 2;
        art.nav.forEach(([nx, ny]) => {
            const starboard = nx - art.pivot[0] > 0;
            lamp(nx * size + ox, ny * sizeY + oy, starboard ? '70, 255, 140' : '255, 70, 70',
                starboard ? blink === 0 : blink === 1);
        });
        // Anti-collision strobes: a white double flash every second and a half.
        // With motion reduced they simply stay lit.
        const cycle = (now + phase * 0.3) % 1.5;
        const flash = !now || cycle < 0.07 || (cycle > 0.18 && cycle < 0.25);
        if (flash) art.strobe.forEach(([nx, ny]) => lamp(nx * size + ox, ny * sizeY + oy, '255, 255, 255', true));
        ctx.restore();
        if (_scanView && r >= 6) {
            ctx.save();
            ctx.font = '600 9px ui-monospace, "Cascadia Mono", Consolas, monospace';
            ctx.fillStyle = 'rgba(190, 240, 255, 0.85)';
            ctx.fillText(`HIGHPORT ${profile.port.cls}`, sx + size + 5, sy - size - 3);
            ctx.restore();
        }
    }

    function _drawWorld(ctx, w, px, py, elapsed_years, wIdx, starX, starY) {
        const r     = _worldBodyRadius(w);
        const color = _worldColor(w);
        _drawHighport(ctx, w, px, py, r, elapsed_years, starX, starY, false);
        _drawLitDisc(ctx, px, py, r, color, w, elapsed_years, starX, starY);
        _drawHighport(ctx, w, px, py, r, elapsed_years, starX, starY, true);
        // Rings shaded on the GPU replace the flat circles; clicks land on the real band.
        const gpuRings = _planetTiles ? PlanetGL.tile(w)?.rings : null;
        const ringHit = body => _hitBodies.push({ kind: body.size === 'R' ? 'moon' : 'ring', body, cx: px, cy: py,
            r: gpuRings.outer * r, innerR: gpuRings.inner * r });

        const moons = (w.moons || []).filter(m => m.type !== 'Empty');
        // Moon paths use the same "Show orbit rings" control as planetary orbits.
        // Rings (size R) already have _drawStaticRing and are not discrete orbits.
        if (!_hideMoons && _showOrbits && _orbitOpacity > 0) {
            const moonAlpha = _lightMode ? _orbitOpacity * 0.65 : _orbitOpacity * 0.40;
            moons.forEach((m, mi) => {
                if (m.size === 'R') return;
                const mDist = _moonOrbitRadius(r, mi, w);
                if (mDist < 2) return;
                ctx.beginPath();
                ctx.arc(px, py, mDist, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(69, 162, 158, ${moonAlpha.toFixed(3)})`;
                ctx.lineWidth = 1 + _orbitOpacity * 1.5;
                ctx.stroke();
            });
        }
        const ringMoons = moons.filter(m => m.size === 'R');
        if (!_hideMoons) moons.forEach((m, mi) => {
            const mDist = m.size === 'R'
                ? _ringOrbitRadius(r, ringMoons.indexOf(m), ringMoons.length)
                : _moonOrbitRadius(r, mi, w);

            // A Ring (CT: size === 'R', from either generation path — Bottom-Up also sets
            // type:'Ring' but Top-Down doesn't, so size is the one field both paths agree on)
            // is a band around the planet, not a discrete orbiting body — skip the per-frame
            // orbital angle entirely and draw a thin static circle instead.
            if (m.size === 'R') {
                if (gpuRings) { ringHit(m); return; }
                _drawStaticRing(ctx, px, py, mDist);
                _hitBodies.push({ kind: 'moon', body: m, cx: px, cy: py, r: mDist + 3 * _zoomScale(), innerR: Math.max(0, mDist - 3 * _zoomScale()) });
                return;
            }

            const period = _moonPeriodYears(m, w);
            const mAngle = _hashEpoch(_hexId + ':moon:' + wIdx + ':' + mi)
                         + (2 * Math.PI / period) * elapsed_years;
            const mx          = px + mDist * Math.cos(mAngle);
            const my          = py + mDist * Math.sin(mAngle);
            const isMainworld = m.type === 'Mainworld';
            const moonR       = _satelliteRadius(m);
            _drawHighport(ctx, m, mx, my, moonR, elapsed_years, starX, starY, false);
            const shadedOnGPU = _drawLitDisc(ctx, mx, my, moonR, '#6a7070', m, elapsed_years, starX, starY, w);
            _drawHighport(ctx, m, mx, my, moonR, elapsed_years, starX, starY, true);
            if (_showDayNight && !shadedOnGPU && !_collectingPlanets) {
                const cover = _easeEclipse(
                    `${_hexId}:${wIdx}:${mi}`,
                    _shadowCover(mx, my, px, py, r, starX, starY)
                );
                if (cover > 0.02) {
                    ctx.save();
                    const wash = ctx.createRadialGradient(mx, my, moonR * 0.15, mx, my, moonR);
                    const ink = _lightMode ? '109, 116, 128' : '8, 12, 18';
                    wash.addColorStop(0, `rgba(${ink}, ${(cover * 0.94).toFixed(3)})`);
                    wash.addColorStop(0.7, `rgba(${ink}, ${(cover * 0.82).toFixed(3)})`);
                    wash.addColorStop(1, `rgba(${ink}, ${(cover * 0.28).toFixed(3)})`);
                    ctx.fillStyle = wash;
                    ctx.beginPath();
                    ctx.arc(mx, my, moonR, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
            if (isMainworld) _drawMainworldStar(ctx, mx, my, moonR);

            if (_lineup === 'orbits' && isMainworld && m.name && !_hideMainworldHighlight) {
                ctx.save();
                ctx.fillStyle = _lightMode ? '#0d6b64' : '#66fcf1';
                ctx.font      = '10px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(m.name, mx, my - moonR - 5);
                ctx.restore();
            }

            _hitBodies.push({ kind: 'moon', body: m, cx: mx, cy: my, r: Math.max(moonR + 6 * _zoomScale(), 9), visualR: moonR });
        });

        // MgT2E rings: RAW's "moon-size roll comes up Ring" outcome is stored on the planet
        // itself (w.rings[]), not inside w.moons[] the way CT's is — see mgt2e_world_engine.js's
        // moon-size-roll-of-'R' branches, which push({}) onto w.rings instead of w.moons. Not
        // interleaved with the moon index sequence above, so rings get their own close-in offset.
        const rings = w.rings || [];
        if (!_hideMoons) rings.forEach((rg, ri) => {
            if (gpuRings) { ringHit(rg); return; }
            const rDist = _ringOrbitRadius(r, ri, rings.length);
            _drawStaticRing(ctx, px, py, rDist);
            _hitBodies.push({ kind: 'ring', body: rg, cx: px, cy: py, r: rDist + 3 * _zoomScale(), innerR: Math.max(0, rDist - 3 * _zoomScale()) });
        });

        if (w.type === 'Mainworld') _drawMainworldStar(ctx, px, py, r);
        if (_lineup === 'orbits' && w.type === 'Mainworld' && w.name && !_hideMainworldHighlight) {
            ctx.save();
            ctx.fillStyle = _lightMode ? '#0d6b64' : '#66fcf1';
            ctx.font      = '11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(w.name, px, py - r - 8);
            ctx.restore();
        }

        _hitBodies.push({ kind: 'world', body: w, cx: px, cy: py, r: Math.max(r + 9 * _zoomScale(), 14), visualR: r });
    }

    function _drawBeltRing(ctx, cx, cy, r, isMainworld = false, dashOffset = 0) {
        if (r < 2 || r > _MAX_DASHED_RING_RADIUS) return;
        ctx.save();
        ctx.strokeStyle    = isMainworld ? '#4fc3a188' : '#88888855';
        ctx.lineWidth      = isMainworld ? 7 : 5;
        ctx.setLineDash([3, 7]);
        _strokeVisibleCircle(ctx, cx, cy, r, 10, dashOffset);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ── Wheel: zoom toward mouse (orbits and body discs both scale) ───────────

    function _onWheel(e) {
        e.preventDefault();
        e.stopPropagation();
        const direction = e.deltaY < 0 ? 1 : -1;
        const factor    = 1.15;
        const rect      = _orrCanvas.getBoundingClientRect();
        const cx        = _canvasW / 2;
        const cy        = _canvasH / 2;
        let   mx        = e.clientX - rect.left;
        let   my        = e.clientY - rect.top;

        // Snap to the exact center when the cursor is within a tight tolerance. Mouse
        // coordinates are always whole pixels, but a canvas with an odd width/height has
        // a fractional center (e.g. 357.5) — that sub-pixel gap gets multiplied by `factor`
        // on every tick (offset ~= gap * (1 - factor^n)), so it compounds into a pan large
        // enough to fling the primary off-screen well before reaching deep zoom levels,
        // even though the cursor never actually moved off center.
        const SNAP_PX = 3;
        if (_tracking) { mx = cx; my = cy; }
        if (Math.abs(mx - cx) <= SNAP_PX) mx = cx;
        if (Math.abs(my - cy) <= SNAP_PX) my = cy;

        _fitCamera(true);
        if (direction > 0) {
            const newZoom = Math.min(_viewZoom * factor, _MAX_ZOOM);
            const ratio   = newZoom / _viewZoom;
            _viewOffX = mx - cx - (mx - cx - _viewOffX) * ratio;
            _viewOffY = my - cy - (my - cy - _viewOffY) * ratio;
            _viewZoom = newZoom;
            _atFit = false;
            _redraw();
        } else {
            const newZoom = Math.max(_minZoom, _viewZoom / factor);
            if (newZoom <= _minZoom * 1.001) {
                fitView();
            } else {
                const ratio = newZoom / _viewZoom;
                _viewOffX = mx - cx - (mx - cx - _viewOffX) * ratio;
                _viewOffY = my - cy - (my - cy - _viewOffY) * ratio;
                _viewZoom = newZoom;
                _redraw();
            }
        }
    }

    // ── Drag-to-pan ───────────────────────────────────────────────────────────

    function _onMouseDown(e) {
        if (e.button !== 0) return;
        _dragging = true;
        _dragLast = { x: e.clientX, y: e.clientY };
        _pointerDown = { x: e.clientX, y: e.clientY };
        _pointerMoved = false;
        _orrCanvas.style.cursor = 'move';
    }

    function _onWindowMouseMove(e) {
        if (!_dragging) return;
        if (_pointerDown && Math.hypot(e.clientX - _pointerDown.x, e.clientY - _pointerDown.y) > 4) _pointerMoved = true;
        _viewOffX += e.clientX - _dragLast.x;
        _viewOffY += e.clientY - _dragLast.y;
        if (_pointerMoved) { _atFit = false; _stopFollow(); }
        _dragLast  = { x: e.clientX, y: e.clientY };
        _hideTooltip();
        _redraw();
    }

    function _hitAtEvent(e) {
        if (!_orrCanvas) return null;
        const rect = _orrCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        return [..._hitBodies].reverse().find(b => {
            const dist = Math.hypot(mx - b.cx, my - b.cy);
            return dist <= b.r && (b.innerR === undefined || dist >= b.innerR);
        }) || null;
    }

    function _onWindowMouseUp(e) {
        if (!_dragging) return;
        _dragging = false;
        if (!_pointerMoved && e.button === 0 && e.target === _orrCanvas) {
            const hit = _hitAtEvent(e);
            if (hit && !window.CampaignAtlas?.pickBody(hit.body)) {
                if (selectBody(hit.body)) _followHit(hit);
                else _stopFollow();
            } else if (!hit) {
                _stopFollow();
            }
        }
        _pointerDown = null;
        if (_orrCanvas) _orrCanvas.style.cursor = _hitAtEvent(e) ? 'pointer' : 'default';
    }

    function _onDblClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.CampaignAtlas?.isPicking()) return;
        const hit = _hitAtEvent(e);
        if (hit) frameBody(hit.body);
        else fitView();
    }

    // ── Hover / tooltip ───────────────────────────────────────────────────────

    function _onMouseMove(e) {
        if (_dragging) return;
        const rect = _orrCanvas.getBoundingClientRect();
        const mx   = e.clientX - rect.left;
        const my   = e.clientY - rect.top;

        let hit = null;
        for (let i = _hitBodies.length - 1; i >= 0; i--) {
            const b  = _hitBodies[i];
            const dx = mx - b.cx;
            const dy = my - b.cy;
            const d  = Math.sqrt(dx * dx + dy * dy);
            if (b.innerR !== undefined) {
                if (d <= b.r && d >= b.innerR) { hit = b; break; }
            } else {
                if (d <= b.r) { hit = b; break; }
            }
        }

        if (hit) {
            _showTooltip(hit, e.clientX, e.clientY);
            _orrCanvas.style.cursor = 'pointer';
        } else {
            _hideTooltip();
            _orrCanvas.style.cursor = _dragging ? 'move' : 'default';
        }
    }

    function _showTooltip(hit, mx, my) {
        if (!_tooltip) return;
        const body    = hit.body;
        const TH      = _lightMode ? '#0d6b64' : '#66fcf1';   // tooltip heading colour
        const TSUB    = _lightMode ? '#4a5568' : '#8a8f94';   // tooltip secondary colour
        const TBORDER = _lightMode ? '#45a29eaa' : '#45a29e44';
        let html      = '';

        if (hit.kind === 'star') {
            const s = body;
            html += `<div style="color:${TH};margin-bottom:5px;border-bottom:1px solid ${TBORDER};padding-bottom:4px">`;
            html += `${s.name} <span style="color:${TSUB}">(${s.role || 'Primary'})</span></div>`;
            html += `<div>Type: ${s.sType}${s.subType ?? ''} ${s.sClass}</div>`;
            if (s.temp != null) html += `<div>Temperature: ${formatDisplayNumber(s.temp, 0, 'K')}</div>`;
            if (s.mass != null) html += `<div>Mass: ${formatDisplayNumber(s.mass, 3, 'M☉')}</div>`;
            if (s.diam != null) html += `<div>Diameter: ${formatDisplayNumber(s.diam, 3, 'D☉')}</div>`;
            if (s.lum != null) html += `<div>Luminosity: ${formatDisplayNumber(s.lum, 3, 'L☉')}</div>`;
            if (s.separation) html += `<div>Separation: ${s.separation}</div>`;
            if (s.role !== 'Primary') {
                const compAU = _starCompanionAU(s);
                if (compAU != null) html += `<div>Distance: ${formatDisplayNumber(compAU, 3, 'AU')}</div>`;
            }

        } else if (hit.kind === 'world') {
            const w = body;
            const _displayType = w.ggType ? `${w.type} ${w.ggType}` : (w.worldType || w.type);
            const typeTag = w.name
                ? ` <span style="color:${TSUB}">(${_displayType})</span>`
                : '';
            html += `<div style="color:${TH};margin-bottom:5px;border-bottom:1px solid ${TBORDER};padding-bottom:4px">`;
            html += `${w.name || w.type}${typeTag}</div>`;
            if (w.orbitId != null) html += `<div>Orbit #: ${formatDisplayNumber(w.orbitId, 2)}</div>`;
            if (w.au != null) html += `<div>Distance: ${formatDisplayNumber(w.au, 3, 'AU')}</div>`;
            if (w.eccentricity != null) html += `<div>Eccentricity: ${formatDisplayNumber(w.eccentricity, 3)}</div>`;
            if (w.uwp)             html += `<div style="margin-top:4px">UWP: <strong>${w.uwp}</strong></div>`;
            if (w.starport)        html += `<div>Starport: ${typeof formatUwpDigit === 'function' ? formatUwpDigit('starport', w.starport) : w.starport}</div>`;
            if (w.tl != null)      html += `<div>TL: ${w.tl}</div>`;
            if (w.tradeCodes && w.tradeCodes.length)
                                   html += `<div>Codes: ${typeof formatTradeCodes === 'function' ? formatTradeCodes(w.tradeCodes) : w.tradeCodes.join(' ')}</div>`;
            if (w.travelZone && w.travelZone !== 'G')
                                   html += `<div>Zone: ${w.travelZone}</div>`;
            if (w.diamKm != null) html += `<div style="margin-top:4px">Diameter: ${formatDisplayNumber(w.diamKm, 0, 'km')}</div>`;
            html += _rotationNote(w);
            if (w.mass != null) html += `<div>Mass: ${formatDisplayNumber(w.mass, 3, 'M⊕')}</div>`;
            if (w.gravity != null) html += `<div>Gravity: ${formatDisplayNumber(w.gravity, 2, 'G')}</div>`;
            if (w.meanTempK != null) html += `<div>Temperature: ${formatDisplayNumber(w.meanTempK, 0, 'K')}</div>`;
            const moons = (w.moons || []).filter(m => m.type !== 'Empty');
            if (moons.length)      html += `<div style="margin-top:4px">Moons: ${moons.length}</div>`;

        } else if (hit.kind === 'moon') {
            const m           = body;
            const isMainworld = m.type === 'Mainworld';
            const label       = m.name || (isMainworld ? 'Mainworld (Moon)' : 'Moon');
            const typeLabel   = isMainworld ? 'Mainworld Satellite' : 'Satellite';
            html += `<div style="color:${TH};margin-bottom:5px;border-bottom:1px solid ${TBORDER};padding-bottom:4px">`;
            html += `${label} <span style="color:${TSUB}">(${typeLabel})</span></div>`;
            if (m.pd != null) html += `<div>Orbit: ${formatDisplayNumber(m.pd, 2, 'PD')} from parent</div>`;
            if (m.uwp)             html += `<div style="margin-top:4px">UWP: <strong>${m.uwp}</strong></div>`;
            if (m.starport)        html += `<div>Starport: ${typeof formatUwpDigit === 'function' ? formatUwpDigit('starport', m.starport) : m.starport}</div>`;
            if (m.tl != null)      html += `<div>TL: ${m.tl}</div>`;
            if (m.tradeCodes && m.tradeCodes.length)
                                   html += `<div>Codes: ${typeof formatTradeCodes === 'function' ? formatTradeCodes(m.tradeCodes) : m.tradeCodes.join(' ')}</div>`;
            if (m.travelZone && m.travelZone !== 'G')
                                   html += `<div>Zone: ${m.travelZone}</div>`;
            if (m.diamKm != null) html += `<div style="margin-top:4px">Diameter: ${formatDisplayNumber(m.diamKm, 0, 'km')}</div>`;
            html += _rotationNote(m);
            if (m.mass != null) html += `<div>Mass: ${formatDisplayNumber(m.mass, 3, 'M⊕')}</div>`;
            if (m.gravity != null) html += `<div>Gravity: ${formatDisplayNumber(m.gravity, 2, 'G')}</div>`;
            if (m.meanTempK != null) html += `<div>Temperature: ${formatDisplayNumber(m.meanTempK, 0, 'K')}</div>`;
            if (m.size != null)    html += `<div>Size: ${m.size}</div>`;

        } else if (hit.kind === 'belt') {
            const beltName = body.name ? `${body.name} ` : '';
            html += `<div style="color:${TH};margin-bottom:5px;border-bottom:1px solid ${TBORDER};padding-bottom:4px">`;
            html += `${beltName}<span style="color:${TSUB}">(Planetoid Belt)</span></div>`;
            if (body.orbitId != null) html += `<div>Orbit #: ${formatDisplayNumber(body.orbitId, 2)}</div>`;
            if (body.au != null) html += `<div>Distance: ${formatDisplayNumber(body.au, 3, 'AU')}</div>`;
            if (body.uwp)             html += `<div style="margin-top:4px">UWP: <strong>${body.uwp}</strong></div>`;
            if (body.starport)        html += `<div>Spaceport: ${body.starport}</div>`;
            if (body.tl != null)      html += `<div>TL: ${body.tl}</div>`;
            if (body.tradeCodes && body.tradeCodes.length)
                                      html += `<div>Codes: ${body.tradeCodes.join(' ')}</div>`;
            if (body.travelZone && body.travelZone !== 'G')
                                      html += `<div>Zone: ${body.travelZone}</div>`;
            if (body.resourceRating != null) html += `<div style="margin-top:4px">Resource: ${body.resourceRating}</div>`;
        }

        _tooltip.innerHTML = html;
        _tooltip.style.display = 'block';

        const W = window.innerWidth, H = window.innerHeight;
        let tx = mx + 16, ty = my - 12;
        if (tx + 295 > W) tx = mx - 305;
        if (ty + 280 > H) ty = my - 290;
        // The orbit view parks the card in the map's top left corner, where it
        // never sits on the body it describes.
        _tipDocked = true;
        _tooltip.classList.toggle('sv-tip-docked', _tipDocked);
        if (_tipDocked) {
            const rect = _orrCanvas.getBoundingClientRect();
            tx = rect.left + 18; ty = rect.top + 18;
        }
        _tooltip.style.left = Math.max(0, tx) + 'px';
        _tooltip.style.top  = Math.max(0, ty) + 'px';
    }

    function _hideTooltip() {
        if (_tooltip) _tooltip.style.display = 'none';
    }

    // ── ESC ───────────────────────────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.code === 'Space' && isOpen() && !e.defaultPrevented && !e.ctrlKey && !e.altKey && !e.metaKey &&
            !e.target.closest('button, a, summary, textarea, select, [contenteditable="true"], input:not([type="range"])') &&
            !window.SurfaceViewer?.isOpen() && !window.ApproachViewer?.isOpen()) {
            e.preventDefault(); e.stopPropagation();
            if (!e.repeat) _togglePause();
            return;
        }
        const openPopover = e.key === 'Escape' && isOpen() && document.querySelector('#system-viewer-overlay .sv-pop[open]');
        if (openPopover && !e.defaultPrevented) {
            e.preventDefault();
            openPopover.open = false;
            openPopover.querySelector('summary')?.focus();
            return;
        }
        if (!e.defaultPrevented && e.key === 'Escape' && isOpen() &&
            !document.querySelector('.campaign-stardate-dialog[open], .atlas-crop-dialog[open]') &&
            !(window.SurfaceViewer  && window.SurfaceViewer.isOpen()) &&
            !(window.ApproachViewer && window.ApproachViewer.isOpen())) close();
    });
    window.addEventListener('blur', () => _stopShuttle?.());

    function normalizeSystem(state) {
        const found = _detectSystem(state);
        if (!found) return null;
        if      (found.edition === 'AoW')   return _normalizeAoW(found.raw);
        else if (found.edition === 'MgT2E') return _normalizeMgT2E(found.raw);
        else if (found.edition === 'CT')    return _normalizeCT(found.raw);
        else if (found.edition === 'T5')    return _normalizeT5(found.raw);
        else                                return _normalizeRTT(found.raw);
    }

    // ── Snapshot auto-fit ────────────────────────────────────────────────────
    // Computes the viewZoom that makes the outermost body fill FILL_FRAC of the
    // available canvas radius, using the same log-scale formula as _drawOrrery.
    // Mirrors the maxAU logic in _drawOrrery exactly so the two stay in sync.
    function _autoFitZoom(normalised, width, height) {
        const FILL_FRAC = 0.85;
        const MARGIN    = 70;   // must match _drawOrrery's margin constant

        // Find the true outermost orbital distance across all worlds + companions
        let actualMaxAU = 0;
        (normalised.worlds || []).forEach(w => {
            if ((w.au || 0) > actualMaxAU) actualMaxAU = w.au;
        });
        (normalised.stars || []).slice(1).forEach(s => {
            const au = _starCompanionAU(s);
            if (au > actualMaxAU) actualMaxAU = au;
        });

        // Mirror _drawOrrery's floor: rawMaxAU is what _drawOrrery passes to _scaleR
        const rawMaxAU = Math.max(actualMaxAU * 1.18, 2);

        // log-scale: r = baseMaxR * zoom * log(1+au) / log(1+rawMaxAU)
        // Solve for zoom so the outermost body lands at FILL_FRAC * baseMaxR:
        //   zoom = FILL_FRAC * log(1+rawMaxAU) / log(1+actualMaxAU)
        const logActual = Math.log(1 + actualMaxAU);
        const logRaw    = Math.log(1 + rawMaxAU);
        const zoom      = logActual > 0 ? FILL_FRAC * logRaw / logActual : 1.0;

        return Math.max(0.5, Math.min(zoom, 20.0));
    }

    // ── Snapshot export ───────────────────────────────────────────────────────
    // Renders one static orrery frame to an off-screen canvas and returns the
    // PNG bytes as a Uint8Array.  Safe to call while the live viewer is closed;
    // all module-level render state is saved and fully restored afterwards.
    // Returns null if the state has no detectable system.
    // `opts` (optional, Release 2 / WP5 slice 5d):
    //   level — a disclosure level ('a'..'g'). Absent/null = GM, unchanged.
    //
    // Deliberately ONE level rather than a pair of booleans. The per-entity
    // rules already live in ExportCore's display-name helpers (worlds and moons
    // at (g), stars at (d)), so passing the level makes the image use exactly
    // the labels the page uses. An earlier version passed a single
    // `genericNames` flag and drew "Star A" at (d)-(f) while the page said
    // "K0 V A" — not a leak, but the two disagreed. Found by looking at the
    // rendered PNG, not by any assertion.
    //
    // This exists because an orrery draws body names as PIXELS. No field filter,
    // parity check or DOM sweep can see them, so a players' export cannot simply
    // reuse the GM image — it has to be re-rendered. The DECISION about which
    // level warrants which labels stays in the exporter; this function only
    // obeys, the same split that puts hexPoly() in renderer.js (WP3).
    async function renderSnapshot(state, width, height, opts) {
        width  = width  || 900;
        height = height || 500;
        opts   = opts   || {};

        const found = _detectSystem(state);
        if (!found) return null;

        let normalised;
        if      (found.edition === 'AoW')   normalised = _normalizeAoW(found.raw);
        else if (found.edition === 'MgT2E') normalised = _normalizeMgT2E(found.raw);
        else if (found.edition === 'CT')    normalised = _normalizeCT(found.raw);
        else if (found.edition === 'T5')    normalised = _normalizeT5(found.raw);
        else                                normalised = _normalizeRTT(found.raw);

        const EC2 = (typeof ExportCore !== 'undefined') ? ExportCore : null;
        if (opts.level && EC2) {
            // Copy rather than mutate — `normalised` may share objects with the
            // live hexState, and this must never alter the GM's own data.
            // ExportCore is resolved at call time, not load time, so script
            // order does not matter.
            const stars = normalised.stars || [];
            const multi = stars.length > 1;
            normalised = Object.assign({}, normalised, {
                stars: stars.map((s, i) => Object.assign({}, s, {
                    name: EC2.starDisplayName(s, i, multi, opts.level),
                })),
                worlds: (normalised.worlds || []).map((w, i) => Object.assign({}, w, {
                    name: EC2.worldDisplayName(w, i, opts.level),
                    moons: (w.moons || []).map((m, j) => Object.assign({}, m, {
                        name: EC2.moonDisplayName(m, j, opts.level),
                    })),
                })),
            });
        }

        // Save every module-level variable that _drawOrrery() reads or writes
        const saved = {
            orrCtx:       _orrCtx,
            canvasW:      _canvasW,
            canvasH:      _canvasH,
            sys:          _sys,
            hexId:        _hexId,
            gameYear:     _gameYear,
            gameDay:      _gameDay,
            viewZoom:     _viewZoom,
            viewOffX:     _viewOffX,
            viewOffY:     _viewOffY,
            lightMode:    _lightMode,
            linearScale:  _linearScale,
            orbitOpacity:          _orbitOpacity,
            showOrbits:             _showOrbits,
            showDayNight:           _showDayNight,
            selectedBody:           _selectedBody,
            trackedBody:            _trackedBody,
            tracking:               _tracking,
            hitBodies:             _hitBodies,
            hideMoons:              _hideMoons,
            hideHZ:                 _hideHZ,
            hideJumpLimit:          _hideJumpLimit,
            hideMainworldHighlight: _hideMainworldHighlight,
            lineup:                 _lineup,
            lineupDisc:             _lineupDisc,
        };

        // Create an off-screen canvas and install snapshot render state
        const canvas  = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;

        _orrCtx       = canvas.getContext('2d');
        _canvasW      = width;
        _canvasH      = height;
        _sys          = normalised;
        _hexId        = saved.hexId || 'snapshot';
        _gameYear     = 0;   // T=0 → deterministic epoch positions
        _gameDay      = 1;
        _viewZoom     = _autoFitZoom(normalised, width, height);
        _viewOffX     = 0;
        _viewOffY     = 0;
        _lightMode    = false;  // always dark-mode for export
        _linearScale  = false;
        _orbitOpacity           = 0.3;    // light orbit rings add context without clutter
        _showOrbits             = true;
        _showDayNight           = false;
        _selectedBody           = null;
        _trackedBody            = null;
        _tracking               = false;
        _hideMoons              = false;
        _hideHZ                 = false;
        _hideJumpLimit          = false;
        _lineup                 = 'orbits';
        _lineupDisc             = 1;
        // The mainworld highlight is identification, which is (g) — a coloured
        // body says "this is the one that matters" as loudly as a caption.
        _hideMainworldHighlight = !!(opts.level && EC2 &&
            !(window.DisclosureModel && window.DisclosureModel.atLeast(opts.level, 'g')));
        _hitBodies              = [];
        const savedFitting = _fitting;
        _fitting = true;
        _drawOrrery();
        _fitting = savedFitting;

        // Restore every saved variable before yielding
        _orrCtx       = saved.orrCtx;
        _canvasW      = saved.canvasW;
        _canvasH      = saved.canvasH;
        _sys          = saved.sys;
        _hexId        = saved.hexId;
        _gameYear     = saved.gameYear;
        _gameDay      = saved.gameDay;
        _viewZoom     = saved.viewZoom;
        _viewOffX     = saved.viewOffX;
        _viewOffY     = saved.viewOffY;
        _lightMode    = saved.lightMode;
        _linearScale  = saved.linearScale;
        _orbitOpacity           = saved.orbitOpacity;
        _showOrbits             = saved.showOrbits;
        _showDayNight           = saved.showDayNight;
        _selectedBody           = saved.selectedBody;
        _trackedBody            = saved.trackedBody;
        _tracking               = saved.tracking;
        _hitBodies              = saved.hitBodies;
        _hideMoons              = saved.hideMoons;
        _hideHZ                 = saved.hideHZ;
        _hideJumpLimit          = !!saved.hideJumpLimit;
        _hideMainworldHighlight = saved.hideMainworldHighlight;
        _lineup                 = saved.lineup;
        _lineupDisc             = saved.lineupDisc;

        return new Promise(resolve => {
            canvas.toBlob(blob => {
                if (!blob) { resolve(null); return; }
                blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
            }, 'image/png');
        });
    }

    function _fitCamera(preserve = false) {
        if (!_orrCtx || !_sys || !_canvasW || !_canvasH) return;
        if (_lineup !== 'orbits') {
            // The lineup is laid out to fill the canvas at zoom 1. Zooming in
            // enlarges that layout; zooming out stops at the fitted strip.
            _minZoom = 1;
            _systemFitZoom = 1;
            _fitOffX = 0;
            _fitOffY = 0;
            if (!preserve || _atFit) {
                _viewZoom = 1;
                _viewOffX = 0;
                _viewOffY = 0;
            } else {
                _viewZoom = Math.max(1, _viewZoom);
            }
            return;
        }
        _fitting = true;
        try {
            const oldZoom = _viewZoom, oldMin = _minZoom;
            const oldX = _viewOffX - _fitOffX, oldY = _viewOffY - _fitOffY;
            _viewOffX = 0; _viewOffY = 0;
            _viewZoom = _minZoom || 1;
            const width = Math.max(20, _canvasW - 32), height = Math.max(20, _canvasH - 32);
            let bounds, lastSpan = null;
            const hasOrbits = (_sys.stars || []).length > 1 || (_sys.worlds || []).some(w => w.type !== 'Empty' && w.au > 0);
            if (!hasOrbits) _viewZoom = 1;
            for (let i = 0; i < 12; i++) {
                bounds = _drawOrrery(true);
                const bw = bounds.right - bounds.left, bh = bounds.bottom - bounds.top;
                const ratio = Math.min(width / Math.max(1, bw), height / Math.max(1, bh));
                if (!hasOrbits || Math.abs(1 - ratio) < 0.0005 || (lastSpan !== null && Math.abs(bw + bh - lastSpan) < 0.001)) break;
                lastSpan = bw + bh;
                _viewZoom = Math.max(0.00001, Math.min(_MAX_ZOOM, _viewZoom * ratio));
            }
            bounds = _drawOrrery(true);
            _minZoom = _viewZoom;
            _systemFitZoom = _minZoom;
            _fitOffX = _canvasW / 2 - (bounds.left + bounds.right) / 2;
            _fitOffY = _canvasH / 2 - (bounds.top + bounds.bottom) / 2;
            _viewOffX = _fitOffX; _viewOffY = _fitOffY;
            if (preserve && !_atFit) {
                const ratio = _minZoom / oldMin;
                _viewZoom = Math.max(_minZoom, oldZoom * ratio);
                _viewOffX += oldX * ratio; _viewOffY += oldY * ratio;
            }
        } finally {
            _fitting = false;
        }
    }
    function _stopFollow() {
        const was = _tracking;
        _tracking = false;
        _trackedBody = null;
        if (was && window.SystemInspector?.currentWorkspace?.() === 'system') SystemInspector.refresh(true);
    }
    function _bodyHit(body) {
        return body ? _hitBodies.find(hit => hit.body === body) : null;
    }
    function _followHit(hit) {
        if (!hit) return false;
        _trackedBody = hit.body;
        _tracking = true;
        _atFit = false;
        _viewOffX += _canvasW / 2 - hit.cx;
        _viewOffY += _canvasH / 2 - hit.cy;
        return true;
    }
    function _followSelected() {
        if (!_tracking || !_trackedBody) return false;
        const hit = _bodyHit(_trackedBody);
        if (!hit) return false;
        const dx = _canvasW / 2 - hit.cx, dy = _canvasH / 2 - hit.cy;
        if (dx * dx + dy * dy < 0.25) return false;
        _viewOffX += dx;
        _viewOffY += dy;
        return true;
    }
    function fitView() { _stopFollow(); _atFit = true; _fitCamera(); }

    function resize() {
        if (!_overlay || !_orrCanvas) return;
        const width = Math.max(1, _overlay.clientWidth);
        let chrome = 0;
        for (const node of _overlay.children) {
            if (node === _orrCanvas || node === _tooltip || node.classList.contains('sv-floating')) continue;
            chrome += node.getBoundingClientRect().height;
        }
        const height = Math.max(1, _overlay.clientHeight - chrome);
        if (width === _canvasW && height === _canvasH) return;
        _canvasW = width; _canvasH = height;
        const dpr = window.devicePixelRatio || 1;
        _orrCanvas.style.width = width + 'px';
        _orrCanvas.style.height = height + 'px';
        _orrCanvas.width = Math.round(width * dpr);
        _orrCanvas.height = Math.round(height * dpr);
        _orrCtx = _orrCanvas.getContext('2d');
        _orrCtx.scale(dpr, dpr);
        _fitCamera(true);
    }
    function selectBody(body) {
        if (body == null) {
            _selectedBody = null;
            window.SystemInspector?.selectBody(null);
            return true;
        }
        const previous = _selectedBody;
        _selectedBody = body;
        if (window.SystemInspector?.selectBody(body) === false) {
            _selectedBody = previous;
            return false;
        }
        return true;
    }
    function _worldsForStar(star) {
        const stars = _sys?.stars || [];
        const idx = stars.indexOf(star);
        if (idx < 0) return [];
        const worlds = (_sys.worlds || []).filter(w => w.type !== 'Empty');
        if (idx === 0) {
            return worlds.filter(w => w.orbitType === 'P-Type' || w.parentStarIdx === 0 || w.parentStarIdx === undefined);
        }
        return worlds.filter(w => w.orbitType === 'S-Type' && w.parentStarIdx === idx);
    }
    function _localBodies(focus) {
        const set = new Set([focus]);
        const stars = _sys?.stars || [];
        if (stars.includes(focus)) {
            for (const w of _worldsForStar(focus)) {
                set.add(w);
                (w.moons || []).forEach(m => set.add(m));
                (w.rings || []).forEach(r => set.add(r));
            }
        } else {
            (focus.moons || []).forEach(m => set.add(m));
            (focus.rings || []).forEach(r => set.add(r));
        }
        return set;
    }
    function _localBounds(focus) {
        const local = _localBodies(focus);
        const hits = _hitBodies.filter(h => local.has(h.body));
        if (!hits.length) return null;
        const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
        for (const h of hits) {
            const outer = h.r, inner = h.innerR;
            if (inner !== undefined) {
                box.left = Math.min(box.left, h.cx - outer);
                box.right = Math.max(box.right, h.cx + outer);
                box.top = Math.min(box.top, h.cy - outer);
                box.bottom = Math.max(box.bottom, h.cy + outer);
            } else {
                box.left = Math.min(box.left, h.cx - outer);
                box.right = Math.max(box.right, h.cx + outer);
                box.top = Math.min(box.top, h.cy - outer);
                box.bottom = Math.max(box.bottom, h.cy + outer);
            }
        }
        return box;
    }
    function frameBody(body) {
        if (!_overlay || !body) return false;
        if (!selectBody(body)) return false;
        _trackedBody = body;
        _tracking = true;
        _atFit = false;
        const pad = 36;
        const width = Math.max(20, _canvasW - pad * 2);
        const height = Math.max(20, _canvasH - pad * 2);
        const cx = _canvasW / 2, cy = _canvasH / 2;
        _measuringFrame = true;
        try {
            for (let i = 0; i < 12; i++) {
                _drawOrrery();
                const box = _localBounds(body);
                if (!box) { _stopFollow(); return false; }
                const bw = Math.max(1, box.right - box.left);
                const bh = Math.max(1, box.bottom - box.top);
                const lcx = (box.left + box.right) / 2;
                const lcy = (box.top + box.bottom) / 2;
                const ratio = Math.min(width / bw, height / bh);
                _viewOffX += cx - lcx;
                _viewOffY += cy - lcy;
                if (Math.abs(1 - ratio) < 0.02) break;
                const newZoom = Math.max(_minZoom, Math.min(_MAX_ZOOM, _viewZoom * ratio));
                const zratio = newZoom / _viewZoom;
                _viewOffX *= zratio;
                _viewOffY *= zratio;
                _viewZoom = newZoom;
            }
        } finally {
            _measuringFrame = false;
        }
        _drawOrrery();
        if (!_followHit(_bodyHit(body))) { _stopFollow(); return false; }
        if (window.SystemInspector?.currentWorkspace?.() === 'system') SystemInspector.refresh(true);
        return true;
    }
    function centerOnBody(body) {
        return frameBody(body);
    }
    // `sys` defaults to the open system. The inspector passes its own normalized
    // copy, which yields the same keys because they come from the same paths.
    function locationEntries(sys = _sys) {
        if (!sys) return [];
        const entries = [];
        function add(body, path, fallback) {
            if (body.type === 'Empty') return;
            // Include identifying data so regenerated/reordered bodies cannot silently
            // inherit a campaign location solely because they occupy the old slot.
            const key = JSON.stringify([path, body.name || '', body.type || '', body.orbitId ?? null, body.au ?? null, body.pd ?? null]);
            entries.push({ body, key, label: body.name || fallback });
        }
        (sys.stars || []).forEach((s, i) => add(s, `star:${i}`, `Star ${i + 1}`));
        (sys.worlds || []).forEach((w, i) => {
            add(w, `world:${i}`, `${w.type || 'World'} ${i + 1}`);
            (w.moons || []).forEach((m, j) => add(m, `world:${i}:moon:${j}`, `${w.name || `World ${i + 1}`} / Moon ${j + 1}`));
            (w.rings || []).forEach((r, j) => add(r, `world:${i}:ring:${j}`, `${w.name || `World ${i + 1}`} / Ring ${j + 1}`));
        });
        return entries;
    }
    function locationForBody(body, sys = _sys) {
        return locationEntries(sys).find(entry => entry.body === body) || null;
    }
    function locationPosition(anchor) {
        if (!_orrCanvas || anchor.hexId !== _hexId) return null;
        const entries = locationEntries();
        const matches = anchor.bodyKey ? entries.filter(e => e.key === anchor.bodyKey)
            : entries.filter(e => e.label.toLocaleLowerCase() === anchor.locationLabel?.trim().toLocaleLowerCase());
        if (matches.length !== 1) return null;
        const hit = _hitBodies.find(h => h.body === matches[0].body);
        if (!hit) return null; // Hidden moons and missing bodies must not point elsewhere.
        const rect = _orrCanvas.getBoundingClientRect();
        const ring = hit.innerR !== undefined;
        const x = hit.cx, y = hit.cy - (ring ? (hit.r + hit.innerR) / 2 : 0);
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
        return { x: rect.left + x, y: rect.top + y, radius: ring ? 9 : hit.r,
            left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }
    function remapHexId(fn) {
        if (typeof fn === 'function' && _hexId) _hexId = fn(_hexId);
    }
    let _timeSaveTimer = null;

    function campaignClockDays() {
        if (window.campaignTime && Number.isFinite(window.campaignTime.days)) return window.campaignTime.days;
        const year = Number.isFinite(window.orreryDefaultYear) ? window.orreryDefaultYear : 0;
        const day = Number.isFinite(window.orreryDefaultDay) ? window.orreryDefaultDay : 1;
        return year * 365 + Math.min(365, Math.max(1, day)) - 1;
    }
    function _scheduleCampaignTimeSave() {
        clearTimeout(_timeSaveTimer);
        _timeSaveTimer = setTimeout(() => {
            _timeSaveTimer = null;
            window.dbManager?.saveCampaignTime?.();
        }, 600);
    }
    function _flushCampaignTimeSave() {
        if (!_timeSaveTimer) return;
        clearTimeout(_timeSaveTimer);
        _timeSaveTimer = null;
        window.dbManager?.saveCampaignTime?.();
    }
    function _syncStardateFields() {
        const value = document.getElementById('campaign-stardate-value');
        if (value) value.textContent = _dateText(campaignClockDays());
    }
    function _clockParts(days) {
        if (!Number.isFinite(days)) days = 0;
        const year = Math.floor(days / 365);
        const gameDay = days - year * 365 + 1;
        return {
            year,
            day: Math.max(1, Math.min(365, Math.floor(gameDay))),
            seconds: Math.floor(((gameDay - Math.floor(gameDay)) * 86400) + 1e-5) % 86400
        };
    }
    function setCampaignClock(year, day, seconds) {
        _setDays((Number.isFinite(year) ? Math.trunc(year) : 0) * 365
            + Math.min(365, Math.max(1, day || 1)) - 1
            + Math.min(86399, Math.max(0, seconds || 0)) / 86400);
        _flushCampaignTimeSave();
    }

    return { open, close, isOpen, refresh, handleWheel, normalizeSystem, renderSnapshot, resize, selectBody,
        centerOnBody, frameBody, isTracking: () => _tracking && !!_trackedBody, surfaceKind,
        trackedBody: () => _trackedBody,
        locationForBody, locationEntries, locationPosition, fitView, searchAlignments,
        rotationText, starColor: s => _STAR_COLORS[s?.sType] || null,
        time: () => ({ days: _totalDays(), year: _gameYear, day: _gameDay, paused: _paused, shuttleRate: _shuttleRate }),
        campaignClockParts: () => _clockParts(campaignClockDays()),
        formatCampaignClock: () => _dateText(campaignClockDays()),
        setCampaignClock, syncCampaignTimeFields: _syncStardateFields,
        currentHexId: () => _hexId, currentSystem: () => _sys, remapHexId };

})();

window.SystemViewer = SystemViewer;
