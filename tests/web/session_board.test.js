/**
 * Session mode (streams/D.md DU1; UX backlog U1): the live session on the device, the board's clock
 * steps, the end question, the session pane's address, the palette command, the wiring in the
 * Campaign panel, and the board rendered through Vite SSR: the start card, then the live board with
 * the clock, the party, the dice and the entry.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HOUR, totalDays, WEEK_DAYS } from '../../apps/web/src/orbit/clock.ts';
import { addressPane, escapePane, hostsCampaign, paneChanges } from '../../apps/web/src/shell/pane.ts';
import { campaignAsk, campaignCommands } from '../../apps/web/src/workspace/campaign_command.ts';
import {
    beginLive,
    clockMoved,
    endAsk,
    endedWords,
    endLive,
    live,
    liveFor,
    parseLive,
    playedDate,
    readLive,
    sessionLabel,
    setLiveDays,
    sinceWords,
    step,
    STEPS,
    timeWords,
} from '../../apps/web/src/workspace/session/live.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const UNI = 'uni_11111111-1111-4111-8111-111111111111';
const ENTRY = 'cj_22222222-2222-4222-8222-222222222222';
const DAY = totalDays(1105, 201);

test('the live session on the device: nothing, nonsense, another build, then start, step and end', () => {
    assert.equal(parseLive(null), null);
    assert.equal(parseLive(''), null);
    assert.equal(parseLive('{not json'), null);
    assert.equal(parseLive('[]'), null);
    assert.equal(parseLive(JSON.stringify({ universeId: UNI })), null);
    assert.deepEqual(parseLive(JSON.stringify({ universeId: UNI, entryId: ENTRY, startedAt: 'x', days: 'soon' })), { universeId: UNI, entryId: ENTRY, startedAt: 'x', days: null });
    assert.equal(readLive(''), null);
    assert.equal(live.read, true);
    const held = readLive(JSON.stringify({ universeId: UNI, entryId: ENTRY, startedAt: '2026-10-28T13:05:00.000Z', days: DAY + 0.5 }));
    assert.equal(held.days, DAY + 0.5);
    assert.deepEqual(liveFor(UNI), held);
    assert.equal(liveFor('uni_other'), null);
    assert.equal(liveFor(null), null);
    const begun = beginLive(UNI, ENTRY, '2026-10-28T13:05:00.000Z', null);
    assert.equal(begun.days, null);
    setLiveDays(DAY + 1);
    assert.equal(live.now.days, DAY + 1);
    setLiveDays(null);
    assert.equal(live.now.days, null);
    endLive();
    assert.equal(live.now, null);
    setLiveDays(DAY);
    assert.equal(live.now, null, 'a step with no session is nothing');
});

test('the clock steps on by an hour, a day or a week; the words', () => {
    assert.deepEqual(STEPS.map((item) => item.label), ['+1 hour', '+1 day', '+1 week']);
    assert.equal(step(DAY, 'hour'), DAY + HOUR);
    assert.equal(step(DAY, 'day'), DAY + 1);
    assert.equal(step(DAY, 'week'), DAY + WEEK_DAYS);
    assert.equal(timeWords(DAY), '00:00');
    assert.equal(timeWords(DAY + 0.5 + HOUR), '13:00');
    assert.equal(clockMoved(DAY, DAY), false);
    assert.equal(clockMoved(DAY + HOUR, DAY), true);
    assert.equal(clockMoved(DAY, DAY + 7), true);
    assert.equal(clockMoved(DAY + 1e-9, DAY), false, 'a hair is not a move');
    assert.equal(sessionLabel({ title: '', sequence: 3 }), 'Session 3');
    assert.equal(sessionLabel({ title: '  Regina Down ', sequence: 3 }), 'Regina Down');
    assert.equal(sessionLabel({ title: '', sequence: null }), 'Session');
    assert.match(playedDate(new Date(2026, 9, 28, 20, 0)), /^2026-10-28$/);
    assert.match(sinceWords(new Date(2026, 9, 28, 14, 5).toISOString()), /^Since 14:05$/);
    assert.equal(sinceWords('nonsense'), '');
    assert.equal(endedWords('Session 3', false, '009-1105'), 'Session 3 ended.');
    assert.equal(endedWords('Session 3', true, '009-1105'), 'Session 3 ended. The campaign date is 009-1105.');
});

test('End asks once, in the campaign\'s dates: advance to the clock, or keep the date; the session ends either way', () => {
    const ask = endAsk(DAY + 7 + 0.5, DAY, 'Session 3');
    assert.equal(ask.title, 'Advance the campaign date?');
    assert.equal(ask.text, 'The clock stands at 208-1105, Forday 12:00. The campaign date is 201-1105. Advance it to the clock, or keep it. Session 3 stays in the journal either way.');
    assert.equal(ask.confirm, 'Advance to 208-1105');
    assert.equal(ask.cancel, 'Keep 201-1105');
});

test('the session pane: panel=session, hosted by the Campaign panel, Escape to the list', () => {
    assert.deepEqual(addressPane('/', { panel: 'session' }).pane, { kind: 'session' });
    assert.deepEqual(paneChanges({ kind: 'session' }), { panel: 'session', record: null, entry: null, character: null, batch: null, tl: null, tlType: null, tlShip: null });
    assert.equal(hostsCampaign({ kind: 'session' }), true);
    assert.deepEqual(escapePane('/s/Spinward_Marches/1910', { panel: 'session', x: '1' }), { path: '/s/Spinward_Marches/1910', query: { panel: 'campaign', x: '1' } });
});

test('the palette: "Start a session" asks the board and opens the pane; the ask starts false', () => {
    const command = campaignCommands().find((item) => item.id === 'campaign-session');
    assert.ok(command);
    assert.equal(command.name, 'Start a session');
    assert.equal(typeof command.runnable, 'function');
    assert.equal(campaignAsk.session, false);
});

test('the wiring: the head\'s Session button, the board at Full, the board\'s pieces', () => {
    const panel = read('apps/web/src/workspace/CampaignPanel.vue');
    assert.match(panel, /data-open-session @click="openSession"/);
    assert.match(panel, /<button v-if="isReferee && !headFolded"[^>]*class="camp-timeline camp-session"/, 'at Column it is the menu\'s (DU34)');
    assert.match(panel, /<SessionBoard v-else-if="onSession && isReferee" :read-only="!online" @map="showMap" @journal="goEntry" @open="go" \/>/);
    assert.match(panel, /watch\(onSession, \(on\) => \{\s+if \(!on \|\| span\.value === 'full'\) return;\s+span\.value = 'full';/);
    assert.match(panel, /onProposals\.value \|\| onSession\.value\) \{\s+event\.preventDefault\(\);/, 'Escape leaves the board');
    assert.match(panel, /onProposals\.value \|\| onSession\.value \|\| props\.entryId\) return false;/, 'no first-run card over the board');
    const board = read('apps/web/src/workspace/session/SessionBoard.vue');
    assert.match(board, /<DiceButton \/>/);
    assert.match(board, /<EntryPage v-if="entry" :id="entry\.id" beside :read-only="readOnly"/);
    assert.match(board, /<WhereBlock\s+heading="Where are we"\s+big/);
    assert.match(board, /<div v-if="system" class="sess-here">\s+<RecordsHere /);
    assert.match(board, /<MarketsNearby :hex-key="hexKey"/);
    assert.match(board, /v-for="item in STEPS"[^>]*:data-session-step="item\.kind"/);
    assert.match(board, /data-session-end :disabled="readOnly" @click="end"/);
    assert.match(board, /<AskModal\s+v-if="ask"/);
    // The clock moves the view day, never the campaign date; the date moves on the answer alone.
    assert.match(board, /function move\(kind: StepKind\): void \{\s+const next = step\(days\.value, kind\);\s+setLiveDays\(next\);\s+publishViewDay\(next/);
    assert.equal((board.match(/setCampaignDate\(/g) || []).length, 1, 'the one call, in finish');
    assert.match(board, /if \(advance\) setCampaignDate\(days\.value\);\s+else resetViewDay\(\);/);
    // The played date is written when the session ends.
    assert.match(board, /saveEntry\(\{ \.\.\.entry\.value, realDate: playedDate\(new Date\(\)\) \}\);/);
});

describe('the board rendered', () => {
    const VESSEL = 'cr_33333333-3333-4333-8333-333333333333';
    const VOSS = 'cr_44444444-4444-4444-8444-444444444444';
    const KALE = 'cr_55555555-5555-4555-8555-555555555555';
    const stamp = '2026-10-28T10:00:00.000Z';

    function record(id, type, name, patch = {}) {
        return {
            id, type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility: 'referee',
            playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 1, createdAt: stamp, updatedAt: stamp, deleted: false, ...patch,
        };
    }

    async function render(liveRaw) {
        const { createServer } = await import('vite');
        const { renderToString } = await import('vue/server-renderer');
        const server = await createServer({
            root: webRoot,
            configFile: path.join(webRoot, 'vite.config.ts'),
            logLevel: 'silent',
            cacheDir: path.join(tmpdir(), 'voyage-session-board-ssr'),
            server: { middlewareMode: true, hmr: false, ws: false, watch: null },
            appType: 'custom',
        });
        try {
            const vue = await import('vue');
            const router = await import('vue-router');
            const storeMod = await server.ssrLoadModule('/src/campaign/store.ts');
            const liveMod = await server.ssrLoadModule('/src/workspace/session/live.ts');
            const view = (await server.ssrLoadModule('/src/workspace/session/SessionBoard.vue')).default;
            const { campaign } = storeMod;
            campaign.status = 'ready';
            campaign.role = 'owner';
            campaign.universeId = UNI;
            campaign.clock = { days: DAY + 0.5, rev: 1 };
            campaign.settings = { party: { vesselIds: [VESSEL], aboard: { [VOSS]: VESSEL }, memberIds: [VOSS, KALE], anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 1 };
            campaign.records[VESSEL] = record(VESSEL, 'vessel', 'Bright Ledger', { anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' } });
            campaign.records[VOSS] = record(VOSS, 'person', 'Voss');
            campaign.records[KALE] = record(KALE, 'person', 'Kale');
            campaign.journal[ENTRY] = {
                id: ENTRY, kind: 'session', title: '', body: 'The party lands at Regina Down.', when: { year: 1105, day: 201 }, realDate: '2026-10-28', sequence: 3,
                author: 'referee', visibility: 'referee', anchor: null, mentions: [], rev: 1, createdAt: stamp, updatedAt: stamp, deleted: false,
            };
            liveMod.readLive(liveRaw);
            const app = vue.createSSRApp({ render: () => vue.h(view, { readOnly: false }) });
            const r = router.createRouter({ history: router.createMemoryHistory(), routes: [{ path: '/:rest(.*)*', component: { render: () => null } }] });
            app.use(r);
            await r.push('/?panel=session');
            await r.isReady();
            return await renderToString(app);
        } finally {
            await server.close();
        }
    }

    test('not live: the start card; live: the clock large, the party, the dice, the entry beside', { timeout: 120000 }, async () => {
        const start = await render('');
        assert.match(start, /data-session-start/);
        assert.match(start, /Start a session/);
        assert.doesNotMatch(start, /data-session-clock/);

        const board = await render(JSON.stringify({ universeId: UNI, entryId: ENTRY, startedAt: '2026-10-28T13:05:00.000Z', days: DAY + 7 + 0.5 + HOUR * 2 }));
        const words = board.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        assert.match(words, /Live Session 3 Since \d\d:\d\d End the session/);
        assert.match(board, /data-session-date[^>]*>208-1105</, 'the clock the device held, a week and two hours on');
        assert.match(words, /Forday · 14:00/);
        assert.match(words, /Campaign date 201-1105 Back to it/);
        assert.match(board, /data-session-step="hour"[^>]*>\+1 hour</);
        assert.match(board, /data-session-step="day"[^>]*>\+1 day</);
        assert.match(board, /data-session-step="week"[^>]*>\+1 week</);
        assert.match(words, /Where are we/);
        assert.match(words, /Regina/);
        assert.match(words, /Bright Ledger Voss/);
        assert.match(words, /Ashore Kale/);
        assert.match(board, /data-session-dice/);
        assert.match(board, /class="dice-picks"/);
        assert.match(board, /data-markets/);
        assert.match(board, /jn-entry/);
        assert.match(words, /The party lands at Regina Down\./);
        assert.doesNotMatch(board, /data-session-start/);
    });
});
