/**
 * Rich text on record details and journal bodies. Stored text stays text.
 * A redacted mention is the words "a record" before the parse, in the client
 * render and in the Player Pack.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { redactPlayersText } from '@voyage/shared';
import { buildPlayerPack } from '../../apps/web/src/pack/build.ts';
import { parseRich, richHtml } from '../../apps/web/src/workspace/journal/rich.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HIDDEN = 'cr_22222222-2222-4222-8222-222222222222';
const VISIBLE = 'cr_33333333-3333-4333-8333-333333333333';
const TOKEN = '[[' + HIDDEN + '|Hidden Label]]';
const MARKED = [
    '**See ' + TOKEN + '**',
    '- Item ' + TOKEN,
    '[Go ' + TOKEN + '](https://example.com/page)',
    '[Go](https://example.com/' + TOKEN + ')',
].join('\n');

const PAINT = {
    bg: 'black',
    surface: 'black',
    text: 'white',
    muted: 'silver',
    line: 'silver',
    signal: 'teal',
    onSignal: 'black',
};

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

test('a redacted mention inside bold, a link, and a list stays "a record"', () => {
    const redacted = redactPlayersText(MARKED, []);
    assert.equal(redacted.includes('Hidden Label'), false);
    assert.equal(redacted.includes(HIDDEN), false);
    const html = richHtml(parseRich(redacted));
    assert.match(html, /<strong>See a record<\/strong>/);
    assert.match(html, /<li>Item a record<\/li>/);
    assert.match(html, /<a href="https:\/\/example\.com\/page" target="_blank" rel="noopener noreferrer nofollow">Go a record<\/a>/);
    assert.equal(html.includes('Hidden Label'), false);
    assert.equal(html.includes('href="https://example.com/a record"'), false);
    assert.match(html, /\[Go\]\(https:\/\/example\.com\/a record\)/);
});

test('a players record inside bold keeps its current name', () => {
    const raw = '**See [[' + VISIBLE + '|Hidden Label]]**';
    const redacted = redactPlayersText(raw, [{ id: VISIBLE, name: 'Beowulf', deleted: false, visibility: 'players' }]);
    assert.equal(redacted, '**See Beowulf**');
    assert.match(richHtml(parseRich(redacted)), /<strong>See Beowulf<\/strong>/);
    const nodes = parseRich(raw, () => 'Beowulf');
    assert.equal(nodes[0].kind, 'bold');
    assert.equal(nodes[0].children[1].kind, 'record');
    assert.equal(nodes[0].children[1].label, 'Beowulf');
});

test('a referee block is a shaded passage, and an unclosed one is labelled', () => {
    const closed = parseRich('Before\n:::referee\nThe password is nightfall.\n:::\nAfter');
    assert.equal(closed[0].kind, 'text');
    assert.equal(closed[0].text, 'Before');
    assert.equal(closed[2].kind, 'referee');
    assert.equal(closed[2].closed, true);
    assert.match(richHtml([closed[2]]), /<aside class="rich-referee"><span class="rich-referee-label">Referee<\/span>/);
    assert.match(richHtml([closed[2]]), /The password is nightfall\./);
    const open = parseRich('Before\n:::referee\nThe password is nightfall.\nStill here');
    const block = open.find((node) => node.kind === 'referee');
    assert.ok(block && block.kind === 'referee');
    assert.equal(block.closed, false);
    assert.match(richHtml([block]), /Unclosed referee block/);
    assert.match(richHtml([block]), /Still here/);
    const inline = richHtml(parseRich('Say :::referee in a sentence.'));
    assert.match(inline, /Say :::referee in a sentence\./);
    assert.equal(inline.includes('<aside'), false);
    const nested = parseRich(':::referee\n:::referee\nsecret\n:::');
    assert.equal(nested[0].kind, 'referee');
    assert.equal(nested[0].closed, true);
    const inner = richHtml(nested[0].children);
    assert.match(inner, /:::referee/);
    assert.equal(inner.includes('<aside'), false);
});

test('a tag, a javascript address, an image, and an unclosed mark stay text', () => {
    const html = richHtml(parseRich('<script>alert(1)</script>\n[Click](javascript:alert(1))\n![Map](https://example.com/a.png)\n**no close\na_snake_case_name'));
    assert.equal(html.includes('<script'), false);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.equal(html.includes('href="javascript:'), false);
    assert.match(html, /\[Click\]\(javascript:alert\(1\)\)/);
    assert.equal(html.includes('<img'), false);
    assert.match(html, /!\[Map\]\(https:\/\/example\.com\/a\.png\)/);
    assert.match(html, /\*\*no close/);
    assert.match(html, /a_snake_case_name/);
    assert.equal(html.includes('<em>'), false);
});

test('the Player Pack renders details and the journal body, and leaves the summary plain', () => {
    const recordId = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const entryId = 'cj_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const record = {
        id: recordId,
        type: 'note',
        kind: 'note',
        name: 'Shown record',
        summary: '**stays stars**',
        details: MARKED,
        tags: [],
        anchor: null,
        when: null,
        visibility: 'players',
        playerNotes: '*notes stay plain*',
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: '2026-10-17T00:00:00.000Z',
        updatedAt: '2026-10-17T00:00:00.000Z',
        deleted: false,
    };
    const entry = {
        id: entryId,
        kind: 'note',
        title: 'Shown entry',
        body: MARKED,
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'players',
        anchor: null,
        mentions: [],
        images: null,
        rev: 1,
        createdAt: '2026-10-17T00:00:00.000Z',
        updatedAt: '2026-10-17T00:00:00.000Z',
        deleted: false,
    };
    const file = buildPlayerPack({
        name: 'Rich',
        clockDays: null,
        records: { [recordId]: record },
        links: {},
        journal: { [entryId]: entry },
        settings: null,
    }, PAINT);
    assert.equal(file.html.includes('Hidden Label'), false);
    assert.match(file.html, /<strong>See a record<\/strong>/);
    assert.match(file.html, /<li>Item a record<\/li>/);
    assert.match(file.html, /<a href="https:\/\/example\.com\/page" target="_blank" rel="noopener noreferrer nofollow">Go a record<\/a>/);
    assert.match(file.html, /\[Go\]\(https:\/\/example\.com\/a record\)/);
    assert.match(file.html, /<h3>Summary<\/h3><p>\*\*stays stars\*\*<\/p>/);
    assert.match(file.html, /<h3>For players<\/h3><p>\*notes stay plain\*<\/p>/);
    assert.equal(file.plan.counts.mentions >= 1, true);
    const detailsAt = file.html.indexOf('<h3>Details</h3>');
    const notesAt = file.html.indexOf('<h3>For players</h3>');
    const details = file.html.slice(detailsAt, notesAt);
    assert.match(details, /<strong>See a record<\/strong>/);
    const bodyAt = file.html.indexOf('<div class="body">');
    assert.match(file.html.slice(bodyAt, bodyAt + 800), /<li>Item a record<\/li>/);
});

test('details and the journal body use the renderer; the summary and player notes stay plain', () => {
    const page = read('apps/web/src/workspace/RecordPage.vue');
    const summary = page.slice(page.indexOf('ui-kicker">Summary'), page.indexOf('ui-kicker">Details'));
    const details = page.slice(page.indexOf('ui-kicker">Details'), page.indexOf('ui-kicker">For players'));
    const notes = page.slice(page.indexOf('ui-kicker">For players'), page.indexOf('ui-kicker">Tags'));
    assert.equal(/\brich\b/.test(summary), false);
    assert.match(details, /\brich\b/);
    assert.equal(/\brich\b/.test(notes), false);
    const journal = read('apps/web/src/workspace/journal/JournalBody.vue');
    const nodes = read('apps/web/src/workspace/journal/RichNodes.vue');
    assert.match(journal, /RichNodes/);
    assert.match(journal, /closest\('button, a'\)/);
    assert.equal(nodes.includes('v-html'), false);
    assert.equal(journal.includes('v-html'), false);
    assert.equal(read('apps/web/src/workspace/journal/rich.ts').includes('innerHTML'), false);
});
