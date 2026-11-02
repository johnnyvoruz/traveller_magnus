/**
 * ZS2 round 1: what hostile text can do when it is drawn (findings/zs2_content.md).
 * Pure: the parser, its HTML writer, the Player Pack, and the two fence readers side by side.
 * A test marked `todo` proves an open finding: it fails today, and the fix drops `todo`.
 * A referee-only string starts with ZREF_.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stripRefereeBlocks } from '../../packages/shared/src/players_view.ts';
import { asciiName } from '../../apps/web/src/capture/paper.ts';
import { renderPack } from '../../apps/web/src/pack/html.ts';
import { parseRich, richHtml } from '../../apps/web/src/workspace/journal/rich.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ID = 'cr_22222222-2222-4222-8222-222222222222';

const HOSTILE = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '"><script>alert(1)</script>',
    '\'><iframe src=javascript:alert(1)>',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '&#60;img src=x onerror=alert(1)&#62;',
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x]( javascript:alert(1))',
    '[x](java\tscript:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
    '[x](vbscript:msgbox(1))',
    '[x](file:///etc/passwd)',
    '[x](//evil.example)',
    '[x](/relative)',
    '[x](https://ok.example/"onmouseover="alert(1))',
    '[x](https://ok.example/\'onmouseover=\'alert(1))',
    '[<b onclick=alert(1)>x</b>](https://ok.example/)',
    `**<b>[[${ID}|<img src=x onerror=alert(1)>]]</b>**`,
    `[[${ID}|"><script>alert(1)</script>]]`,
    '[[hex:<script>/1910|x]]',
    '- <li onclick=alert(1)>',
    ':::referee\n<script>alert(1)</script>\n:::',
    ':::referee\n[x](javascript:alert(1))',
    '![x](https://ok.example/a.png)',
];

/** Every tag the writer may put out, and every attribute on it. */
const TAGS = new Set(['strong', 'em', 'a', 'ul', 'li', 'br', 'aside', 'span']);
const ATTRS = new Set(['href', 'target', 'rel', 'class']);

function tagsIn(html) {
    return [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>"]|"[^"]*")*)>/g)];
}

function links(nodes, out = []) {
    for (const node of nodes) {
        if (node.kind === 'link') out.push(node.href);
        for (const child of node.children ?? []) links([child], out);
        for (const item of node.items ?? []) links(item, out);
    }
    return out;
}

function words(nodes, keepReferee) {
    let out = '';
    for (const node of nodes) {
        if (node.kind === 'referee' && !keepReferee) continue;
        if (typeof node.text === 'string') out += node.text;
        if (typeof node.label === 'string') out += node.label;
        if (node.children) out += words(node.children, keepReferee);
        for (const item of node.items ?? []) out += words(item, keepReferee);
    }
    return out;
}

function sourceFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) sourceFiles(full, out);
        else if (/\.(vue|ts)$/.test(name)) out.push(full);
    }
    return out;
}

test('ZS2: no screen assigns HTML from text', () => {
    const found = sourceFiles(path.join(root, 'apps/web/src')).filter((file) => {
        if (file.includes(`${path.sep}dev${path.sep}`)) return false;
        return /v-html|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|srcdoc/.test(readFileSync(file, 'utf8'));
    });
    assert.deepEqual(found, []);
});

test('ZS2: a link is http or https, or it stays text', () => {
    for (const text of HOSTILE) {
        for (const href of links(parseRich(text))) {
            assert.match(href, /^https?:\/\//, text);
            assert.equal(/["'<>\s]/.test(href), false, `${text} -> ${href}`);
        }
    }
});

test('ZS2: the HTML writer puts out only its own tags and attributes', () => {
    for (const text of HOSTILE) {
        const html = richHtml(parseRich(text, () => null));
        for (const tag of tagsIn(html)) {
            assert.equal(TAGS.has(tag[1].toLowerCase()), true, `${text} -> ${tag[0]}`);
            for (const attr of (tag[2] ?? '').replace(/"[^"]*"/g, '""').matchAll(/([^\s=/]+)=/g)) {
                assert.equal(ATTRS.has(attr[1].toLowerCase()), true, `${text} -> ${tag[0]}`);
            }
        }
    }
});

test('ZS2: the Player Pack holds one script, its own, whatever a name says', () => {
    const bad = '</title></style></script><script>alert(1)</script><img src=x onerror=alert(1)>"\'';
    const html = renderPack({
        name: bad,
        clockLabel: bad,
        noDate: false,
        counts: { recordsLeftOut: 0, entriesLeftOut: 0, linksLeftOut: 0, linkTextLeftOff: 0, mentions: 0, places: 0, partyMembers: 0, ship: 0, timeline: 0 },
        party: { members: [{ id: bad, name: bad }], ships: [{ id: bad, name: bad, aboard: [{ id: bad, name: bad }] }], ashore: [{ id: bad, name: bad }] },
        timeline: [{ id: bad, date: bad, weekday: bad, title: bad, kind: bad, place: bad }],
        records: [{ id: bad, type: 'person', typeName: bad, kind: bad, name: bad, summary: bad, details: bad, tags: [bad], when: bad, place: bad, playerNotes: bad, sheet: bad, status: bad }],
        entries: [{ id: bad, kind: 'note', kindName: bad, title: bad, body: bad, when: bad, played: bad, author: bad, place: bad }],
        links: [{ fromId: bad, toId: bad, fromName: bad, toName: bad, kind: bad }],
    }, { bg: 'black', text: 'white', signal: 'red', line: 'gray', muted: 'gray', surface: 'black', onSignal: 'white' });
    assert.equal(html.match(/<script/gi).length, 1);
    assert.equal(/<img/i.test(html), false);
    assert.equal(html.match(/<\/title>/gi).length, 1);
    assert.equal(html.match(/<\/style>/gi).length, 1);
    assert.equal(html.includes('<script>alert(1)'), false);
});

test('ZS2: the fence reader in the view and the one in the players projection agree', () => {
    const cases = [
        'Open.\n:::referee\nZREF_a\n:::\nStill.',
        'Open.\r\n:::referee\r\nZREF_a\r\n:::\r\nStill.',
        'Open.\r:::referee\rZREF_a\r:::\rStill.',
        'Open.\n:::referee\nZREF_a',
        'Open.\n:::referee\n:::referee\nZREF_a\n:::\nStill.\n:::',
        'Open.\n:::referee\nZREF_a\n:::\n:::referee\nZREF_b\n:::\nStill.',
        'Open.\n  :::referee  \nZREF_a\n\t:::\t\nStill.',
        'Open.\n :::referee \nZREF_a\n :::\nStill.',
        '﻿:::referee\nZREF_a\n:::\nStill.',
        ' :::referee\nZREF_a\n :::\nStill.',
        'Code `:::referee` stays.\n`:::`\nStill.',
        '`\n:::referee\nZREF_a\n:::\n`',
        '- :::referee\nStill.\n:::',
        '&#58;&#58;&#58;referee\nStill.',
        ':::referee extra\nStill.\n:::',
        ':::\nStill.\n:::',
        ':::referee\n:::',
        ':::referee',
        `:::referee\n[[${ID}|ZREF_a]]\n:::\nStill.`,
    ];
    const bare = (text) => text.replace(/\s/g, '');
    for (const text of cases) {
        assert.equal(bare(words(parseRich(stripRefereeBlocks(text)), false)), bare(words(parseRich(text), false)), JSON.stringify(text));
        if (text.includes('ZREF_')) assert.equal(stripRefereeBlocks(text).includes('ZREF_'), false, JSON.stringify(text));
    }
});

test('ZS2 FINDING: a fence with a zero-width or bidi character on its line still hides the passage', () => {
    const bare = (text) => text.replace(/\s/g, '');
    const agree = (text, label) => {
        assert.equal(stripRefereeBlocks(text).includes('ZREF_zero'), false, label);
        assert.equal(bare(words(parseRich(stripRefereeBlocks(text)), false)), bare(words(parseRich(text), false)), label);
        const html = richHtml(parseRich(text));
        assert.equal(html.includes('rich-referee'), true, label);
        assert.equal(html.includes('ZREF_zero'), true, label);
    };
    for (const mark of ['​', '‌', '‍', '‎', '‏', '⁠', '‮']) {
        agree(`${mark}:::referee\nZREF_zero\n${mark}:::\nStill.`, `U+${mark.codePointAt(0).toString(16)}`);
    }
    for (const code of [0x202A, 0x202B, 0x202C, 0x202D, 0x2066, 0x2067, 0x2068, 0x2069, 0xFEFF, 0x00AD]) {
        const mark = String.fromCodePoint(code);
        agree(`${mark}:::ref${mark}eree\nZREF_zero\n:::${mark}\nStill.`, `U+${code.toString(16)}`);
    }
});

test('ZS2 SECURITY: a line of brackets does not stall the journal', () => {
    const text = '['.repeat(100_000);
    const started = performance.now();
    const html = richHtml(parseRich(text));
    const spent = performance.now() - started;
    assert.equal(html, text);
    assert.equal(spent < 1000, true, `${Math.round(spent)} ms for 100,000 characters`);
});

test('ZS2: stars and long plain text stay quick at the size of a body', () => {
    for (const text of ['*a '.repeat(33000), '** '.repeat(33000), '*'.repeat(100000), 'x'.repeat(100000), '- x\n'.repeat(25000)]) {
        const started = performance.now();
        parseRich(text);
        const spent = performance.now() - started;
        assert.equal(spent < 2000, true, `${Math.round(spent)} ms`);
    }
});

test('ZS2: a Save image name holds no path, no control character, and no reserved character', () => {
    for (const name of ['../../evil', '..\\..\\evil', 'a\r\nb', 'x<y>:"|?*', 'con\u0000.png', '‮gnp.exe', '   ']) {
        const out = asciiName(name);
        assert.equal(/[\\/:*?"<>|\u0000-\u001f\u007f-￿]/.test(out), false, out);
        assert.equal(out.length > 0, true);
    }
});
