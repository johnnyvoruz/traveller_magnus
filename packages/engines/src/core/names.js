import { hashString, masterSeed, rng } from './rng.js';
import { trace, writeLogLine } from './trace.js';
import { isManual } from './manual.js';

export const namePool = [];
export const usedNames = new Set();

export function setNamePool(list) {
    namePool.length = 0;
    for (const name of list) namePool.push(name);
}

// =====================================================================
// NAME GENERATION UTILITIES
// =====================================================================

/**
 * Grabs a name from the pool.
 * If hexId is provided, it uses a deterministic hash to pick the name,
 * ensuring the same hex always gets the same name for a given Master Seed.
 */
export function getNextSystemName(hexId) {
    if (namePool.length === 0) return "Unnamed System";

    let index;
    if (hexId) {
        // Deterministic pick based on location - absolute determinism
        const nameSeed = hashString(masterSeed + "-" + hexId + "-name");
        index = nameSeed % namePool.length;
        const name = namePool[index];
        usedNames.add(name);
        if (trace.enabled) {
            writeLogLine(`System Name Selected: ${name}`);
        }
        return name;
    } else {
        // Fallback to current RNG stream
        index = Math.floor(rng() * namePool.length);
        const name = namePool[index];
        // DO NOT splice here; it breaks determinism based on generation order across the session
        usedNames.add(name);
        if (trace.enabled) {
            writeLogLine(`System Name Selected: ${name}`);
        }
        return name;
    }
}

/**
 * Assigns systematic orbital names to all bodies in a fully-generated MgT2E system.
 * Must be called after all generation phases are complete (world tree fully assembled).
 * - Mainworld keeps the plain system name.
 * - Other primary bodies (sorted by orbitId): "SystemName I", "SystemName II", …
 * - Moons of primaries: "SystemName I-a", "SystemName I-b", …
 * - Moons of the mainworld (rare): "SystemName-a", "SystemName-b", …
 */
export function _toRoman(n) {
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let r = '';
    for (let i = 0; i < vals.length; i++) {
        while (n >= vals[i]) { r += syms[i]; n -= vals[i]; }
    }
    return r;
}

export function _assignMoonNames(moons, parentName) {
    if (!moons || moons.length === 0) return;
    let idx = 0;
    moons.forEach(m => {
        if (m.isLunarMainworld || m.type === 'Mainworld' || m.isMainworld) return;
        if (!m.name) m.name = `${parentName}-${String.fromCharCode(97 + idx)}`;
        idx++;
    });
}

export function applyMgT2EOrbitalNames(sys) {
    const _mw = (sys.mainworld) ||
                sys.worlds.find(w => w.type === 'Mainworld' || w.isLunarMainworld) ||
                sys.worlds[0];

    if (_mw && !_mw.name) {
        _mw.name = (typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId) : 'Unnamed';
    }
    const _sysName = (_mw && _mw.name) ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId) : 'Unknown');

    const isMultiStar = sys.stars && sys.stars.length > 1;

    // Group non-mainworld bodies by parentStarIdx for multi-star prefix support
    const starGroups = {};
    sys.worlds
        .filter(w => w.type !== 'Empty' && w.type !== 'Mainworld' && !w.isLunarMainworld)
        .forEach(w => {
            const idx = (w.parentStarIdx !== undefined) ? w.parentStarIdx : 0;
            if (!starGroups[idx]) starGroups[idx] = [];
            starGroups[idx].push(w);
        });

    Object.keys(starGroups).sort((a, b) => Number(a) - Number(b)).forEach(idxStr => {
        const idx = Number(idxStr);
        const namePrefix = isMultiStar
            ? `${_sysName} ${String.fromCharCode(65 + idx)}-`
            : `${_sysName} `;

        const group = starGroups[idx].sort((a, b) => (a.orbitId || 0) - (b.orbitId || 0));
        let _ordinal = 1;
        group.forEach(w => {
            const _roman = _toRoman(_ordinal++);
            if (!w.name) w.name = `${namePrefix}${_roman}`;
            _assignMoonNames(w.moons, `${namePrefix}${_roman}`);
        });
    });

    _assignMoonNames(_mw && _mw.moons, _sysName);
    sys.name = _sysName;
}

export function applyCTOrbitalNames(sys) {
    if (!sys || !sys.orbits) return;

    let _mw = null;
    for (const slot of sys.orbits) {
        if (slot.contents && slot.contents.type === 'Mainworld') { _mw = slot.contents; break; }
    }
    if (!_mw && sys.capturedPlanets) {
        _mw = sys.capturedPlanets.find(p => p.type === 'Mainworld') || null;
    }

    const _sysName = (_mw && _mw.name) ||
                     sys.name ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId || '') : 'Unknown');
    if (_mw && !_mw.name) _mw.name = _sysName;

    // CT has a flat orbit pool with no per-star attribution — use a single ordinal sequence.
    // Captured Planets (RAW Book 6 anomalies that sit outside the normal discrete orbit-slot
    // sequence, sys.capturedPlanets — see ct_bottomup_generator.js) are merged in here, sorted
    // by real distance (distAU) rather than orbit-slot number so they interleave at their true
    // position — same order hex_editor.js's accordion already renders them in. Without this, a
    // captured planet's `.name` was never set at all; the accordion's input `placeholder`
    // (computed from that same ordinal position) made it merely *look* named, while the real
    // field stayed permanently blank — visible the moment System Editor read `w.name` directly.
    const orbitBodies = sys.orbits
        .filter(slot => slot.contents && slot.contents.type !== 'Empty' && slot.contents.type !== 'Mainworld')
        .map(slot => ({ body: slot.contents, sortAU: slot.contents.distAU ?? slot.orbit ?? 0 }));
    const capturedBodies = (sys.capturedPlanets || [])
        .filter(p => p.type !== 'Mainworld')
        .map(p => ({ body: p, sortAU: p.distAU ?? p.orbit ?? 0 }));
    const bodies = [...orbitBodies, ...capturedBodies]
        .sort((a, b) => a.sortAU - b.sortAU)
        .map(e => e.body);

    let _ordinal = 1;
    bodies.forEach(w => {
        const _roman = _toRoman(_ordinal++);
        if (!w.name) w.name = `${_sysName} ${_roman}`;
        if (w.satellites && w.satellites.length > 0) {
            // Sort by pd (periapsis distance) to match hex_editor display order
            const sortedSats = [...w.satellites].sort((a, b) => (a.pd || 0) - (b.pd || 0));
            _assignMoonNames(sortedSats, `${_sysName} ${_roman}`);
        }
    });

    _assignMoonNames(_mw && _mw.satellites, _sysName);
    sys.name = _sysName;
}

export function applyT5OrbitalNames(sys) {
    if (!sys || !sys.stars) return;

    const _mw = sys.mainworld;
    const _hexId = (_mw && _mw.hexId) || sys.hexId || '';
    if (_mw && !_mw.name) {
        _mw.name = (typeof getNextSystemName === 'function') ? getNextSystemName(_hexId) : 'Unnamed';
    }
    const _sysName = (_mw && _mw.name) ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(_hexId) : 'Unknown');

    const isMultiStar = sys.stars.length > 1;

    sys.stars.forEach((star, starIdx) => {
        if (!star.orbits) return;
        const namePrefix = isMultiStar
            ? `${_sysName} ${String.fromCharCode(65 + starIdx)}-`
            : `${_sysName} `;

        const bodies = star.orbits
            .filter(slot => slot.contents && slot.contents !== _mw)
            .sort((a, b) => (a.orbit || 0) - (b.orbit || 0))
            .map(slot => slot.contents);

        let _ordinal = 1;
        bodies.forEach(w => {
            const _roman = _toRoman(_ordinal++);
            if (!w.name) w.name = `${namePrefix}${_roman}`;
            _assignMoonNames(w.satellites, `${namePrefix}${_roman}`);
        });
    });

    _assignMoonNames(_mw && _mw.satellites, _sysName);
    sys.name = _sysName;
}

export function applyRTTOrbitalNames(sys) {
    if (!sys || !sys.stars) return;

    const _sysName = sys.name ||
                     ((typeof getNextSystemName === 'function') ? getNextSystemName(sys.hexId || '') : 'Unknown');
    sys.name = _sysName;

    const isMultiStar = sys.stars.length > 1;

    sys.stars.forEach((star, starIdx) => {
        if (!star.planetarySystem || !star.planetarySystem.orbits) return;
        const namePrefix = isMultiStar
            ? `${_sysName} ${String.fromCharCode(65 + starIdx)}-`
            : `${_sysName} `;

        const allOrbits = [...star.planetarySystem.orbits]
            .sort((a, b) => (a.orbitNumber || 0) - (b.orbitNumber || 0));

        let _ordinal = 1;
        allOrbits.forEach(b => {
            if (b.isMainworld) {
                _assignMoonNames(b.satellites, _sysName);
                return;
            }
            const _roman = _toRoman(_ordinal++);
            if (!isManual(b, 'name')) b.name = `${namePrefix}${_roman}`;
            _assignMoonNames(b.satellites, `${namePrefix}${_roman}`);
        });
    });
}
