/**
 * Deck-plan placement follows assets/geomorphs/REBUILD.md.
 * Corner points in this file are computed from those formulas, not from place.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawDeck, fitFrame, SQUARE_BASE_PATH, tileUrl } from '../../apps/web/src/deckplan/draw.ts';
import { placeShip } from '../../apps/web/src/deckplan/place.ts';
import { DECK_PLAN_LIMITS, DeckPlan } from '@voyage/shared';
import { recordingContext } from './orbit_fixture.js';

const PAD = 16;

function row(code, role, feetX, feetY) {
    return { code, role, path: code + '/' + role + ' [' + feetX + 'x' + feetY + '].png' };
}

function manifest() {
    return {
        images: [
            row('SQ', 'url', 50, 50),
            row('SQ', 'mirrorUrl', 50, 50),
            row('LONG', 'url', 70, 100),
            row('LONG', 'mirrorUrl', 70, 100),
            row('OVER', 'url', 50, 50),
            row('OVER', 'mirrorUrl', 50, 50),
            row('OVER', 'overlayUrl', 50, 50),
            row('OVER', 'overlayMirrorUrl', 50, 50),
        ],
    };
}

/** REBUILD.md: gutter of 10, plus 4 squares, then the three corners for the rotation. */
function expectedCorners(corner, feetX, feetY, rotation) {
    const sizeX = feetX / 5;
    const sizeY = feetY / 5;
    const x1 = corner[0] - 10;
    const y1 = corner[1] - 10;
    const width = (sizeX + 4) * 5;
    const length = (sizeY + 4) * 5;
    if (rotation === 0) return [[x1, y1 + length], [x1 + width, y1 + length], [x1, y1]];
    if (rotation === 90) return [[x1, y1], [x1, y1 + width], [x1 + length, y1]];
    if (rotation === 180) return [[x1 + width, y1], [x1, y1], [x1 + width, y1 + length]];
    if (rotation === 270) return [[x1 + length, y1 + width], [x1 + length, y1], [x1, y1 + width]];
    throw new Error('rotation ' + rotation);
}

/** The recording context's createPattern returns nothing. The grid fill needs a pattern. */
function allowPattern(ctx, calls) {
    ctx.createPattern = (image, repeat) => {
        calls.push({ op: 'createPattern', args: [image, repeat] });
        return { image, repeat };
    };
}

function screenOf(bounds, width, height, x, y) {
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const innerW = width - PAD * 2;
    const innerH = height - PAD * 2;
    const scale = Math.min(innerW / spanX, innerH / spanY);
    const ox = PAD + (innerW - spanX * scale) / 2;
    const oy = PAD + (innerH - spanY * scale) / 2;
    return [ox + (x - bounds.minX) * scale, oy + (bounds.maxY - y) * scale];
}

test('four rotations and mirror for a 50 by 50 tile and a 70 by 100 tile', () => {
    const corner = [15, -5];
    const cases = [
        ['SQ', 50, 50],
        ['LONG', 70, 100],
    ];
    for (const [code, feetX, feetY] of cases) {
        for (const rotation of [0, 90, 180, 270]) {
            const placed = placeShip(manifest(), [{ code, corner, rotation }]);
            const want = expectedCorners(corner, feetX, feetY, rotation);
            assert.equal(placed.missing.length, 0);
            assert.equal(placed.tiles.length, 1);
            assert.equal(placed.tiles[0].path, code + '/url [' + feetX + 'x' + feetY + '].png');
            assert.deepEqual(placed.tiles[0].topLeft, want[0]);
            assert.deepEqual(placed.tiles[0].topRight, want[1]);
            assert.deepEqual(placed.tiles[0].bottomLeft, want[2]);
            const xs = want.map((point) => point[0]);
            const ys = want.map((point) => point[1]);
            assert.deepEqual(placed.bounds, {
                minX: Math.min(...xs),
                minY: Math.min(...ys),
                maxX: Math.max(...xs),
                maxY: Math.max(...ys),
            });
        }
        const mirrored = placeShip(manifest(), [{ code, corner, rotation: 0, mirror: true }]);
        assert.equal(mirrored.tiles[0].path, code + '/mirrorUrl [' + feetX + 'x' + feetY + '].png');
        assert.deepEqual(mirrored.tiles[0].topLeft, expectedCorners(corner, feetX, feetY, 0)[0]);
        assert.deepEqual(mirrored.tiles[0].topRight, expectedCorners(corner, feetX, feetY, 0)[1]);
        assert.deepEqual(mirrored.tiles[0].bottomLeft, expectedCorners(corner, feetX, feetY, 0)[2]);
    }
});

test('an overlay is drawn after its base, and a mirrored overlay uses the port overlay', () => {
    const placed = placeShip(manifest(), [
        { code: 'OVER', corner: [0, 0], rotation: 90, overlay: true },
        { code: 'SQ', corner: [40, 0], rotation: 0 },
    ]);
    assert.deepEqual(placed.tiles.map((tile) => tile.path), [
        'OVER/url [50x50].png',
        'OVER/overlayUrl [50x50].png',
        'SQ/url [50x50].png',
    ]);
    assert.deepEqual(placed.tiles[0].topLeft, placed.tiles[1].topLeft);
    assert.deepEqual(placed.tiles[0].topRight, placed.tiles[1].topRight);
    assert.deepEqual(placed.tiles[0].bottomLeft, placed.tiles[1].bottomLeft);
    const mirrored = placeShip(manifest(), [
        { code: 'OVER', corner: [0, 0], rotation: 180, mirror: true, overlay: true },
    ]);
    assert.deepEqual(mirrored.tiles.map((tile) => tile.path), [
        'OVER/mirrorUrl [50x50].png',
        'OVER/overlayMirrorUrl [50x50].png',
    ]);
});

test('a missing code is skipped and the rest of the ship stays', () => {
    const placed = placeShip(manifest(), [
        { code: 'SQ', corner: [0, 0], rotation: 0 },
        { code: 'NO-SUCH', corner: [10, 10], rotation: 90 },
        { code: 'LONG', corner: [80, 0], rotation: 270 },
    ]);
    assert.deepEqual(placed.missing, ['NO-SUCH']);
    assert.deepEqual(placed.tiles.map((tile) => tile.path), [
        'SQ/url [50x50].png',
        'LONG/url [70x100].png',
    ]);
});

test('a file is rejected unless it is a shipyard ship within the caps', () => {
    const good = {
        meta: 'Traveller Geomorph Ship',
        name: 'Cutter',
        parts: [{ code: 'SE-239', corner: [0, 0], rotation: 0, mirror: true }],
    };
    assert.equal(DeckPlan.safeParse(good).success, true);
    assert.equal(DeckPlan.safeParse({ ...good, meta: 'picture' }).success, false);
    assert.equal(DeckPlan.safeParse({ ...good, parts: [{ corner: [0, 0], rotation: 0 }] }).success, false);
    assert.equal(DeckPlan.safeParse({ ...good, parts: [{ code: 'SE-239', rotation: 0 }] }).success, false);
    assert.equal(DeckPlan.safeParse({ ...good, parts: [{ code: 'SE-239', corner: [0, 0], rotation: 45 }] }).success, false);
    assert.equal(DeckPlan.safeParse({ ...good, name: 'n'.repeat(DECK_PLAN_LIMITS.name + 1) }).success, false);
    const tooMany = Array.from({ length: DECK_PLAN_LIMITS.parts + 1 }, () => ({ code: 'SE-239', corner: [0, 0], rotation: 0 }));
    assert.equal(DeckPlan.safeParse({ ...good, parts: tooMany }).success, false);
    assert.equal(DeckPlan.safeParse({ name: 'Cutter', parts: [] }).success, false);
});

test('drawing maps the three corners with Y flipped, and a failed tile is skipped', async () => {
    const placed = placeShip(manifest(), [
        { code: 'SQ', corner: [0, 0], rotation: 0 },
        { code: 'LONG', corner: [80, 0], rotation: 0 },
    ]);
    let loads = 0;
    const load = (url) => {
        loads += 1;
        if (url.endsWith('LONG/url [70x100].png')) return Promise.resolve(null);
        return Promise.resolve({ width: 20, height: 10, naturalWidth: 20, naturalHeight: 10 });
    };
    const { ctx, calls: ops } = recordingContext();
    allowPattern(ctx, ops);
    const width = 400;
    const height = 300;
    const skipped = await drawDeck(ctx, placed, { width, height, resolve: (path) => 'tile:' + path, load });
    assert.deepEqual(skipped, ['LONG/url [70x100].png']);
    const transforms = ops.filter((op) => op.op === 'setTransform' && !(op.args[0] === 1 && op.args[3] === 1 && op.args[1] === 0));
    const tile = placed.tiles[0];
    const topLeft = screenOf(placed.bounds, width, height, tile.topLeft[0], tile.topLeft[1]);
    const topRight = screenOf(placed.bounds, width, height, tile.topRight[0], tile.topRight[1]);
    const bottomLeft = screenOf(placed.bounds, width, height, tile.bottomLeft[0], tile.bottomLeft[1]);
    const imageW = 20;
    const imageH = 10;
    const part = transforms[transforms.length - 1];
    assert.equal(ops.filter((op) => op.op === 'fillRect').length, 1);
    assert.equal(transforms.length, 2, 'one pattern fill, then the part');
    assert.ok(Math.abs(part.args[0] - (topRight[0] - topLeft[0]) / imageW) < 1e-9);
    assert.ok(Math.abs(part.args[1] - (topRight[1] - topLeft[1]) / imageW) < 1e-9);
    assert.ok(Math.abs(part.args[2] - (bottomLeft[0] - topLeft[0]) / imageH) < 1e-9);
    assert.ok(Math.abs(part.args[3] - (bottomLeft[1] - topLeft[1]) / imageH) < 1e-9);
    assert.ok(Math.abs(part.args[4] - topLeft[0]) < 1e-9);
    assert.ok(Math.abs(part.args[5] - topLeft[1]) < 1e-9);
    assert.ok(topLeft[1] < bottomLeft[1], 'map Y is flipped so the image top sits above the image bottom');
    const drawn = ops.filter((op) => op.op === 'drawImage');
    assert.equal(drawn.length, 1);
    await drawDeck(ctx, placed, { width, height, resolve: (path) => 'tile:' + path, load });
    assert.equal(loads, 3);
});

test('the square base repeats on 50-unit corners, and a missing base is not a skipped part', async () => {
    const placed = placeShip(manifest(), [{ code: 'SQ', corner: [0, 0], rotation: 0 }]);
    const frame = { panX: 0, panY: 0, scale: 1 };
    const load = (url) => {
        if (url.endsWith(SQUARE_BASE_PATH)) return Promise.resolve({ width: 600, height: 600, naturalWidth: 600, naturalHeight: 600 });
        return Promise.resolve({ width: 20, height: 20, naturalWidth: 20, naturalHeight: 20 });
    };
    const { ctx, calls: ops } = recordingContext();
    allowPattern(ctx, ops);
    const skipped = await drawDeck(ctx, placed, {
        width: 400, height: 300, frame, resolve: (path) => 'grid:' + path, load,
    });
    assert.deepEqual(skipped, []);
    const fills = ops.filter((op) => op.op === 'fillRect');
    assert.equal(fills.length, 1);
    assert.equal(ops.filter((op) => op.op === 'createPattern' && op.args[1] === 'repeat').length, 1);
    const transforms = ops.filter((op) => op.op === 'setTransform' && !(op.args[0] === 1 && op.args[3] === 1 && op.args[1] === 0));
    const origin = transforms.find((op) => op.args[4] === 0 && op.args[5] === -50);
    assert.ok(origin, 'the pattern origin is map (0, 50), the image top');
    assert.ok(Math.abs(origin.args[0] - 50 / 600) < 1e-9);
    assert.ok(Math.abs(origin.args[3] - 50 / 600) < 1e-9);
    assert.equal(origin.args[2], 0);
    assert.equal(origin.args[5] + origin.args[3] * 600, 0, 'image bottom is map 0');
    const [fx, fy, fw, fh] = fills[0].args;
    assert.ok(fx <= 0 && fx + fw >= 400 / (50 / 600), 'the fill covers the canvas width');
    assert.ok(fy <= 600 && fy + fh >= 600 + 300 / (50 / 600), 'the fill covers the canvas height');

    const miss = (url) => url.endsWith(SQUARE_BASE_PATH) ? Promise.resolve(null) : load(url);
    const failed = recordingContext();
    const missed = await drawDeck(failed.ctx, placed, {
        width: 400, height: 300, frame, resolve: (path) => 'nogrid:' + path, load: miss,
    });
    assert.deepEqual(missed, []);
    const left = failed.calls.filter((op) => op.op === 'drawImage');
    assert.equal(left.length, 1);
});

test('an explicit frame pans and zooms, and fit matches the unframed screen point', async () => {
    const placed = placeShip(manifest(), [{ code: 'SQ', corner: [0, 0], rotation: 0 }]);
    const load = () => Promise.resolve({ width: 10, height: 10, naturalWidth: 10, naturalHeight: 10 });
    const width = 400;
    const height = 300;
    const frame = { panX: 12, panY: 34, scale: 2 };
    const { ctx, calls: ops } = recordingContext();
    allowPattern(ctx, ops);
    await drawDeck(ctx, placed, { width, height, frame, resolve: (path) => 'frame:' + path, load });
    const transforms = ops.filter((op) => op.op === 'setTransform' && !(op.args[0] === 1 && op.args[3] === 1 && op.args[1] === 0));
    const tile = placed.tiles[0];
    const sx = frame.panX + tile.topLeft[0] * frame.scale;
    const sy = frame.panY - tile.topLeft[1] * frame.scale;
    const part = transforms[transforms.length - 1];
    assert.ok(Math.abs(part.args[4] - sx) < 1e-9);
    assert.ok(Math.abs(part.args[5] - sy) < 1e-9);
    const fitted = fitFrame(placed.bounds, width, height);
    const [fitX, fitY] = screenOf(placed.bounds, width, height, tile.topLeft[0], tile.topLeft[1]);
    assert.ok(Math.abs(fitted.panX + tile.topLeft[0] * fitted.scale - fitX) < 1e-9);
    assert.ok(Math.abs(fitted.panY - tile.topLeft[1] * fitted.scale - fitY) < 1e-9);
});

test('tileUrl uses the dev middleware or the map CDN', () => {
    assert.equal(tileUrl('manifest.json', { dev: true }), '/dev/geomorphs/manifest.json');
    assert.equal(
        tileUrl('rooms/SE-239 [50x50].png', { dev: true }),
        '/dev/geomorphs/rooms/SE-239%20%5B50x50%5D.png',
    );
    assert.equal(
        tileUrl('manifest.json', { dev: false }),
        'https://cdn.traveller.voyage/geomorphs/manifest.json',
    );
    assert.equal(
        tileUrl('a/b.png', { dev: false, cdnBase: 'https://cdn.example.com/' }),
        'https://cdn.example.com/geomorphs/a/b.png',
    );
    assert.equal(tileUrl('manifest.json'), 'https://cdn.traveller.voyage/geomorphs/manifest.json');
});
