/**
 * Replies under a journal entry (streams/D.md DU30): the thread from the read, what a post sends,
 * the words, the row's count, the delete toast, and the thread rendered through Vite SSR with a
 * fake campaign read.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_LIMITS, CampaignEntry, EntryChange } from '@voyage/shared';
import { resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { deleteEntry, deletedWords, entriesNewestFirst, rebuildJournalIndex } from '../../apps/web/src/campaign/journal.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { toasts } from '../../apps/web/src/shell/toast.ts';
import { rowFace } from '../../apps/web/src/workspace/journal/list.ts';
import {
    authorWords,
    changesPath,
    dateWords,
    deleteChange,
    mayDelete,
    POST_FAILED,
    postedReply,
    readThread,
    refusalWords,
    replyChange,
    replyText,
    replyWords,
    restoreChange,
    threadPath,
    threadStale,
} from '../../apps/web/src/workspace/journal/replies.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const ENTRY = 'cj_11111111-1111-4111-8111-111111111111';
const cj = (n) => 'cj_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const RECORD = 'cr_22222222-2222-4222-8222-222222222222';

function entry(patch = {}) {
    return {
        id: ENTRY,
        kind: 'note',
        title: '',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 1,
        createdAt: '2026-10-07T00:00:00.000Z',
        updatedAt: '2026-10-07T00:00:00.000Z',
        deleted: false,
        ...patch,
    };
}

function reply(n, patch = {}) {
    return entry({
        id: cj(n),
        author: 'players',
        visibility: 'players',
        parent: ENTRY,
        body: 'Reply ' + n,
        createdAt: '2026-10-2' + n + 'T10:00:00.000Z',
        updatedAt: '2026-10-2' + n + 'T10:00:00.000Z',
        ...patch,
    });
}

const parse = (row) => CampaignEntry.parse(row);

test('the thread: tombstones dropped, oldest first, the handle and the count lifted off each row', () => {
    const rows = readThread([
        { ...reply(3), authorName: 'voss', replies: 1 },
        { ...reply(1), rev: undefined },
        { ...reply(2), deleted: true, authorName: 'gone' },
        null,
        { id: 'bad' },
        { ...reply(4), authorName: '' },
    ], parse);
    assert.deepEqual(rows.map((row) => row.id), [cj(1), cj(3), cj(4)]);
    assert.equal(rows[0].rev, 0);
    assert.equal(rows[0].authorName, '');
    assert.equal(rows[1].authorName, 'voss');
    assert.equal(rows[1].replies, 1);
    assert.equal(rows[2].replies, 0);
    assert.equal('authorName' in parse({ ...reply(1) }), false);
});

test('the words: the count, the author, the date, the refusal', () => {
    assert.equal(replyWords(0), 'No replies yet');
    assert.equal(replyWords(1), '1 reply');
    assert.equal(replyWords(3), '3 replies');
    assert.equal(authorWords({ authorName: ' voss ' }), 'voss');
    assert.equal(authorWords({ authorName: '' }), 'Players');
    assert.equal(dateWords('2026-10-21T10:00:00.000Z'), dateWords(new Date('2026-10-21T10:00:00.000Z').toISOString()));
    assert.match(dateWords('2026-10-21T12:00:00.000Z'), /^2[01] Oct 2026$/);
    assert.equal(dateWords('nonsense'), '');
    assert.equal(refusalWords({ error: { code: 'validation', message: 'Invalid request.' } }, POST_FAILED), 'Invalid request.');
    assert.equal(refusalWords({ error: { code: 'rate_limited', message: 'Too many requests.' } }, POST_FAILED), 'Too many requests.');
    assert.equal(refusalWords(null, POST_FAILED), POST_FAILED);
    assert.equal(refusalWords({ error: { message: '  ' } }, POST_FAILED), POST_FAILED);
});

test('the paths: the read with parent, the write', () => {
    assert.equal(threadPath('uni_a b', ENTRY), '/api/universes/uni_a%20b/campaign?after=0&limit=1000&parent=' + ENTRY);
    assert.equal(changesPath('uni_x'), '/api/universes/uni_x/campaign/changes');
});

test('a post sends a players note under the parent at rev 0, mentions read from the body; empty words post nothing', () => {
    assert.equal(replyText('   \n\t '), null);
    assert.equal(replyText('  Hello there  \r\nSecond line  '), 'Hello there\nSecond line');
    assert.equal(replyText('x'.repeat(CAMPAIGN_LIMITS.entryBody + 10)).length, CAMPAIGN_LIMITS.entryBody);
    const change = replyChange(ENTRY, 'See [[' + RECORD + '|Voss]] about it.', cj(9), '2026-10-28T08:00:00.000Z');
    assert.equal(EntryChange.safeParse(change).success, true);
    assert.equal(change.kind, 'note');
    assert.equal(change.author, 'players');
    assert.equal(change.visibility, 'players');
    assert.equal(change.parent, ENTRY);
    assert.equal(change.baseRev, 0);
    assert.equal(change.rev, 0);
    assert.equal(change.anchor, null);
    assert.equal('images' in change, false);
    assert.deepEqual(change.mentions, [RECORD]);
    const shown = postedReply(change, 7, 'me');
    assert.equal(shown.rev, 7);
    assert.equal(shown.authorName, 'me');
    assert.equal(shown.replies, 0);
    assert.equal('baseRev' in shown, false);
    assert.equal(postedReply({ id: cj(9), baseRev: 1, deleted: true }, 2, ''), null);
});

test('a delete sends the tombstone on the rev held; Undo sends the row back; who may delete', () => {
    assert.deepEqual(deleteChange({ id: cj(1), rev: 4 }), { id: cj(1), baseRev: 4, deleted: true });
    const held = { ...reply(1), rev: 4, authorName: 'voss', replies: 2 };
    const back = restoreChange(held, 5, '2026-10-28T09:00:00.000Z');
    assert.equal(EntryChange.safeParse(back).success, true);
    assert.equal(back.baseRev, 5);
    assert.equal(back.rev, 5);
    assert.equal(back.deleted, false);
    assert.equal(back.updatedAt, '2026-10-28T09:00:00.000Z');
    assert.equal(back.parent, ENTRY);
    assert.equal('authorName' in back, false);
    assert.equal('replies' in back, false);
    assert.equal(mayDelete({ rev: 0 }, 'owner', false), true);
    assert.equal(mayDelete({ rev: 0 }, 'player', false), false);
    assert.equal(mayDelete({ rev: 3 }, 'player', false), true);
    assert.equal(mayDelete({ rev: 0 }, 'player', true), true);
    assert.equal(mayDelete({ rev: 3 }, null, true), false);
});

test('the poll\'s count reads an open thread again; closed, unread, busy or matching, it waits (DF21)', () => {
    assert.equal(threadStale({ open: true, held: 3, busy: false }, 4), true);
    assert.equal(threadStale({ open: true, held: 3, busy: false }, 2), true);
    assert.equal(threadStale({ open: true, held: 3, busy: false }, 3), false);
    assert.equal(threadStale({ open: false, held: 3, busy: false }, 4), false);
    assert.equal(threadStale({ open: true, held: null, busy: false }, 4), false);
    assert.equal(threadStale({ open: true, held: 3, busy: true }, 4), false);
    assert.equal(threadStale({ open: true, held: 0, busy: false }, 1), true);
    const thread = read('apps/web/src/workspace/journal/Replies.vue');
    assert.match(thread, /watch\(\(\) => props\.count, \(count\) => \{/);
    assert.match(thread, /held: rows\.value \? rows\.value\.length : null, busy: loading\.value \|\| posting\.value \|\| deleting\.value\.size > 0/);
    assert.match(thread, /if \(threadStale\(state, count\)\) void ensure\(\);/);
});

test('a reply never lists as an entry; a row carries its count', () => {
    const top = entry({ title: 'Docked', replies: 3 });
    rebuildJournalIndex({ [top.id]: top, [cj(1)]: reply(1), [cj(2)]: reply(2) }, {}, null);
    assert.deepEqual(entriesNewestFirst().map((row) => row.id), [ENTRY]);
    assert.equal(rowFace(top, {}).replies, 3);
    assert.equal(rowFace(entry(), {}).replies, 0);
});

test('deleting an entry says its replies go with it, on the one undo toast', () => {
    assert.equal(deletedWords('Docked', 0), 'Deleted Docked.');
    assert.equal(deletedWords('Docked', 1), 'Deleted Docked and its 1 reply. Undo brings back the entry only.');
    assert.equal(deletedWords('the entry', 3), 'Deleted the entry and its 3 replies. Undo brings back the entry only.');
    transport.schedule = () => () => {};
    campaign.status = 'ready';
    campaign.role = 'owner';
    campaign.universeId = 'uni_test';
    campaign.journal[ENTRY] = entry({ title: 'Docked', replies: 3 });
    assert.equal(deleteEntry(ENTRY), true);
    assert.equal(toasts[toasts.length - 1].message, 'Deleted Docked and its 3 replies. Undo brings back the entry only.');
    assert.equal(toasts[toasts.length - 1].action.label, 'Undo');
    resetCampaign();
});

test('the screens: the thread under the entry, the count on the row, no page globals in the thread', () => {
    const page = read('apps/web/src/workspace/journal/EntryPage.vue');
    assert.match(page, /<Replies :key="id" :parent-id="id" :count="entry\.replies \?\? 0" :read-only="readOnly && !isPlayerView" \/>/);
    assert.match(page, /"replies side"/);
    // DF22: the heading belongs to the thread, so it goes when there is nothing to open or write.
    assert.doesNotMatch(page, /<h3 class="ui-heading">Replies<\/h3>/);
    assert.match(read('apps/web/src/workspace/journal/Replies.vue'), /v-if="offered"[^\n]*\n\s*<h3 v-if="depth === 0" class="ui-heading">Replies<\/h3>/);
    const list = read('apps/web/src/workspace/journal/JournalList.vue');
    assert.match(list, /v-if="face\.replies" class="jn-replies-count">\{\{ replyWords\(face\.replies\) \}\}/);
    const thread = read('apps/web/src/workspace/journal/Replies.vue');
    assert.doesNotMatch(thread, /\bdocument\.|\bwindow\./);
    assert.match(thread, /data-replies-toggle/);
    assert.match(thread, /<textarea[\s\S]*data-reply-box/);
    assert.match(thread, /v-if="depth < 1"/);
    assert.match(thread, /:depth="depth \+ 1"/);
    assert.match(thread, /showToast\('Deleted the reply\.', \{ action: \{ label: 'Undo'/);
});

describe('the thread renders', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let store = null;
    let calls = [];

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-journal-replies-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        store = await server.ssrLoadModule('/src/campaign/store.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    function hold(role, rows) {
        const { campaign: held, transport: wire } = store;
        for (const key of Object.keys(held.records)) delete held.records[key];
        held.records[RECORD] = { id: RECORD, type: 'person', kind: '', name: 'Voss', summary: '', details: '', tags: [], anchor: null, when: null, visibility: 'referee', playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 1, createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', deleted: false };
        held.status = 'ready';
        held.role = role;
        held.universeId = 'uni_test';
        calls = [];
        wire.fetch = async (url, init) => {
            calls.push({ url: String(url), method: init && init.method ? init.method : 'GET' });
            const parent = new URL(String(url), 'http://x').searchParams.get('parent');
            const journal = rows.filter((row) => row.parent === parent);
            return new Response(JSON.stringify({ ok: true, data: { records: [], links: [], journal, settings: null, clock: null, seq: 9, done: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
        };
    }

    async function render(props) {
        const view = (await server.ssrLoadModule('/src/workspace/journal/Replies.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        return (await renderToString(createSSRApp({ render: () => h(view, props) }))).replace(/<!--[\s\S]*?-->/g, '');
    }

    const words = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    test('three replies for the referee: who, when, the note, a nested count, Delete on each, the box at the foot', async () => {
        hold('owner', [
            { ...reply(1), authorName: 'voss', replies: 1 },
            { ...reply(2), authorName: '', body: 'Ask [[' + RECORD + ']] first.' },
            { ...reply(3), authorName: 'imogen' },
            { ...reply(5, { parent: cj(1) }), authorName: 'imogen', body: 'Under the first.' },
        ]);
        const html = await render({ parentId: ENTRY, count: 3, readOnly: false, startOpen: true });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, threadPath('uni_test', ENTRY));
        const text = words(html);
        assert.match(text, /^\s*Replies 3 replies/);
        assert.equal((html.match(/class="ui-heading"/g) ?? []).length, 1, 'the heading once, not under each reply');
        assert.match(text, /voss .*Reply 1/);
        assert.match(text, /Players .*Ask .*Voss.* first\./);
        assert.match(text, /imogen .*Reply 3/);
        assert.equal(text.indexOf('Reply 1') < text.indexOf('Reply 3'), true);
        assert.equal((html.match(/data-reply-delete/g) ?? []).length, 3);
        assert.match(html, /data-depth="1"[^>]*data-replies="cj_000000000000-0000-4000-8000-000000000001"|data-replies="cj_00000000-0000-4000-8000-000000000001"/);
        assert.match(text, /1 reply/);
        assert.doesNotMatch(text, /Under the first/);
        assert.match(html, /data-reply-box/);
        assert.match(html, /data-reply-post/);
        assert.equal(html.includes('data-replies="' + cj(5) + '"'), false);
    });

    test('a player: Delete only on their own reply (the one with a rev); read-only shows no box; no replies and read-only shows nothing', async () => {
        hold('player', [
            { ...reply(1), authorName: 'voss', rev: undefined },
            { ...reply(2), authorName: 'me', rev: 3 },
        ]);
        const html = await render({ parentId: ENTRY, count: 2, readOnly: false, startOpen: true });
        assert.equal((html.match(/data-reply-delete/g) ?? []).length, 1);
        assert.match(html, /data-reply-box/);
        const locked = await render({ parentId: ENTRY, count: 2, readOnly: true, startOpen: true });
        assert.doesNotMatch(locked, /data-reply-box|data-reply-delete/);
        assert.match(words(locked), /2 replies/);
        hold('player', []);
        const none = await render({ parentId: ENTRY, count: 0, readOnly: true });
        assert.equal(none.trim(), '');
        assert.doesNotMatch(none, /Replies/);
        const closed = await render({ parentId: ENTRY, count: 0, readOnly: false });
        assert.match(words(closed), /Reply/);
        assert.doesNotMatch(closed, /data-reply-box/);
        assert.equal(calls.length, 0);
    });
});
