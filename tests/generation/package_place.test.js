// The pure placement module (contracts/b_marketplace.md F5; z_marketplace.md phase 3 part A).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PlaceError, placeCells, placeKeys, placeRecord, placeTree, stable } from '@voyage/shared';
import { handTree, regina } from './package_location_fields.test.js';

const SECTORS = { Home: { x: 0, y: 0 }, East: { x: 1, y: 0 }, South: { x: 0, y: 1 }, Spinward_Marches: { x: -4, y: -1 }, Deneb: { x: -3, y: -1 } };
const at = (slug) => SECTORS[slug] ?? null;
const slugAt = (sx, sy) => Object.entries(SECTORS).find(([, s]) => s.x === sx && s.y === sy)?.[0] ?? `~slot_${sx}_${sy}`;
const hash = (value) => createHash('sha256').update(stable(value)).digest('hex');

function moved(keys, placement) {
    return placeKeys(placeCells(keys, placement, at, at), slugAt);
}

test('F5 worked example: one column right on the odd-q grid', () => {
    const map = moved(['Home/0101', 'Home/0102', 'Home/0201'], { anchor: 'Home/0101', to: 'Home/0201' });
    assert.deepEqual(Object.fromEntries(map), { 'Home/0101': 'Home/0201', 'Home/0102': 'Home/0202', 'Home/0201': 'Home/0302' });
});

test('an even column shift equals the plain offset shift', () => {
    const map = moved(['Home/0101', 'Home/0201', 'Home/0305'], { anchor: 'Home/0101', to: 'Home/0303' });
    assert.deepEqual(Object.fromEntries(map), { 'Home/0101': 'Home/0303', 'Home/0201': 'Home/0403', 'Home/0305': 'Home/0507' });
});

test('a piece across a sector edge takes the next sector, and empty space is named by slot', () => {
    const map = moved(['Home/3140', 'Home/3240'], { anchor: 'Home/3140', to: 'Home/3240' });
    assert.equal(map.get('Home/3140'), 'Home/3240');
    // 3240 is an odd global column (half a row lower); one step right keeps it down-right of 3140's new place: East's slot is (1,0), so row 41 is the sector below.
    assert.equal(map.get('Home/3240'), '~slot_1_1/0101');
    const down = moved(['Home/0140'], { anchor: 'Home/0140', to: 'South/0140' });
    assert.equal(down.get('Home/0140'), 'South/0140');
    const empty = moved(['Home/0101'], { anchor: 'Home/0101', to: '~slot_5_7/0101' });
    assert.equal(empty.get('Home/0101'), '~slot_5_7/0101');
});

test('neighbour distances are kept for every shift', () => {
    const keys = ['Home/0505', 'Home/0605', 'Home/0606', 'Home/0405', 'Home/0504'];
    const cube = (key) => {
        const [slug, local] = key.split('/');
        const s = SECTORS[slug] ?? { x: Number(slug.split('_')[1]), y: Number(slug.split('_')[2]) };
        const q = s.x * 32 + Number(local.slice(0, 2)) - 1;
        const r = s.y * 40 + Number(local.slice(2)) - 1;
        const z = r - (q - (q & 1)) / 2;
        return { x: q, z, y: -q - z };
    };
    const dist = (a, b) => { const p = cube(a); const q = cube(b); return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z)); };
    for (const to of ['Home/0606', 'Home/0707', 'East/1020', 'South/3101', '~slot_-2_3/0909']) {
        const map = moved(keys, { anchor: 'Home/0505', to });
        for (const a of keys) for (const b of keys) assert.equal(dist(map.get(a), map.get(b)), dist(a, b), `${to} ${a} ${b}`);
    }
});

test('every census field of a stored envelope moves; parentId keeps its suffix', async () => {
    const tree = await regina();
    const map = moved(['Spinward_Marches/1910'], { anchor: 'Spinward_Marches/1910', to: 'Deneb/0101' });
    const placed = placeTree(tree, map);
    const text = JSON.stringify(placed);
    assert.equal(text.includes('Spinward_Marches/1910'), false);
    assert.equal(placed.hexKey, 'Deneb/0101');
    assert.equal(placed.body.mgt2eData.hexId, 'Deneb/0101');
    assert.equal(placed.body.mgt2eData.parentId, 'Deneb/0101-GG-pre');
    assert.equal(placed.body.mgtSystem.mainworld.parentId, 'Deneb/0101-GG-pre');
    for (const world of placed.body.mgtSystem.worlds) for (const moon of world.moons ?? []) {
        assert.ok(moon.hexId === undefined || moon.hexId === 'Deneb/0101');
    }
    assert.notEqual(hash(placed), hash(tree));
    assert.equal(placeTree(handTree(), map).hexKey, 'Deneb/0101');
});

test('a round trip gives back the original hashes; placement is deterministic', async () => {
    const tree = await regina();
    const away = moved(['Spinward_Marches/1910'], { anchor: 'Spinward_Marches/1910', to: 'Home/0707' });
    const back = moved(['Home/0707'], { anchor: 'Home/0707', to: 'Spinward_Marches/1910' });
    const there = placeTree(tree, away);
    assert.equal(hash(placeTree(there, back)), hash(tree));
    assert.equal(hash(placeTree(tree, away)), hash(there));
    assert.deepEqual([...moved(['Home/0101', 'Home/0201'], { anchor: 'Home/0101', to: 'East/0909' })], [...moved(['Home/0101', 'Home/0201'], { anchor: 'Home/0101', to: 'East/0909' })]);
});

test('a record anchor moves; a key outside the piece stays', () => {
    const map = moved(['Home/0101'], { anchor: 'Home/0101', to: 'East/0202' });
    const record = { id: 'cr_1', anchor: { kind: 'system', hexKey: 'Home/0101', bodyKey: 'w1' }, details: 'See Home/0909.' };
    const placed = placeRecord(record, map);
    assert.equal(placed.anchor.hexKey, 'East/0202');
    assert.equal(placed.details, 'See Home/0909.');
    assert.equal(record.anchor.hexKey, 'Home/0101');
});

test('refusals: the anchor must be in the piece, sectors must be known, the slot must be in bounds', () => {
    assert.throws(() => moved(['Home/0101'], { anchor: 'Home/0202', to: 'East/0101' }), (err) => err instanceof PlaceError && err.reason === 'anchor');
    assert.throws(() => moved(['Nowhere/0101'], { anchor: 'Nowhere/0101', to: 'East/0101' }), (err) => err instanceof PlaceError && err.reason === 'unknown sector');
    assert.equal(moved(['Home/0101'], { anchor: 'Home/0101', to: '~slot_1000_0/3201' }).get('Home/0101'), '~slot_1000_0/3201');
    assert.throws(() => moved(['Home/0101', 'Home/0201'], { anchor: 'Home/0101', to: '~slot_1000_0/3201' }), (err) => err instanceof PlaceError && err.reason === 'outside' && err.message === 'The piece does not fit on the map.');
});