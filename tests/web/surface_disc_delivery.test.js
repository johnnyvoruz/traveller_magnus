import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { ENHANCED_BAKE_PASSES, ENHANCED_CITY_VERSION, VANILLA_DISC_VERSION } from '../../apps/web/src/surface/enhanced/bake.ts';
import { settleDiscDelivery, watchSuperseded } from '../../apps/web/src/surface/enhanced/delivery.ts';
import { ENHANCED_DRAW_FRAG } from '../../apps/web/src/surface/enhanced/draw.ts';
import { clearDiscs, discHeld, rememberDisc } from '../../apps/web/src/surface/disc_hold.ts';
import { disposeSurfaces, drawDisc, prepareDiscs } from '../../apps/web/src/surface/service.ts';
import { DRAW_FRAG } from '../../apps/web/src/surface/vanilla/gl_shade.ts';

const HEX = 'Spinward_Marches/1910';
const closed = [];

class FakeBitmap {
    constructor(label) {
        this.label = label;
    }

    close() {
        closed.push(this.label);
    }
}

globalThis.ImageBitmap = FakeBitmap;

function disc(radiusPx, key = 'w0') {
    return {
        key,
        hexKey: HEX,
        dossierKey: key,
        body: Object.freeze({ name: 'Regina', uwp: 'A788899-C' }),
        radiusPx,
        spin: 0,
        cloudSpin: 0,
        sweep: 0,
        samples: 1,
        tiltDeg: 0,
        light: [1, 0],
        sun: [1, 1, 1],
        ring: null,
        casters: [],
        lightMode: false,
    };
}

function paint() {
    return { drawImage() {} };
}

function tilesMessage(envelope, image) {
    return {
        op: 'tiles',
        ready: true,
        lost: false,
        failed: false,
        slow: [],
        delivery: 'tiles',
        ...envelope,
        tiles: [{ key: 'w0', size: 32, radiusPx: 16, image }],
    };
}

after(() => {
    disposeSurfaces();
    clearDiscs();
});

test('step 1 links the vanilla draw source and adds no bake pass', () => {
    assert.equal(ENHANCED_DRAW_FRAG, DRAW_FRAG);
    assert.deepEqual([...ENHANCED_BAKE_PASSES], []);
    assert.equal(ENHANCED_CITY_VERSION, 'enhanced-cities-1');
    assert.equal(VANILLA_DISC_VERSION, 'vanilla');
});

test('a newer watch supersedes an in-flight one', () => {
    const first = { mode: 'vanilla', version: VANILLA_DISC_VERSION, generation: 1 };
    const second = { mode: 'enhanced', version: ENHANCED_CITY_VERSION, generation: 2 };
    assert.equal(watchSuperseded(null, first), false);
    assert.equal(watchSuperseded(first, first), false);
    assert.equal(watchSuperseded(second, first), true);
});

test('delayed worker and bitmap results during rapid mode switches are dropped', async () => {
    disposeSurfaces();
    clearDiscs();
    closed.length = 0;
    const live = { mode: 'vanilla', version: VANILLA_DISC_VERSION, generation: 1 };
    const keys = new Set(['w0']);
    const stale = new FakeBitmap('stale-tile');
    await settleDiscDelivery(tilesMessage(live, stale), () => live, () => keys);
    assert.equal(discHeld('w0').image, stale);
    assert.equal(closed.includes('stale-tile'), false);

    const late = new FakeBitmap('late-vanilla');
    live.mode = 'enhanced';
    live.version = ENHANCED_CITY_VERSION;
    live.generation = 2;
    await settleDiscDelivery(
        tilesMessage({ mode: 'vanilla', version: VANILLA_DISC_VERSION, generation: 1 }, late),
        () => live,
        () => keys,
    );
    assert.equal(discHeld('w0').image, stale);
    assert.equal(closed.includes('late-vanilla'), true);

    let release = null;
    globalThis.createImageBitmap = (_image, _sx, _sy, _sw, _sh) => new Promise((resolve) => {
        release = () => resolve(new FakeBitmap('slice'));
    });
    const atlas = new FakeBitmap('atlas');
    const pending = settleDiscDelivery({
        op: 'tiles',
        ready: true,
        lost: false,
        failed: false,
        slow: [],
        delivery: 'atlas',
        mode: 'enhanced',
        version: ENHANCED_CITY_VERSION,
        generation: 2,
        image: atlas,
        table: [{ key: 'w0', sx: 0, sy: 0, size: 8, radiusPx: 4 }],
    }, () => live, () => keys);
    live.mode = 'vanilla';
    live.version = VANILLA_DISC_VERSION;
    live.generation = 3;
    release();
    await pending;
    assert.equal(discHeld('w0').image, stale);
    assert.equal(closed.includes('slice'), true);
    assert.equal(closed.includes('atlas'), true);

    const coarse = discHeld('w0');
    const older = new FakeBitmap('older-coarse');
    await settleDiscDelivery(
        tilesMessage({ mode: 'vanilla', version: VANILLA_DISC_VERSION, generation: 2 }, older),
        () => live,
        () => keys,
    );
    assert.equal(discHeld('w0'), coarse);
    assert.equal(closed.includes('older-coarse'), true);
    clearDiscs();
});

test('a mode switch drops the held tile and a same-mode sharpen keeps it', () => {
    disposeSurfaces();
    clearDiscs();
    const coarse = { kind: 'coarse' };
    rememberDisc('w0', { image: coarse, size: 32, radiusPx: 40, mode: 'vanilla', version: VANILLA_DISC_VERSION, generation: 1 });
    const first = prepareDiscs({ mode: 'vanilla', timeSeconds: 0, discs: [disc(40)] });
    assert.equal(first.status, 'unavailable');
    assert.equal(drawDisc(paint(), 'w0', 0, 0, 40), true);

    const sharper = prepareDiscs({ mode: 'vanilla', timeSeconds: 0, discs: [disc(200)] });
    assert.equal(sharper.mode, 'vanilla');
    assert.equal(drawDisc(paint(), 'w0', 0, 0, 200), true);
    assert.equal(discHeld('w0').image, coarse);

    const switched = prepareDiscs({ mode: 'enhanced', timeSeconds: 0, discs: [disc(200)] });
    assert.equal(switched.mode, 'enhanced');
    assert.equal(switched.status, 'unavailable');
    assert.equal(drawDisc(paint(), 'w0', 0, 0, 200), false);
    assert.equal(discHeld('w0'), undefined);
    clearDiscs();
});
