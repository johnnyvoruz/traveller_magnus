/**
 * ZS2 round 2: the paste door in the browser (findings/zs2_content.md). Pure: `pastedBatch`.
 * The answer to any hostile paste is a refusal in a sentence, or a batch the schema accepts.
 * It never throws, never stalls, and never changes a prototype.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { pastedBatch } from '../../apps/web/src/campaign/proposals.ts';

const evidence = [{ at: '00:01', quote: 'Heard at the table.' }];
const record = { type: 'person', kind: '', name: 'Ada', summary: '', details: '', tags: [] };

function batch(proposals, over = {}) {
    return { format: 'voyage-proposals', schemaVersion: 1, idempotencyKey: 'zs2-paste-001', source: { kind: 'notes', label: 'ZS2', realDate: null }, proposals, ...over };
}

function fenced(text) {
    return '```json\n' + text + '\n```';
}

function quick(text) {
    const started = performance.now();
    const out = pastedBatch(text);
    assert.equal(performance.now() - started < 3000, true);
    return out;
}

function refused(out) {
    assert.equal(out.ok, false);
    assert.equal(out.sentences.length > 0, true);
}

test('ZS2: size and depth are refused in a sentence', () => {
    refused(quick(fenced('{"a":"' + 'x'.repeat(10_000_000) + '"}')));
    refused(quick(fenced('['.repeat(200000) + ']'.repeat(200000))));
    refused(quick(fenced('{"a":'.repeat(200000) + '1' + '}'.repeat(200000))));
    refused(quick('['.repeat(2_000_000)));
    refused(quick('```json\n'.repeat(200000)));
    refused(quick('{' + '"a":1,'.repeat(500000)));
    const deep = '['.repeat(100000) + ']'.repeat(100000);
    refused(quick(fenced(JSON.stringify(batch([{ op: 'record.create', ref: 'a', record: 'DEEP', evidence }])).replace('"DEEP"', deep))));
});

test('ZS2: __proto__ and constructor keys change no prototype and reach no batch', () => {
    const good = JSON.stringify(batch([{ op: 'record.create', ref: 'ada', record, evidence }]));
    const texts = [
        '{"__proto__":{"zs2":1}}',
        good.replace('"name":"Ada"', '"name":"Ada","__proto__":{"zs2":1}'),
        good.replace('"name":"Ada"', '"name":"Ada","constructor":{"prototype":{"zs2":1}}'),
        good.replace('"proposals"', '"__proto__":{"zs2":1},"proposals"'),
    ];
    for (const text of texts) {
        const out = pastedBatch(fenced(text));
        assert.equal({}.zs2, undefined);
        assert.equal(Object.prototype.zs2, undefined);
        if (out.ok) assert.equal(JSON.stringify(out.batch).includes('zs2'), false);
    }
});

test('ZS2: a field the operation does not name is refused, so a paste cannot set who sees a record', () => {
    for (const extra of [{ visibility: 'players' }, { id: 'cr_22222222-2222-4222-8222-222222222222' }, { images: [] }, { sheet: {} }, { rev: 9 }]) {
        refused(pastedBatch(fenced(JSON.stringify(batch([{ op: 'record.create', ref: 'ada', record: { ...record, ...extra }, evidence }])))));
    }
});

test('ZS2: a number written as a string, or the reverse, is refused', () => {
    refused(pastedBatch(fenced(JSON.stringify(batch([], { schemaVersion: '1' })))));
    refused(pastedBatch(fenced(JSON.stringify(batch([{ op: 'record.create', ref: 7, record, evidence }])))));
    refused(pastedBatch(fenced(JSON.stringify(batch([{ op: 'record.create', ref: 'ada', record: { ...record, name: 7 }, evidence }])))));
});

test('ZS2: a refused paste is plain strings: the sentence may quote the op, and a screen draws it as text', () => {
    const out = pastedBatch(fenced(JSON.stringify(batch([{ op: '<img src=x onerror=alert(1)>', ref: '<b>', evidence }]))));
    refused(out);
    for (const line of out.sentences) assert.equal(typeof line, 'string');
});
