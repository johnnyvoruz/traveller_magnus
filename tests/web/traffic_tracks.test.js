/**
 * AQ1 round 3. A track's hit box, and drawing a group of tracks as two passes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawTracks, TRACK_CASE, TRACK_PX, TRACK_STROKE, trackBox } from '../../apps/web/src/map/traffic.ts';

const INK = { traffic: 'traffic', own: 'own', bg: 'bg', font: 'data' };
const PAINT = { alpha: 0.75, scale: 1 };

function recordingCtx() {
    const calls = [];
    const ctx = new Proxy({}, {
        get(_target, prop) {
            return (...args) => { calls.push([String(prop), ...args]); };
        },
        set(_target, prop, value) {
            calls.push(['set', String(prop), value]);
            return true;
        },
    });
    return { ctx, calls };
}

function track(over = {}) {
    return { key: 'ship', mine: false, x: 10, y: 20, many: false, label: null, ...over };
}

test('a track box is the diamond plus its stroke and casing, including off the origin', () => {
    const r = TRACK_PX / 2 + TRACK_STROKE / 2 + TRACK_CASE;
    assert.deepEqual(trackBox(0, 0), { x0: -r, y0: -r, x1: r, y1: r });
    assert.deepEqual(trackBox(3, -4), { x0: 3 - r, y0: -4 - r, x1: 3 + r, y1: -4 + r });
    const box = trackBox(3, -4);
    assert.equal(box.x1 - box.x0, box.y1 - box.y0);
});

test('no tracks draws nothing; yours is filled and someone else is only stroked', () => {
    const none = recordingCtx();
    drawTracks(none.ctx, [], PAINT, INK);
    assert.deepEqual(none.calls, []);

    const other = recordingCtx();
    drawTracks(other.ctx, [track()], PAINT, INK);
    assert.equal(other.calls.some((call) => call[0] === 'fill'), false);
    assert.equal(other.calls.some((call) => call[0] === 'set' && call[1] === 'strokeStyle' && call[2] === 'traffic'), true);

    const mine = recordingCtx();
    drawTracks(mine.ctx, [track({ mine: true })], PAINT, INK);
    assert.equal(mine.calls.some((call) => call[0] === 'fill'), true);
    assert.equal(mine.calls.some((call) => call[0] === 'set' && call[1] === 'fillStyle' && call[2] === 'own'), true);
});

test('several ships at one place add the inner diamond on both passes', () => {
    const { ctx, calls } = recordingCtx();
    drawTracks(ctx, [track({ many: true })], PAINT, INK);
    const firstStroke = calls.findIndex((call) => call[0] === 'stroke');
    const casing = calls.slice(0, firstStroke).filter((call) => call[0] === 'moveTo');
    const ink = calls.slice(firstStroke).filter((call) => call[0] === 'moveTo');
    assert.equal(casing.length, 2);
    assert.equal(ink.length, 2);
});
