import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { SURFACE_MESSAGE_VERSION } from '../../apps/web/src/surface/contracts.ts';
import { SheetCache } from '../../apps/web/src/surface/cache.ts';
import { attachSurfaceWorker } from '../../apps/web/src/surface/surface.worker.ts';
import {
    configureSurfaceRuntime, disposeSurfaces, requestMap,
} from '../../apps/web/src/surface/service.ts';
import { renderEnhancedMapPixels } from '../../apps/web/src/surface/enhanced/map.ts';
import { renderFlatMapPixels } from '../../apps/web/src/surface/vanilla/map.ts';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'surface');
const FLAGS = {
    seasonalIce: false, paletteVariants: false, movingClouds: false, lightning: false,
};

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fixture(id) {
    return JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8'));
}

function paintInputs(row) {
    return {
        worldData: row.input.worldData,
        imageSeed: row.input.hexId || '0000',
        masterSeed: row.input.masterSeed,
        continentalDefinition: row.input.continental,
        coastlineComplexity: row.input.coastline,
        printMode: row.input.printMode === true,
    };
}

function requestFrom(row) {
    const world = row.input.worldData;
    const name = String(world.name || '');
    const hexId = String(row.input.hexId || '');
    const suffix = '-' + name;
    const hexKey = name && hexId.endsWith(suffix) ? hexId.slice(0, -suffix.length) : hexId;
    return {
        mode: 'vanilla',
        hexKey,
        dossierKey: 'w0',
        body: {
            type: 'Planet',
            name,
            size: world.size,
            atmCode: world.atmosphere,
            hydroCode: world.hydrographics,
            tempBand: world.temperature,
            meanTempK: world.temperatureK,
            uwp: world.uwp,
        },
        resolution: { width: 800, height: 400 },
        options: {
            continentalDefinition: row.input.continental,
            coastlineComplexity: row.input.coastline,
            flags: FLAGS,
        },
    };
}

function mapMessage(requestId, generation, continental) {
    return {
        version: SURFACE_MESSAGE_VERSION,
        op: 'map',
        requestId,
        generation,
        mode: 'vanilla',
        inputs: {
            worldData: { size: 1 },
            imageSeed: '1910-Regina',
            masterSeed: 'TravellerMagnus',
            continentalDefinition: continental,
            coastlineComplexity: 0.45,
            printMode: false,
        },
    };
}

test('worker sheets match the main-thread pixels for three fixtures', { timeout: 120000 }, async () => {
    const worker = new Worker(new URL('./surface_worker_host.js', import.meta.url));
    const inbox = [];
    worker.on('message', (data) => inbox.push(data));
    function waitFor(pred) {
        const found = inbox.find(pred);
        if (found) return Promise.resolve(found);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('surface worker timed out')), 30000);
            const on = (data) => {
                if (!pred(data)) return;
                clearTimeout(timer);
                worker.off('message', on);
                resolve(data);
            };
            worker.on('message', on);
        });
    }
    try {
        await waitFor((data) => data.op === 'ready');
        for (const id of ['regina-w0', 'hydro-0', 'exotic-A']) {
            const row = fixture(id);
            const inputs = paintInputs(row);
            const local = renderFlatMapPixels(inputs);
            worker.postMessage({
                version: SURFACE_MESSAGE_VERSION,
                op: 'map',
                requestId: id,
                generation: 1,
                mode: 'vanilla',
                inputs,
            });
            const reply = await waitFor((data) => data.op === 'map' && data.requestId === id);
            assert.equal(reply.pixels.byteLength, local.byteLength, id);
            assert.equal(sha256(reply.pixels), sha256(local), id);
            assert.equal(sha256(reply.pixels), row.rgbaDigest, id);
        }
    } finally {
        await worker.terminate();
    }
});

test('a cancel drops a waiting sheet and a late result', async () => {
    const replies = [];
    const tasks = [];
    let listener = null;
    attachSurfaceWorker({
        postMessage(data, transfer) { replies.push({ data, transfer }); },
        addEventListener(_type, fn) { listener = fn; },
    }, {
        render: (inputs) => Uint8ClampedArray.of(inputs.continentalDefinition),
        schedule: (fn) => { tasks.push(fn); },
    });
    listener({ data: mapMessage('keep', 1, 1) });
    listener({ data: mapMessage('stop', 2, 2) });
    listener({ data: { version: SURFACE_MESSAGE_VERSION, op: 'cancel', requestId: 'stop', generation: 2, mode: 'vanilla' } });
    assert.equal(replies.some((item) => item.data.op === 'dropped' && item.data.requestId === 'stop'), true);
    while (tasks.length) tasks.shift()();
    assert.equal(replies.some((item) => item.data.op === 'map' && item.data.requestId === 'stop'), false);
    const kept = replies.find((item) => item.data.op === 'map' && item.data.requestId === 'keep');
    assert.ok(kept);
    assert.equal(kept.transfer[0], kept.data.pixels.buffer);
});

test('the worker keeps at most two waiting jobs and the latest stays', () => {
    const replies = [];
    const tasks = [];
    let listener = null;
    attachSurfaceWorker({
        postMessage(data) { replies.push(data); },
        addEventListener(_type, fn) { listener = fn; },
    }, {
        render: (inputs) => Uint8ClampedArray.of(inputs.continentalDefinition),
        schedule: (fn) => { tasks.push(fn); },
    });
    for (let generation = 1; generation <= 4; generation += 1) {
        listener({ data: mapMessage('j' + generation, generation, generation) });
    }
    const dropped = replies.filter((item) => item.op === 'dropped').map((item) => item.generation);
    assert.deepEqual(dropped, [1, 2]);
    tasks.shift()();
    tasks.shift()();
    const painted = replies.filter((item) => item.op === 'map').map((item) => item.generation);
    assert.deepEqual(painted, [3, 4]);
});

describe('surface service', { concurrency: false }, () => {
    test('cache evicts by byte cap and by sheet count', () => {
        const byBytes = new SheetCache(10, 16);
        byBytes.set('blank', new Uint8ClampedArray(4));
        assert.equal(byBytes.bytes, 4);
        byBytes.set('a', new Uint8ClampedArray(6));
        byBytes.set('b', new Uint8ClampedArray(6));
        assert.equal(byBytes.bytes <= 10, true);
        assert.equal(byBytes.has('a'), false);
        assert.equal(byBytes.has('b'), true);
        assert.equal(byBytes.evictions > 0, true);

        const byCount = new SheetCache(1000, 2);
        byCount.set('a', new Uint8ClampedArray(4));
        byCount.set('b', new Uint8ClampedArray(4));
        byCount.get('a');
        byCount.set('c', new Uint8ClampedArray(4));
        assert.equal(byCount.sheets, 2);
        assert.equal(byCount.has('b'), false);
        assert.equal(byCount.has('a'), true);
        assert.equal(byCount.has('c'), true);
    });

    test('latest request wins and a late sheet is not cached', async () => {
        const sent = [];
        const listeners = [];
        configureSurfaceRuntime({
            spawn: () => ({
                postMessage(message) { sent.push(message); },
                addEventListener(_type, fn) { listeners.push(fn); },
                terminate() {},
            }),
        });
        try {
            const first = requestMap(requestFrom(fixture('class-wet')));
            const second = requestMap(requestFrom(fixture('hydro-0')));
            const third = requestMap(requestFrom(fixture('exotic-A')));
            const pixels = new Uint8ClampedArray([9, 9, 9, 255]);
            for (const ticket of [first, second, third]) {
                for (const fn of listeners) {
                    fn({
                        data: {
                            version: SURFACE_MESSAGE_VERSION,
                            op: 'map',
                            requestId: ticket.requestId,
                            generation: ticket.generation,
                            mode: 'vanilla',
                            width: 1,
                            height: 1,
                            pixels,
                        },
                    });
                }
            }
            assert.equal(await first.done, null);
            assert.equal(await second.done, null);
            const sheet = await third.done;
            assert.ok(sheet);
            assert.equal(sheet.generation, third.generation);
            assert.equal(sha256(sheet.pixels), sha256(pixels));
            const maps = sent.filter((item) => item.op === 'map');
            assert.equal(maps[maps.length - 1].generation, third.generation);
            assert.equal(maps[maps.length - 1].requestId, third.requestId);
        } finally {
            disposeSurfaces();
        }
    });

    test('the page path paints when workers are unavailable', { timeout: 120000 }, async () => {
        configureSurfaceRuntime({ spawn: null });
        try {
            const row = fixture('hydro-0');
            assert.equal(row.input.masterSeed, 'TravellerMagnus');
            const ticket = requestMap(requestFrom(row));
            assert.equal(ticket.status, 'pending');
            const sheet = await ticket.done;
            assert.ok(sheet);
            assert.equal(sheet.fromCache, false);
            assert.equal(sheet.chunkTasks > 1, true);
            assert.equal(sheet.longestChunkMs < 50, true);
            assert.equal(sha256(sheet.pixels), row.rgbaDigest);
            const again = requestMap(requestFrom(row));
            assert.equal(again.status, 'sheet');
            assert.equal(again.fromCache, true);
            assert.equal(sha256(again.pixels), row.rgbaDigest);

        } finally {
            disposeSurfaces();
        }
    });

    test('enhanced is its own sheet, and vanilla is the same before and after it', { timeout: 120000 }, async () => {
        configureSurfaceRuntime({ spawn: null });
        try {
            const row = fixture('class-wet');
            const base = requestFrom(row);
            // The body as a released document has it: the sea is decided from these fields.
            const body = Object.freeze({ ...base.body, liquidType: 'Water', hydroPercent: 50, lowTempK: 280, highTempK: 300 });
            const vanillaRequest = Object.freeze({ ...base, body });
            const enhancedRequest = Object.freeze({ ...base, body, mode: 'enhanced' });

            const before = await requestMap(vanillaRequest).done;
            assert.ok(before);
            assert.equal(before.mode, 'vanilla');
            assert.equal(sha256(before.pixels), row.rgbaDigest);

            const enhanced = await requestMap(enhancedRequest).done;
            assert.ok(enhanced);
            assert.equal(enhanced.mode, 'enhanced');
            assert.equal(enhanced.fromCache, false, 'the vanilla sheet in the cache is not handed to enhanced');
            assert.equal(enhanced.longestChunkMs < 50, true);
            assert.notEqual(sha256(enhanced.pixels), row.rgbaDigest);
            assert.equal(sha256(enhanced.pixels), sha256(renderEnhancedMapPixels({
                ...paintInputs(row),
                sea: { coverage: 0.5, liquid: 'Water', ice: { kind: 'none' } },
            })));
            assert.notEqual(enhanced.key, before.key);

            // Back and forth: each mode's sheet comes back from its own cache entry, unchanged.
            for (let round = 0; round < 2; round += 1) {
                const vanillaAgain = requestMap(vanillaRequest);
                assert.equal(vanillaAgain.status, 'sheet');
                assert.equal(vanillaAgain.fromCache, true);
                assert.equal(sha256(vanillaAgain.pixels), row.rgbaDigest);
                const enhancedAgain = requestMap(enhancedRequest);
                assert.equal(enhancedAgain.fromCache, true);
                assert.equal(sha256(enhancedAgain.pixels), sha256(enhanced.pixels));
            }

            // And painted afresh after the switch, not only from the cache.
            disposeSurfaces();
            configureSurfaceRuntime({ spawn: null });
            assert.ok(await requestMap(enhancedRequest).done);
            const after = await requestMap(vanillaRequest).done;
            assert.ok(after);
            assert.equal(after.fromCache, false);
            assert.equal(sha256(after.pixels), row.rgbaDigest);
            assert.equal(sha256(after.pixels), sha256(renderFlatMapPixels(paintInputs(row))));
        } finally {
            disposeSurfaces();
        }
    });

    test('an enhanced request sends the worker the sea beside the vanilla inputs', () => {
        const sent = [];
        configureSurfaceRuntime({
            spawn: () => ({
                postMessage(message) { sent.push(message); },
                addEventListener() {},
                terminate() {},
            }),
        });
        try {
            const base = requestFrom(fixture('class-wet'));
            const body = { ...base.body, liquidType: 'Water', hydroPercent: 50, lowTempK: 280, highTempK: 300 };
            requestMap({ ...base, body });
            requestMap({ ...base, body, mode: 'enhanced' });
            const maps = sent.filter((item) => item.op === 'map');
            assert.equal(maps.length, 2);
            assert.equal(maps[0].mode, 'vanilla');
            assert.equal('enhanced' in maps[0], false);
            assert.equal(maps[1].mode, 'enhanced');
            assert.deepEqual(maps[1].enhanced, { ...maps[1].inputs, sea: { coverage: 0.5, liquid: 'Water', ice: { kind: 'none' } } });
            assert.deepEqual(maps[1].inputs, maps[0].inputs);
        } finally {
            disposeSurfaces();
        }
    });
});
