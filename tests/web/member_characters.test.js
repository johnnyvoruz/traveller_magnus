/**
 * BM2c (findings/member_characters_plan.md §3; Johnny 141): a member's characters on the screens. The list
 * helpers, the moved sentence, the board with several, one, none and a gone character, the player's page
 * with none, the join page with several, and the calls sending the whole list.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { movedSentence, NO_CHARACTER, PLAYER_NO_CHARACTER, tiedIds, toggledIds } from '../../apps/web/src/workspace/players/players_words.ts';
import { me, playsNone } from '../../apps/web/src/workspace/players/me.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

test('the list: personIds first, else the one id, else none', () => {
    assert.deepEqual(tiedIds({ personId: 'a', personIds: ['a', 'b'] }), ['a', 'b']);
    assert.deepEqual(tiedIds({ personId: 'a' }), ['a'], 'an older answer without the list');
    assert.deepEqual(tiedIds({ personId: 'a', personIds: [] }), ['a']);
    assert.deepEqual(tiedIds({ personId: null, personIds: [] }), []);
});

test('a tick adds last and keeps the order; a clear takes one out', () => {
    assert.deepEqual(toggledIds(['b', 'a'], 'c', true), ['b', 'a', 'c']);
    assert.deepEqual(toggledIds(['b', 'a'], 'a', true), ['b', 'a'], 'ticking one already there changes nothing');
    assert.deepEqual(toggledIds(['b', 'a', 'c'], 'a', false), ['b', 'c']);
    assert.deepEqual(toggledIds(['a'], 'a', false), [], 'the last one cleared is none');
});

test('the moved sentence: one, several from one player, from several players, none', () => {
    const names = { p1: 'Ara Silt', p2: 'Ysa Quen', p3: 'Tam Oduya' };
    const handles = { u2: 'ivo', u3: 'sel' };
    const nameOf = (id) => names[id] ?? '';
    const handleOf = (id) => handles[id] ?? '';
    assert.equal(movedSentence([], nameOf, handleOf), '');
    assert.equal(movedSentence([{ personId: 'p1', fromUserId: 'u2' }], nameOf, handleOf), 'Ara Silt moved from ivo.');
    assert.equal(movedSentence([{ personId: 'p1', fromUserId: 'u2' }, { personId: 'p2', fromUserId: 'u2' }], nameOf, handleOf), 'Ara Silt and Ysa Quen moved from ivo.');
    assert.equal(
        movedSentence([{ personId: 'p1', fromUserId: 'u2' }, { personId: 'p2', fromUserId: 'u3' }], nameOf, handleOf),
        'Ara Silt moved from ivo, and Ysa Quen from sel.',
    );
    assert.equal(
        movedSentence([{ personId: 'p1', fromUserId: 'u2' }, { personId: 'p2', fromUserId: 'u2' }, { personId: 'p3', fromUserId: 'u2' }], nameOf, handleOf),
        'Ara Silt, Ysa Quen, and Tam Oduya moved from ivo.',
    );
    assert.equal(movedSentence([{ personId: 'zz', fromUserId: 'u9' }], nameOf, handleOf), 'A character moved from another player.', 'unknown names still read');
});

test('none, as the server said: only once the list was read for this campaign', () => {
    me.universeId = 'uni_1';
    me.readFor = '';
    me.personIds = [];
    assert.equal(playsNone('uni_1'), false, 'not read yet is not none');
    me.readFor = 'uni_1';
    assert.equal(playsNone('uni_1'), true);
    assert.equal(playsNone('uni_2'), false, 'another campaign');
    assert.equal(playsNone(null), false);
    me.personIds = ['cr_1'];
    assert.equal(playsNone('uni_1'), false);
    me.personIds = [];
    me.readFor = '';
    me.universeId = '';
    assert.match(PLAYER_NO_CHARACTER, /^You do not play a character in this campaign yet, so you cannot trade on this ship\. Ask the referee to choose yours\.$/);
});

test('the calls send the whole list; the answer carries the moves', () => {
    const calls = read('workspace/players/referee_calls.ts');
    assert.match(calls, /export function setMemberPeople\(userId: string, personIds: readonly string\[\]\): Promise<CallResult<PlayerPeople \| null>>/);
    assert.doesNotMatch(calls, /JSON\.stringify\(\{ personId \}\)/, 'no single-id write left');
    const membership = read('campaign/membership.ts');
    assert.match(membership, /export async function setPeople\(personIds: readonly string\[\]\): Promise<PlayerPeople \| null>/);
    assert.match(membership, /body: JSON\.stringify\(\{ personIds \}\)/);
    assert.match(membership, /return parseRead\(PlayerPeople, data\);/);
    const section = read('workspace/players/PlayersSection.vue');
    assert.match(section, /return \{ ok: true, said: result\.data \? movedSentence\(result\.data\.moved, nameOf, handleOf\) : '' \};/);
    assert.match(section, /else if \(result\.said\) rowWords\.value = \{ userId, text: result\.said, said: true \};/);
    assert.match(section, /@people="choosePeople"/);
    const join = read('characters/screens/JoinPage.vue');
    assert.match(join, /const saved = await setPeople\(personIds\);/);
    assert.match(join, /@click="pick\(ticked\)"/);
    assert.match(join, /@click="pick\(\[\]\)"\s*>Not yet</, 'Not yet is still none');
    const ship = read('workspace/players/PlayerShip.vue');
    assert.match(ship, /<p v-if="none" class="pship-rule" role="note" data-player-none>\{\{ PLAYER_NO_CHARACTER \}\}<\/p>/);
    assert.match(ship, /@media \(max-width: 599px\) \{\s+\.pship-who-box \{\s+height: 44px;/, 'DF41: Acting as is 44 tall below 600 px');
    assert.match(ship, /const none = computed\(\(\) => playsNone\(campaign\.universeId\)\);/);
});

const id = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const member = (n, handle, over = {}) => ({ userId: 'u' + n, handle, personId: null, personIds: [], joined: '2026-10-17T10:00:00.000Z', status: 'active', archivedAt: null, archivedBy: null, ...over });

describe('the screens render', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-member-chars-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    async function board(over) {
        const view = (await server.ssrLoadModule('/src/workspace/players/PlayersBoard.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const props = { readOnly: false, invite: null, inviteBusy: false, list: null, listState: 'ready', listWords: '', busyUser: null, rowWords: null, people: [], ...over };
        return (await renderToString(createSSRApp(view, props))).replace(/<!--[\s\S]*?-->/g, '');
    }

    const people = [{ id: id(1), name: 'Ara Silt' }, { id: id(2), name: 'Ysa Quen' }, { id: id(3), name: 'Tam Oduya' }];

    test('several: each ticked, each a line with its crew line; one without a crew line is the name', async () => {
        const html = await board({
            people,
            roles: { [id(1)]: 'Captain of Kestrel Dawn' },
            list: { playing: [member(1, 'mara', { personId: id(1), personIds: [id(1), id(2)] })], archived: [] },
        });
        assert.match(html, /<small class="players-role" data-players-role="u1">Ara Silt · Captain of Kestrel Dawn<\/small><small class="players-role" data-players-role="u1">Ysa Quen<\/small>/);
        assert.match(html, /<input type="checkbox" checked aria-label="Ara Silt, played by mara">/);
        assert.match(html, /<input type="checkbox" checked aria-label="Ysa Quen, played by mara">/);
        assert.match(html, /<input type="checkbox" aria-label="Tam Oduya, played by mara">/);
        assert.doesNotMatch(html, /data-players-none/);
    });

    test('none: "No character yet" and nothing ticked; a gone character stays listed to clear', async () => {
        const html = await board({ people, list: { playing: [member(1, 'mara'), member(2, 'ivo', { personId: id(9), personIds: [id(9)] })], archived: [] } });
        assert.match(html, /<small class="players-role" data-players-none="u1">No character yet<\/small>/);
        assert.equal(NO_CHARACTER, 'No character yet');
        assert.doesNotMatch(html, /checked aria-label="[^"]*, played by mara"/);
        assert.match(html, /data-players-role="u2">Someone no longer in the party<\/small>/);
        assert.match(html, /<input type="checkbox" checked aria-label="Someone no longer in the party, played by ivo">/);
    });

    test('the moved sentence beside the row reads as news, a refusal as before; busy turns the boxes off', async () => {
        const said = await board({ people, list: { playing: [member(1, 'mara', { personIds: [id(1)] })], archived: [] }, rowWords: { userId: 'u1', text: 'Ara Silt moved from ivo.', said: true } });
        assert.match(said, /class="is-said players-row-words" role="status" data-players-said="u1">Ara Silt moved from ivo\.<\/p>/);
        const refused = await board({ people, list: { playing: [member(1, 'mara')], archived: [] }, rowWords: { userId: 'u1', text: 'Invalid request.' } });
        assert.match(refused, /class="players-row-words" role="status">Invalid request\.<\/p>/);
        const busy = await board({ people, list: { playing: [member(1, 'mara')], archived: [] }, busyUser: 'u1' });
        assert.match(busy, /<fieldset class="players-which" data-players-which="u1" disabled>/);
    });

    test('nobody in the party: Which one says so', async () => {
        const html = await board({ people: [], list: { playing: [member(1, 'mara')], archived: [] } });
        assert.match(html, /<legend>Which one<\/legend><span class="players-fine">Nobody in the party yet\.<\/span>/);
    });
});
