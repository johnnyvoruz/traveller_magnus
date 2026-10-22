/**
 * SI3: the session ingest screens. A proposal card for each kind (its heading, the diff against what is
 * stored now, the quotes, Accept/Edit/Drop or, for a question, Make a note/Dismiss), the conflict strip,
 * Edit's boxes and what Accept then sends, the batch's words, the Copy for your AI sizes, the token list
 * (never the token text) and Agent access while it is paused. The wiring: the pane, the menu, the mount,
 * the review link, and no "snapshot" on screen.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(root, 'apps', 'web');
const read = (rel) => fs.readFileSync(path.join(webRoot, 'src', rel), 'utf8');

const rid = (n) => 'cr_00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const pid = (n) => 'pp_' + String(n).padStart(26, '0');
const stamp = '2026-10-18T00:00:00.000Z';
const ev = [{ at: '01:12:40', quote: 'I owe you one for Efate, captain.', speaker: 'Kara' }];
const record = (n, type, name, extra = {}) => ({
    id: rid(n), type, kind: '', name, summary: '', details: '', tags: [], anchor: null, when: null, visibility: 'referee',
    playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 3, createdAt: stamp, updatedAt: stamp, deleted: false, ...extra,
});
const stored = (n, proposal, extra = {}) => ({ id: pid(n), ordinal: n, proposal, targetId: null, state: 'pending', appliedRev: null, decidedAt: null, note: null, ...extra });

const KARA = record(1, 'person', 'Kara Voss', { summary: 'Pilot', details: 'Flew the Efate run.', tags: ['crew'] });
const LEDGER = record(2, 'vessel', 'Bright Ledger', { status: { cargo: [{ label: 'Parts', tons: 4 }], ledger: [] } });
const RECORDS = { [KARA.id]: KARA, [LEDGER.id]: LEDGER };

const PROPOSALS = {
    create: { op: 'record.create', ref: 'dock-boss', record: { type: 'person', kind: 'npc', name: 'Hollis Brand', summary: 'Dock boss at Efate', details: '', tags: ['efate'], anchor: { kind: 'record', id: LEDGER.id } }, evidence: ev },
    update: { op: 'record.update', id: KARA.id, baseRev: 3, set: { summary: 'Pilot, owes a favour' }, append: { details: 'Owes the crew a favour.' }, evidence: ev },
    link: { op: 'link.create', link: { from: { ref: 'dock-boss' }, to: { id: LEDGER.id }, kind: 'contact', role: 'fixer' }, evidence: ev },
    journal: { op: 'journal.create', entry: { kind: 'session', title: 'Into Efate', body: 'The crew landed.', when: { year: 1105, day: 104 }, realDate: '2026-10-17', sequence: 4, anchor: null }, evidence: ev },
    clock: { op: 'clock.set', days: 1105 * 365 + 103.5, baseRev: 9, evidence: ev },
    cargo: { op: 'cargo.append', id: LEDGER.id, baseRev: 3, lots: [{ label: 'Common Electronics', tons: 5, value: 50000, origin: 'Mora' }], evidence: ev },
    ledger: { op: 'ledger.append', id: LEDGER.id, baseRev: 3, lines: [{ when: { year: 1105, day: 104 }, amount: -5000, memo: 'Berthing', kind: 'expense' }], evidence: ev },
    question: { op: 'question', text: 'Did the party pay the berthing fee?', evidence: ev },
};

describe('the proposals screens', { concurrency: 1 }, () => {
    let server = null;
    let cacheDir = '';
    let words = null;
    let edit = null;
    let access = null;
    let copy = null;

    test.before(async () => {
        cacheDir = fs.mkdtempSync(path.join(tmpdir(), 'd-proposals-'));
        const { createServer } = await import('vite');
        server = await createServer({ root: webRoot, cacheDir, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent' });
        words = await server.ssrLoadModule('/src/workspace/proposals/proposal_words.ts');
        edit = await server.ssrLoadModule('/src/workspace/proposals/proposal_edit.ts');
        access = await server.ssrLoadModule('/src/workspace/proposals/agent_access.ts');
        copy = await server.ssrLoadModule('/src/workspace/proposals/copy_for_ai.ts');
    });

    test.after(async () => {
        if (server) await server.close();
        if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5 });
    });

    const look = () => ({ records: RECORDS, refs: new Map([['dock-boss', 'Hollis Brand']]) });

    async function renderCard(row, extra = {}) {
        const view = (await server.ssrLoadModule('/src/workspace/proposals/ProposalCard.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const app = createSSRApp({ render: () => h(view, { row, look: look(), conflict: false, busy: false, readOnly: false, ...extra }) });
        return renderToString(app);
    }

    test('each kind\'s heading: what it is, and what it is about', () => {
        const heads = Object.fromEntries(Object.entries(PROPOSALS).map(([key, p]) => [key, words.cardHeading(p, look())]));
        assert.deepEqual(heads.create, { kicker: 'New person', title: 'Hollis Brand' });
        assert.deepEqual(heads.update, { kicker: 'Change', title: 'Kara Voss' });
        assert.deepEqual(heads.link, { kicker: 'New link', title: 'Hollis Brand → Bright Ledger' }, 'a ref reads by the name its create gives');
        assert.deepEqual(heads.journal, { kicker: 'Session 4', title: 'Into Efate' });
        assert.equal(heads.clock.kicker, 'Campaign date');
        assert.match(heads.clock.title, /^104-1105 \(.+\), 12:00$/);
        assert.deepEqual(heads.cargo, { kicker: 'Cargo', title: 'Bright Ledger' });
        assert.deepEqual(heads.question, { kicker: 'Question', title: 'Your AI asks' });
    });

    test('the diff: a change beside what is stored now, an append after the count there, a new record\'s fields', () => {
        assert.deepEqual(words.diffRows(PROPOSALS.update, look()), [
            { label: 'Summary', before: 'Pilot', after: 'Pilot, owes a favour', how: 'set' },
            { label: 'Details', before: 'Flew the Efate run.', after: 'Owes the crew a favour.', how: 'add' },
        ]);
        assert.deepEqual(words.diffRows(PROPOSALS.cargo, look()), [
            { label: 'Lot', before: '1 in the hold', after: 'Common Electronics, 5 t · Cr50,000 · from Mora', how: 'add' },
        ]);
        assert.deepEqual(words.diffRows(PROPOSALS.ledger, look())[0], { label: 'Line', before: '0 on the ledger', after: '104-1105 · Berthing · −Cr5,000 (expense)', how: 'add' });
        const created = words.diffRows(PROPOSALS.create, look());
        assert.deepEqual(created.map((row) => [row.label, row.after]), [['Kind', 'npc'], ['Summary', 'Dock boss at Efate'], ['Tags', 'efate'], ['Place', 'Aboard Bright Ledger']]);
        assert.ok(created.every((row) => row.how === 'new' && row.before === null));
    });

    test('a card per kind: heading, quotes, and its actions; a question has Make a note and Dismiss', async () => {
        for (const [key, proposal] of Object.entries(PROPOSALS)) {
            const html = await renderCard(stored(1, proposal));
            assert.match(html, /data-state="pending"/, key);
            assert.match(html, /I owe you one for Efate, captain\./, key + ': the quote');
            assert.match(html, /01:12:40/, key + ': where in the session');
            if (key === 'question') {
                assert.match(html, /Did the party pay the berthing fee\?/);
                assert.match(html, />Make a note</);
                assert.match(html, />Dismiss</);
                assert.doesNotMatch(html, />Accept</);
            } else {
                assert.match(html, />Accept</, key);
                assert.match(html, />Drop</, key);
            }
        }
        assert.match(await renderCard(stored(1, PROPOSALS.update)), />Edit</, 'words can be edited');
        assert.doesNotMatch(await renderCard(stored(1, PROPOSALS.clock)), />Edit</, 'the clock is accepted or dropped as sent');
        assert.doesNotMatch(await renderCard(stored(1, PROPOSALS.cargo)), />Edit</);
    });

    test('the conflict strip, and an accepted card has no actions', async () => {
        const html = await renderCard(stored(1, PROPOSALS.update), { conflict: true });
        assert.match(html, /data-proposal-conflict/);
        assert.match(html, /This record changed after your AI read it\./);
        assert.match(html, />Accept</, 'Accept again applies it on top of what is saved now');
        const done = await renderCard(stored(1, PROPOSALS.update, { state: 'accepted', appliedRev: 4 }));
        assert.match(done, />Accepted</);
        assert.doesNotMatch(done, /data-proposal-accept/);
    });

    test('Edit: the proposal\'s words in boxes, and the proposal Accept then sends', () => {
        assert.deepEqual(edit.editFields(PROPOSALS.update).map((f) => f.key), ['set.summary', 'append.details']);
        const made = edit.withEdits(PROPOSALS.update, { 'set.summary': '  Pilot,   in debt ', 'append.details': '' });
        assert.deepEqual(made.proposal, { op: 'record.update', id: KARA.id, baseRev: 3, set: { summary: 'Pilot, in debt' }, evidence: ev }, 'an emptied append is left out');
        assert.deepEqual(edit.withEdits(PROPOSALS.create, { name: '', summary: '', details: '', tags: '' }), { error: 'Enter a name.' });
        const only = { ...PROPOSALS.update, set: undefined };
        delete only.set;
        assert.deepEqual(edit.withEdits(only, { 'append.details': ' ' }), { error: 'Nothing is left to change. Drop the proposal instead.' });
        const renamed = edit.withEdits(PROPOSALS.create, { name: 'Hollis  Brand ', summary: 'Dock boss', details: '', tags: 'efate, efate,  docks' });
        assert.equal(renamed.proposal.record.name, 'Hollis Brand');
        assert.deepEqual(renamed.proposal.record.tags, ['efate', 'docks']);
        assert.deepEqual(edit.editFields(PROPOSALS.clock), []);
    });

    test('a batch in words: counts, how it came, a checked paste', () => {
        assert.equal(words.countWords({ pending: 3, accepted: 2, dropped: 0 }), '3 waiting · 2 accepted');
        assert.equal(words.countWords({ pending: 0, accepted: 0, dropped: 1 }), '0 waiting · 1 dropped');
        assert.equal(words.doorWords({ pasted: true }), 'Pasted');
        assert.equal(words.doorWords({ pasted: false }), 'Sent by your AI');
        assert.equal(words.pastedWords({ 'record.create': 2, question: 1 }), '3 proposals: 2 new records, 1 question');
        assert.equal(words.stampWords('2026-10-18T12:00:00.000Z'), '18 Oct 2026');
    });

    test('Copy for your AI: each part\'s size, All the largest; the size words', () => {
        const input = {
            name: 'Traders', records: [KARA, LEDGER], links: [], journal: [], clock: { days: 1105 * 365 + 103, rev: 9 },
            settings: { party: { vesselIds: [LEDGER.id], aboard: {}, memberIds: [KARA.id], anchor: null }, calendar: { dateFormat: 'imperial' }, kinds: {}, rev: 1 },
        };
        const sizes = copy.choiceSizes(input, 'https://traveller.voyage', {});
        assert.deepEqual(Object.keys(sizes), ['all', 'ships', 'characters', 'records', 'journal']);
        for (const part of ['ships', 'characters', 'records', 'journal']) assert.ok(sizes.all >= sizes[part], part);
        assert.equal(copy.sizeWords(812), 'About 812 tokens');
        assert.equal(copy.sizeWords(12_449), 'About 12,400 tokens');
        assert.deepEqual(copy.liveSheetIds({ ...input, records: [{ ...KARA, sheet: { characterId: 'ch_1' } }] }), ['ch_1']);
    });

    test('Agent access: the server\'s answer read, paused said with the way that still works', async () => {
        const store = await server.ssrLoadModule('/src/campaign/store.ts');
        const answer = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
        store.transport.fetch = answer(503, { error: { code: 'agents_paused', message: 'Agent access is paused.' } });
        const paused = await access.readAccess();
        assert.equal(paused.kind, 'paused');
        assert.match(paused.message, /Copy for your AI/);
        store.transport.fetch = answer(503, { error: { code: 'tokens_unavailable', message: 'Agent access is not available yet.' } });
        assert.deepEqual(await access.readAccess(), { kind: 'unavailable', message: 'Agent access is not available yet.' });
        const row = { id: 'tok_1', name: 'Claude', prefix: 'tv_pat_ab12', scopes: ['campaign:read', 'proposals:write'], universeId: 'u1', createdAt: stamp, expiresAt: '2027-01-16T00:00:00.000Z', lastUsedAt: null, revokedAt: null };
        store.transport.fetch = answer(200, { data: { items: [row] } });
        assert.deepEqual(await access.readAccess(), { kind: 'on', items: [row] });
        assert.equal(access.scopeWords(row.scopes), 'Reads the campaign and sends proposals');
        assert.equal(access.tokenLive(row, Date.parse(stamp)), true);
        assert.equal(access.tokenLive({ ...row, revokedAt: stamp }, Date.parse(stamp)), false);
    });

    test('the token list shows the first characters, never the token text', async () => {
        const view = (await server.ssrLoadModule('/src/workspace/proposals/TokenList.vue')).default;
        const { createSSRApp, h } = await import('vue');
        const { renderToString } = await import('vue/server-renderer');
        const row = { id: 'tok_1', name: 'Claude on my laptop', prefix: 'tv_pat_ab12', scopes: ['campaign:read'], universeId: 'u1', createdAt: stamp, expiresAt: '2027-01-16T00:00:00.000Z', lastUsedAt: null, revokedAt: null };
        const html = await renderToString(createSSRApp({ render: () => h(view, { items: [row], campaignName: () => 'Traders', busy: null, now: Date.parse(stamp) }) }));
        assert.match(html, /Claude on my laptop/);
        assert.match(html, /tv_pat_ab12…/);
        assert.match(html, /Traders · Reads the campaign/);
        assert.match(html, />Revoke</);
        assert.match(html, /never used/);
    });
});

test('the one-time token: shown once with Copy, "You won\'t see it again", and the leak sentence', () => {
    const make = read('workspace/proposals/TokenMake.vue');
    assert.match(make, /copy this token now\. You won't see it again\./);
    assert.match(make, /If this token leaks, revoke it here/);
    assert.match(make, /made\.value = \{ token: answer\.token, name: answer\.row\.name \};/);
    assert.match(make, /@click="made = null; emit\('done'\)"/, 'Done forgets it');
});

test('the wiring: the pane, the referee\'s menu, the mount, the review link, the account section', () => {
    const pane = read('shell/pane.ts');
    assert.match(pane, /\| \{ kind: 'proposals'; batch: string \| null \}/);
    assert.match(pane, /if \(pane\.kind === 'proposals'\) return \{ \.\.\.cleared, panel: 'proposals', batch: pane\.batch \};/);
    const panel = read('workspace/CampaignPanel.vue');
    assert.match(panel, /const isReferee = computed\(\(\) => campaign\.role === 'owner' && !isPlayer\.value && !viewAs\.on\);/);
    assert.match(panel, /<CampaignMenu v-if="isReferee" @proposals="openProposals" \/>/);
    assert.match(panel, /<ProposalsSection v-else-if="onProposals && isReferee"/);
    assert.match(read('router.ts'), /path: '\/universes\/:universe\/proposals\/:batch', redirect:/);
    assert.match(read('workspace/passkey/AccountPage.vue'), /<AgentAccess \/>/);
    const section = read('workspace/proposals/ProposalsSection.vue');
    assert.match(section, /const DECISIONS_PER_CALL = 50;/);
    assert.match(section, /result = await submitPasted\(pasteText\.value\);/, 'the paste goes through A\'s door');
    assert.match(section, /pasteWords\.value = result\.sentences;/, 'errors name the proposal and the field');
});

test('no "snapshot" in anything a referee reads', () => {
    const dir = path.join(webRoot, 'src', 'workspace', 'proposals');
    for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.vue'))) {
        const template = fs.readFileSync(path.join(dir, name), 'utf8').split('<template>').slice(1).join('');
        assert.doesNotMatch(template, /snapshot/i, name);
    }
});
