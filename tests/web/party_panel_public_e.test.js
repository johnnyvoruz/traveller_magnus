/**
 * The party panel for several ships, Public on a journal entry, and the name switch
 * (prompts/e_party_panel_public_journal.md).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { rowFace } from '../../apps/web/src/workspace/journal/list.ts';
import { _forgetPublicGames, publicGamesOf, setPublicGames, setShowReferee, showRefereeOf } from '../../apps/web/src/workspace/public_games.ts';

const read = (file) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const answer = (status, body, calls = []) => async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};

const ID = 'cj_11111111-1111-4111-8111-111111111111';

function entry(patch) {
    return {
        id: ID,
        kind: 'note',
        title: 'At Regina',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 0,
        createdAt: '2026-10-14T00:00:00.000Z',
        updatedAt: '2026-10-14T00:00:00.000Z',
        deleted: false,
        ...patch,
    };
}

test('the party panel lists ships, keeps the lead separate, and says who a removal leaves ashore', () => {
    const panel = read('apps/web/src/workspace/PartyPanel.vue');
    const picked = panel.slice(panel.indexOf('function picked'), panel.indexOf('function addShip'));
    assert.match(picked, /withVesselAdded\(party\.value, record\.id\)/);
    assert.equal(picked.includes('withLeadVessel'), false);
    assert.match(panel, /saveParty\(withLeadVessel\(party\.value, id\)\)/);
    assert.match(panel, /withVesselAdded\(party\.value, 'cr_00000000-0000-4000-8000-000000000099'\)/);
    assert.match(panel, /shipNote\.value = refused\.ok \? '' : refused\.message/);
    assert.match(panel, /saveParty\(withVesselRemoved\(party\.value, id\)\)/);
    assert.match(panel, /saveParty\(withAboard\(party\.value, record\.id, value \? value : null\)\)/);
    assert.ok(panel.includes('will be left aboard no ship.'));
    assert.ok(panel.includes('>Lead</span>'));
    assert.ok(panel.includes('Make lead'));
    assert.ok(panel.includes('>No ship</option>'));
    assert.ok(panel.includes('{{ standing }}'));
    assert.match(panel, /@media \(max-width: 599px\)/);
    assert.equal(panel.includes('window.confirm'), false);
    assert.equal(panel.includes('window.alert'), false);
});

test('a public journal entry is a third choice and a mark on the list', () => {
    const page = read('apps/web/src/workspace/journal/EntryPage.vue');
    assert.ok(page.includes("setVisibility('public')\">Public</button>"));
    assert.ok(page.includes("Shown on your ships' public cards when this game is public."));
    const list = read('apps/web/src/workspace/journal/JournalList.vue');
    assert.match(list, /v-if="face\.public" class="ui-chip jn-public">Public<\/span>/);
    assert.equal(rowFace(entry({ visibility: 'public' }), {}).public, true);
    assert.equal(rowFace(entry({ visibility: 'players' }), {}).public, false);
    assert.equal(rowFace(entry({ visibility: 'referee' }), {}).public, false);
});

beforeEach(() => { _forgetPublicGames(); });

test('the name switch sends showReferee and leaves { public } alone', async () => {
    const calls = [];
    assert.equal(showRefereeOf({ id: 'uni_a', publicGames: true }), null);
    assert.equal(showRefereeOf({ id: 'uni_a', publicGames: false, showReferee: true }), null);
    assert.equal(showRefereeOf({ id: 'uni_a', publicGames: true, showReferee: false }), false);
    assert.deepEqual(
        await setShowReferee('uni_a', true, answer(200, { public: true, showReferee: true }, calls)),
        { ok: true, showReferee: true },
    );
    assert.deepEqual(calls, [{ url: '/api/universes/uni_a/public-games', method: 'PATCH', body: { public: true, showReferee: true } }]);
    assert.equal(showRefereeOf({ id: 'uni_a', publicGames: false, showReferee: false }), true);
    const again = [];
    assert.deepEqual(await setPublicGames('uni_a', true, answer(200, { public: true }, again)), { ok: true, public: true });
    assert.deepEqual(again, [{ url: '/api/universes/uni_a/public-games', method: 'PATCH', body: { public: true } }]);
    assert.equal(publicGamesOf({ id: 'uni_a', publicGames: false }), true);
    assert.equal(showRefereeOf({ id: 'uni_a', publicGames: false, showReferee: false }), true);
    assert.deepEqual(await setPublicGames('uni_a', false, answer(200, { public: false })), { ok: true, public: false });
    assert.equal(showRefereeOf({ id: 'uni_a', publicGames: true, showReferee: true }), null);
    const menu = read('apps/web/src/workspace/AccountMenu.vue');
    assert.match(menu, /v-if="openOne && showName !== null"/);
    assert.ok(menu.includes('Show my name on public cards'));
    assert.ok(menu.includes('data-command="show-referee"'));
});
