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
import { OrbitRenderer } from '../../apps/web/src/orbit/OrbitRenderer.ts';
import { cssSeconds, ORBIT_OPACITY, readOrbitMotion, readOrbitTheme, withAlpha } from '../../apps/web/src/orbit/theme.ts';
import { HEX_KEY, recordingContext, testSystem } from './orbit_fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const paint = (name) => ({ solid: name, glow: name + '-glow', clear: name + '-clear', rim: name + '-rim' });
const port = (name) => ({ washLit: [name + '-lit', name + '-lit2', name + '-lit3'], washDark: [name + '-dark', name + '-dark2', name + '-dark3'], hub: ['hub', name + '-hub2', name + '-hub3'] });
const theme = {
    space: 'space', spaceClear: 'space-clear', starCore: 'core',
    stars: { G: paint('star-g'), M: paint('star-m') }, starUnknown: paint('star-unknown'),
    field: ['f1', 'f2'], nebulae: [[['n1', 'n1c'], ['n2', 'n2c'], ['n3', 'n3c']]],
    hzEdge: 'hz-edge', hzMid: 'hz-mid', hzLine: 'hz-line', hzText: 'hz-text', hzPill: 'hz-pill',
    jump: 'jump', jumpText: 'jump-text',
    path: 'path', companionPath: 'companion-path', pathWidth: 2,
    tones: { gasLarge: 'gas-large', gasMedium: 'gas-medium', gasSmall: 'gas-small', belt: 'belt', world: 'world' },
    moon: 'moon', ring: 'ring', beltBand: 'belt-band', night: 'night', shadow: ['sh1', 'sh2', 'sh3'],
    mainworld: 'mainworld', text: 'text', textMuted: 'muted', lock: 'lock', lockGlow: ['lock-glow', 'lock-clear'],
    signal: 'signal', tag: 'tag',
    port: { major: port('major'), minor: port('minor') },
    portStarboard: ['sb1', 'sb2', 'sb3'], portPort: ['pt1', 'pt2', 'pt3'], portStrobe: ['st1', 'st2', 'st3'],
    portShade: 'port-shade', portPath: 'port-path',
    fontText: 'TextFont', fontCode: 'CodeFont', tLock: 0.65, tPulse: 2.4,
};

const deps = { makeCanvas: null, loadImage: null, artBase: '/starports/', stale() {} };
const VIEW = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false };

function drawn(state = {}, view = VIEW) {
    const plan = planSystem(testSystem(), HEX_KEY);
    const scene = layoutScene(plan, view, 1000);
    const { ctx, calls } = recordingContext();
    const renderer = new OrbitRenderer(ctx, theme, deps);
    renderer.resize(view.w, view.h, 1);
    const full = { selected: null, days: 1000, time: 5000, motion: true, ...state };
    // A frame a second earlier first, so the selection lock has landed in the frame that is read.
    renderer.draw(plan, scene, view, { ...full, time: full.time - 1000 });
    calls.length = 0;
    renderer.draw(plan, scene, view, full);
    return { calls, scene, plan };
}

/** The index of the first call that matches, or -1. */
const first = (calls, test) => calls.findIndex(test);
const last = (calls, test) => calls.length - 1 - [...calls].reverse().findIndex(test);
const isGradient = (value, stop) => value && typeof value === 'object' && value.stops.some((entry) => entry[1] === stop);

test('the legacy paint order: field, band, jump circles, companions, primary worlds, stars, labels', () => {
    const { calls } = drawn();
    const field = first(calls, (c) => c.op === 'fillRect' && c.fill === 'space');
    const band = first(calls, (c) => c.op === 'fill' && isGradient(c.fill, 'hz-mid'));
    const jump = first(calls, (c) => c.op === 'stroke' && c.stroke === 'jump');
    const companionOrbit = first(calls, (c) => c.op === 'stroke' && c.stroke === 'companion-path');
    const companionBand = last(calls, (c) => c.op === 'fill' && isGradient(c.fill, 'hz-mid'));
    const beltBand = first(calls, (c) => c.op === 'stroke' && c.stroke === 'belt-band');
    // The companion's set strokes a path too; this is the primary's, after its belt.
    const worldOrbit = calls.findIndex((c, i) => i > beltBand && c.op === 'stroke' && c.stroke === 'path');
    const giant = first(calls, (c) => c.op === 'fill' && c.fill === 'gas-large');
    const moon = first(calls, (c) => c.op === 'fill' && c.fill === 'moon');
    const starGlow = first(calls, (c) => c.op === 'fill' && isGradient(c.fill, 'star-g-glow'));
    const starName = first(calls, (c) => c.op === 'fillText' && c.args[0] === 'G2 V');
    const bandLabel = first(calls, (c) => c.op === 'fillText' && c.args[0] === 'HABITABLE ZONE');
    for (const at of [field, band, jump, companionOrbit, companionBand, beltBand, worldOrbit, giant, moon, starGlow, starName, bandLabel]) assert.ok(at >= 0);
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
    assert.ok(starName < bandLabel, 'habitable labels after the stars');
});

test('labels: star names, a companion’s separation, the mainworld’s name and mark, the 100D label', () => {
    const { calls } = drawn();
    const text = calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    assert.ok(text.includes('G2 V') && text.includes('M0 V'));
    assert.ok(text.includes('Far'));
    assert.ok(text.includes('Test'), 'the mainworld moon is named');
    assert.ok(!text.includes('Test II') && !text.includes('Test I'), 'other worlds are not labelled');
    assert.ok(text.includes('100D jump'));
    assert.ok(text.includes('HABITABLE ZONE · M0 V'));
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
        assert.equal(read.path, withAlpha('#45a29e', ORBIT_OPACITY * 0.40));
        assert.equal(read.companionPath, withAlpha('#45a29e', ORBIT_OPACITY * 0.55));
        assert.equal(read.pathWidth, 1 + ORBIT_OPACITY * 1.5);
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
        const flat = JSON.stringify(read);
        assert.ok(!flat.includes('""') && !flat.includes('NaN'), 'no token came back empty');
        const motion = readOrbitMotion({});
        assert.deepEqual(motion, { hop: 450, flight: 800 });
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
