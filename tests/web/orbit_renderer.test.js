/**
 * The orbit painter (apps/web/src/orbit/OrbitRenderer.ts) against a recording canvas: the
 * legacy paint order (findings/legacy_orbit_inventory.md §5), what is and is not drawn, and
 * the theme and backdrop it draws with. The theme here is made of names, so each call says
 * which colour it used.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { backdropBox, backdropShift, paintBackdrop, rng, seedOf } from '../../apps/web/src/orbit/backdrop.ts';
import { layoutScene, planSystem } from '../../apps/web/src/orbit/layout.ts';
import { layoutLineup } from '../../apps/web/src/orbit/lineup.ts';
import { OrbitRenderer } from '../../apps/web/src/orbit/OrbitRenderer.ts';
import { DEFAULT_LAYERS, orbitPicture } from '../../apps/web/src/orbit/picture.ts';
import { cssSeconds, readOrbitMotion, readOrbitTheme, withAlpha } from '../../apps/web/src/orbit/theme.ts';
import { blendPictures, travelOrder } from '../../apps/web/src/orbit/tween.ts';
import { HEX_KEY, recordingContext, testSystem } from './orbit_fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const paint = (name) => ({ solid: name, glow: name + '-glow', clear: name + '-clear', rim: name + '-rim' });
const port = (name) => ({ washLit: [name + '-lit', name + '-lit2', name + '-lit3'], washDark: [name + '-dark', name + '-dark2', name + '-dark3'], hub: ['hub', name + '-hub2', name + '-hub3'] });
const theme = {
    space: 'space', spaceClear: 'space-clear', starCore: 'core',
    stars: { G: paint('star-g'), M: paint('star-m') }, starUnknown: paint('star-unknown'),
    field: ['f1', 'f2'], nebulae: [[['n1', 'n1c'], ['n2', 'n2c'], ['n3', 'n3c']]],
    hzEdge: 'hz-edge', hzMid: 'hz-mid', hzLine: 'hz-line',
    jump: 'jump',
    pathBase: 'path', hzPanel: 'hz-panel', rock: 'rock', scanWedge: ['wedge-clear', 'wedge'],
    tones: { gasLarge: 'gas-large', gasMedium: 'gas-medium', gasSmall: 'gas-small', belt: 'belt', world: 'world' },
    moon: 'moon', ring: 'ring', beltBand: 'belt-band', night: 'night', shadow: ['sh1', 'sh2', 'sh3'],
    mainworld: 'mainworld', text: 'text', textMuted: 'muted', lock: 'lock', lockGlow: ['lock-glow', 'lock-clear'],
    signal: 'signal', tag: 'tag',
    port: { major: port('major'), minor: port('minor') },
    portStarboard: ['sb1', 'sb2', 'sb3'], portPort: ['pt1', 'pt2', 'pt3'], portStrobe: ['st1', 'st2', 'st3'],
    portShade: 'port-shade', portPath: 'port-path',
    fontText: 'TextFont', fontCode: 'CodeFont', tLock: 0.65, tPulse: 2.4, tSweep: 8,
};

const deps = { makeCanvas: null, loadImage: null, artBase: '/starports/', stale() {} };

/** A stand-in for the surface service: it records the batches and the tiles asked for. */
function fakeDiscs(status, has = () => true) {
    const seen = { batches: [], draws: [] };
    return {
        seen,
        painter: {
            mode: () => 'enhanced',
            prepare(batch) { seen.batches.push(batch); return status; },
            draw(ctx, key, x, y, r) {
                seen.draws.push({ key, x, y, r });
                if (!has(key)) return false;
                ctx.fillStyle = 'tile:' + key;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
                return true;
            },
        },
    };
}

/** The orbits layout painted once with a disc painter. */
function shadedFrame(status, has, layers = {}) {
    const plan = planSystem(testSystem(), HEX_KEY);
    const switches = { ...DEFAULT_LAYERS, ...layers };
    const view = { ...VIEW, zoom: 3, z: 1.6 };
    const scene = layoutScene(plan, { ...view, moons: switches.moons, jump: switches.jump }, 1000);
    const picture = orbitPicture(plan, scene, switches, view.z);
    const fake = status === null ? null : fakeDiscs(status, has);
    const { ctx, calls } = recordingContext();
    const renderer = new OrbitRenderer(ctx, theme, { ...deps, discs: fake ? fake.painter : null });
    renderer.resize(view.w, view.h, 2);
    renderer.draw(plan, picture, view, { selected: null, days: 1000, time: 5000, motion: true, layers: switches });
    return { calls, seen: fake ? fake.seen : null, picture };
}
const VIEW = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false };

/** Paints a picture twice a second apart (so a selection lock has landed) and returns the second frame's calls. */
function paintPicture(plan, picture, view, state = {}) {
    const { ctx, calls } = recordingContext();
    const renderer = new OrbitRenderer(ctx, theme, deps);
    renderer.resize(view.w, view.h, 1);
    const full = { selected: null, days: 1000, time: 5000, motion: true, layers: DEFAULT_LAYERS, ...state };
    renderer.draw(plan, picture, view, { ...full, time: full.time - 1000 });
    calls.length = 0;
    renderer.draw(plan, picture, view, full);
    return calls;
}

/** The orbits layout, painted. `layers` overrides the default switches. */
function drawn(state = {}, view = VIEW, layers = {}) {
    const plan = planSystem(testSystem(), HEX_KEY);
    const switches = { ...DEFAULT_LAYERS, ...layers };
    const laid = { ...view, moons: switches.moons, jump: switches.jump };
    const scene = layoutScene(plan, laid, 1000);
    const calls = paintPicture(plan, orbitPicture(plan, scene, switches, view.z), view, { ...state, layers: switches });
    return { calls, scene, plan };
}

/** A line-up, painted. */
function lined(mode, layers = {}, state = {}) {
    const plan = planSystem(testSystem(), HEX_KEY);
    const switches = { ...DEFAULT_LAYERS, ...layers };
    const picture = layoutLineup(plan, { ...VIEW, moons: switches.moons }, mode, 1000, switches);
    return { calls: paintPicture(plan, picture, VIEW, { ...state, layers: switches }), picture, plan };
}

/** The index of the dash pattern call just before call `at`, or -1. */
const dashBefore = (calls, at) => {
    for (let i = at; i >= 0; i--) if (calls[i].op === 'setLineDash') return calls[i].args[0].join(',');
    return '';
};

/** The index of the first call that matches, or -1. */
const first = (calls, test) => calls.findIndex(test);
const last = (calls, test) => calls.length - 1 - [...calls].reverse().findIndex(test);
const isGradient = (value, stop) => value && typeof value === 'object' && value.stops.some((entry) => entry[1] === stop);

test('the legacy paint order: field, band, jump circles, companions, primary worlds, stars', () => {
    const { calls } = drawn();
    const field = first(calls, (c) => c.op === 'fillRect' && c.fill === 'space');
    const band = first(calls, (c) => c.op === 'fill' && isGradient(c.fill, 'hz-mid'));
    const jump = first(calls, (c) => c.op === 'stroke' && c.stroke === 'jump');
    // A companion's orbit is the dashed [4, 6] stroke in the path colour.
    const companionOrbit = calls.findIndex((c, i) => c.op === 'stroke' && c.stroke === 'path' && dashBefore(calls, i) === '4,6');
    const companionBand = last(calls, (c) => c.op === 'fill' && isGradient(c.fill, 'hz-mid'));
    const beltBand = first(calls, (c) => c.op === 'stroke' && c.stroke === 'belt-band');
    // The companion's set strokes a path too; this is the primary's, after its belt.
    const worldOrbit = calls.findIndex((c, i) => i > beltBand && c.op === 'stroke' && c.stroke === 'path');
    const giant = first(calls, (c) => c.op === 'fill' && c.fill === 'gas-large');
    const moon = first(calls, (c) => c.op === 'fill' && c.fill === 'moon');
    const starGlow = first(calls, (c) => c.op === 'fill' && isGradient(c.fill, 'star-g-glow'));
    const starName = first(calls, (c) => c.op === 'fillText' && c.args[0] === 'G2 V');
    for (const at of [field, band, jump, companionOrbit, companionBand, beltBand, worldOrbit, giant, moon, starGlow, starName]) assert.ok(at >= 0);
    assert.ok(field < band, 'the field is under the band');
    assert.ok(band < jump, 'the band is under the jump circles');
    assert.ok(jump < companionOrbit, 'jump circles come before the companion');
    assert.ok(companionOrbit < companionBand, 'a companion: its orbit, then its band');
    // The companion's own world (a plain world disc) is painted before the primary's belt and worlds.
    const companionWorld = first(calls, (c) => c.op === 'fill' && c.fill === 'world');
    assert.ok(companionBand < companionWorld && companionWorld < beltBand);
    assert.ok(beltBand < worldOrbit, 'belts before orbit paths');
    assert.ok(worldOrbit < giant, 'orbit paths before the bodies');
    assert.ok(giant < moon, 'a world before its moons');
    assert.ok(moon < starGlow, 'stars on top of every world');
    assert.ok(starGlow < starName);
});

test('labels: star names, a companion’s separation, the mainworld’s name and mark; the legend names the rest', () => {
    const { calls } = drawn();
    const text = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    assert.ok(text.includes('G2 V') && text.includes('M0 V'));
    assert.ok(text.includes('Far'));
    assert.ok(text.includes('Test'), 'the mainworld moon is named');
    assert.ok(!text.includes('Test II') && !text.includes('Test I'), 'other worlds are not labelled');
    // The band and the jump circles are named in the legend (orbit/legend.ts), never across the picture.
    assert.ok(!text.some((t) => String(t).startsWith('HABITABLE')) && !text.includes('100D jump'));
    // The mainworld mark and name use the mainworld colour.
    assert.ok(calls.some((c) => c.op === 'fillText' && c.args[0] === 'Test' && c.fill === 'mainworld'));
    assert.ok(calls.some((c) => c.op === 'fill' && c.fill === 'mainworld'));
});

test('flat discs carry a night half; rings are circles; no art is asked for without a loader', () => {
    const { calls } = drawn();
    assert.ok(calls.some((c) => c.op === 'fill' && c.fill === 'night'));
    assert.ok(calls.filter((c) => c.op === 'stroke' && c.stroke === 'ring').length >= 2, 'the ring moon and world.rings');
    assert.ok(!calls.some((c) => c.op === 'drawImage'));
    // The highport still shows its lights without the painting: the wash and a lamp.
    assert.ok(calls.some((c) => c.op === 'fillRect' && isGradient(c.fill, 'major-lit')));
    assert.ok(calls.some((c) => c.op === 'fill' && (c.fill === 'sb3' || c.fill === 'pt3')));
});

test('a highport fades into its world’s shadow as a moon does, and never snaps', () => {
    // One pass of the station round its world, in steps far smaller than its period.
    const dark = [];
    for (let i = 0; i < 400; i++) {
        const plan = planSystem(testSystem(), HEX_KEY);
        const days = 1000 + i * 0.0005;
        const scene = layoutScene(plan, { ...VIEW, moons: true, jump: true }, days);
        const calls = paintPicture(plan, orbitPicture(plan, scene, DEFAULT_LAYERS, VIEW.z), VIEW, { days });
        const lit = calls.filter((c) => c.op === 'fillRect' && isGradient(c.fill, 'major-lit'));
        const shade = calls.filter((c) => c.op === 'fillRect' && isGradient(c.fill, 'major-dark'));
        assert.ok(lit.length <= 1 && shade.length <= 1 && lit.length + shade.length >= 1);
        const litA = lit.length ? lit[0].alpha : 0;
        const darkA = shade.length ? shade[0].alpha : 0;
        // The two washes share one breathing strength between them.
        assert.ok(litA + darkA > 0.69 && litA + darkA <= 1.0001, 'lit ' + litA + ' dark ' + darkA);
        dark.push(darkA / (litA + darkA));
    }
    assert.ok(dark.some((share) => share === 0), 'fully lit somewhere on its orbit');
    assert.ok(dark.some((share) => share > 0.99), 'fully dark somewhere on its orbit');
    assert.ok(dark.some((share) => share > 0.2 && share < 0.8), 'and part-way between');
    // No step between two neighbouring moments is a snap.
    let worst = 0;
    for (let i = 1; i < dark.length; i++) worst = Math.max(worst, Math.abs(dark[i] - dark[i - 1]));
    assert.ok(worst < 0.25, 'largest step ' + worst);
});

test('shaded discs: one batch a frame, a tile per body, and the flat disc wherever there is none', () => {
    const flat = shadedFrame(null);
    const ready = shadedFrame('ready');
    // One batch for the frame, never one per body, carrying the mode, the time and every body.
    assert.equal(ready.seen.batches.length, 1);
    const batch = ready.seen.batches[0];
    assert.equal(batch.mode, 'enhanced');
    assert.equal(batch.timeSeconds, 5);
    assert.ok(batch.discs.length >= 3);
    assert.deepEqual(batch.discs.find((disc) => disc.key === 'w2').sun, [1, 1, 1]);
    assert.equal(batch.discs.find((disc) => disc.key === 'w0').radiusPx, flat.picture.layers.flatMap((layer) => layer.worlds).find((at) => at.world.key === 'w0').r * 2);
    // Each body of the batch is drawn once, where the painter puts its flat disc, at that radius.
    assert.deepEqual(ready.seen.draws.map((draw) => draw.key).sort(), batch.discs.map((disc) => disc.key).sort());
    const giant = flat.picture.layers.flatMap((layer) => layer.worlds).find((at) => at.world.key === 'w2');
    assert.deepEqual(ready.seen.draws.find((draw) => draw.key === 'w2'), { key: 'w2', x: giant.x, y: giant.y, r: giant.r });
    // A tile replaces the flat disc, its night half, the moon's shadow wash and the flat rings.
    const tiles = ready.calls.filter((c) => c.op === 'fillRect' && String(c.fill).startsWith('tile:'));
    assert.equal(tiles.length, batch.discs.length);
    assert.ok(flat.calls.some((c) => c.op === 'fill' && c.fill === 'gas-large'));
    assert.ok(!ready.calls.some((c) => c.op === 'fill' && c.fill === 'gas-large'));
    assert.ok(flat.calls.some((c) => c.op === 'fill' && c.fill === 'night'));
    assert.ok(flat.calls.filter((c) => c.op === 'stroke' && c.stroke === 'ring').length >= 2);
    assert.ok(!ready.calls.some((c) => c.op === 'stroke' && c.stroke === 'ring'), 'the tile carries the rings');
    // The highport, the mainworld's mark and the names are still painted over the tiles.
    assert.ok(ready.calls.some((c) => c.op === 'fillRect' && isGradient(c.fill, 'major-lit')));
    assert.ok(ready.calls.some((c) => c.op === 'fill' && c.fill === 'mainworld'));

    // A tile the service does not hold: that body keeps its flat disc, its rings and its night half.
    const partial = shadedFrame('ready', (key) => key !== 'w2');
    assert.ok(partial.calls.some((c) => c.op === 'fill' && c.fill === 'gas-large'));
    assert.ok(partial.calls.filter((c) => c.op === 'stroke' && c.stroke === 'ring').length >= 2);
    assert.ok(partial.calls.some((c) => c.op === 'fillRect' && c.fill === 'tile:w0'));
    assert.ok(!partial.calls.some((c) => c.op === 'fillRect' && c.fill === 'tile:w2'));

    // Pending and unavailable: the batch is still sent once, nothing is drawn from it, and the
    // frame is the flat one, call for call. No error is shown.
    for (const status of ['pending', 'unavailable']) {
        const waiting = shadedFrame(status);
        assert.equal(waiting.seen.batches.length, 1, status);
        assert.equal(waiting.seen.draws.length, 0, status);
        assert.equal(JSON.stringify(waiting.calls), JSON.stringify(flat.calls), status);
    }
    // Day / night off: as legacy, no discs are asked for at all.
    const off = shadedFrame('ready', () => true, { dayNight: false });
    assert.equal(off.seen.batches.length, 0);
    assert.equal(off.seen.draws.length, 0);
});

test('the discs ask for another frame while they are starting, arriving or moving, and not otherwise', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const view = { ...VIEW, zoom: 3, z: 1.6 };
    const picture = orbitPicture(plan, layoutScene(plan, { ...view, moons: true, jump: true }, 1000), DEFAULT_LAYERS, view.z);
    const made = (status, has, layers = DEFAULT_LAYERS) => {
        const fake = status === null ? null : fakeDiscs(status, has);
        const renderer = new OrbitRenderer(recordingContext().ctx, theme, { ...deps, discs: fake ? fake.painter : null });
        renderer.resize(view.w, view.h, 2);
        let time = 5000;
        const frame = (motion) => {
            time += 16;
            renderer.draw(plan, picture, view, { selected: null, days: 1000, time, motion, layers });
            return renderer.discsBusy;
        };
        return frame;
    };
    // No service, an unavailable one, or Day / night off: never.
    assert.equal(made(null)(true), false);
    assert.equal(made('unavailable')(true), false);
    assert.equal(made('ready', () => true, { ...DEFAULT_LAYERS, dayNight: false })(true), false);
    // Starting up: yes, with or without motion.
    assert.equal(made('pending')(false), true);
    // Ready, with motion: the worlds turn, so every frame.
    assert.equal(made('ready')(true), true);
    // Ready, reduced motion, a tile missing: yes until it has arrived and some frames have passed.
    let arrived = false;
    const still = made('ready', () => arrived);
    assert.equal(still(false), true);
    arrived = true;
    assert.equal(still(false), true, 'sharper tiles may still follow');
    let frames = 1;
    while (still(false) && frames < 1000) frames += 1;
    assert.ok(frames > 60 && frames < 400, 'it settles after ' + frames + ' frames');
    assert.equal(still(false), false);
    // A tile that goes missing again starts the wait again.
    arrived = false;
    assert.equal(still(false), true);
});

test('the selection lock is painted last, in the lock colour, with the body’s tag', () => {
    const { calls } = drawn({ selected: 'w2m2', time: 100000 });
    const starName = last(calls, (c) => c.op === 'fillText' && c.args[0] === 'M0 V');
    const lockRing = first(calls, (c) => c.op === 'stroke' && c.stroke === 'lock');
    assert.ok(lockRing > starName);
    const tagName = first(calls, (c) => c.op === 'fillText' && c.args[0] === 'TEST');
    const tagDetail = first(calls, (c) => c.op === 'fillText' && c.args[0] === 'A667899-C');
    assert.ok(tagName > lockRing && tagDetail > tagName);
    // Nothing selected, or a key that is not in the picture: no lock.
    assert.ok(!drawn().calls.some((c) => c.stroke === 'lock'));
    assert.ok(!drawn({ selected: 'w9' }).calls.some((c) => c.stroke === 'lock'));
    // Reduced motion: the lock is there, the pulse is not.
    const still = drawn({ selected: 'w0', motion: false });
    assert.ok(still.calls.some((c) => c.op === 'stroke' && c.stroke === 'lock'));
    const strokesAfterTag = still.calls.slice(last(still.calls, (c) => c.op === 'fillText'));
    assert.ok(!strokesAfterTag.some((c) => c.op === 'stroke' && c.stroke === 'signal'));
});

test('a body off the canvas is not painted, and its hit target stays', () => {
    const near = drawn();
    const far = drawn({}, { ...VIEW, offX: 40000, offY: 40000 });
    assert.ok(near.calls.some((c) => c.fill === 'gas-large'));
    assert.ok(!far.calls.some((c) => c.fill === 'gas-large'));
    assert.ok(!far.calls.some((c) => c.op === 'fillText'));
    assert.equal(far.scene.hits.length, near.scene.hits.length);
});

test('orbit paths are drawn at the ring strength, and the layer switches take things away', () => {
    const base = drawn();
    const pathStroke = base.calls.find((c) => c.op === 'stroke' && c.stroke === 'path' && dashBefore(base.calls, base.calls.indexOf(c)) !== '4,6');
    assert.ok(Math.abs(pathStroke.alpha - 0.65 * 0.40) < 1e-9, 'a world orbit at 40% of the strength');
    const strong = drawn({}, VIEW, { pathStrength: 1 });
    assert.ok(strong.calls.some((c) => c.op === 'stroke' && c.stroke === 'path' && Math.abs(c.alpha - 0.40) < 1e-9));
    assert.ok(strong.calls.some((c) => c.op === 'stroke' && c.stroke === 'path' && Math.abs(c.alpha - 0.55) < 1e-9), 'a companion orbit at 55%');

    // Paths off: no orbit strokes; the belt is not a path and stays.
    const noPaths = drawn({}, VIEW, { paths: false });
    assert.ok(!noPaths.calls.some((c) => c.op === 'stroke' && c.stroke === 'path'));
    assert.ok(noPaths.calls.some((c) => c.op === 'stroke' && c.stroke === 'belt-band'));
    // Moons off: no moon discs, no rings, and no hit targets for them.
    const noMoons = drawn({}, VIEW, { moons: false });
    assert.ok(!noMoons.calls.some((c) => c.fill === 'moon') && !noMoons.calls.some((c) => c.stroke === 'ring'));
    assert.ok(!noMoons.scene.hits.some((hit) => hit.kind === 'moon' || hit.kind === 'ring'));
    // Habitable off, Jump limit off.
    const noBand = drawn({}, VIEW, { habitable: false });
    assert.ok(!noBand.calls.some((c) => c.stroke === 'hz-line') && !noBand.calls.some((c) => isGradient(c.fill, 'hz-mid')));
    assert.ok(drawn().calls.some((c) => c.stroke === 'hz-line'));
    const noJump = drawn({}, VIEW, { jump: false });
    assert.ok(!noJump.calls.some((c) => c.stroke === 'jump') && noJump.scene.jumps.length === 0);
    // Day / night off: no night halves. Mark off: no mainworld star and no name.
    assert.ok(!drawn({}, VIEW, { dayNight: false }).calls.some((c) => c.fill === 'night'));
    const noMark = drawn({}, VIEW, { markMainworld: false });
    assert.ok(!noMark.calls.some((c) => c.fill === 'mainworld'));
});

test('a line-up paints its panel, arcs, rocks, bodies and captions, and none of the orbit labels', () => {
    const { calls, picture } = lined('row');
    const text = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    // Captions: every node, the companion with its separation; a name too long for its slot is shortened.
    assert.ok(text.includes('G2 V') && text.includes('M0 V (Far)') && text.includes('Test Belt'));
    assert.equal(picture.captions.length, 6);
    // The panel behind the companion's world, which sits in that star's habitable zone.
    const panel = first(calls, (c) => c.op === 'fill' && c.fill === 'hz-panel');
    const arc = first(calls, (c) => c.op === 'stroke' && c.stroke === 'path');
    const rock = first(calls, (c) => c.op === 'fill' && c.fill === 'rock');
    const giant = first(calls, (c) => c.op === 'fill' && c.fill === 'gas-large');
    const caption = first(calls, (c) => c.op === 'fillText');
    for (const at of [panel, arc, rock, giant, caption]) assert.ok(at >= 0);
    assert.ok(panel < arc && arc < rock && giant < caption);
    assert.equal(calls.filter((c) => c.op === 'fill' && c.fill === 'rock').length, 72);
    assert.ok(Math.abs(calls[arc].alpha - 0.65 * 0.55) < 1e-9, 'line-up arcs at 55% of the strength');
    // The selection lock is drawn in a line-up, without the readout tag (orbits layout only).
    const selected = lined('column', {}, { selected: 'w2', time: 100000 });
    assert.ok(selected.calls.some((c) => c.op === 'stroke' && c.stroke === 'lock'));
    assert.ok(!selected.calls.some((c) => c.op === 'fillText' && c.args[0] === 'TEST II'));
    // A caption that does not fit falls back to the short name before it is cut.
    const narrow = { ...picture, captions: [{ ...picture.captions[1], text: 'Test I of the long name', short: 'I', maxW: 20 }] };
    const drawnNarrow = paintPicture(planSystem(testSystem(), HEX_KEY), narrow, VIEW);
    assert.ok(drawnNarrow.some((c) => c.op === 'fillText' && c.args[0] === 'I'));
});

test('the scan view marks every world and moon, and sweeps round the primary in the orbits layout', () => {
    const scanned = drawn({}, VIEW, { scan: true });
    const plain = drawn();
    const signalStrokes = (calls) => calls.filter((c) => c.op === 'stroke' && c.stroke === 'signal').length;
    assert.ok(signalStrokes(scanned.calls) > signalStrokes(plain.calls) + 8);
    // The sweep is a conic wedge over the whole canvas, then the leading edge.
    assert.ok(scanned.calls.some((c) => c.op === 'fillRect' && c.fill && c.fill.kind === 'conic'));
    // Designations: the short name of each world, in the orbits layout only.
    const labels = scanned.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    assert.ok(labels.includes('II') && labels.includes('I'));
    const row = lined('row', { scan: true });
    assert.ok(!row.calls.some((c) => c.op === 'fillRect' && c.fill && c.fill.kind === 'conic'), 'no sweep in a line-up');
    assert.ok(signalStrokes(row.calls) > 8);
    // Reduced motion: marks, no sweep.
    const still = drawn({ motion: false }, VIEW, { scan: true });
    assert.ok(!still.calls.some((c) => c.op === 'fillRect' && c.fill && c.fill.kind === 'conic'));
    assert.ok(signalStrokes(still.calls) > 8);
});

test('a picture part way between two layouts paints: fading bands, travelling bodies, arriving captions', () => {
    const plan = planSystem(testSystem(), HEX_KEY);
    const from = orbitPicture(plan, layoutScene(plan, VIEW, 1000), DEFAULT_LAYERS, 1);
    const to = layoutLineup(plan, VIEW, 'row', 1000, DEFAULT_LAYERS);
    const order = travelOrder(plan);
    const early = blendPictures({ from, to, elapsed: 100, ms: 650, order, days: 1000, moonsShown: true });
    const late = blendPictures({ from, to, elapsed: 700, ms: 650, order, days: 1000, moonsShown: true });
    const earlyCalls = paintPicture(plan, early, VIEW);
    const lateCalls = paintPicture(plan, late, VIEW);
    assert.ok(earlyCalls.some((c) => c.fill === 'gas-large') && lateCalls.some((c) => c.fill === 'gas-large'));
    // Early: the orbit's star name is still there and no caption has arrived.
    assert.ok(earlyCalls.some((c) => c.op === 'fillText' && c.args[0] === 'G2 V' && c.alpha > 0 && c.alpha < 1));
    assert.ok(!earlyCalls.some((c) => c.op === 'fillText' && c.args[0] === 'M0 V (Far)'));
    // Late: captions are arriving.
    assert.ok(lateCalls.some((c) => c.op === 'fillText' && c.args[0] === 'M0 V (Far)'));
});

test('a token colour takes an alpha; other forms pass through', () => {
    assert.equal(withAlpha('#45a29e', 0.5), 'rgba(69, 162, 158, 0.5)');
    assert.equal(withAlpha('#fff', 0), 'rgba(255, 255, 255, 0)');
    assert.equal(withAlpha(' #000000 ', 0.72), 'rgba(0, 0, 0, 0.72)');
    assert.equal(withAlpha('#ff000080', 0.5), 'rgba(255, 0, 0, 0.251)');
    assert.equal(withAlpha('lightblue', 0.5), 'lightblue');
    assert.equal(withAlpha('#12', 0.5), '#12');
    assert.equal(cssSeconds('650ms'), 0.65);
    assert.equal(cssSeconds('2.4s'), 2.4);
    assert.equal(cssSeconds(''), 0);
});

test('the theme reads every colour it needs from tokens.css', () => {
    // Parse the real token file, resolving var() one level, as the browser's computed style does.
    const css = fs.readFileSync(path.join(ROOT, 'apps/web/src/design/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const tokens = {};
    for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[match[1]] = match[2].trim();
    const resolve = (value) => value.replace(/var\((--[a-z0-9-]+)\)/g, (_all, name) => tokens[name] ?? '');
    const asked = new Set();
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({
        getPropertyValue(name) { asked.add(name); return resolve(tokens[name] ?? ''); },
    });
    try {
        const read = readOrbitTheme({});
        for (const name of asked) assert.ok(tokens[name] !== undefined, name + ' is not in tokens.css');
        // The legacy alphas over the legacy colours.
        assert.equal(read.space, '#000000');
        assert.equal(read.jump, 'rgba(120, 186, 255, 0.95)');
        assert.equal(read.hzMid, 'rgba(88, 214, 120, 0.28)');
        assert.equal(read.pathBase, '#45a29e');
        assert.equal(read.hzPanel, 'rgba(88, 214, 120, 0.2)');
        assert.equal(read.rock, '#e4e8ea');
        assert.equal(read.scanWedge[1], 'rgba(102, 252, 241, 0.035)');
        assert.equal(read.tones.gasLarge, '#c8a97a');
        assert.equal(read.moon, '#6a7070');
        assert.equal(read.night, 'rgba(0, 5, 15, 0.72)');
        assert.equal(read.mainworld, '#66fcf1');
        assert.equal(read.stars.G.solid, '#fff4ea');
        assert.equal(read.stars.BD.solid, '#a56432');
        assert.equal(read.field.length, 7);
        assert.equal(read.nebulae.length, 5);
        assert.equal(read.nebulae[0][0][0], 'rgba(40, 150, 170, 0.05)');
        assert.equal(read.nebulae[4][0][0], 'rgba(150, 140, 60, 0.05)');
        assert.equal(read.port.major.washLit[0], 'rgba(150, 236, 255, 0.34)');
        assert.equal(read.tLock, 0.65);
        assert.equal(read.tPulse, 2.4);
        assert.equal(read.tSweep, 8);
        const flat = JSON.stringify(read);
        assert.ok(!flat.includes('""') && !flat.includes('NaN'), 'no token came back empty');
        const motion = readOrbitMotion({});
        assert.deepEqual(motion, { hop: 450, flight: 800, lineup: 650 });
    } finally {
        globalThis.getComputedStyle = previous;
    }
});

test('the backdrop is seeded by the hex: the same sky every time, a different one elsewhere', () => {
    assert.equal(seedOf('backdrop|Spinward_Marches/1910'), seedOf('backdrop|Spinward_Marches/1910'));
    assert.notEqual(seedOf('backdrop|Spinward_Marches/1910'), seedOf('backdrop|Spinward_Marches/1911'));
    const a = rng(42);
    const b = rng(42);
    const run = [a(), a(), a()];
    assert.deepEqual(run, [b(), b(), b()]);
    for (const value of run) assert.ok(value >= 0 && value < 1);

    // 6% margin each side; the drift is 2% of the pan, held inside the margin.
    const box = backdropBox(1000, 800);
    assert.deepEqual(box, { mx: 60, my: 48, bw: 1120, bh: 896 });
    assert.deepEqual(backdropShift(box, 0, 0), { x: -60, y: -48 });
    assert.deepEqual(backdropShift(box, 500, -1000), { x: -50, y: -68 });
    assert.deepEqual(backdropShift(box, 1e6, -1e6), { x: 0, y: -96 });

    const paintOnce = (key) => {
        const { ctx, calls } = recordingContext();
        paintBackdrop(ctx, box, 1, key, theme);
        return calls;
    };
    const one = paintOnce('Spinward_Marches/1910');
    const two = paintOnce('Spinward_Marches/1910');
    const other = paintOnce('Spinward_Marches/1911');
    const arcs = (calls) => calls.filter((c) => c.op === 'arc').map((c) => c.args.slice(0, 3).join(','));
    assert.deepEqual(arcs(one), arcs(two));
    assert.notDeepEqual(arcs(one), arcs(other));
    assert.equal(one[0].op, 'fillRect');
    assert.equal(one[0].fill, 'space');
    // Four glows, then stars thinned toward the band: fewer than one per 800 px², more than none.
    assert.equal(one.filter((c) => c.op === 'fillRect' && isGradient(c.fill, 'n1c') | isGradient(c.fill, 'n2c') | isGradient(c.fill, 'n3c')).length, 4);
    const count = arcs(one).length;
    assert.ok(count > 100 && count <= Math.round(1120 * 896 / 800) + Math.round(1120 * 896 / 60000));
});

/** One fresh frame, so a previous frame's canvas state cannot leak into the recording. */
function frameCalls(state = {}, view = VIEW) {
    const plan = planSystem(testSystem(), HEX_KEY);
    const laid = { ...view, moons: DEFAULT_LAYERS.moons, jump: DEFAULT_LAYERS.jump };
    const scene = layoutScene(plan, laid, 1000);
    const { ctx, calls } = recordingContext();
    const renderer = new OrbitRenderer(ctx, theme, deps);
    renderer.resize(view.w, view.h, 1);
    renderer.draw(plan, orbitPicture(plan, scene, DEFAULT_LAYERS, view.z), view, {
        selected: null, days: 1000, time: 5000, motion: true, layers: DEFAULT_LAYERS, ...state,
    });
    return calls;
}

/** The calls added after a steady frame. */
function extraCalls(state, view = VIEW) {
    const base = frameCalls({}, view);
    const next = frameCalls(state, view);
    assert.equal(JSON.stringify(next.slice(0, base.length)), JSON.stringify(base));
    return next.slice(base.length);
}

test('the steady frame with the ship layer off is unchanged', () => {
    const base = drawn();
    const off = drawn({ ships: [], plot: null });
    assert.equal(JSON.stringify(off.calls), JSON.stringify(base.calls));
    assert.equal(JSON.stringify(frameCalls()), JSON.stringify(frameCalls({ ships: [], plot: null })));
});

test('one wireframe designator per shape, the same size at another zoom', () => {
    const marks = [
        { id: 'a', name: 'Far Margin', kind: 'party', shape: 'triangle', x: 120, y: 80, heading: 0.5 },
        { id: 'b', name: 'Courier', kind: 'vessel', shape: 'circle', x: 180, y: 80 },
        { id: 'c', name: 'Patrol', kind: 'traffic', shape: 'square', x: 240, y: 80 },
        { id: 'd', name: 'Liner', kind: 'traffic', shape: 'rectangle', x: 300, y: 80, heading: 1 },
    ];
    const extra = extraCalls({ ships: marks });
    assert.ok(!extra.some((c) => c.op === 'drawImage'));
    assert.ok(!extra.some((c) => c.op === 'fill'));
    const strokes = extra.filter((c) => c.op === 'stroke');
    assert.deepEqual(strokes.map((c) => c.stroke), ['signal', 'text', 'muted', 'muted']);
    const text = extra.filter((c) => c.op === 'fillText');
    assert.deepEqual(text.map((c) => c.args), [
        ['Far Margin', 132, 80],
        ['Courier', 192, 80],
        ['Patrol', 252, 80],
        ['Liner', 312, 80],
    ]);
    assert.deepEqual(text.map((c) => c.fill), ['signal', 'text', 'muted', 'muted']);

    const path = (shape) => {
        const start = extra.findIndex((c) => c.op === 'translate' && c.args[0] === marks.find((m) => m.shape === shape).x);
        const end = extra.findIndex((c, i) => i > start && c.op === 'restore');
        return extra.slice(start, end).filter((c) => c.op === 'moveTo' || c.op === 'lineTo' || c.op === 'arc' || c.op === 'rect' || c.op === 'closePath' || c.op === 'rotate');
    };
    assert.deepEqual(path('triangle').map((c) => [c.op, ...c.args]), [
        ['rotate', 0.5],
        ['moveTo', 8, 0],
        ['lineTo', -6, 5],
        ['lineTo', -6, -5],
        ['closePath'],
    ]);
    assert.deepEqual(path('circle').filter((c) => c.op === 'arc').map((c) => c.args.slice(0, 3)), [[0, 0, 6]]);
    assert.deepEqual(path('square').filter((c) => c.op === 'rect').map((c) => c.args), [[-5, -5, 10, 10]]);
    assert.deepEqual(path('rectangle').map((c) => [c.op, ...c.args]).filter((row) => row[0] === 'rect' || row[0] === 'rotate'), [
        ['rotate', 1],
        ['rect', -9, -4, 18, 8],
    ]);

    const wideView = { ...VIEW, z: 4, zoom: 6 };
    const wide = extraCalls({ ships: marks }, wideView);
    const local = (calls) => calls.filter((c) => c.op === 'moveTo' || c.op === 'lineTo' || c.op === 'rect' || c.op === 'arc').map((c) => [c.op, ...c.args]);
    // A larger picture.z does not change the designator's own pixels.
    assert.deepEqual(local(wide), local(extra));
});

test('the plotting overlay is hairlines and a readout, and only on that frame', () => {
    const extra = extraCalls({ plot: { x: 100, y: 200, from: { x: 100, y: 230 } } });
    const hair = extra.filter((c) => c.op === 'moveTo' || c.op === 'lineTo');
    assert.deepEqual(hair.map((c) => [c.op, ...c.args]), [
        ['moveTo', 0, 200],
        ['lineTo', 1000, 200],
        ['moveTo', 100, 0],
        ['lineTo', 100, 800],
    ]);
    assert.equal(extra.find((c) => c.op === 'stroke').stroke, 'text');
    const readout = extra.find((c) => c.op === 'fillText');
    assert.deepEqual(readout.args, ['100.0, 200.0  30.0', 108, 212]);
    assert.equal(readout.fill, 'text');
    assert.ok(!extra.some((c) => c.op === 'drawImage'));
});
