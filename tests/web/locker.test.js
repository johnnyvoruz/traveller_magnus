/**
 * DS6: the Ship's locker with the move pair. The rows and their words (pure), a blank row dropped, the KG sum from
 * the typed column, the Equipment table's boxes a row moves to and from; the schema and the projection keep every
 * row; the move's refusals before any write (no sheet to write, a full table) and its put-back shape (pinned);
 * the player's page renders the section read-only without the switch and typed in place with it; the mounts.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CampaignRecord, LockerRow, StatusAppend, playersView } from '@voyage/shared';
import {
    COLUMNS, EQUIPMENT_ROWS, NOT_CHANGED, NOT_MOVED, NO_LOCKER, NO_TAKER, WRITE_TYPE, equipmentFilled, equipmentNames, equipmentRows, equipmentSets, firstEmptyEquipment, fullWords,
    isBlank, kgOf, kgSum, kgText, kgWords, lockerChanged, lockerOf, lockerWith, lockerWithout, movedToLockerWords, movedToSheetWords, rowFrom, rowFromEquipment, withSets,
} from '../../apps/web/src/workspace/locker.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const stamp = '2026-11-02T00:00:00.000Z';
const record = (n, type, name, visibility, over = {}) => ({
    id: rid(n), type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility,
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 3, createdAt: stamp, updatedAt: stamp, deleted: false, ...over,
});
const suit = { type: 'Vacc suit', tl: '12', kg: 8, notes: 'Standard' };
const kit = { type: 'Medkit', tl: '8', kg: 1, notes: '' };
const ship = (status) => record(1, 'vessel', 'Kestrel Dawn', 'players', { status });
const tam = (over = {}) => record(2, 'person', 'Tam Oduya', 'players', over);
const party = { vesselIds: [rid(1)], memberIds: [rid(2)] };

test('the rows as stored; a row short of a column is not a row', () => {
    assert.deepEqual(lockerOf(ship({ locker: [suit, kit] })), [suit, kit]);
    assert.deepEqual(lockerOf(ship({ locker: [suit, { type: 'x' }, null, 'y', { ...kit, kg: '1' }] })), [suit]);
    assert.deepEqual(lockerOf(ship(null)), []);
    assert.deepEqual(lockerOf(null), []);
});

test('a row from the boxes: trimmed, the KG read as a number from what was typed, nothing from nonsense', () => {
    assert.deepEqual(rowFrom({ type: ' Vacc suit ', tl: '12', kg: '8', notes: ' Standard' }), suit);
    assert.equal(kgOf('8.5'), 8.5);
    assert.equal(kgOf('2,5 kg'), 2.5);
    assert.equal(kgOf('about 3'), 3);
    assert.equal(kgOf(''), 0);
    assert.equal(kgOf('heavy'), 0);
    assert.equal(kgOf('-4'), 0, 'no negative mass');
    assert.equal(kgOf(7), 7);
    assert.equal(kgText(8), '8');
    assert.equal(kgText(0.5), '0.5');
    assert.equal(kgText(0), '', 'zero reads as an empty box');
    assert.equal(isBlank(rowFrom({ type: ' ', tl: '', kg: '', notes: '' })), true);
    assert.equal(isBlank(rowFrom({ type: '', tl: '', kg: '0', notes: 'x' })), false);
});

test('adding, changing and removing; a blank row is dropped, not kept', () => {
    assert.deepEqual(lockerWith([], suit), [suit]);
    assert.deepEqual(lockerWith([suit], rowFrom({ type: '', tl: '', kg: '', notes: '' })), [suit], 'a blank add is nothing');
    assert.deepEqual(lockerChanged([suit, kit], 1, { ...kit, notes: 'Used' }), [suit, { ...kit, notes: 'Used' }], 'in place');
    assert.deepEqual(lockerChanged([suit, kit], 0, { type: '', tl: '', kg: 0, notes: '' }), [kit], 'changed to nothing, the row leaves');
    assert.deepEqual(lockerChanged([suit], 4, kit), [suit], 'no such row');
    assert.deepEqual(lockerWithout([suit, kit], 0), [kit]);
    assert.deepEqual(lockerWithout([suit, kit], 9), [suit, kit]);
});

test('the KG sum is the typed column added up, as a line; no rule', () => {
    assert.equal(kgSum([suit, kit]), 9);
    assert.equal(kgSum([{ ...suit, kg: 0.1 }, { ...kit, kg: 0.2 }]), 0.3, 'to the hundredth');
    assert.equal(kgWords([suit, kit]), '9 kg in the locker');
    assert.equal(kgWords([{ ...suit, kg: 0 }]), '0 kg in the locker');
    assert.equal(kgWords([]), NO_LOCKER);
    assert.equal(NO_LOCKER, 'Nothing in the locker.');
});

test('the Equipment table: eight rows of four boxes as the rules file spells them, the first empty row, the sets each way', () => {
    assert.equal(EQUIPMENT_ROWS, 8);
    assert.deepEqual(COLUMNS, ['type', 'tl', 'kg', 'notes']);
    assert.deepEqual(equipmentNames(3), { type: 'Equipment Type 3', tl: 'Equipment TL 3', kg: 'Equipment KG 3', notes: 'Equipment Notes 3' });
    const rules = JSON.parse(fs.readFileSync(path.join(root, 'rules/mgt2e_character_sheet_fields.json'), 'utf8'));
    const names = new Set(rules.fields.map((field) => field.name));
    for (let n = 1; n <= 8; n += 1) for (const name of Object.values(equipmentNames(n))) assert.ok(names.has(name), name + ' is a box of the sheet');
    assert.equal(names.has('Equipment Type 9'), false, 'the table stops at eight');
    const fields = { 'Equipment Type 1': 'Medkit', 'Equipment TL 1': '8', 'Equipment KG 1': '1', 'Equipment Notes 3': 'a note alone', 'Name': 'Tam' };
    const rows = equipmentRows(fields);
    assert.equal(rows.length, 8);
    assert.deepEqual(rows[0], { n: 1, type: 'Medkit', tl: '8', kg: '1', notes: '' });
    assert.equal(equipmentFilled(rows[0]), true);
    assert.equal(equipmentFilled(rows[1]), false);
    assert.equal(equipmentFilled(rows[2]), true, 'a note alone fills a row');
    assert.equal(firstEmptyEquipment(fields), 2);
    const full = {};
    for (let n = 1; n <= 8; n += 1) full['Equipment Type ' + n] = 'Thing ' + n;
    assert.equal(firstEmptyEquipment(full), null);
    assert.deepEqual(equipmentSets(2, suit), [
        { field: 'Equipment Type 2', value: 'Vacc suit' }, { field: 'Equipment TL 2', value: '12' }, { field: 'Equipment KG 2', value: '8' }, { field: 'Equipment Notes 2', value: 'Standard' },
    ]);
    assert.deepEqual(equipmentSets(1, null).map((set) => set.value), ['', '', '', '']);
    assert.deepEqual(rowFromEquipment(rows[0]), kit);
    assert.deepEqual(withSets(fields, equipmentSets(1, null)), { 'Equipment Notes 3': 'a note alone', 'Name': 'Tam' }, 'an emptied box leaves the sheet');
    assert.deepEqual(withSets({}, equipmentSets(1, kit)), { 'Equipment Type 1': 'Medkit', 'Equipment TL 1': '8', 'Equipment KG 1': '1' }, 'the empty notes box is not written');
});

test('the words', () => {
    assert.equal(movedToSheetWords(suit, 'Tam Oduya'), 'Moved Vacc suit to Tam Oduya’s sheet.');
    assert.equal(movedToLockerWords({ ...kit, type: '', notes: 'a note' }, 'Kestrel Dawn'), 'Moved a note to Kestrel Dawn’s locker.');
    assert.equal(movedToLockerWords({ type: '', tl: '', kg: 2, notes: '' }, 'Kestrel Dawn'), 'Moved an item to Kestrel Dawn’s locker.');
    assert.equal(fullWords('Tam Oduya'), 'Tam Oduya’s Equipment table is full. Clear a row on the sheet first.');
    assert.equal(NOT_MOVED, 'The item was not moved. Try again.');
    assert.equal(NOT_CHANGED, 'The locker was not changed. Try again.');
    assert.equal(NO_TAKER, 'That character’s sheet cannot be written from here.');
    assert.equal(WRITE_TYPE, 'Write at least the type.');
});

test('the schema takes the rows; the projection keeps every one; the door takes add, change and remove', () => {
    assert.equal(LockerRow.safeParse(suit).success, true);
    assert.equal(LockerRow.safeParse({ ...suit, kg: '8' }).success, false);
    assert.equal(LockerRow.safeParse({ ...suit, tons: 1 }).success, false);
    const vessel = ship({ locker: [suit, kit] });
    assert.equal(CampaignRecord.safeParse(vessel).success, true);
    const view = playersView({ records: [vessel, tam()], links: [], journal: [], settings: null, clock: null });
    assert.deepEqual(view.records.find((row) => row.id === rid(1)).status.locker, [suit, kit]);
    assert.equal(StatusAppend.safeParse({ id: rid(1), append: { locker: { add: [suit] } } }).success, true);
    assert.equal(StatusAppend.safeParse({ id: rid(1), append: { locker: { change: [{ index: 0, row: kit }] } } }).success, true);
    assert.equal(StatusAppend.safeParse({ id: rid(1), append: { locker: { remove: [0] } } }).success, true);
    assert.equal(StatusAppend.safeParse({ id: rid(1), append: { locker: {} } }).success, false, 'an empty piece');
});

test('pins: the section beside Cargo on both pages, the player writes only through the door, the row action on the sheet, the put-back', () => {
    const trade = read('workspace/VesselTrade.vue');
    assert.match(trade, /<\/section>\s+<ShipLocker :id="id" :read-only="readOnly" who="referee" \/>\s+<section class="vt-sec ui-frame" data-vessel-ledger/, 'after Cargo, before the Ledger');
    const player = read('workspace/players/PlayerShip.vue');
    assert.match(player, /<\/section>\s+<ShipLocker :id="id" :read-only="false" who="player" \/>\s+<section class="pship-sec ui-frame" data-player-passengers/, 'after Cargo on the player\'s page');
    const section = read('workspace/ShipLocker.vue');
    assert.match(section, /data-vessel-locker/);
    assert.match(section, /const canWrite = computed\(\(\) => !props\.readOnly && \(props\.who === 'referee' \|\| myCrew\.value\.length > 0\)\);/, 'a player writes with the switch alone');
    assert.match(section, /myPersonIds\(\)\.filter\(\(id\) => may\(record\.value, id, 'locker'\)\)/);
    assert.match(section, /<option v-for="person in takers" :key="person\.id" :value="person\.id">To \{\{ person\.name \}\}<\/option>/);
    assert.doesNotMatch(section, /#[0-9a-f]{3,6}\b/i, 'tokens only');
    assert.doesNotMatch(section, /\bwindow\.|\bdocument\./);
    const move = read('workspace/locker_move.ts');
    assert.match(move, /const result = await appendStatus\(ship\.id, append\);/, 'a player\'s locker write is the door');
    assert.match(move, /if \(!landed\) \{\n\s+const back = campaign\.records\[ship\.id\] \?\? ship;\n\s+await writeLocker\(back, who, lockerWith\(lockerOf\(back\), row\), \{ locker: \{ add: \[row\] \} \}\);\n\s+return \{ ok: false, why: 'not_moved' \};/, 'a failed landing puts the row back in the locker');
    assert.match(move, /if \(!added\) \{\n\s+restore\(\);\n\s+return \{ ok: false, why: 'not_moved' \};/, 'a failed add puts the boxes back');
    assert.match(move, /'\/api\/characters\/' \+ encodeURIComponent\(taker\.id\) \+ '\/fields'/, 'a Character is written through the route its sheet writes today');
    assert.match(move, /saveRecord\(person\.id, \{ sheet: characterSheetWith\(now\.sheet, withSets\(fields, sets\)\) \}\);/, 'a plain sheet through the record save');
    const door = read('campaign/append.ts');
    assert.match(door, /body: JSON\.stringify\(\{ appends: \[\{ id, append \}\] \}\),/);
    assert.match(door, /await loadPlayerPages\(campaign\.universeId\);/, 'both lists re-read after');
    const sheet = read('workspace/CharacterSheet.vue');
    assert.match(sheet, /rowAction\?: \{ table: string; label: string; title: string \} \| null;/);
    assert.match(sheet, /<button v-if="rowFilled\(row\)" type="button" class="ui-btn csheet-row-act" :title="rowAction!\.title" :data-row-action="block\.name \+ ':' \+ \(n \+ 1\)" @click="emit\('rowAction', n \+ 1\)">\{\{ rowAction!\.label \}\}<\/button>/);
    const person = read('workspace/PersonSheet.vue');
    assert.equal((person.match(/:row-action="(lockerAction|liveEditable \? lockerAction : null)"/g) || []).length, 2, 'on the plain sheet and the live Character');
    assert.match(person, /label: 'To the locker'/);
    assert.match(person, /shipHolding\(partyShips\(campaign\.records, campaign\.settings\.party\), record\.value\.id, ''\)/, 'only a character who crews a party ship');
    assert.match(read('workspace/vessel_trade.ts'), /locker\?: LockerRow\[\]/);
});

describe('the player\'s page renders the locker; the move refuses before any write', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;
    let me = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-locker-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        store = await server.ssrLoadModule('/src/campaign/store.ts');
        me = await server.ssrLoadModule('/src/workspace/players/me.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    function hold(records, partySettings, role = 'player') {
        const { campaign } = store;
        for (const key of Object.keys(campaign.records)) delete campaign.records[key];
        for (const row of records) campaign.records[row.id] = row;
        for (const key of Object.keys(campaign.links)) delete campaign.links[key];
        campaign.settings = { party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null, ...partySettings }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 2 };
        campaign.clock = { days: 1105 * 365 + 13, rev: 1 };
        campaign.status = 'ready';
        campaign.role = role;
        campaign.universeId = 'u_test';
    }

    async function render(file, props = {}) {
        const view = (await server.ssrLoadModule(file)).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createRouter, createMemoryHistory } = await import('vue-router');
        const app = createSSRApp(view, props);
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] });
        app.use(router);
        await router.push('/');
        await router.isReady();
        return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, '');
    }

    const crewed = (over = {}) => ship({ crew: [{ personId: rid(2), role: 'Captain' }], locker: [suit, kit], ...over });
    const section = (html) => html.slice(html.indexOf('data-vessel-locker'), html.indexOf('data-player-passengers'));

    test('without the switch, or with no tied character known, the rows read as text: no box, no button', async () => {
        me.setMyPersonIds([]);
        hold([crewed(), tam()], party);
        const html = section(await render('/src/workspace/players/PlayerShip.vue', { id: rid(1) }));
        assert.match(html, /Ship’s locker <span class="ui-frame-count">2<\/span>/);
        assert.match(html, /data-locker-sum>9 kg in the locker<\/span>/);
        assert.match(html, /data-locker-writes="no"/);
        assert.match(html, /data-locker-text="0:type">Vacc suit<\/td>/);
        assert.match(html, /data-locker-text="0:kg">8<\/td>/);
        assert.match(html, /data-locker-text="1:notes"><\/td>/);
        assert.doesNotMatch(html, /<input|<select|<form|<button/);
        me.setMyPersonIds([rid(2)]);
        hold([crewed({ roles: [{ name: 'Captain', ledger: true, trade: true, locker: false }] }), tam()], party);
        const off = section(await render('/src/workspace/players/PlayerShip.vue', { id: rid(1) }));
        assert.match(off, /data-locker-writes="no"/, 'the Locker switch off');
        assert.doesNotMatch(off, /<input|<form/);
        hold([ship({ crew: [{ personId: rid(2), role: 'Captain' }] }), tam()], party);
        const empty = section(await render('/src/workspace/players/PlayerShip.vue', { id: rid(1) }));
        assert.match(empty, /class="lk-none">Nothing in the locker\.<\/p>/);
    });

    test('with the switch on, a tied crew character types in place, removes and adds; no Move to without a sheet of their own to write', async () => {
        me.setMyPersonIds([rid(2)]);
        hold([crewed(), tam()], party);
        const html = section(await render('/src/workspace/players/PlayerShip.vue', { id: rid(1) }));
        assert.match(html, /data-locker-writes="yes"/);
        assert.match(html, /<input value="Vacc suit" class="lk-box" maxlength="200" aria-label="Type, row 1" data-locker-cell="0:type">/);
        assert.match(html, /<input value="1" class="lk-box" maxlength="12" inputmode="decimal" aria-label="KG, row 2" data-locker-cell="1:kg">/);
        assert.match(html, /aria-label="Remove Vacc suit" title="Remove this row" data-locker-remove="0"/);
        assert.match(html, /<form class="lk-add" data-locker-add>/);
        assert.match(html, /data-locker-post>Add to the locker<\/button>/);
        assert.doesNotMatch(html, /data-locker-to=/, 'a plain sheet is the referee\'s to write; a Character needs the Characters store');
        me.setMyPersonIds([]);
    });

    test('the move refuses before any write: no sheet a player can write, a full Equipment table for the referee', async () => {
        const move = await server.ssrLoadModule('/src/workspace/locker_move.ts');
        const full = {};
        for (let n = 1; n <= 8; n += 1) full['Equipment Type ' + n] = 'Thing ' + n;
        const plain = tam({ sheet: { schema: 'mgt2e_character@1', fields: { 'Equipment Type 1': 'Medkit' } } });
        assert.deepEqual(move.sheetTaker(plain, 'referee'), { kind: 'record' });
        assert.equal(move.sheetTaker(plain, 'player'), null, 'a plain sheet is the record\'s');
        assert.deepEqual(move.sheetTaker(tam(), 'referee'), { kind: 'record' }, 'a person with no sheet yet: the referee starts one');
        assert.equal(move.sheetTaker(tam({ sheet: { schema: 'mgt2e_character@1', characterId: 'ch_1' } }), 'referee'), null, 'a Character the store does not list');
        hold([crewed(), plain], party, 'owner');
        assert.deepEqual(await move.toCharacter(store.campaign.records[rid(1)], 0, plain, 'player'), { ok: false, why: 'no_taker' });
        const stuffed = tam({ sheet: { schema: 'mgt2e_character@1', fields: full } });
        hold([crewed(), stuffed], party, 'owner');
        assert.deepEqual(await move.toCharacter(store.campaign.records[rid(1)], 0, stuffed, 'referee'), { ok: false, why: 'full' });
        assert.deepEqual(lockerOf(store.campaign.records[rid(1)]), [suit, kit], 'nothing written');
        assert.deepEqual(await move.toCharacter(store.campaign.records[rid(1)], 5, stuffed, 'referee'), { ok: false, why: 'no_taker' }, 'no such row');
        let restored = 0;
        hold([crewed(), plain], party, 'owner');
        const out = await move.toLocker(store.campaign.records[rid(1)], kit, 'referee', () => false, () => { restored += 1; });
        assert.deepEqual(out, { ok: false, why: 'not_moved' }, 'the boxes could not be cleared: nothing added');
        assert.equal(restored, 0, 'nothing to put back when the first write never happened');
    });
});
