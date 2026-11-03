/**
 * DS2: the Crew list. `status.crew` rows (a party character and a role each), Captain preset, the one-ship
 * rule, the role line for the Players list, the suggestions; the schema takes the rows; the projection keeps
 * a row whose person the players can see and drops the rest; the mounts are pinned; the player's page renders
 * the Crew section read-only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CampaignRecord, CrewRole, CrewRow, playersView } from '@voyage/shared';
import {
    ALL_ON, CAPTAIN, NO_CREW, ONE_SHIP, REFEREE_ALONE, SWITCHES, crewLine, crewOf, crewWith, crewWithout, may, movedWords, partyPersons, partyShips, presetRole, roleName, roleOf,
    roleSuggestions, roleSwitches, rolesInUse, rolesOf, shipHolding, withSwitch,
} from '../../apps/web/src/workspace/crew.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const stamp = '2026-11-02T00:00:00.000Z';
const record = (n, type, name, visibility, over = {}) => ({
    id: rid(n), type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility,
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 3, createdAt: stamp, updatedAt: stamp, deleted: false, ...over,
});
const byId = (list) => Object.fromEntries(list.map((row) => [row.id, row]));
const tam = () => record(2, 'person', 'Tam Oduya', 'players');
const ree = () => record(3, 'person', 'Ree Chandra', 'players');
const mara = () => record(4, 'person', 'Mara Vell', 'referee');
const ship = (crew) => record(1, 'vessel', 'Kestrel Dawn', 'players', { status: { crew } });
const tender = (crew) => record(5, 'vessel', 'Tender', 'players', { status: { crew } });
const party = { vesselIds: [rid(1), rid(5)], memberIds: [rid(2), rid(3), rid(4)] };

test('the rows as stored, the role of one person, the preset', () => {
    assert.deepEqual(crewOf(ship([{ personId: rid(2), role: 'Captain' }])), [{ personId: rid(2), role: 'Captain' }]);
    assert.deepEqual(crewOf(ship(undefined)), []);
    assert.deepEqual(crewOf(record(1, 'vessel', 'Bare', 'players')), []);
    assert.deepEqual(crewOf(ship([{ personId: rid(2) }, 'x', null])), [], 'a row without a role is not a row');
    assert.equal(roleOf(ship([{ personId: rid(2), role: 'Captain' }]), rid(2)), 'Captain');
    assert.equal(roleOf(ship([{ personId: rid(2), role: 'Captain' }]), rid(3)), null);
    assert.equal(roleOf(null, rid(2)), null);
    assert.equal(presetRole([]), CAPTAIN, 'the first row is the captain (Johnny 134)');
    assert.equal(presetRole([{ personId: rid(2), role: 'Captain' }]), '');
});

test('adding, changing and removing a row; the role is trimmed', () => {
    const one = crewWith([], rid(2), ' Captain ');
    assert.deepEqual(one, [{ personId: rid(2), role: 'Captain' }]);
    const two = crewWith(one, rid(3), 'Pilot');
    assert.deepEqual(two, [{ personId: rid(2), role: 'Captain' }, { personId: rid(3), role: 'Pilot' }]);
    assert.deepEqual(crewWith(two, rid(3), 'Engineer'), [{ personId: rid(2), role: 'Captain' }, { personId: rid(3), role: 'Engineer' }], 'in place');
    assert.deepEqual(crewWithout(two, rid(2)), [{ personId: rid(3), role: 'Pilot' }]);
    assert.deepEqual(crewWithout(two, rid(9)), two);
});

test('the party\'s ships and characters: live party records only, the characters by name', () => {
    const records = byId([ship([]), tender([]), tam(), ree(), mara(), { ...record(6, 'person', 'Gone', 'players'), deleted: true }, record(7, 'vessel', 'Not ours', 'players')]);
    assert.deepEqual(partyShips(records, party).map((row) => row.name), ['Kestrel Dawn', 'Tender']);
    assert.deepEqual(partyShips(records, null), []);
    assert.deepEqual(partyPersons(records, { ...party, memberIds: [rid(3), rid(2), rid(4), rid(6), rid(1)] }).map((row) => row.name), ['Mara Vell', 'Ree Chandra', 'Tam Oduya'], 'a referee-only person is offered: the referee picks');
    assert.deepEqual(partyPersons(records, null), []);
});

test('the one-ship rule: the other party ship a character crews, and the words of the move', () => {
    const ships = [ship([{ personId: rid(2), role: 'Captain' }]), tender([{ personId: rid(3), role: 'Pilot' }])];
    assert.equal(shipHolding(ships, rid(3), rid(1))?.name, 'Tender', 'adding Ree to Kestrel Dawn moves her off the Tender');
    assert.equal(shipHolding(ships, rid(2), rid(1)), null, 'already here');
    assert.equal(shipHolding(ships, rid(4), rid(1)), null);
    assert.equal(movedWords('Ree Chandra', 'Tender'), 'Moved Ree Chandra from Tender. ' + ONE_SHIP);
    assert.equal(ONE_SHIP, 'A character crews one ship at a time.');
    assert.equal(NO_CREW, 'No crew yet. Add a party character and say what they do aboard.');
});

test('the role line for the Players list, and the suggestions from the roles typed on the party\'s ships', () => {
    const ships = [ship([{ personId: rid(2), role: 'Captain' }, { personId: rid(3), role: '' }]), tender([{ personId: rid(4), role: 'Engineer' }])];
    assert.equal(crewLine(ships, rid(2)), 'Captain of Kestrel Dawn');
    assert.equal(crewLine(ships, rid(3)), 'Crew of Kestrel Dawn', 'a row with no role typed');
    assert.equal(crewLine(ships, rid(4)), 'Engineer of Tender');
    assert.equal(crewLine(ships, rid(9)), '');
    assert.deepEqual(roleSuggestions(ships), ['Captain', 'Engineer'], 'Captain first, each role once, the empty role not offered');
    assert.deepEqual(roleSuggestions([]), ['Captain']);
});

test('the schema takes the rows beside the passengers; the projection keeps a row whose person the players see', () => {
    assert.equal(CrewRow.safeParse({ personId: rid(2), role: 'Captain' }).success, true);
    assert.equal(CrewRow.safeParse({ personId: 'nope', role: 'Captain' }).success, false);
    assert.equal(CrewRow.safeParse({ personId: rid(2) }).success, false);
    const parsed = CampaignRecord.safeParse(ship([{ personId: rid(2), role: 'Captain' }]));
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    const view = playersView({
        records: [ship([{ personId: rid(2), role: 'Captain' }, { personId: rid(4), role: 'Gunner' }]), tam(), mara()],
        links: [], journal: [], settings: null, clock: null,
    });
    const seen = view.records.find((row) => row.id === rid(1));
    assert.deepEqual(seen.status.crew, [{ personId: rid(2), role: 'Captain' }], 'the referee-only person\'s row is dropped');
});

test('pins: the list under Passengers on the vessel page, the role on the Players list, the Crew section on the player\'s page', () => {
    const trade = read('workspace/VesselTrade.vue');
    assert.match(trade, /<\/section>\s+<CrewList :id="id" :read-only="readOnly" \/>\s+<section class="vt-sec ui-frame" data-vessel-owners/, 'under Passengers, before Owners');
    const list = read('workspace/CrewList.vue');
    assert.match(list, /data-vessel-crew/);
    assert.match(list, /if \(other\) records\.push\(withCrew\(other, crewWithout\(crewOf\(other\), personId\)\)\);/, 'the move is one commit');
    assert.match(list, /if \(other\) showToast\(movedWords\(nameOf\(personId\), other\.name\)\);/);
    assert.match(list, /add\.role = presetRole\(next\);/, 'Captain for the first row, empty after');
    assert.doesNotMatch(list, /#[0-9a-f]{3,6}\b/i, 'tokens only');
    assert.doesNotMatch(list, /\bwindow\.|\bdocument\./);
    const board = read('workspace/players/PlayersBoard.vue');
    assert.match(board, /<small v-if="member\.personId && \(roles \?\? \{\}\)\[member\.personId\]" class="players-role" :data-players-role="member\.userId">/);
    const section = read('workspace/players/PlayersSection.vue');
    assert.match(section, /crewLine\(ships, person\.id\)/);
    assert.match(section, /:roles="roles"/);
    const player = read('workspace/players/PlayerShip.vue');
    assert.match(player, /<section v-if="crew\.length" class="pship-sec ui-frame" data-player-crew/);
    assert.doesNotMatch(player, /writeTrade|saveRecord|commit\(/, 'read-only');
    const trade2 = read('workspace/vessel_trade.ts');
    assert.match(trade2, /crew\?: CrewRow\[\]/);
    const projection = fs.readFileSync(path.join(root, 'packages/shared/src/players_view.ts'), 'utf8');
    assert.match(projection, /if \(key === 'crew' && Array\.isArray\(value\)\) \{/);
});

test('DS3: the switches are all on by default, a flipped switch is read, a person off the crew has none, the schema takes the rows', () => {
    assert.deepEqual(SWITCHES, ['ledger', 'trade', 'locker']);
    assert.deepEqual(roleSwitches([], 'Captain'), { name: 'Captain', ledger: true, trade: true, locker: true }, 'a role with no row is all on (131)');
    const roles = withSwitch([], 'Pilot', 'ledger', false);
    assert.deepEqual(roles, [{ name: 'Pilot', ledger: false, trade: true, locker: true }], 'the row is made all on, then flipped');
    assert.deepEqual(withSwitch(roles, 'Pilot', 'trade', false), [{ name: 'Pilot', ledger: false, trade: false, locker: true }], 'in place');
    assert.deepEqual(withSwitch(roles, 'Pilot', 'ledger', true), [{ name: 'Pilot', ledger: true, trade: true, locker: true }]);
    const crew = [{ personId: rid(2), role: 'Captain' }, { personId: rid(3), role: 'Pilot' }, { personId: rid(4), role: '' }];
    assert.equal(roleName(crew[2]), 'Crew');
    assert.deepEqual(rolesInUse(crew, roles).map((row) => row.name + ':' + row.ledger), ['Captain:true', 'Pilot:false', 'Crew:true'], 'one row per role in use, in the crew\'s order');
    const vessel = record(1, 'vessel', 'Kestrel Dawn', 'players', { status: { crew, roles } });
    assert.equal(may(vessel, rid(2), 'ledger'), true);
    assert.equal(may(vessel, rid(3), 'ledger'), false, 'the flipped switch');
    assert.equal(may(vessel, rid(3), 'trade'), true);
    assert.equal(may(vessel, rid(4), 'locker'), true, 'a row with no role typed is the all-on "Crew"');
    assert.equal(may(vessel, rid(9), 'trade'), false, 'not on the crew');
    assert.equal(may(null, rid(2), 'trade'), false);
    assert.deepEqual(rolesOf(record(1, 'vessel', 'Bare', 'players')), []);
    assert.deepEqual(rolesOf(record(1, 'vessel', 'Bare', 'players', { status: { roles: [{ name: 'X', ledger: true }] } })), [], 'a row short of a switch is not a row');
    assert.equal(CrewRole.safeParse({ name: 'Pilot', ledger: false, trade: true, locker: true }).success, true);
    assert.equal(CrewRole.safeParse({ name: 'Pilot', ledger: 'no', trade: true, locker: true }).success, false);
    assert.equal(CampaignRecord.safeParse(vessel).success, true);
    const view = playersView({ records: [vessel, tam(), ree(), mara()], links: [], journal: [], settings: null, clock: null });
    const seen = view.records.find((row) => row.id === rid(1));
    assert.equal('roles' in seen.status, false, 'players never see the switches');
    assert.equal(REFEREE_ALONE, 'The referee alone: the sheet, Set up the ship, the owners and the payment, Players, the course and the clock.');
    assert.equal(ALL_ON, 'Every role may do everything until a switch is turned off.');
    const list = read('workspace/CrewList.vue');
    assert.match(list, /<div v-if="rows\.length" class="crew-switches" data-crew-switches>/, 'the fold under the list');
    assert.match(list, /:data-crew-switch="role\.name \+ ':' \+ key"/);
    assert.match(list, /withSwitch\(roles\.value, role\.name, key, box\.checked\)/);
    assert.match(list, /data-crew-referee-alone>\{\{ REFEREE_ALONE \}\}/);
    assert.match(read('workspace/vessel_trade.ts'), /roles\?: CrewRole\[\]/);
});

describe('the player\'s page renders the Crew section', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-crew-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        store = await server.ssrLoadModule('/src/campaign/store.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    function hold(records, partySettings) {
        const { campaign } = store;
        for (const key of Object.keys(campaign.records)) delete campaign.records[key];
        for (const row of records) campaign.records[row.id] = row;
        for (const key of Object.keys(campaign.links)) delete campaign.links[key];
        campaign.settings = { party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null, ...partySettings }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 2 };
        campaign.clock = { days: 1105 * 365 + 13, rev: 1 };
        campaign.status = 'ready';
        campaign.role = 'player';
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

    test('names and roles, the person a link, nothing to change; no section without a crew', async () => {
        hold([ship([{ personId: rid(2), role: 'Captain' }, { personId: rid(3), role: '' }]), tam(), ree()], { vesselIds: [rid(1)], memberIds: [rid(2), rid(3)] });
        const html = await render('/src/workspace/players/PlayerShip.vue', { id: rid(1) });
        const crew = html.slice(html.indexOf('data-player-crew'), html.indexOf('data-player-fuel'));
        assert.match(crew, /Crew <span class="ui-frame-count">2<\/span>/);
        assert.match(crew, /<button type="button" class="pship-link">Tam Oduya<\/button>/);
        assert.match(crew, /<span class="pship-class">Captain<\/span>/);
        assert.match(crew, /<button type="button" class="pship-link">Ree Chandra<\/button>/);
        assert.match(crew, /<span class="pship-class">Crew<\/span>/, 'a row with no role typed');
        assert.doesNotMatch(crew, /<input|<select|<form|Remove|Add to the crew/);
        assert.equal(html.indexOf('data-player-crew') > html.indexOf('data-player-passengers'), true, 'under Passengers');
        hold([ship([]), tam()], { vesselIds: [rid(1)], memberIds: [rid(2)] });
        assert.doesNotMatch(await render('/src/workspace/players/PlayerShip.vue', { id: rid(1) }), /data-player-crew/);
    });
});
