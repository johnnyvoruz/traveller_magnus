/**
 * The selection lock's glow stays off the body. Painted over the limb, its gold at 16 %
 * read as a band of air round the night side with the city lights showing through it
 * (findings/city_lights_fix, Johnny's shots of 2026-10-17). The glow now begins at the
 * body's own drawn radius; outside the body its gradient is what it was.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutScene, planSystem } from '../../apps/web/src/orbit/layout.ts';
import { layoutLineup } from '../../apps/web/src/orbit/lineup.ts';
import { OrbitRenderer } from '../../apps/web/src/orbit/OrbitRenderer.ts';
import { DEFAULT_LAYERS, orbitPicture } from '../../apps/web/src/orbit/picture.ts';
import { HEX_KEY, recordingContext, testSystem } from './orbit_fixture.js';

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
const VIEW = { w: 1000, h: 800, zoom: 1, offX: 0, offY: 0, z: 1, linear: false };

/** Two frames a second apart, so the lock has landed; the second frame's calls and the picture. */
function paintSelected(picture, plan, selected) {
    const { ctx, calls } = recordingContext();
    const renderer = new OrbitRenderer(ctx, theme, deps);
    renderer.resize(VIEW.w, VIEW.h, 1);
    const state = { selected, days: 1000, time: 5000, motion: true, layers: DEFAULT_LAYERS };
    renderer.draw(plan, picture, VIEW, { ...state, time: 4000 });
    calls.length = 0;
    renderer.draw(plan, picture, VIEW, state);
    return calls;
}

function orbits(selected) {
    const plan = planSystem(testSystem(), HEX_KEY);
    const scene = layoutScene(plan, { ...VIEW, moons: true, jump: true }, 1000);
    const picture = orbitPicture(plan, scene, DEFAULT_LAYERS, VIEW.z);
    return { picture, calls: paintSelected(picture, plan, selected) };
}

function lineup(mode, selected) {
    const plan = planSystem(testSystem(), HEX_KEY);
    const picture = layoutLineup(plan, { ...VIEW, moons: true }, mode, 1000, DEFAULT_LAYERS);
    return { picture, calls: paintSelected(picture, plan, selected) };
}

/** The lock glow's fill: its gradient and the two arcs of the annulus it fills. */
function lockGlow(calls) {
    const at = calls.findIndex((c) => c.op === 'fill' && c.fill && c.fill.kind === 'radial'
        && c.fill.stops.length === 2 && c.fill.stops[0][1] === 'lock-glow' && c.fill.stops[1][1] === 'lock-clear');
    assert.ok(at > 0, 'the lock glow is painted');
    const arcs = calls.slice(0, at).filter((c) => c.op === 'arc').slice(-2);
    assert.equal(arcs.length, 2);
    return { gradient: calls[at].fill, outer: arcs[0], inner: arcs[1] };
}

test('the lock glow on a world begins at the world’s drawn edge, and its gradient outside is unchanged', () => {
    for (const key of ['w0', 'w2m2', 'w4']) {
        const { picture, calls } = orbits(key);
        const hit = picture.hits.find((h) => h.key === key);
        assert.ok(hit && hit.visualR !== undefined, key + ' is a body with a drawn radius');
        const R = hit.visualR + 5;
        const { gradient, outer, inner } = lockGlow(calls);
        // The annulus: from the body's edge out to the lock's reach. Nothing over the body.
        assert.equal(inner.args[2], hit.visualR, key + ': the glow starts at the drawn radius');
        assert.equal(inner.args[5], true, key + ': the inner arc is the hole');
        assert.equal(outer.args[2], R + 22, key + ': the glow reaches R + 22');
        assert.ok(inner.args[2] >= hit.visualR, key + ': no part of the glow lies inside the body');
        // Outside the body the gradient is the legacy one: 0.9 R to R + 22, lock colour to clear.
        assert.deepEqual(gradient.args, [hit.cx, hit.cy, R * 0.9, hit.cx, hit.cy, R + 22]);
    }
});

test('the lock glow on a star and in a line-up also stays off the body', () => {
    const star = orbits('s0');
    const starHit = star.picture.hits.find((h) => h.key === 's0');
    assert.ok(starHit && starHit.visualR !== undefined, 's0 is a star with a drawn radius');
    assert.equal(lockGlow(star.calls).inner.args[2], starHit.visualR);
    for (const mode of ['row', 'column']) {
        const lined = lineup(mode, 'w0');
        const hit = lined.picture.hits.find((h) => h.key === 'w0');
        assert.ok(hit && hit.visualR !== undefined, mode + ': w0 is a world with a drawn radius');
        assert.equal(lockGlow(lined.calls).inner.args[2], hit.visualR, mode + ': the glow starts at the drawn radius');
    }
});

test('a belt keeps the legacy glow, since no disc lies under the lock point', () => {
    const { picture, calls } = orbits('w3');
    const hit = picture.hits.find((h) => h.key === 'w3');
    assert.ok(hit && hit.innerR !== undefined, 'w3 is the belt');
    const R = Math.max(9, (hit.r - hit.innerR) / 2 + 4);
    const { inner, outer } = lockGlow(calls);
    assert.equal(inner.args[2], R * 0.9);
    assert.equal(outer.args[2], R + 22);
});
