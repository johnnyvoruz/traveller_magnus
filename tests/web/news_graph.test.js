/**
 * XA1. The fixture is six systems in sector Fix. Four bare routes (one of them
 * 5 parsecs), one typed Trade route, one ZhCo route, one route to an empty hex,
 * one cross-sector route into Next, and a duplicate of the first bare route.
 * Spinward Marches is read from universe/raw through the shared parsers.
 * Nine sectors are not in git, so that size stays a report measurement.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseMetadataXml, parseT5Tab } from '@voyage/shared';
import { hexDistance } from '../../apps/web/src/map/geometry.ts';
import { buildNewsGraph, edgePairs, sectorsWanted } from '../../apps/web/src/news/graph.ts';
import { jumpSpan, NEWS_PARAMS } from '../../apps/web/src/news/params.ts';
import { NewsParams } from '../../apps/web/src/news/params_schema.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function hexes(ids) {
    const out = {};
    for (const id of ids) out[id] = { name: id };
    return out;
}

function cellsWith(hex) {
    const cells = '.'.repeat(1280).split('');
    const col = Number(hex.slice(0, 2));
    const row = Number(hex.slice(2, 4));
    cells[(col - 1) * 40 + (row - 1)] = 'A';
    return cells.join('');
}

function fixture() {
    const index = {
        slug: 'Fix',
        x: 0,
        y: 0,
        hexes: hexes(['0101', '0102', '0103', '0108', '0201', '3201']),
        metadata: {
            routes: [
                { Start: '0101', End: '0102' },
                { Start: '0101', End: '0102' },
                { Start: '0102', End: '0103' },
                { Start: '0101', End: '0201' },
                { Start: '0103', End: '0108' },
                { Start: '0101', End: '0103', Type: 'Trade' },
                { Start: '0102', End: '0201', Allegiance: 'ZhCo' },
                { Start: '0101', End: '0199' },
                { Start: '3201', End: '0101', EndOffsetX: '1' },
            ],
        },
    };
    const overview = { slug: 'Next', x: 1, y: 0, cells: cellsWith('0101') };
    return { index, overview };
}

function withRule(rule, max = 4, extra = {}) {
    const { index, overview } = fixture();
    return buildNewsGraph([index], [overview], {
        ...NEWS_PARAMS,
        xboatRouteRule: rule,
        xboatMaxParsecs: max,
        ...extra,
    });
}

test('the cited jump is 154, 169 and 184 hours, and the defaults match the decisions', () => {
    assert.deepEqual(jumpSpan(NEWS_PARAMS.jumpHours), { earliest: 154, likely: 169, latest: 184 });
    assert.deepEqual(NEWS_PARAMS.xboatLegHours, NEWS_PARAMS.jumpHours);
    assert.equal(NEWS_PARAMS.stationHoldHours, 0);
    assert.equal(NEWS_PARAMS.xboatMaxParsecs, 4);
    assert.equal(NEWS_PARAMS.xboatRouteRule, 'bare');
    assert.equal(NEWS_PARAMS.offNetworkOn, true);
    assert.equal(NEWS_PARAMS.offNetworkParsecs, 2);
    assert.equal(NEWS_PARAMS.offNetworkWaitHours, null);
    assert.equal(NEWS_PARAMS.horizonDays, 60);
    assert.equal(NEWS_PARAMS.sectorCap, 9);
    // The defaults pass the schema (they were parsed at load before ZP2 moved the schema out of first paint).
    assert.equal(NewsParams.safeParse(NEWS_PARAMS).success, true);
    assert.equal(NewsParams.safeParse({ ...NEWS_PARAMS, xboatRouteRule: 'nope' }).success, false);
    assert.equal(NewsParams.safeParse({ ...NEWS_PARAMS, offNetworkWaitHours: 12 }).success, true);
});

test('each route rule keeps its own edges, and a 5-parsec leg follows the setting', () => {
    const bare = edgePairs(withRule('bare'), 0);
    assert.deepEqual(bare, [
        'Fix/0101 Fix/0102',
        'Fix/0101 Fix/0201',
        'Fix/0102 Fix/0103',
        'Fix/3201 Next/0101',
    ]);
    const kept = edgePairs(withRule('bare', 5), 0);
    assert.ok(kept.includes('Fix/0103 Fix/0108'));
    assert.equal(kept.length, bare.length + 1);
    assert.deepEqual(edgePairs(withRule('chart'), 0), [
        'Fix/0101 Fix/0102',
        'Fix/0101 Fix/0103',
        'Fix/0101 Fix/0201',
        'Fix/0102 Fix/0103',
        'Fix/3201 Next/0101',
    ]);
    assert.deepEqual(edgePairs(withRule('allegiances:ZhCo'), 0), [
        'Fix/0101 Fix/0102',
        'Fix/0101 Fix/0201',
        'Fix/0102 Fix/0103',
        'Fix/0102 Fix/0201',
        'Fix/3201 Next/0101',
    ]);
    const graph = withRule('bare');
    const next = graph.nodes.find((node) => node.key === 'Next/0101');
    assert.equal(next.loaded, false);
    assert.equal(graph.nodes.filter((node) => node.loaded).length, 6);
    assert.equal(graph.offEdges, 0);
});

test('off-network edges are the pairs within the distance, and only once a wait exists', () => {
    const { index } = fixture();
    const at = (parsecs) => edgePairs(buildNewsGraph([index], [], {
        ...NEWS_PARAMS,
        offNetworkWaitHours: 0,
        offNetworkParsecs: parsecs,
    }), 1);
    assert.deepEqual(at(1), [
        'Fix/0101 Fix/0102',
        'Fix/0101 Fix/0201',
        'Fix/0102 Fix/0103',
        'Fix/0102 Fix/0201',
    ]);
    assert.deepEqual(at(2), [
        'Fix/0101 Fix/0102',
        'Fix/0101 Fix/0103',
        'Fix/0101 Fix/0201',
        'Fix/0102 Fix/0103',
        'Fix/0102 Fix/0201',
        'Fix/0103 Fix/0201',
    ]);
    const nodes = buildNewsGraph([index], [], NEWS_PARAMS).nodes;
    for (const parsecs of [1, 2]) {
        const got = new Set(at(parsecs));
        const want = [];
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                if (hexDistance(nodes[i], nodes[j]) <= parsecs) {
                    const a = nodes[i].key;
                    const b = nodes[j].key;
                    want.push(a < b ? a + ' ' + b : b + ' ' + a);
                }
            }
        }
        assert.deepEqual([...got].sort(), want.sort());
    }
    assert.equal(buildNewsGraph([index], [], { ...NEWS_PARAMS, offNetworkOn: false, offNetworkWaitHours: 0 }).offEdges, 0);
});

test('a frontier on the sector edge names the unloaded neighbour, and the cap stops it', () => {
    const west = sectorsWanted([{ q: 0, r: 19 }], [{ sx: 0, sy: 0 }]);
    assert.deepEqual(west, [{ sx: -1, sy: 0 }]);
    const full = [];
    for (let n = 0; n < 9; n++) full.push({ sx: n, sy: 0 });
    assert.deepEqual(sectorsWanted([{ q: 0, r: 19 }], full), []);
});

test('Spinward Marches raw files build 439 nodes and 86 bare edges in under 10 ms', () => {
    const tsv = fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8');
    const xml = fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8');
    const rows = parseT5Tab(tsv);
    const meta = parseMetadataXml(xml);
    const hexes = {};
    for (const [hex, row] of rows) {
        if (row.type !== 'SYSTEM_PRESENT') continue;
        hexes[hex] = { name: row.name };
    }
    const index = {
        slug: 'Spinward_Marches',
        x: -4,
        y: -1,
        hexes,
        metadata: { routes: meta.routes },
    };
    // The budget is a floor on the build's speed, not a load test: the best of three builds after one
    // warm-up, so a full test run's load (17 to 25 ms for one build on a busy machine, 2 to 4 ms alone) does not fail it (DF27).
    let graph = buildNewsGraph([index], [], NEWS_PARAMS);
    let best = Infinity;
    for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        graph = buildNewsGraph([index], [], NEWS_PARAMS);
        best = Math.min(best, performance.now() - started);
    }
    assert.equal(graph.nodes.length, 439);
    assert.equal(graph.xboatEdges, 86);
    assert.equal(edgePairs(graph, 0).length, 86);
    assert.equal(graph.offEdges, 0);
    assert.ok(best < 10, 'the best of three builds took ' + best + ' ms');
});
