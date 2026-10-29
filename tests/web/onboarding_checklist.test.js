/**
 * DU9 (U9): the onboarding checklist in the account pop-up. Seven lines from what the app holds:
 * world found, ship added, date set, first record, first entry, players invited, package browsed.
 * The count, the next line, the list gone at 7 of 7, the Players section's memory; on screen in
 * the pop-up for the referee of an open campaign, each line a button, done lines marked.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { newRecord } from '../../apps/web/src/workspace/records.ts';
import { systemAnchor } from '../../apps/web/src/workspace/places.ts';
import {
    ONBOARDING_LABELS, ONBOARDING_ORDER, ensureInvitedKnown, firstEntryWritten, firstRecordMade, invitedIn, noteInvited, onboardingCount, onboardingLines, onboardingNext, onboardingShows, resetOnboarding, vesselAdded,
} from '../../apps/web/src/workspace/onboarding.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const STAMP = '2026-10-27T12:00:00.000Z';
const REGINA = 'Spinward_Marches/1910';
const id = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const byId = (list) => Object.fromEntries(list.map((record) => [record.id, record]));
const loose = newRecord('vessel', id(1), STAMP, null);
const placed = newRecord('vessel', id(2), STAMP, systemAnchor(REGINA, 'Regina', null));
const person = newRecord('person', id(3), STAMP, null);
const gone = { ...person, id: id(4), deleted: true };
const none = { worldOpen: false, records: {}, clock: null, journal: {}, invited: false, storeSeen: false, packagesKept: 0 };

describe('the states', () => {
    test('a ship is any live vessel; a first record is a live record that is not one; an entry is a journal row not deleted', () => {
        assert.equal(vesselAdded({}), false);
        assert.equal(vesselAdded(byId([person])), false);
        assert.equal(vesselAdded(byId([loose])), true);
        assert.equal(firstRecordMade(byId([loose, placed])), false);
        assert.equal(firstRecordMade(byId([gone])), false);
        assert.equal(firstRecordMade(byId([loose, person])), true);
        assert.equal(firstEntryWritten({}), false);
        assert.equal(firstEntryWritten({ a: { deleted: true } }), false);
        assert.equal(firstEntryWritten({ a: { deleted: true }, b: { deleted: false } }), true);
    });

    test('seven lines in order, none done on a new campaign; the count and the next line', () => {
        const lines = onboardingLines(none);
        assert.deepEqual(lines.map((l) => l.id), [...ONBOARDING_ORDER]);
        assert.deepEqual(lines.map((l) => l.label), ONBOARDING_ORDER.map((key) => ONBOARDING_LABELS[key]));
        assert.equal(lines.every((l) => !l.done), true);
        assert.deepEqual(onboardingCount(lines), { done: 0, total: 7 });
        assert.equal(onboardingNext(lines), 'world');
        assert.equal(onboardingShows(lines), true);
    });

    test('a world is found when its dossier is open, or when the ship has a place; the store seen or a page kept is a package browsed', () => {
        const open = onboardingLines({ ...none, worldOpen: true });
        assert.equal(open[0].done, true);
        assert.equal(onboardingNext(open), 'ship');
        const shipPlaced = onboardingLines({ ...none, records: byId([placed]) });
        assert.equal(shipPlaced[0].done, true, 'world');
        assert.equal(shipPlaced[1].done, true, 'ship');
        assert.equal(onboardingNext(shipPlaced), 'date');
        const shipLoose = onboardingLines({ ...none, records: byId([loose]) });
        assert.equal(shipLoose[0].done, false);
        assert.equal(shipLoose[1].done, true);
        assert.equal(onboardingLines({ ...none, storeSeen: true })[6].done, true);
        assert.equal(onboardingLines({ ...none, packagesKept: 1 })[6].done, true);
    });

    test('all seven done: 7 of 7 and the list leaves', () => {
        const lines = onboardingLines({
            worldOpen: false, records: byId([placed, person]), clock: { days: 403602 }, journal: { a: { deleted: false } }, invited: true, storeSeen: false, packagesKept: 2,
        });
        assert.deepEqual(onboardingCount(lines), { done: 7, total: 7 });
        assert.equal(onboardingShows(lines), false);
        assert.equal(onboardingNext(lines), null);
    });

    test('players invited is remembered per campaign from what the Players section saw', () => {
        resetOnboarding();
        assert.equal(invitedIn('u1'), false);
        noteInvited('u1', { invite: false, members: 0 });
        assert.equal(invitedIn('u1'), false);
        noteInvited('u1', { invite: true, members: 0 });
        assert.equal(invitedIn('u1'), true);
        assert.equal(invitedIn('u2'), false);
        assert.equal(invitedIn(null), false);
        noteInvited('u1', { invite: false, members: 0 });
        assert.equal(invitedIn('u1'), false, 'the link revoked and nobody in');
        noteInvited('u1', { invite: false, members: 2 });
        assert.equal(invitedIn('u1'), true);
        noteInvited(null, { invite: true, members: 1 });
        resetOnboarding();
        assert.equal(invitedIn('u1'), false);
    });
});

describe('players invited, read once (DU9b)', () => {
    test.afterEach(() => resetOnboarding());

    test('the existing list is read once per campaign per session; a member playing or archived means invited; nobody means not; a failed read is asked again', async () => {
        let reads = 0;
        const reader = (answer) => async () => { reads += 1; return answer; };
        await ensureInvitedKnown('u1', reader({ playing: [{ userId: 'p1' }], archived: [] }));
        assert.equal(reads, 1);
        assert.equal(invitedIn('u1'), true);
        await ensureInvitedKnown('u1', reader({ playing: [], archived: [] }));
        assert.equal(reads, 1, 'not read again this session');
        assert.equal(invitedIn('u1'), true);
        await ensureInvitedKnown('u2', reader({ playing: [], archived: [] }));
        assert.equal(reads, 2);
        assert.equal(invitedIn('u2'), false, 'nobody in: not done, and nothing noted');
        await ensureInvitedKnown('u3', reader(null));
        assert.equal(invitedIn('u3'), false);
        await ensureInvitedKnown('u3', reader({ playing: [], archived: [{ userId: 'left' }] }));
        assert.equal(reads, 4, 'a failed read is asked again');
        assert.equal(invitedIn('u3'), true, 'an archived member was invited once');
        await ensureInvitedKnown(null, reader({ playing: [{ userId: 'x' }], archived: [] }));
        assert.equal(reads, 4);
    });

    test('the read the list hands over is the players list of the open campaign, through the campaign transport', async () => {
        const { campaign, resetCampaignState, transport } = await import('../../apps/web/src/campaign/store.ts');
        const calls = [];
        campaign.universeId = 'u9';
        transport.fetch = async (url) => {
            calls.push(String(url));
            return new Response(JSON.stringify({ ok: true, data: { playing: [{ userId: 'p1', handle: 'a', personId: null, joined: '2026-10-27T00:00:00Z', status: 'active', archivedAt: null, archivedBy: null }], archived: [] } }), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        try {
            const read = () => import('../../apps/web/src/campaign/membership.ts').then((m) => m.listPlayers());
            await ensureInvitedKnown('u9', read);
            assert.equal(calls.length, 1);
            assert.match(calls[0], /\/api\/universes\/u9\/players$/);
            assert.equal(invitedIn('u9'), true);
            await ensureInvitedKnown('u9', read);
            assert.equal(calls.length, 1);
        } finally {
            resetCampaignState();
            transport.fetch = fetch;
        }
    });
});

describe('in the pop-up', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-onb-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    async function render(setUp) {
        const store = await server.ssrLoadModule('/src/campaign/store.ts');
        const memory = await server.ssrLoadModule('/src/workspace/market/catalogue_memory.ts');
        const onboarding = await server.ssrLoadModule('/src/workspace/onboarding.ts');
        store.resetCampaignState();
        onboarding.resetOnboarding();
        memory.storeSeen.session = false;
        setUp({ campaign: store.campaign, memory, onboarding });
        const view = (await server.ssrLoadModule('/src/workspace/OnboardingList.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const { createMemoryHistory, createRouter } = await import('vue-router');
        const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] });
        const app = createSSRApp({ render: () => h(view) });
        app.use(router);
        await router.push('/');
        await router.isReady();
        return renderToString(app);
    }

    const referee = (campaign) => {
        campaign.status = 'ready';
        campaign.role = 'owner';
        campaign.universeId = 'u1';
    };

    test('the referee of an open campaign with a placed ship and the date set: 2 of 7, two lines done and faded, the next lit, each line a button', async () => {
        const html = await render(({ campaign }) => {
            referee(campaign);
            campaign.records = byId([placed]);
            campaign.clock = { days: 403602 };
        });
        assert.match(html, /data-onboarding/);
        assert.match(html, /Set up this campaign/);
        assert.match(html, /data-onboarding-count[^>]*>3 of 7</, 'a placed ship also finds the world');
        const done = [...html.matchAll(/data-onboarding-line="([a-z]+)" data-done="true"/g)].map((m) => m[1]);
        assert.deepEqual(done, ['world', 'ship', 'date']);
        assert.match(html, /class="[^"]*is-next[^"]*" data-onboarding-line="record"/);
        assert.equal((html.match(/<button type="button" class="onb-btn"/g) || []).length, 7);
        assert.match(html, /aria-label="Add your ship: done"/);
        assert.match(html, /is-done[\s\S]*?>Done</);
    });

    test('a player, a campaign not open, or 7 of 7: nothing', async () => {
        const player = await render(({ campaign }) => { referee(campaign); campaign.role = 'player'; });
        assert.doesNotMatch(player, /data-onboarding/);
        const closed = await render(({ campaign }) => { campaign.status = 'signed-out'; });
        assert.doesNotMatch(closed, /data-onboarding/);
        const all = await render(({ campaign, memory, onboarding }) => {
            referee(campaign);
            campaign.records = byId([placed, person]);
            campaign.clock = { days: 403602 };
            campaign.journal = { j1: { deleted: false } };
            onboarding.noteInvited('u1', { invite: true, members: 0 });
            memory.storeSeen.session = true;
        });
        assert.doesNotMatch(all, /data-onboarding/);
    });
});

describe('where it sits', () => {
    test('the account pop-up mounts the list before its items; the Players section tells it what it saw; nothing is stored', () => {
        const menu = read('workspace/AccountMenu.vue');
        assert.match(menu, /<OnboardingList @close="\$emit\('close'\)" \/>\s*<div ref="menu" class="account-items"/);
        const players = read('workspace/players/PlayersSection.vue');
        assert.match(players, /noteInvited\(campaign\.universeId, \{ invite: invite\.value !== null, members \}\)/);
        for (const file of ['workspace/onboarding.ts', 'workspace/OnboardingList.vue']) {
            const text = read(file);
            assert.doesNotMatch(text, /storageSet|localStorage|apiFetch|fetch\(/, file + ' stores nothing and asks the server nothing');
            assert.doesNotMatch(text, /\bwindow\.|\bdocument\./, file);
        }
        const list = read('workspace/OnboardingList.vue');
        for (const id of ['search', 'journal-new-note']) assert.match(list, new RegExp("runCommand\\('" + id + "'\\)"));
        assert.match(list, /MARKETPLACE_PATH/);
        assert.match(list, /kind: 'party'/);
        assert.match(list, /void ensureInvitedKnown\(campaign\.universeId, \(\) => import\('\.\.\/campaign\/membership\.ts'\)/, 'DU9b: the list is read once when the checklist opens, the module loaded then');
        assert.doesNotMatch(read('workspace/onboarding.ts'), /from '\.\.\/campaign\/membership\.ts'/, 'the first paint stays free of the membership schemas');
    });
});
