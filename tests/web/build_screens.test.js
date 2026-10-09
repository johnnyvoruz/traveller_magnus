import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offeredProviders, readProviders, SIGN_IN_PROVIDERS_URL } from '../../apps/web/src/workspace/account.ts';
import { cameraTransform, hexPoints, keyAt, keysInBox } from '../../apps/web/src/workspace/build/marks.ts';
import {
    addKeys, choiceLine, cleanChoice, DEFAULT_CHOICE, ENGINES, generateTargets, jobToast, layOver, removeTargets,
    restoreTargets, settingRows, spanLine, stateOf, tally, toggleKey,
} from '../../apps/web/src/workspace/build/state.ts';
import { BUILD_COMMANDS } from '../../apps/web/src/workspace/build/commands.ts';

const S = 'Spinward_Marches';
const key = (hex) => S + '/' + hex;
const chartRow = (name, uwp = 'A788899-C') => ({ tree: 'h-' + name, type: 'SYSTEM_PRESENT', name, uwp, allegiance: '', zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null });

// ---- sign-in ------------------------------------------------------------------------------------

test('the card offers X alone until the server says which providers it has', () => {
    assert.deepEqual(offeredProviders(null).map((item) => item.id), ['twitter']);
    assert.deepEqual(offeredProviders(['google', 'twitter', 'github']).map((item) => item.id), ['twitter', 'google']);
    assert.deepEqual(offeredProviders(['discord']).map((item) => item.label), ['Sign in with Discord']);
    assert.deepEqual(offeredProviders([]), []);
});

test('the provider list is read from one route and any failure is null', async () => {
    const asked = [];
    const good = async (url) => { asked.push(url); return new Response(JSON.stringify({ ok: true, data: { twitter: true, discord: true, google: false } })); };
    assert.deepEqual(await readProviders(good), ['twitter', 'discord']);
    assert.deepEqual(asked, [SIGN_IN_PROVIDERS_URL]);
    assert.equal(await readProviders(async () => new Response('{}', { status: 404 })), null);
    assert.deepEqual(await readProviders(async () => new Response(JSON.stringify({ data: {} }))), []);
    assert.equal(await readProviders(async () => new Response(JSON.stringify({ data: ['twitter'] }))), null);
    assert.equal(await readProviders(async () => { throw new Error('offline'); }), null);
});

// ---- the selection ------------------------------------------------------------------------------

test('a key is added, or taken away when it is there', () => {
    assert.deepEqual(toggleKey([key('1910')], key('2010')), [key('1910'), key('2010')]);
    assert.deepEqual(toggleKey([key('1910'), key('2010')], key('1910')), [key('2010')]);
});

test('a box adds what is new, in order, and stops at the cap', () => {
    assert.deepEqual(addKeys(['a'], ['b', 'a', 'c']), { keys: ['a', 'b', 'c'], over: false });
    assert.deepEqual(addKeys(['a'], ['b', 'c', 'd'], 2), { keys: ['a', 'b'], over: true });
});

test('the builder’s row decides what a hex is; with none the chart does', () => {
    assert.equal(stateOf(null, null), 'empty');
    assert.equal(stateOf(null, chartRow('Regina')), 'truth');
    assert.equal(stateOf({ hexKey: key('1910'), state: 'removed', entry: null, roll: 0, rev: 2 }, chartRow('Regina')), 'removed');
    assert.equal(stateOf({ hexKey: key('2010'), state: 'own', entry: chartRow('Averne'), roll: 1, rev: 1 }, null), 'own');
});

test('the count, and what each act takes from it', () => {
    const states = { [key('1908')]: 'empty', [key('1909')]: 'truth', [key('1910')]: 'override', [key('1911')]: 'removed', [key('2010')]: 'own' };
    const count = tally(Object.keys(states), (k) => states[k]);
    assert.deepEqual(count, { empty: [key('1908')], chart: [key('1909')], yours: [key('1910'), key('2010')], removed: [key('1911')] });
    // Generate fills the empty ones; a filled hex only when asked; a removed one never.
    assert.deepEqual(generateTargets(count, false), [key('1908')]);
    assert.deepEqual(generateTargets(count, true), [key('1908'), key('1909'), key('1910'), key('2010')]);
    assert.deepEqual(removeTargets(count), [key('1909'), key('1910'), key('2010')]);
    // Restore: the builder has a row and the chart has something under it.
    const truth = (k) => (k === key('2010') || k === key('1908') ? null : chartRow('x'));
    assert.deepEqual(restoreTargets(Object.keys(states), (k) => states[k], truth), [key('1910'), key('1911')]);
});

test('where a selection lies, in words', () => {
    assert.equal(spanLine([key('1908'), key('2111'), key('2010')]), 'Columns 19 to 21, rows 08 to 11');
    assert.equal(spanLine([key('1910'), key('1911')]), 'Column 19, rows 10 to 11');
    assert.equal(spanLine([key('1910'), 'Deneb/0101']), 'Across 2 sectors');
    assert.equal(spanLine([]), '');
});

test('the generate choice: only an engine the dossier can walk, and a generator that engine has', () => {
    assert.deepEqual(ENGINES.filter((item) => item.ready).map((item) => item.id), ['MgT2E', 'AoW']);
    // The pairs are the contract's: Mongoose top down, Architect of Worlds bottom up.
    assert.deepEqual(ENGINES.filter((item) => item.ready).map((item) => item.generators), [['top-down'], ['bottom-up']]);
    assert.deepEqual(cleanChoice({ engine: 'AoW', generator: 'top-down' }), { engine: 'AoW', generator: 'bottom-up' });
    assert.deepEqual(cleanChoice({ engine: 'MgT2E', generator: 'bottom-up' }), { engine: 'MgT2E', generator: 'top-down' });
    assert.deepEqual(cleanChoice({ engine: 'T5', generator: 'top-down' }), DEFAULT_CHOICE);
    assert.deepEqual(cleanChoice('nonsense'), DEFAULT_CHOICE);
    assert.equal(choiceLine({ engine: 'MgT2E', generator: 'top-down' }), 'Mongoose 2nd Ed (MgT2E) · full system, top down');
});

test('the universe’s settings are shown under the legacy tray’s labels', () => {
    assert.deepEqual(settingRows(null), []);
    const rows = settingRows({
        generationPopMax: 20, generationPopMod: 0, generationTlMax: 20, generationTlMod: 0, generationUseRealisticStellar: false,
        generationUseTlFloor: true, generationRttSettlement: 2, generationRttTL: 15, generationStarportMax: 'A', generationStarportMod: 0,
        generationNoTravelZones: false, generationPopCheckFrequency: 100,
    });
    assert.equal(rows.length, 12);
    assert.deepEqual(rows[0], { label: 'Starport Max', value: 'A' });
    assert.deepEqual(rows.find((row) => row.label === 'Use Min TL (MgT2e)'), { label: 'Use Min TL (MgT2e)', value: 'on' });
});

test('the rows are laid over the chart: a system replaces or adds, a removed one takes away', () => {
    const index = { slug: S, name: 'Spinward Marches', hexes: { 1909: chartRow('Hefry'), 1910: chartRow('Regina') } };
    assert.equal(layOver(index, []), index);
    const over = layOver(index, [
        { hexKey: key('1909'), state: 'removed', entry: null, roll: 0, rev: 1 },
        { hexKey: key('2010'), state: 'own', entry: chartRow('Averne'), roll: 0, rev: 1 },
        { hexKey: 'Deneb/0101', state: 'own', entry: chartRow('Elsewhere'), roll: 0, rev: 1 },
    ]);
    assert.notEqual(over, index);
    assert.deepEqual(Object.keys(over.hexes).sort(), ['0101', '1910', '2010']);
    assert.deepEqual(Object.keys(index.hexes).sort(), ['1909', '1910']);
});

test('the toast when a many-hex build ends', () => {
    assert.equal(jobToast({ total: 7, done: 7, failed: [], state: 'done' }, 'Regina'), 'Generated 7 systems in Regina.');
    assert.equal(jobToast({ total: 9, done: 1, failed: ['x'], state: 'done' }, ''), 'Generated 1 system. 1 hex failed.');
    assert.equal(jobToast({ total: 12, done: 4, failed: [], state: 'stopped' }, 'Regina'), 'Stopped. 4 systems of 12 built in Regina.');
});

test('no key does two build things, and none takes a key the map already uses', () => {
    const taken = new Set(['/', 'Home', 'Escape', 'l', 'b']);
    for (const command of BUILD_COMMANDS) {
        for (const spec of command.keys ?? []) {
            assert.equal(taken.has(spec), false, spec + ' is taken');
            taken.add(spec);
        }
    }
});

// ---- the marks ----------------------------------------------------------------------------------

const sectorOf = (slug) => (slug === S ? { slug: S, x: -4, y: -1 } : null);
const sectorAt = (x, y) => (x === -4 && y === -1 ? S : null);

test('a hex is six points in the chart’s units, and nothing off the chart', () => {
    const points = hexPoints(key('1910'), sectorOf).split(' ');
    assert.equal(points.length, 6);
    assert.equal(hexPoints('Nowhere/1910', sectorOf), '');
    assert.equal(hexPoints(key('19'), sectorOf), '');
});

test('the camera transform puts the camera’s centre in the middle of the canvas', () => {
    assert.equal(cameraTransform({ x: 2, y: 1, ppp: 50 }, { width: 800, height: 600 }), 'translate(300.00 250.00) scale(50.0000)');
});

test('the hex under the pointer and the hexes inside a dragged box', () => {
    const vp = { width: 800, height: 600 };
    // Centre the camera on 1910: column 19 of sector (-4, -1) is global q = -4 * 32 + 18.
    const q = -4 * 32 + 18;
    const r = -1 * 40 + 9;
    const cam = { x: q, y: (Math.sqrt(3) / 1.5) * (r + ((q & 1) ? 0.5 : 0)), ppp: 80 };
    assert.equal(keyAt(cam, vp, 400, 300, sectorAt), key('1910'));
    assert.equal(keyAt(cam, vp, 400, 300, () => null), null);
    const inside = keysInBox(cam, vp, { x: 360, y: 260 }, { x: 520, y: 400 }, sectorAt, 100);
    assert.ok(inside.includes(key('1910')));
    assert.ok(inside.includes(key('2010')));
    assert.ok(inside.length >= 3 && inside.length <= 6, String(inside.length));
    assert.equal(keysInBox(cam, vp, { x: 0, y: 0 }, { x: 800, y: 600 }, sectorAt, 5).length, 5);
});

// ---- a sector or a subsector as the selection ---------------------------------------------------

test('a subsector is its eighty hexes and a sector all 1,280, each once', async () => {
    const { scopeKeys, scopeTitle, subsectorCells } = await import('../../apps/web/src/workspace/build/scope.ts');
    const c = scopeKeys({ slug: S, letter: 'C' });
    assert.equal(c.length, 80);
    assert.equal(c[0], key('1701'));
    assert.ok(c.includes(key('1910')));
    assert.equal(c[79], key('2410'));
    const all = scopeKeys({ slug: S, letter: null });
    assert.equal(all.length, 1280);
    assert.equal(new Set(all).size, 1280);
    assert.deepEqual(scopeKeys({ slug: S, letter: 'Q' }), []);
    const nameAt = (hexKey) => (hexKey === key('1701') ? 'Regina' : '');
    const cells = subsectorCells(S, nameAt);
    assert.equal(cells.length, 16);
    assert.deepEqual(cells[2], { letter: 'C', name: 'Regina' });
    assert.deepEqual(cells[0], { letter: 'A', name: 'Subsector A' });
    assert.equal(scopeTitle({ slug: S, letter: 'C' }, 'Spinward Marches', nameAt), 'Regina');
    assert.equal(scopeTitle({ slug: S, letter: null }, 'Spinward Marches', nameAt), 'Spinward Marches');
});
