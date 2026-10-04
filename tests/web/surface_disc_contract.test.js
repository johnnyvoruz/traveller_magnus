import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { clearDiscs, rememberDisc, retainDiscs } from '../../apps/web/src/surface/disc_hold.ts';
import { discShadeRequest } from '../../apps/web/src/surface/disc_shade.ts';
import { productionDiscId } from '../../apps/web/src/surface/identity.ts';
import { disposeSurfaces, drawDisc, prepareDiscs } from '../../apps/web/src/surface/service.ts';
import { discDest } from '../../apps/web/src/surface/vanilla/gl_plan.ts';

const HEX = 'Spinward_Marches/1910';

function disc(body, extra = {}) {
    return {
        key: 'w0',
        hexKey: HEX,
        dossierKey: 'w0',
        body,
        radiusPx: 40,
        spin: 0.25,
        cloudSpin: 0.3,
        sweep: 0.01,
        samples: 1,
        tiltDeg: 23,
        light: [1, 0],
        sun: [0.9, 0.8, 0.7],
        ring: null,
        casters: [],
        lightMode: false,
        ...extra,
    };
}

function ctxOf(calls) {
    return {
        drawImage(...args) { calls.push(args); },
    };
}

describe('disc contract', () => {
    after(() => {
        disposeSurfaces();
        clearDiscs();
    });

    test('discDest centres the tile and scales it with the draw radius', () => {
        assert.deepEqual(discDest(100, 50, 10, 20, 25), { x: -15, y: -5, w: 50, h: 50 });
        assert.deepEqual(discDest(80, 40, 0, 0, 40), { x: -40, y: -40, w: 80, h: 80 });
        assert.deepEqual(discDest(80, 0, 4, 6, 10), { x: -36, y: -34, w: 80, h: 80 });
    });

    test('the shade request is derived from hexKey and body', () => {
        const body = Object.freeze({ name: 'Regina', uwp: 'A788899-C', type: 'Planet' });
        const ring = { inner: 1.22, outer: 2.05, fill: 0.7, phase: 1.2, detail: 0.4 };
        const row = [0.5, -0.25, 1];
        const shade = discShadeRequest(12.5, disc(body, {
            ring,
            casters: [row],
            lightMode: true,
            near: 0,
            key: 'regina',
        }));
        assert.ok(shade);
        assert.equal(shade.key, 'regina');
        assert.equal(shade.profile.id, productionDiscId(HEX, body, 'temperate'));
        assert.equal(shade.profile.kind, 'temperate');
        assert.equal(shade.radius, 40);
        assert.equal(shade.spin, 0.25);
        assert.equal(shade.cloudSpin, 0.3);
        assert.equal(shade.tilt, 23);
        assert.deepEqual(shade.light, [1, 0]);
        assert.deepEqual(shade.sun, [0.9, 0.8, 0.7]);
        assert.deepEqual(shade.ring, ring);
        assert.notEqual(shade.ring, ring);
        assert.deepEqual(shade.casters, [[0.5, -0.25, 1]]);
        assert.notEqual(shade.casters[0], row);
        assert.equal(shade.lightMode, true);
        assert.equal(shade.near, 0);
        assert.equal(shade.uTime, 12.5);
        assert.equal('scale' in shade, false);
        assert.equal(discShadeRequest(0, disc(Object.freeze({ name: 'Sol', sType: 'G2V' }))), null);
        assert.equal(discShadeRequest(0, disc(Object.freeze({ name: 'Belt', type: 'Planetoid Belt' }))), null);
        assert.equal(discShadeRequest(0, disc(Object.freeze({ name: 'Ring', type: 'Ring' }))), null);
    });

    test('an empty batch stays unavailable and does not drop a held tile', () => {
        rememberDisc('kept', { image: { kind: 'kept' }, size: 20, radiusPx: 10 });
        const batch = prepareDiscs({ mode: 'enhanced', timeSeconds: 0, discs: [] });
        assert.equal(batch.status, 'unavailable');
        assert.equal(batch.mode, 'enhanced');
        const calls = [];
        assert.equal(drawDisc(ctxOf(calls), 'kept', 8, 8, 10), true);
        assert.equal(calls.length, 1);
        clearDiscs();
    });

    test('a star batch is ready and does not open a canvas', () => {
        rememberDisc('old', { image: { kind: 'old' }, size: 16, radiusPx: 8 });
        const batch = prepareDiscs({
            mode: 'vanilla',
            timeSeconds: 3,
            discs: [disc(Object.freeze({ name: 'Sol', sType: 'G2V' }), { key: 'sun' })],
        });
        assert.equal(batch.status, 'ready');
        assert.equal(batch.mode, 'vanilla');
        const calls = [];
        assert.equal(drawDisc(ctxOf(calls), 'old', 0, 0, 8), false);
        assert.equal(drawDisc(ctxOf(calls), 'sun', 0, 0, 8), false);
        assert.equal(calls.length, 0);
    });

    test('without a document a world batch is unavailable and does not throw', () => {
        const body = Object.freeze({ name: 'Regina', uwp: 'A788899-C' });
        assert.doesNotThrow(() => {
            const batch = prepareDiscs({ mode: 'vanilla', timeSeconds: 1, discs: [disc(body)] });
            assert.equal(batch.status, 'unavailable');
            assert.equal(batch.mode, 'vanilla');
        });
        const calls = [];
        assert.equal(drawDisc(ctxOf(calls), 'w0', 1, 2, 40), false);
        rememberDisc('w0', { image: { kind: 'tile' }, size: 100, radiusPx: 50 });
        assert.equal(drawDisc(ctxOf(calls), 'w0', 10, 20, 25), true);
        assert.deepEqual(calls[0].slice(1), [-15, -5, 50, 50]);
        rememberDisc('w0', { image: { kind: 'newer' }, size: 40, radiusPx: 20 });
        assert.equal(drawDisc(ctxOf(calls), 'w0', 0, 0, 20), true);
        assert.equal(calls[1][0].kind, 'newer');
        assert.deepEqual(calls[1].slice(1), [-20, -20, 40, 40]);
        disposeSurfaces();
        assert.equal(drawDisc(ctxOf(calls), 'w0', 0, 0, 20), false);
    });

    test('retainDiscs keeps only the keys still in the frame', () => {
        rememberDisc('a', { image: {}, size: 10, radiusPx: 5 });
        rememberDisc('b', { image: {}, size: 10, radiusPx: 5 });
        retainDiscs(new Set(['a']));
        const calls = [];
        assert.equal(drawDisc(ctxOf(calls), 'b', 0, 0, 5), false);
        assert.equal(drawDisc(ctxOf(calls), 'a', 0, 0, 5), true);
        clearDiscs();
    });
});
