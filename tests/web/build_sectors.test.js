/**
 * Build, step 3 part 1: the referee's own sectors (apps/web/src/workspace/build/sectors.ts and
 * sector_acts.ts). An empty slot has an address of its own; a sector of theirs is laid into the
 * chart the map draws; New sector, Rename, Move and Delete each end in the one toast with Undo.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reactive } from 'vue';
import { SectorIndex, TruthManifest } from '@voyage/shared';
import { BUILD_COMMANDS, canBuild } from '../../apps/web/src/workspace/build/commands.ts';
import { slotAt, slotBox, slotsInView } from '../../apps/web/src/workspace/build/marks.ts';
import {
    cancelMove, commitRename, deleteSector, deleteWords, moveTo, nameAt, newSector, sectorUi, setSectorAt, setSectorNav, startMove, startRename, stepCursor,
} from '../../apps/web/src/workspace/build/sector_acts.ts';
import { cleanName, freeSlots, isOwnSlug, ownIndex, parseSlot, slotHolder, slotSlug, slotWords, subsectorOwnName, withOwn } from '../../apps/web/src/workspace/build/sectors.ts';
import { useOwnSectors } from '../../apps/web/src/workspace/build/seam.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';

const ID = '~01M4GFABNQTCSR151Y18ANZN6Z';
const names = (at, name) => Array.from({ length: 16 }, (_, index) => (index === at ? name : ''));
const own = (more = {}) => ({ id: ID, slot: { x: -7, y: -4 }, name: 'Hollow Reach', subsectors: names(5, 'Kessrin Deep'), rev: 3, ...more });
const chart = { sectors: [{ slug: 'Zhiensh', name: 'Zhiensh', x: -7, y: -5 }, { slug: 'Chit_Botshti', name: 'Chit Botshti', x: -5, y: -4 }] };

// ---- addresses and the chart ----------------------------------------------------------------------

test('a sector of the referee’s is known by its id; an empty slot by where it is; neither is a chart slug', () => {
    assert.equal(isOwnSlug(ID), true);
    assert.equal(isOwnSlug('Spinward_Marches'), false);
    assert.equal(slotSlug({ x: 3, y: -1 }), '~slot_3_-1');
    assert.deepEqual(parseSlot('~slot_3_-1'), { x: 3, y: -1 });
    assert.deepEqual(parseSlot('~slot_-7_-4'), { x: -7, y: -4 });
    assert.equal(parseSlot(ID), null);
    assert.equal(parseSlot('Spinward_Marches'), null);
    assert.equal(isOwnSlug('~slot_3_-1'), false);
});

test('what stands in a slot: the chart’s sector, one of the referee’s, or nothing', () => {
    assert.deepEqual(slotHolder(chart, [own()], { x: -7, y: -5 }), { kind: 'chart', slug: 'Zhiensh', name: 'Zhiensh' });
    assert.deepEqual(slotHolder(chart, [own()], { x: -7, y: -4 }), { kind: 'own', slug: ID, name: 'Hollow Reach' });
    assert.equal(slotHolder(chart, [own()], { x: -6, y: -4 }), null);
    // The chart the map draws already holds the referee's sectors: one found there is still theirs.
    const drawn = { sectors: [...chart.sectors, { slug: ID, name: 'Hollow Reach', x: -7, y: -4 }] };
    assert.equal(slotHolder(drawn, [], { x: -7, y: -4 }), null);
});

test('an empty slot is said by what stands beside it, and by its numbers when nothing does', () => {
    assert.equal(slotWords(chart, [], { x: -7, y: -4 }), 'Below Zhiensh');
    assert.equal(slotWords(chart, [], { x: -6, y: -4 }), 'Left of Chit Botshti');
    assert.equal(slotWords(chart, [own()], { x: -6, y: -4 }), 'Right of Hollow Reach');
    assert.equal(slotWords(chart, [], { x: 40, y: 40 }), 'Slot 40, 40');
});

test('the empty slots of a block, row by row, capped', () => {
    const free = freeSlots(chart, [own()], { x: -7, y: -5 }, { x: -5, y: -4 });
    assert.deepEqual(free, [{ x: -6, y: -5 }, { x: -5, y: -5 }, { x: -6, y: -4 }]);
    assert.equal(freeSlots(null, [], { x: 0, y: 0 }, { x: 99, y: 99 }, 12).length, 12);
});

test('the referee’s sectors are laid into the manifest the map draws, and the chart’s own object is kept when there are none', () => {
    const manifest = TruthManifest.parse({
        truthVersion: 'v5', milieu: 'M1105', seed: 's', settings: {
            generationStarportMax: 'A', generationStarportMod: 0, generationPopMax: 15, generationPopMod: 0, generationPopCheckFrequency: 100,
            generationTlMax: 33, generationTlMod: 0, generationNoTravelZones: false, generationUseRealisticStellar: false, generationUseTlFloor: false,
            generationRttSettlement: 5, generationRttTL: 10,
        }, engineVersion: '1.1.0', overviewHash: 'o', politiesHash: 'p', attribution: 'a',
        sectors: [{ slug: 'Zhiensh', name: 'Zhiensh', x: -7, y: -5, tags: ['OTU'], canonical: true, systems: 1, built: 1, partial: 0, indexHash: 'h' }],
    });
    assert.equal(withOwn(manifest, []), manifest);
    const laid = withOwn(manifest, [own()]);
    assert.equal(manifest.sectors.length, 1);
    assert.equal(laid.sectors.length, 2);
    assert.deepEqual({ slug: laid.sectors[1].slug, name: laid.sectors[1].name, x: laid.sectors[1].x, y: laid.sectors[1].y, canonical: laid.sectors[1].canonical }, { slug: ID, name: 'Hollow Reach', x: -7, y: -4, canonical: true });
    assert.deepEqual(laid.sectors[1].tags, []);
    TruthManifest.parse(laid);
});

test('the index the map reads for a sector of theirs: no chart hexes, and only the names they gave', () => {
    const index = ownIndex(own(), 'v5');
    SectorIndex.parse(index);
    assert.deepEqual(index.hexes, {});
    assert.deepEqual(index.metadata.names, { F: 'Kessrin Deep' });
    assert.equal(index.name, 'Hollow Reach');
    assert.equal(subsectorOwnName(own(), 'F'), 'Kessrin Deep');
    assert.equal(subsectorOwnName(own(), 'A'), '');
    assert.equal(subsectorOwnName(own(), 'Q'), '');
});

test('a typed name is trimmed; nothing, or more than eighty characters, is no name', () => {
    assert.equal(cleanName('  Hollow   Reach '), 'Hollow Reach');
    assert.equal(cleanName('   '), null);
    assert.equal(cleanName('x'.repeat(81)), null);
    assert.equal(cleanName('x'.repeat(80)).length, 80);
});

test('a slot on the canvas: its box in the chart’s units, the slot under a point, the block in view', () => {
    const box = slotBox({ x: 0, y: 0 });
    assert.ok(box.width > 31 && box.width < 34);
    assert.ok(box.height > 45 && box.height < 48);
    const cam = { x: 16, y: 23, ppp: 10 };
    const vp = { width: 800, height: 600 };
    assert.deepEqual(slotAt(cam, vp, 400, 300), { x: 0, y: 0 });
    assert.deepEqual(slotAt(cam, vp, 400 - 330, 300), { x: -1, y: 0 });
    const seen = slotsInView(cam, vp);
    assert.deepEqual([seen.from.x, seen.to.x], [-1, 1]);
});

// ---- the acts, against a store that answers as the server does -----------------------------------------

function fakeStore(list = []) {
    const state = reactive({ tick: 0 });
    const held = new Map(list.map((sector) => [sector.id, sector]));
    const calls = [];
    const bump = (sector) => { held.set(sector.id, sector); state.tick += 1; return sector; };
    const act = (id, change) => {
        const before = held.get(id);
        const next = bump({ ...before, ...change, rev: before.rev + 1 });
        return { id, toRev: before.rev, atRev: next.rev };
    };
    return {
        calls,
        held,
        tick: () => state.tick,
        loaded: () => true,
        list: () => [...held.values()],
        get: (id) => held.get(id) ?? null,
        make: async (name, slot) => { calls.push(['make', name, slot]); return bump({ id: ID, slot, name, subsectors: names(-1, ''), rev: 1 }); },
        rename: async (id, name) => { calls.push(['rename', id, name]); return act(id, { name }); },
        move: async (id, slot) => { calls.push(['move', id, slot]); return act(id, { slot }); },
        remove: async (id) => { calls.push(['remove', id]); const rev = held.get(id).rev + 1; held.delete(id); state.tick += 1; return { id, toRev: rev, atRev: rev }; },
        renameSubsector: async (id, letter, name) => {
            calls.push(['subsector', id, letter, name]);
            const subsectors = [...held.get(id).subsectors];
            subsectors[letter.charCodeAt(0) - 65] = name;
            return act(id, { subsectors });
        },
        undo: async (token) => { calls.push(['undo', token]); },
        formMode: async () => null,
        designByHand: async () => async () => {},
    };
}

function setUp(list = []) {
    clearToasts();
    const store = fakeStore(list);
    const went = [];
    useOwnSectors(store);
    setSectorNav({
        openSector: (id, letter) => { went.push(['sector', id, letter]); },
        openSlot: (slot) => { went.push(['slot', slot]); },
        systems: () => 12,
        free: (slot) => !(slot.x === -7 && slot.y === -5),
    });
    setSectorAt(null);
    sectorUi.name = '';
    return { store, went };
}

test('New sector: with no name the box takes focus and nothing is made; with one, the sector is made, opened, and Undo deletes it', async () => {
    const { store, went } = setUp();
    setSectorAt({ kind: 'slot', slot: { x: -7, y: -4 } });
    assert.equal(canBuild('build-sector-new', []), true);
    const focus = sectorUi.focusName;
    await newSector();
    assert.equal(sectorUi.focusName, focus + 1);
    assert.deepEqual(store.calls, []);
    sectorUi.name = '  Hollow Reach ';
    await newSector();
    assert.deepEqual(store.calls, [['make', 'Hollow Reach', { x: -7, y: -4 }]]);
    assert.deepEqual(went, [['sector', ID, null]]);
    assert.equal(sectorUi.name, '');
    assert.equal(toasts[toasts.length - 1].message, 'Created the sector Hollow Reach.');
    toasts[toasts.length - 1].action.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(store.calls[1], ['remove', ID]);
    assert.deepEqual(went[1], ['slot', { x: -7, y: -4 }]);
});

test('Rename: the sector must keep a name; a subsector’s may be emptied; the same name changes nothing', async () => {
    const { store } = setUp([own()]);
    setSectorAt({ kind: 'own', id: ID, letter: null });
    assert.equal(canBuild('build-sector-rename', []), true);
    startRename();
    assert.equal(sectorUi.renaming, true);
    assert.equal(nameAt(), 'Hollow Reach');
    await commitRename('  ');
    assert.equal(sectorUi.error, 'Enter a name for the sector.');
    assert.equal(sectorUi.renaming, true);
    await commitRename('Hollow Reach');
    assert.equal(sectorUi.renaming, false);
    assert.deepEqual(store.calls, []);
    startRename();
    await commitRename('Hollow Reach Two');
    assert.deepEqual(store.calls, [['rename', ID, 'Hollow Reach Two']]);
    assert.equal(toasts[toasts.length - 1].message, 'Renamed the sector to Hollow Reach Two.');
    assert.equal(toasts[toasts.length - 1].action.label, 'Undo');

    setSectorAt({ kind: 'own', id: ID, letter: 'F' });
    assert.equal(nameAt(), 'Kessrin Deep');
    startRename();
    await commitRename('');
    assert.deepEqual(store.calls[1], ['subsector', ID, 'F', '']);
    assert.equal(toasts[toasts.length - 1].message, 'Cleared the name of subsector F.');
    // A subsector is named, never moved or deleted.
    assert.equal(canBuild('build-sector-move', []), false);
    assert.equal(canBuild('build-sector-delete', []), false);
});

test('Move: the keyboard’s slot steps from the sector’s own; a taken slot is refused in words; a free one moves it', async () => {
    const { store, went } = setUp([own()]);
    setSectorAt({ kind: 'own', id: ID, letter: null });
    startMove();
    assert.equal(sectorUi.moving, ID);
    assert.deepEqual(sectorUi.cursor, { x: -7, y: -4 });
    stepCursor(0, -1);
    assert.deepEqual(sectorUi.cursor, { x: -7, y: -5 });
    await moveTo({ x: -7, y: -5 });
    assert.equal(sectorUi.error, 'That sector slot is in use. Select an empty sector slot.');
    assert.deepEqual(store.calls, []);
    await moveTo({ x: -6, y: -4 });
    assert.deepEqual(store.calls, [['move', ID, { x: -6, y: -4 }]]);
    assert.equal(sectorUi.moving, '');
    assert.deepEqual(went, [['sector', ID, null]]);
    assert.equal(toasts[toasts.length - 1].message, 'Moved Hollow Reach with its hexes and names.');
    // Its own slot is no move at all.
    startMove();
    await moveTo({ x: -6, y: -4 });
    assert.equal(sectorUi.moving, '');
    assert.equal(store.calls.length, 1);
    startMove();
    cancelMove();
    assert.equal(sectorUi.cursor, null);
});

test('Delete asks nothing: it says what goes before it is pressed, goes to the empty slot, and its toast’s Undo names the delete’s own revision', async () => {
    const { store, went } = setUp([own()]);
    setSectorAt({ kind: 'own', id: ID, letter: null });
    assert.equal(deleteWords(), 'Also deletes its 12 systems. You can undo this.');
    await deleteSector();
    assert.deepEqual(store.calls, [['remove', ID]]);
    assert.deepEqual(went, [['slot', { x: -7, y: -4 }]]);
    const toast = toasts[toasts.length - 1];
    assert.equal(toast.message, 'Deleted Hollow Reach and its 12 systems.');
    toast.action.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(store.calls[1], ['undo', { id: ID, toRev: 4, atRev: 4 }]);
    assert.deepEqual(went[1], ['sector', ID, null]);
});

test('leaving the sector drops a move and a name half typed', () => {
    setUp([own()]);
    setSectorAt({ kind: 'own', id: ID, letter: null });
    startMove();
    setSectorAt({ kind: 'slot', slot: { x: 1, y: 1 } });
    assert.equal(sectorUi.moving, '');
    setSectorAt({ kind: 'own', id: ID, letter: null });
    startRename();
    setSectorAt(null);
    assert.equal(sectorUi.renaming, false);
});

test('the sector acts are commands, and their keys are N and F2', () => {
    const byId = Object.fromEntries(BUILD_COMMANDS.map((item) => [item.id, item]));
    assert.deepEqual(byId['build-sector-new'].keys, ['n']);
    assert.deepEqual(byId['build-sector-rename'].keys, ['F2']);
    for (const id of ['build-sector-move', 'build-sector-delete']) assert.ok(byId[id]);
    setUp();
    for (const id of ['build-sector-new', 'build-sector-rename', 'build-sector-move', 'build-sector-delete']) assert.equal(canBuild(id, []), false);
    useOwnSectors(null);
    setSectorNav(null);
});
