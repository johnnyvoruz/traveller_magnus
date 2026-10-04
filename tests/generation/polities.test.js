import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BORDER_COLOR_CYCLE, assembleSectorIndex, HEX_SIZE, hexCentre, hexCorners, outlineLoops, polityColour, polityOutlines, sectorOverview, toGlobal } from '@voyage/generation';
import { hashString } from '@voyage/engines';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RAW = path.join(ROOT, 'universe/raw');
const INSET = HEX_SIZE * 0.1;

function catalogueOf(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(RAW, 'sectors.json'), 'utf8'))
        .sectors.find(sector => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

function overviewOf(slug) {
    const xml = fs.readFileSync(path.join(RAW, `${slug}.xml`), 'utf8');
    const index = assembleSectorIndex({
        slug, version: 'v4', metadataXml: xml, hexes: {}, catalogue: catalogueOf(slug),
    });
    return { index, overview: sectorOverview(index, {}) };
}

function sectorWith(slug, x, canonical, hexes) {
    const owners = new Array(1280).fill('.');
    for (const hex of hexes) {
        const col = Number(hex.slice(0, 2));
        const row = Number(hex.slice(2, 4));
        owners[(col - 1) * 40 + (row - 1)] = '0';
    }
    return {
        slug, name: slug, x, y: 0, tags: [], canonical, systems: hexes.length,
        cells: '.'.repeat(1280),
        polities: [{ name: 'Imperium', color: '#336699' }],
        owners: owners.join(''),
    };
}

function places(n) {
    const text = String(n);
    const dot = text.indexOf('.');
    if (dot < 0) return 0;
    return text.length - dot - 1;
}

function insetMid(q, r, side) {
    const centre = hexCentre(q, r);
    const corners = hexCorners(centre.x, centre.y);
    const x1 = corners[side * 2];
    const y1 = corners[side * 2 + 1];
    const next = ((side + 1) % 6) * 2;
    const mx = (x1 + corners[next]) / 2;
    const my = (y1 + corners[next + 1]) / 2;
    const dx = centre.x - mx;
    const dy = centre.y - my;
    const len = Math.hypot(dx, dy);
    return { x: mx + (dx / len) * INSET, y: my + (dy / len) * INSET };
}

function nearestSegment(loops, x, y) {
    let best = Infinity;
    for (const loop of loops) {
        const n = loop.length;
        for (let i = 0; i < n; i += 2) {
            const j = (i + 2) % n;
            const mx = (loop[i] + loop[j]) / 2;
            const my = (loop[i + 1] + loop[j + 1]) / 2;
            const dist = Math.hypot(mx - x, my - y);
            if (dist < best) best = dist;
        }
    }
    return best;
}

function round3(n) {
    return Number(n.toFixed(3));
}

test('touching canonical polities join and a non-canonical sector adds nothing', () => {
    const left = sectorWith('Left', 0, true, ['3201']);
    const right = sectorWith('Right', 1, true, ['0101']);
    const joined = polityOutlines([left, right], {});
    assert.equal(joined.length, 1);
    assert.equal(joined[0].hexes, 2);
    assert.equal(joined[0].loops.length, 1);
    assert.equal(joined[0].loops[0].length, 20);
    const towardLeft = insetMid(31, 0, 5);
    const towardRight = insetMid(32, 0, 2);
    assert.ok(nearestSegment(joined[0].loops, towardLeft.x, towardLeft.y) > 0.05);
    assert.ok(nearestSegment(joined[0].loops, towardRight.x, towardRight.y) > 0.05);
    const alone = outlineLoops([{ q: 31, r: 0 }]);
    assert.ok(nearestSegment(alone.map(loop => loop.points), towardLeft.x, towardLeft.y) < 1e-6);

    const other = sectorWith('Other', 1, true, ['0101']);
    other.polities = [{ name: 'Other', color: '#336699' }];
    assert.equal(polityOutlines([left, other], {}).length, 2);
    const otherColour = sectorWith('Tint', 1, true, ['0101']);
    otherColour.polities = [{ name: 'Imperium', color: '#99aabb' }];
    const sameName = polityOutlines([left, otherColour], {});
    assert.equal(sameName.length, 1);
    assert.equal(sameName[0].hexes, 2);
    assert.equal(sameName[0].loops.length, 1);
    assert.ok(nearestSegment(sameName[0].loops, towardLeft.x, towardLeft.y) > 0.05);
    assert.ok(nearestSegment(sameName[0].loops, towardRight.x, towardRight.y) > 0.05);
    assert.equal(new Set(sameName.map(polity => polity.name)).size, sameName.length);

    const alternate = sectorWith('Alt', 2, false, ['0101', '0201', '0301']);
    assert.deepEqual(polityOutlines([left, right, alternate], {}), joined);

    for (const polity of joined) {
        for (const n of polity.box) assert.ok(places(n) <= 3, String(n));
        for (const loop of polity.loops) for (const n of loop) assert.ok(places(n) <= 3, String(n));
    }
});

test('Spinward Marches alone gives four polities in hex-count order', () => {
    const { overview } = overviewOf('Spinward_Marches');
    const polities = polityOutlines([overview], {});
    assert.deepEqual(polities.map(polity => polity.hexes), [739, 60, 52, 36]);
    assert.equal(new Set(polities.map(polity => polity.name)).size, polities.length);
    for (const polity of polities) {
        for (const n of polity.box) assert.ok(places(n) <= 3);
        for (const loop of polity.loops) for (const n of loop) assert.ok(places(n) <= 3);
    }
});

test('a listed name takes the table colour and any other name takes the cycle', () => {
    const left = sectorWith('Left', 0, true, ['0101']);
    const far = sectorWith('Far', 3, true, ['0101']);
    const table = { Imperium: '#112233' };
    assert.equal(polityOutlines([left], table)[0].color, '#112233');
    const first = polityOutlines([left], {});
    const second = polityOutlines([far], {});
    const again = polityOutlines([left], {});
    const cycle = BORDER_COLOR_CYCLE[hashString('Imperium') % BORDER_COLOR_CYCLE.length];
    assert.equal(first[0].color, cycle);
    assert.equal(second[0].color, cycle);
    assert.equal(again[0].color, cycle);
    assert.equal(polityColour('Imperium', {}), cycle);
    assert.equal(polityColour('Imperium', table), '#112233');
    const names = polityOutlines([left, far], {}).map(polity => polity.name);
    assert.equal(new Set(names).size, names.length);
});

test('regions of Riftspan Reaches carry loops', () => {
    const { index } = overviewOf('Riftspan_Reaches');
    assert.ok(index.regions.length > 0);
    for (const region of index.regions) {
        const hexes = region.hexes.map(hex => toGlobal(index.x, index.y, Number(hex.slice(0, 2)), Number(hex.slice(2, 4))));
        const expected = outlineLoops(hexes).map(loop => loop.points.map(round3));
        assert.deepEqual(region.loops, expected);
        assert.ok(region.loops.length > 0);
        assert.ok(region.loops[0].length >= 6);
    }
});
