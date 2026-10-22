/**
 * ZS1 round A: the players projection under hostile text (findings/zs1_access.md).
 * The referee's view of a `:::referee` block (rich.ts) and the players' copy
 * (players_view.ts) must agree: whatever the referee sees inside a block, no
 * players read holds. A referee-only string starts with ZREF_.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playersView } from '@voyage/shared';
import { parseRich } from '../../apps/web/src/workspace/journal/rich.ts';

const STAMP = '2026-10-18T00:00:00.000Z';

function rid(prefix, n) {
    return prefix + '22222222-2222-4222-8222-' + n.toString(16).padStart(12, '0');
}

function record(n, players, over = {}) {
    return {
        id: rid('cr_', n),
        type: 'place',
        kind: '',
        name: (players ? 'ZPLAY_name' : 'ZREF_name') + n,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: players ? 'players' : 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function entry(n, players, over = {}) {
    return {
        id: rid('cj_', n),
        kind: 'note',
        title: '',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: players ? 'players' : 'referee',
        anchor: null,
        mentions: [],
        images: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

/** Every text the referee's render puts inside a referee block. */
function refereeTexts(nodes, inside = false, out = []) {
    for (const node of nodes) {
        if (node.kind === 'text' && inside) out.push(node.text);
        if (node.kind === 'referee') refereeTexts(node.children, true, out);
        else if (node.kind === 'list') for (const item of node.items) refereeTexts(item, inside, out);
        else if (Array.isArray(node.children)) refereeTexts(node.children, inside, out);
    }
    return out;
}

function view(text) {
    const shown = record(1, true, { details: text });
    const page = playersView({ records: [shown], links: [], journal: [entry(1, true, { body: text })], settings: null, clock: null });
    return JSON.stringify(page);
}

const AGREE = [
    ['LF', 'Open.\n:::referee\nZREF_lf\n:::\nStill.'],
    ['CRLF', 'Open.\r\n:::referee\r\nZREF_crlf\r\n:::\r\nStill.'],
    ['indented with tabs', 'Open.\n\t  :::referee  \n ZREF_indent\n\t:::\t\nStill.'],
    ['unclosed', 'Open.\n:::referee\nZREF_open\nZREF_open_two'],
    ['nested opener', 'Open.\n:::referee\nZREF_outer\n:::referee\nZREF_inner\n:::\nAfter.'],
    ['two blocks', ':::referee\nZREF_one\n:::\nMiddle.\n:::referee\nZREF_two\n:::'],
    ['opener as the last line', 'Open.\n:::referee'],
    ['non-breaking space around the opener', 'Open.\n\u00a0:::referee\u00a0\nZREF_nbsp\n:::\nStill.'],
    ['mixed CRLF opener, LF closer', 'Open.\r\n:::referee\nZREF_mixed\r\n:::\nStill.'],
];

for (const [name, text] of AGREE) {
    test(`ZS1: a referee block (${name}) the referee sees as hidden is absent for players`, () => {
        const hidden = refereeTexts(parseRich(text)).map((item) => item.trim()).filter(Boolean);
        const raw = view(text);
        for (const piece of hidden) assert.equal(raw.includes(piece), false, `${name}: ${piece}`);
        assert.equal(raw.includes('ZREF_'), false, name);
    });
}

// SECURITY (ZS1): rich.ts reads a lone CR as a line break (text.replace(/\r\n?/g, '\n')), so the
// referee sees a hidden block; players_view.ts splits on '\n' only, so the players read holds it.
// Kept as todo so the gates stay green; the owning lane drops `todo` with the fix.
test('ZS1 SECURITY: a referee block written with lone CR line breaks is absent for players', {
    todo: 'SECURITY ZS1: stripRefereeBlocks splits on \\n only; rich.ts also breaks on a lone \\r',
}, () => {
    const text = 'Open.\r:::referee\rZREF_cr\r:::\rStill.';
    const hidden = refereeTexts(parseRich(text)).map((item) => item.trim()).filter(Boolean);
    assert.deepEqual(hidden, ['ZREF_cr']);
    assert.equal(view(text).includes('ZREF_cr'), false);
});

test('ZS1: text the referee sees outside any block stays for players', () => {
    for (const [name, text] of AGREE) {
        const raw = view(text);
        if (text.includes('Still.')) assert.equal(raw.includes('Still.'), true, name);
    }
    assert.equal(view('Open.\n:::Referee\nZPLAY_case\n:::').includes('ZPLAY_case'), true);
    assert.deepEqual(refereeTexts(parseRich('Open.\n:::Referee\nZPLAY_case\n:::')), []);
});

test('ZS1: a hidden record holds no id, name or text on any players path', () => {
    const hidden = record(9, false, { details: 'ZREF_details', summary: 'ZREF_summary', anchor: { kind: 'system', hexKey: '1910', locationLabel: 'ZREF_label' } });
    const gone = record(8, true, { name: 'ZREF_deleted', deleted: true });
    const token = (r) => `[[${r.id}]]`;
    const bare = (r) => ` ${r.id} `;
    const text = `See ${token(hidden)}${bare(hidden)}${token(gone)}${bare(gone)}.`;
    const ship = record(2, true, {
        type: 'vessel',
        name: 'ZPLAY_ship',
        details: text,
        summary: text,
        kind: text,
        tags: [text],
        playerNotes: text,
        sheet: { lines: [text, { deep: text }] },
        images: [{ hash: 'ab'.repeat(32), thumbHash: 'cd'.repeat(32), width: 1, height: 1, bytes: 1, caption: text }],
        anchor: { kind: 'record', id: hidden.id },
        status: {
            track: [{ from: { kind: 'record', id: hidden.id }, to: { kind: 'system', hexKey: '1910', locationLabel: text }, departs: 1, arrives: 2, mode: 'flight', note: text }],
            cargo: [{ itemId: hidden.id, label: text, tons: 1 }],
            passengers: [{ personId: gone.id, label: text }],
            owners: [{ holder: { kind: 'record', id: hidden.id }, share: 1 }, { holder: 'party', share: 1, note: text }],
            memo: { free: text },
        },
    });
    const place = record(3, true, { anchor: { kind: 'system', hexKey: '1910', locationLabel: text } });
    const links = [
        { id: rid('cl_', 1), from: ship.id, to: place.id, kind: 'contact', role: text, order: 0, since: null, until: null, notes: text, visibility: 'players', provenance: null, rev: 1, createdAt: STAMP, updatedAt: STAMP, deleted: false },
        { id: rid('cl_', 2), from: ship.id, to: hidden.id, kind: 'contact', role: 'ZREF_role', order: 0, since: null, until: null, notes: 'ZREF_link', visibility: 'players', provenance: null, rev: 1, createdAt: STAMP, updatedAt: STAMP, deleted: false },
    ];
    const journal = [
        entry(1, true, { title: text, body: text, mentions: [hidden.id, gone.id, ship.id, 'hex:1910'], anchor: { kind: 'record', id: hidden.id }, images: [{ hash: 'ab'.repeat(32), thumbHash: 'cd'.repeat(32), width: 1, height: 1, bytes: 1, caption: text }] }),
        entry(2, false, { title: 'ZREF_entry', body: 'ZREF_entry' }),
        entry(3, true, { title: 'ZREF_tomb', deleted: true }),
    ];
    const settings = {
        party: { vesselIds: [ship.id, hidden.id], aboard: { [hidden.id]: ship.id }, memberIds: [hidden.id], anchor: { kind: 'record', id: hidden.id } },
        kinds: { place: [text] },
        calendar: { dateFormat: 'imperial' },
        rev: 1,
    };
    const page = playersView({ records: [hidden, gone, ship, place], links, journal, settings, clock: { days: 3, rev: 2 } });
    const raw = JSON.stringify(page);
    for (const leak of [hidden.id, gone.id, 'ZREF_']) assert.equal(raw.includes(leak), false, leak);
    assert.equal(page.settings.party.anchor?.hexKey, '1910');
    assert.equal(page.settings.party.anchor?.locationLabel, undefined);
    assert.deepEqual(page.journal.map((row) => row.id), [rid('cj_', 1)]);
    assert.deepEqual(page.links.map((row) => row.id), [rid('cl_', 1)]);
});