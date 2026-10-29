/**
 * P5 (players_build_plan.md; contracts/b_players.md): the referee's players screens. The words and
 * small rules; the board rendered with and without a link, with both groups, and full; the calls'
 * paths; where the section and "Playing in" sit.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inviteLine, isFull, memberLine, partyPeople, PLAYERS_FULL, realDate, usesWords } from '../../apps/web/src/workspace/players/players_words.ts';

test('the words: a real date, uses, the link line, a member line by status', () => {
    assert.equal(realDate('2026-11-16T09:30:00.000Z'), 'November 16, 2026');
    assert.equal(realDate('not a date'), '');
    assert.deepEqual([0, 1, 4].map(usesWords), ['Not used yet', 'Used once', 'Used 4 times']);
    assert.equal(inviteLine({ expiresAt: '2026-11-16T00:00:00.000Z', uses: 2 }), 'Works until November 16, 2026 · Used 2 times');
    // DU33: the link read back after a reload carries no uses count, so the line stops at the date.
    assert.equal(inviteLine({ expiresAt: '2026-11-16T00:00:00.000Z' }), 'Works until November 16, 2026');
    assert.equal(inviteLine({ expiresAt: 'nonsense' }), 'Works for 30 days');
    const base = { userId: 'u1', handle: 'mara', personId: null, joined: '2026-10-17T10:00:00.000Z', status: 'active', archivedAt: null, archivedBy: null };
    assert.equal(memberLine(base), 'Joined October 17, 2026');
    assert.equal(memberLine({ ...base, status: 'archived', archivedAt: '2026-10-18T00:00:00.000Z', archivedBy: 'owner' }), 'Archived on October 18, 2026');
    assert.equal(memberLine({ ...base, status: 'archived', archivedAt: '2026-10-18T00:00:00.000Z', archivedBy: 'self' }), 'Left on October 18, 2026');
});

test('full at 255 playing, and the sentence is the contract\'s', () => {
    assert.equal(isFull(254), false);
    assert.equal(isFull(255), true);
    assert.equal(PLAYERS_FULL, 'This campaign has 255 players, the most it can have.');
});

const id = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const person = (n, name, visibility = 'players') => ({
    id: id(n), type: 'person', kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility,
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 1, createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z', deleted: false,
});
const settingsWith = (memberIds) => ({ party: { vesselIds: [], aboard: {}, memberIds, anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 1 });

test('Which one: the party\'s people as players see them; a referee-only person is not offered', () => {
    const records = [person(1, 'Ysa Quen'), person(2, 'Ara Silt'), person(3, 'Hidden Hand', 'referee'), person(4, 'Not in the party')];
    const people = partyPeople({ records, links: [], journal: [], settings: settingsWith([id(1), id(2), id(3)]), clock: null });
    assert.deepEqual(people.map((item) => item.name), ['Ara Silt', 'Ysa Quen']);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const member = (n, handle, over = {}) => ({ userId: 'u' + n, handle, personId: null, joined: '2026-10-17T10:00:00.000Z', status: 'active', archivedAt: null, archivedBy: null, ...over });

describe('the board renders', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-players-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    async function render(over) {
        const view = (await server.ssrLoadModule('/src/workspace/players/PlayersBoard.vue')).default;
        const { createSSRApp } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const props = { readOnly: false, invite: null, inviteBusy: false, list: null, listState: 'ready', listWords: '', busyUser: null, rowWords: null, people: [], ...over };
        return (await renderToString(createSSRApp(view, props))).replace(/<!--[\s\S]*?-->/g, '');
    }

    test('DU33: a link read back after a reload shows as one just made, without the uses words', async () => {
        const html = await render({ invite: { url: 'https://traveller.voyage/join/kept', expiresAt: '2026-11-16T00:00:00.000Z' }, list: { playing: [], archived: [] } });
        assert.match(html, /value="https:\/\/traveller\.voyage\/join\/kept" data-players-url/);
        assert.match(html, /data-players-revoke[^>]*>Revoke/);
        assert.match(html, /Works until November 16, 2026\. Anyone with the link can join as a player\./);
        assert.doesNotMatch(html, /Not used yet|Used /);
        const section = fs.readFileSync(path.join(webRoot, 'src/workspace/players/PlayersSection.vue'), 'utf8');
        assert.match(section, /async function loadInvite\(\): Promise<void> \{\s+const id = campaign\.universeId;\s+if \(!id\) return;\s+const found = await readInvite\(\);\s+if \(!found \|\| id !== campaign\.universeId \|\| invite\.value\) return;\s+invite\.value = found;\s+noteSeen\(\);/, 'read once; a link made meanwhile wins');
        assert.match(section, /onMounted\(\(\) => \{\s+void loadList\(\);\s+void loadInvite\(\);\s+\}\);/);
    });

    test('no link yet, nobody playing', async () => {
        const html = await render({ list: { playing: [], archived: [] } });
        assert.match(html, /data-players-link[^>]*>[\s\S]*?Get the invite link/);
        assert.doesNotMatch(html, /data-players-url/);
        assert.match(html, /Nobody yet\. Send the invite link to your players\./);
        assert.doesNotMatch(html, /Archived/, 'no Archived group with nobody in it');
        assert.doesNotMatch(html, /255 players/);
    });

    test('a link and both groups: Copy, Revoke, the line; Which one, Archive; Bring back', async () => {
        const html = await render({
            invite: { url: 'https://traveller.voyage/join/abc', expiresAt: '2026-11-16T00:00:00.000Z', role: 'player', uses: 1 },
            list: { playing: [member(1, 'mara', { personId: id(2) }), member(2, 'ivo')], archived: [member(3, 'sel', { status: 'archived', archivedAt: '2026-10-18T00:00:00.000Z', archivedBy: 'self' })] },
            people: [{ id: id(2), name: 'Ara Silt' }, { id: id(1), name: 'Ysa Quen' }],
        });
        assert.match(html, /value="https:\/\/traveller\.voyage\/join\/abc" data-players-url/);
        assert.match(html, /Copy<\/button>/);
        assert.match(html, /data-players-revoke[^>]*>Revoke/);
        assert.match(html, /Works until November 16, 2026 · Used once\. Anyone with the link can join as a player\./);
        assert.match(html, /Playing <span class="ui-count">2<\/span>/);
        assert.match(html, /<b>mara<\/b><small>Joined October 17, 2026<\/small>/);
        assert.match(html, /<select value="cr_00000000-0000-4000-8000-000000000002" aria-label="Which person mara plays">/);
        assert.match(html, /data-players-archive="u1"[^>]*>Archive/);
        assert.match(html, /Archived <span class="ui-count">1<\/span>/);
        assert.match(html, /<b>sel<\/b><small>Left on October 18, 2026<\/small>/);
        assert.match(html, /data-players-back="u3"[^>]*>Bring back/);
    });

    test('full: the sentence; a refusal beside its player; the list\'s own failure', async () => {
        const playing = Array.from({ length: 255 }, (_, n) => member(n + 10, 'p' + n));
        const full = await render({ list: { playing, archived: [] }, rowWords: { userId: 'u10', text: 'You cannot change that.' } });
        assert.match(full, /This campaign has 255 players, the most it can have\./);
        assert.match(full, /class="players-row-words" role="status">You cannot change that\./);
        const down = await render({ listState: 'failed', listWords: 'Players are not available yet.' });
        assert.match(down, /role="status">Players are not available yet\./);
    });
});

const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

test('the calls: Archive, Bring back and Which one on the contract\'s paths', () => {
    const calls = read('workspace/players/referee_calls.ts');
    assert.match(calls, /return call\(member\(userId\), \{ method: 'DELETE' \}, null\)/);
    assert.match(calls, /method: 'PATCH', body: JSON\.stringify\(\{ status: 'active' \}\) \}, PlayerStatus\)/);
    assert.match(calls, /method: 'PATCH', body: JSON\.stringify\(\{ personId \}\) \}, PlayerPerson\)/);
});

test('where: Players on the Party tab for the referee only; Playing in on the Campaigns panel', () => {
    assert.match(read('workspace/PartyPanel.vue'), /<PlayersSection v-if="campaign\.role === 'owner'" :read-only="readOnly" \/>/);
    assert.match(read('workspace/CampaignsPanel.vue'), /<PlayingIn \/>/);
    const playing = read('workspace/players/PlayingIn.vue');
    assert.match(playing, /<section v-if="campaign\.playing\.length"/);
    assert.match(playing, /Run by \{\{ item\.ownerHandle \}\}/);
});
