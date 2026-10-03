// How a world looks in orbit view, derived only from its generated data.
// Presentation only: nothing here feeds generation or export. The mapping from
// UWP digits and physical fields to appearance is documented, with the values
// still open for review, in directives/planet_rendering.md.
window.PlanetProfile = (() => {
    'use strict';

    const digit = value => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && /^[0-9A-Fa-f]$/.test(value.trim())) return parseInt(value.trim(), 16);
        return null;
    };
    const uwpDigit = (body, index) => typeof body.uwp === 'string' ? digit(body.uwp[index]) : null;
    const num = value => {
        if (value == null || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    function seedOf(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h;
    }
    function rng(seed) {
        let h = seed >>> 0 || 1;
        return () => {
            h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
            h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        };
    }

    const atmDigit = body => digit(body.atmCode) ?? digit(body.atm) ?? uwpDigit(body, 2);
    const hydroDigit = body => digit(body.hydroCode) ?? digit(body.hydro) ?? uwpDigit(body, 3);
    const BAND_KELVIN = { Frozen: 200, Cold: 250, Cool: 278, Temperate: 295, Warm: 320, Hot: 380, Boiling: 420 };

    // The coarse family a world belongs to. Also used by the inspector's icons.
    function kind(body) {
        if (!body) return null;
        if (body.sType != null && !body.uwp) return 'star';
        if (body.type === 'Gas Giant' || body.ggType) return 'gas';
        if (body.type === 'Planetoid Belt' || body.type === 'Asteroid Belt' || body.worldType === 'Belt') return 'belt';
        if (body.type === 'Ring' || body.size === 'R') return 'ring';
        const worldType = String(body.worldType || '').toLowerCase();
        if (worldType === 'iceworld') return 'ice';
        if (worldType === 'inferno') return 'hot';
        if (worldType === 'radworld') return 'rad';
        if (worldType === 'stormworld') return 'storm';
        const atm = atmDigit(body);
        const hydro = hydroDigit(body);
        const kelvin = Number(body.meanTempK) || 0;
        const band = body.tempBand || (kelvin && window.PlanetRenderer?.tempBandFromKelvin ? PlanetRenderer.tempBandFromKelvin(kelvin) : '');
        if (kelvin >= 450) return 'hot';
        if (atm != null && atm >= 10) return 'exotic';
        if (band === 'Frozen') return (hydro || atm) ? 'ice' : 'barren';
        if (atm === 0 || (atm == null && hydro == null)) return 'barren';
        if (hydro != null && hydro >= 9) return 'ocean';
        if (hydro != null && hydro >= 3) return atm >= 4 && atm <= 9 ? 'temperate' : 'ocean';
        return 'desert';
    }

    // Surface liquid by the generator's liquidType. Shallow over shelves, deep offshore.
    const LIQUIDS = {
        'Water': { shallow: [52, 142, 164], deep: [10, 34, 86], frozen: false },
        'Ice': { shallow: [206, 224, 238], deep: [156, 190, 216], frozen: true },
        'Sulphuric Acid': { shallow: [198, 178, 92], deep: [112, 90, 36] },
        'Formic Acid': { shallow: [172, 178, 152], deep: [88, 96, 80] },
        'Hydrogen Cyanide': { shallow: [192, 186, 128], deep: [108, 102, 58] },
        'Formamide': { shallow: [160, 172, 172], deep: [78, 92, 96] },
        'Carbonic Acid': { shallow: [92, 152, 172], deep: [30, 70, 102] },
        'Ammonia': { shallow: [152, 182, 192], deep: [68, 100, 122] },
        'Ethane': { shallow: [72, 58, 42], deep: [24, 18, 14] },
        'Methane': { shallow: [62, 52, 42], deep: [20, 16, 14] },
        'Oxygen': { shallow: [132, 172, 222], deep: [70, 110, 182] },
        'Chlorine': { shallow: [172, 192, 92], deep: [88, 110, 40] },
        'Sulphur Dioxide': { shallow: [192, 182, 150], deep: [110, 100, 80] },
        'Unknown Exotic Liquid': { shallow: [152, 112, 172], deep: [68, 40, 102] }
    };
    // Bedrock tone by the generator's composition.
    const ROCKS = {
        'Mostly Metal': { low: [66, 66, 72], high: [146, 146, 152] },
        'Compressed Metal': { low: [58, 58, 64], high: [132, 132, 140] },
        'Rock and Metal': { low: [84, 78, 72], high: [156, 146, 132] },
        'Mostly Rock': { low: [96, 84, 70], high: [176, 160, 136] },
        'Mostly Ice': { low: [150, 168, 186], high: [234, 241, 247] },
        'Exotic Ice': { low: [158, 138, 170], high: [228, 216, 238] }
    };
    const OXIDE = { low: [102, 56, 38], high: [220, 168, 124] };
    const BASALT = { low: [30, 22, 20], high: [104, 76, 58] };
    const SULPHUR = { low: [96, 88, 40], high: [196, 180, 104] };

    // Atmosphere thickness from surface pressure where the generator gives it,
    // else from the UWP digit. 1 bar is 0.85; ten times the pressure adds 0.45.
    // E (Thin, Low) sits with the very thin airs; F (Unusual) is taken as standard.
    const PRESSURE_BY_DIGIT = [0, 0.005, 0.1, 0.1, 0.35, 0.35, 1, 1, 2, 2, 1.5, 5, 5, 20, 0.15, 1];
    // Haze colour by what the rules call the air: breathable, tainted, exotic,
    // corrosive, insidious, super-high density, thin-low (cold and pale), and
    // unusual (the base under its iridescence).
    function airTint(atm) {
        if (atm === 1) return [176, 188, 210];
        if (atm === 10) return [224, 170, 112];
        if (atm === 11) return [238, 214, 142];
        if (atm === 12) return [202, 214, 120];
        if (atm === 13) return [172, 202, 255];
        if (atm === 14) return [200, 226, 255];
        if (atm === 15) return [176, 160, 255];
        const clear = [104, 164, 255];
        return [2, 4, 7, 9].includes(atm) ? mix(clear, [210, 178, 112], 0.4) : clear;
    }

    // City light by tech level: amber firelight and gas lamps, warm electric
    // light, 5,600 K daylight for a modern world, then neon districts as the
    // tech level climbs past it. `neon` is the share of districts lit in neon.
    // By day, cities show as ground in their building material (`urban`):
    // stone and timber, brick, concrete, then glass and steel that catches
    // the sun (`shine`). By night, `glow` sets how far their light blooms.
    function cityLight(tl) {
        if (tl == null) return { color: [255, 238, 226], neon: 0, gain: 0.8, urban: [132, 134, 138], shine: 0.1, glow: 0.35, glass: [150, 158, 170] };
        if (tl <= 3) return { color: [255, 138, 38], neon: 0, gain: 0.55, urban: [126, 114, 98], shine: 0, glow: 0.12, glass: [150, 136, 116] };
        if (tl <= 5) return { color: [255, 166, 72], neon: 0, gain: 0.65, urban: [130, 118, 104], shine: 0.02, glow: 0.18, glass: [152, 142, 128] };
        if (tl <= 7) return { color: [255, 200, 138], neon: 0, gain: 0.75, urban: [134, 130, 124], shine: 0.05, glow: 0.28, glass: [156, 156, 156] };
        if (tl <= 11) return { color: [255, 238, 226], neon: 0, gain: 0.85 + (tl - 8) * 0.04, urban: [138, 140, 144], shine: 0.12, glow: 0.4, glass: [160, 172, 188] };
        const neon = clamp((tl - 11) / 4, 0.25, 1);
        return { color: [255, 238, 226], neon, gain: clamp(1 + (tl - 12) * 0.06, 1, 1.3),
            urban: [146, 154, 168], glass: [176, 200, 228], shine: 0.28, glow: 0.9 + neon * 0.9 };
    }

    // Vegetation: its share of the land from biomass, its maturity from
    // biocomplexity, and its hue from how Terran it is (compatibility).
    const ALIEN_CANOPIES = [[112, 58, 104], [150, 70, 48], [40, 118, 118], [156, 136, 40], [86, 70, 150]];

    function siderealHours(body) {
        if (typeof body.siderealHours === 'number' && Number.isFinite(body.siderealHours) && body.siderealHours !== 0) return Math.abs(body.siderealHours);
        if (typeof body.rotationPeriod === 'number' && body.rotationPeriod > 0) return body.rotationPeriod;
        if (typeof body.rotationPeriod === 'string') {
            const m = body.rotationPeriod.match(/([\d.]+)\s*([hdw])/i);
            if (m) return parseFloat(m[1]) * ({ h: 1, d: 24, w: 168 }[m[2].toLowerCase()]);
        }
        return null;
    }

    const cache = new WeakMap();
    // `id` should be stable for the body across refreshes (it seeds the terrain).
    function of(body, id) {
        const hit = cache.get(body);
        if (hit && hit.id === id) return hit;
        const family = kind(body);
        const seed = seedOf(id || `${body.name}|${body.type}|${body.uwp}`);
        const rand = rng(seed);
        const atm = atmDigit(body) ?? 0;
        const hydro = hydroDigit(body) ?? 0;
        const size = uwpDigit(body, 1) ?? digit(body.size) ?? 5;
        const kelvin = num(body.meanTempK) || BAND_KELVIN[body.tempBand] || (family === 'ice' ? 200 : family === 'hot' ? 620 : 288);
        const high = num(body.highTempK), low = num(body.lowTempK);
        const spread = high != null && low != null && high > low ? high - low : 40;
        const pressure = num(body.totalPressureBar) ?? num(body.pressureBar) ?? PRESSURE_BY_DIGIT[clamp(atm, 0, 15)] ?? 0;
        let air = family === 'barren' || pressure <= 0.001 ? 0 : clamp(0.85 + 0.45 * Math.log10(pressure), 0.06, 1.6);
        if (family === 'gas') air = 0.7;

        // Liquid: the generator's liquid, else water that freezes or boils with temperature.
        let liquidName = body.liquidType || (hydro > 0 ? (kelvin < 273 ? 'Ice' : kelvin < 373 ? 'Water' : null) : null);
        if (liquidName === 'Water' && kelvin < 262) liquidName = 'Ice';
        const liquid = liquidName ? (LIQUIDS[liquidName] || LIQUIDS['Unknown Exotic Liquid']) : null;
        const water = hydro >= 11 ? 1 : clamp(hydro / 10, 0, 1);

        // Life.
        const biomass = num(body.biomass);
        const complexity = num(body.biocomplexity);
        const compatibility = num(body.compatibility);
        const meanC = kelvin - 273.15;
        let lifeCover = biomass != null ? (biomass > 0 ? clamp(0.25 + biomass / 12, 0, 1) : 0)
            : (atm >= 4 && atm <= 9 && hydro >= 2 && meanC > -25 && meanC < 50 ? 0.7 : 0);
        const terran = compatibility != null ? clamp(compatibility / 8, 0, 1) : 1;
        const alien = ALIEN_CANOPIES[Math.floor(rand() * ALIEN_CANOPIES.length)];
        const canopy = mix(alien, [46, 96, 46], terran);
        const scrub = mix(mix(alien, [150, 140, 100], 0.5), [148, 146, 92], terran);
        // Simple life (low biocomplexity) stays as mats and films, not forest.
        const maturity = complexity != null ? clamp(complexity / 8, 0.15, 1) : 1;

        // Rock.
        let rock = ROCKS[body.composition] || ROCKS['Rock and Metal'];
        if (family === 'desert' && atm <= 3 && lifeCover === 0) rock = OXIDE;
        if (family === 'hot') rock = BASALT;
        if (family === 'exotic' || family === 'rad') rock = SULPHUR;
        if (family === 'ice') rock = ROCKS['Mostly Ice'];

        // Geology.
        const stress = num(body.seismicStress) ?? 0;
        const plates = num(body.tectonicPlates) ?? 0;
        const interaction = body.plateInteraction || 'None';
        const volcanism = family === 'hot' ? 1 : clamp(stress / 320, 0, 1);
        const mountains = clamp((interaction === 'Converging' ? 1 : interaction === 'Transversing' ? 0.7 : interaction === 'Diverging' ? 0.55 : 0.35) * (0.6 + plates / 30), 0.2, 1.2);
        const relief = clamp(1.05 - size * 0.06, 0.35, 1);
        const craters = family === 'gas' ? 0 : clamp((1 - Math.min(1, air * 1.6)) * (1 - volcanism * 0.7) * (water > 0.1 && liquid && !liquid.frozen ? 0.25 : 1), 0, 1);

        // Weather.
        let clouds = 0;
        if (atm >= 11 && atm <= 12) clouds = 0.95;
        else if (atm === 13) clouds = 0.85;
        else if (atm === 10) clouds = 0.55;
        else if (family === 'storm') clouds = 0.8;
        else if (air > 0.25 && liquid && !liquid.frozen) clouds = clamp(0.12 + air * 0.3 * (0.4 + water) + (pressure > 2 ? 0.1 : 0), 0, 0.75);
        else if (air > 0.1) clouds = clamp(air * 0.14, 0, 0.2);
        if (kelvin >= 373 && hydro > 0 && atm >= 4) clouds = Math.max(clouds, 0.8);
        const cloudColor = atm === 11 ? [238, 226, 172] : atm === 12 ? [216, 224, 162] : atm === 10 ? [232, 198, 150]
            : atm === 15 ? [226, 220, 255] : family === 'desert' && atm <= 3 ? [236, 208, 184] : [255, 255, 255];

        // People.
        const pop = digit(body.pop) ?? digit(body.popCode) ?? uwpDigit(body, 4) ?? 0;
        const tlRaw = body.tl ?? (typeof body.uwp === 'string' ? body.uwp.split('-')[1] : null);
        const tl = digit(tlRaw) ?? num(tlRaw);

        // Rotation. Unknown tilt stays upright rather than being invented.
        const tilt = clamp(num(body.axialTilt) ?? 0, 0, 180);
        const locked = !!(body.tidallyLocked || body.isTwilightZone);

        // Gas giants: the generator's size class picks the family, temperature
        // shifts it, faster spin packs more bands.
        let gas = null;
        if (family === 'gas') {
            const type = body.ggType || (/\((G[SML])\)/.exec(body.composition || '') || [])[1] || 'GL';
            gas = type === 'GS'
                ? { zone: [182, 222, 236], belt: [92, 146, 196], pole: [70, 110, 166], storm: [48, 80, 146] }
                : type === 'GM'
                    ? { zone: [240, 226, 186], belt: [190, 148, 92], pole: [146, 136, 116], storm: [226, 210, 176] }
                    : { zone: [242, 230, 204], belt: [174, 106, 64], pole: [112, 102, 108], storm: [200, 88, 54] };
            if (kelvin > 700) for (const key of Object.keys(gas)) gas[key] = mix(gas[key], [120, 60, 40], 0.45);
            else if (kelvin < 90 && type !== 'GS') for (const key of Object.keys(gas)) gas[key] = mix(gas[key], [180, 210, 230], 0.3);
            const hours = siderealHours(body) || 10;
            gas.bands = clamp(6 + 70 / hours, 6, 16);
        }

        // Rings: ice bright and cream, dust grey-brown. Placement comes from the
        // viewer, which knows where the moons orbit.
        const icyRings = kelvin < 200 || family === 'ice';
        const rings = {
            icy: icyRings,
            inner: icyRings ? [238, 228, 206] : [198, 180, 156],
            outer: icyRings ? [208, 192, 162] : [142, 124, 108],
            opacity: icyRings ? 0.9 : 0.7,
            gaps: [0.45 + rand() * 0.2, 0.78 + rand() * 0.12],
            seed: rand() * 100
        };
        const lightModel = cityLight(tl);
        // Starport, from the Mongoose starport profile ("B-HY:DY:+1": highport
        // yes/no, downport yes/no) where there is one. Otherwise from the class
        // alone: mainworld starports A–E (X is no starport, an interdiction);
        // secondary-world spaceports F good, G basic, H primitive, Y none, with
        // no landing site at all. No highport is assumed without a profile.
        const portClass = String(body.starport || (typeof body.uwp === 'string' ? body.uwp[0] : '') || 'X').toUpperCase();
        const portProfile = /^([A-EX])-H([YN]):D([YN])/.exec(String(body.starportProfile || ''));
        const PORT_STRENGTH = { A: 1, B: 0.85, C: 0.7, D: 0.55, E: 0.4, F: 0.5, G: 0.38, H: 0.28, X: 0, Y: 0 };
        const hasDown = portProfile ? portProfile[3] === 'Y' : (PORT_STRENGTH[portClass] || 0) > 0;
        const port = {
            cls: portClass,
            down: hasDown ? (PORT_STRENGTH[portClass] || 0) : 0,
            high: portProfile ? portProfile[2] === 'Y' : false,
            color: portClass === 'A' || portClass === 'B' ? [150, 236, 255] : [255, 226, 170]
        };
        // Share of the usable ground that is built up, by population digit:
        // scattered towns at 1-3, a fifth of the land at 8, nearly all of it
        // at A (an ecumenopolis), and the seas too from B.
        const COVERAGE = [0, 0.002, 0.004, 0.008, 0.015, 0.03, 0.06, 0.11, 0.2, 0.38, 0.8, 0.97, 0.99, 1, 1, 1];
        const coverage = COVERAGE[clamp(Math.round(pop), 0, 15)];

        const profile = {
            id, seed, kind: family,
            offsets: [rand() * 97, rand() * 97, rand() * 97],
            axisAzimuth: rand() * Math.PI * 2,
            vortices: [0, 1, 2].map(() => {
                const z = rand() * 1.6 - 0.8, a = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
                return [Math.cos(a) * s, Math.sin(a) * s, z, (rand() < 0.5 ? -1 : 1) * (2 + rand() * 3)];
            }),
            rock, liquid, water, liquidName,
            climate: { kelvin, meanC, spread, locked },
            air: { strength: air, pressure, tint: family === 'gas' ? (gas && body.ggType === 'GS' ? [120, 190, 255] : [255, 224, 176]) : airTint(atm),
                iridescent: family !== 'gas' && atm === 15 },
            life: { cover: lifeCover, canopy, scrub, maturity },
            geology: { volcanism, mountains, relief, craters },
            clouds: { cover: clouds, color: cloudColor },
            lights: { pop, color: lightModel.color, neon: lightModel.neon, gain: lightModel.gain,
                urban: lightModel.urban, glass: lightModel.glass, shine: lightModel.shine, glow: lightModel.glow,
                coverage, haze: clamp((coverage - 0.2) / 0.6, 0, 1) * (0.6 + 0.4 * lightModel.glow) },
            rings, port,
            rotation: { hours: siderealHours(body), tilt, locked },
            albedo: clamp(0.8 + (num(body.albedo) ?? 0.3) * 0.6, 0.75, 1.15),
            gas
        };
        cache.set(body, profile);
        return profile;
    }

    // The halo colour and strength alone, for places that only need a hint of
    // the world (the inspector's map loader).
    function halo(body) {
        const family = kind(body);
        const atm = atmDigit(body) ?? 0;
        if (family === 'gas') return { tint: body.ggType === 'GS' ? [120, 190, 255] : [255, 224, 176], strength: 0.7, iridescent: false };
        const pressure = num(body.totalPressureBar) ?? num(body.pressureBar) ?? PRESSURE_BY_DIGIT[clamp(atm, 0, 15)] ?? 0;
        const strength = family === 'barren' || pressure <= 0.001 ? 0 : clamp(0.85 + 0.45 * Math.log10(pressure), 0.06, 1.6);
        return { tint: airTint(atm), strength, iridescent: atm === 15 };
    }

    return { of, kind, halo, siderealHours, seedOf };
})();
