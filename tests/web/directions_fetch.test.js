/**
 * DN1b (streams/D.md): Directions fetches the sectors it needs. The box between From and To widened by the jump,
 * nearest the line first and the ends' own sectors always in, at most 16 with the sentence past that; an end by
 * sector and hex in a sector not loaded; "Finding a route…" while the stubbed fetch runs; then the plan over
 * what arrived.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { blankForm } from '../../apps/web/src/map/directions.ts';
import { bothSettled, CAPPED_WORDS, FINDING_WORDS, gridEnd, planFetching, resolveEnd, ROUTE_SECTOR_CAP, saidAfter, sectorsForRoute } from '../../apps/web/src/map/directions_fetch.ts';

const webSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');

// A row of sectors along x, and a big grid around the origin for the cap.
const row = [0, 1, 2, 3].map((x) => ({ slug: 'S' + x, name: 'Sector ' + x, x, y: 0 }));
const big = [];
for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) big.push({ slug: 'B' + x + '_' + y, name: 'B ' + x + ' ' + y, x, y });

function index(slug, x, y, rows) {
    const hexes = {};
    for (const one of rows) hexes[one.hex] = { name: one.name ?? '', uwp: one.uwp ?? 'B555555-8', zone: '', pbg: '000' };
    return { slug, name: 'Sector ' + x, x, y, hexes };
}

test('an end by sector and hex: the name or the slug, loaded or not; a whole name still read from the loaded', () => {
    assert.deepEqual(gridEnd(row, 'Sector 2 0510'), { sector: 'S2', hex: '0510' });
    assert.deepEqual(gridEnd(row, 's2/0510'), { sector: 'S2', hex: '0510' });
    assert.equal(gridEnd(row, 'Sector 9 0510'), null);
    assert.equal(gridEnd(row, 'Sector 2'), null);
    const loaded = [index('S0', 0, 0, [{ hex: '3220', name: 'Home' }])];
    assert.deepEqual(resolveEnd(loaded, row, 'Home', 'From'), { ok: true, end: { sector: 'S0', hex: '3220' }, label: 'Home' });
    assert.deepEqual(resolveEnd(loaded, row, 'Sector 3 0101', 'To'), { ok: true, end: { sector: 'S3', hex: '0101' }, label: 'Sector 3 0101' });
    assert.equal(resolveEnd(loaded, row, 'Nowhere', 'To').ok, false);
    assert.equal(bothSettled(loaded, row, { ...blankForm(), from: 'Home', to: 'Sector 3 0101' }), true, 'plans by itself across sectors not loaded');
});

test('the box: the sectors between the ends widened by the jump, the ends first, nearest the line next', () => {
    const near = sectorsForRoute(row, { sector: 'S0', hex: '1620' }, { sector: 'S2', hex: '1620' }, 2);
    assert.deepEqual(near, { slugs: ['S0', 'S2', 'S1'], capped: false });
    const edge = sectorsForRoute(row, { sector: 'S0', hex: '1620' }, { sector: 'S2', hex: '3120' }, 2);
    assert.deepEqual(edge.slugs.sort(), ['S0', 'S1', 'S2', 'S3'], 'two parsecs from the edge reach the next sector');
    assert.deepEqual(sectorsForRoute(row, { sector: 'Gone', hex: '0101' }, { sector: 'S1', hex: '0101' }, 2), { slugs: [], capped: false });
});

test('the cap: at most 16, nearest the line, and the sentence', () => {
    const wide = sectorsForRoute(big, { sector: 'B-4_-4', hex: '1620' }, { sector: 'B4_4', hex: '1620' }, 6);
    assert.equal(wide.slugs.length, ROUTE_SECTOR_CAP);
    assert.equal(wide.capped, true);
    assert.deepEqual(wide.slugs.slice(0, 2), ['B-4_-4', 'B4_4']);
    assert.ok(wide.slugs.includes('B0_0'), 'the middle of the line');
    assert.ok(!wide.slugs.includes('B-4_4') && !wide.slugs.includes('B4_-4'), 'the far corners are left');
    assert.equal(CAPPED_WORDS, 'Only the 16 sectors nearest the route were searched.');
    assert.equal(saidAfter({ ok: true, stops: [], lines: [], total: '' }, true), CAPPED_WORDS);
    assert.equal(saidAfter({ ok: false, message: 'No route.' }, true), 'No route. ' + CAPPED_WORDS);
    assert.equal(saidAfter({ ok: false, message: 'No route.' }, false), 'No route.');
});

test('the plan: the missing sectors fetched first ("Finding a route…"), then planned over what arrived', async () => {
    // Home at the east edge of S0, a stepping stone at the west edge of S1, Far in S1: Jump-1 needs S1.
    const s0 = index('S0', 0, 0, [{ hex: '3220', name: 'Home' }]);
    const s1 = index('S1', 1, 0, [{ hex: '0120', name: 'Step' }, { hex: '0220', name: 'Far' }]);
    const held = [s0];
    const fetched = [];
    let finding = 0;
    const how = {
        indexes: () => held,
        grid: row,
        fetchIndex: async (slug) => { fetched.push(slug); if (slug === 'S1') held.push(s1); return null; },
        finding: () => { finding += 1; },
    };
    const form = { ...blankForm(), from: 'Home', to: 'Sector 1 0220', jump: 1 };
    const { result, capped } = await planFetching(how, form);
    assert.equal(finding, 1);
    assert.deepEqual(fetched, ['S1']);
    assert.equal(capped, false);
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(result.stops, [{ sector: 'S0', hex: '3220' }, { sector: 'S1', hex: '0120' }, { sector: 'S1', hex: '0220' }]);
    assert.equal(FINDING_WORDS, 'Finding a route…');
    // Everything held: no fetch, no "Finding".
    const again = await planFetching({ ...how, finding: () => { finding += 1; } }, form);
    assert.equal(again.result.ok, true);
    assert.equal(finding, 1);
    // A fetch that fails is a miss in the planner's words, not a thrown error.
    const lost = await planFetching({ indexes: () => [s0], grid: row, fetchIndex: async () => { throw new Error('offline'); } }, form);
    assert.equal(lost.result.ok, false);
});

test('pins: the panel plans through it and says it; MapView hands it the grid and the fetch', () => {
    const panel = fs.readFileSync(path.join(webSrc, 'map/DirectionsPanel.vue'), 'utf8');
    assert.match(panel, /finding: \(\) => \{ said\.value = FINDING_WORDS; \}/);
    assert.match(panel, /const \{ result, capped \} = await planFetching\(how, form, pinned\);\s+if \(ticket !== planTicket\) return;\s+said\.value = saidAfter\(result, capped\);/);
    const view = fs.readFileSync(path.join(webSrc, 'views/MapView.vue'), 'utf8');
    assert.match(view, /:grid="routeGrid"\s+:fetch-index="indexWhenReady"/);
    assert.match(view, /return chart\.sectors\.filter\(\(item\) => item\.canonical\)\.map/);
    const text = fs.readFileSync(path.join(webSrc, 'map/directions_fetch.ts'), 'utf8');
    assert.doesNotMatch(text, /\bwindow\.|\bdocument\.|\bfetch\(/, 'the fetch is handed in');
});
