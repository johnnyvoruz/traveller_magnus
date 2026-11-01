/**
 * AQ9. Hostile pastes through pastedBatch. The door already refuses a shape it
 * cannot read, and it does not throw. Cases the paste contract does not name
 * are left as the door answers them today.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBlock, pastedBatch } from '../../apps/web/src/campaign/proposals.ts';

const NOT_JSON = 'The ```json block is not valid JSON. Ask your AI to give the whole block again.';
const NO_BLOCK = 'No proposals found. Your AI\'s reply should end with one ```json block holding the batch.';
const ID = 'cr_00000000-0000-4000-8000-000000000001';
const FOREIGN = 'cr_00000000-0000-4000-8000-000000000099';

function protoNames() {
    return Object.getOwnPropertyNames(Object.prototype).sort().join('\n');
}

function fence(value) {
    return '```json\n' + (typeof value === 'string' ? value : JSON.stringify(value)) + '\n```';
}

function envelope(proposals) {
    return {
        format: 'voyage-proposals',
        schemaVersion: 1,
        idempotencyKey: 'abcdefghi',
        source: { kind: 'notes', label: 'n', realDate: null },
        proposals,
    };
}

const evidence = [{ at: '1', quote: 'Heard it.' }];

function update(id, baseRev = 1) {
    return { op: 'record.update', id, baseRev, append: { details: 'A note.' }, evidence };
}

function read(text) {
    const names = protoNames();
    const start = performance.now();
    const result = pastedBatch(text);
    const ms = performance.now() - start;
    assert.equal(protoNames(), names, 'the paste added no own property to Object.prototype');
    assert.equal(Object.prototype.polluted, undefined);
    return { result, ms };
}

function bestMs(text) {
    read(text);
    let best = Infinity;
    for (let i = 0; i < 3; i += 1) best = Math.min(best, read(text).ms);
    return best;
}

test('a thousand nested objects is a refusal, and so are prototype keys at every level', () => {
    const nest = '{"a":'.repeat(1000) + '1' + '}'.repeat(1000);
    const nested = read(nest);
    assert.equal(nested.result.ok, false);
    assert.equal(nested.result.code, 'invalid');
    assert.equal(nested.result.sentences[0], 'The batch: a field could not be read.');

    let deep = '1';
    for (let i = 0; i < 1000; i += 1) {
        deep = `{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"prototype":{"polluted":1},"n":${deep}}`;
    }
    const keyed = read(deep);
    assert.equal(keyed.result.ok, false);
    assert.equal(keyed.result.code, 'invalid');
    assert.equal(keyed.result.sentences[0], 'The batch: a field could not be read.');
    assert.ok(keyed.ms < 1000, `deep keys took ${keyed.ms} ms`);
});

test('a 10 MB paste answers in under a second', () => {
    const spaces = '{' + ' '.repeat(10 * 1024 * 1024);
    const spaced = read(spaces);
    assert.equal(spaced.result.ok, false);
    assert.equal(spaced.result.code, 'not_json');
    assert.deepEqual(spaced.result.sentences, [NOT_JSON]);
    assert.ok(bestMs(spaces) < 1000);

    const labelled = '{"format":"voyage-proposals","schemaVersion":1,"idempotencyKey":"abcdefghi","source":{"kind":"notes","label":"'
        + 'n'.repeat(10 * 1024 * 1024)
        + '","realDate":null},"proposals":[{"op":"question","text":"x","evidence":[{"at":"1","quote":"y"}]}]}';
    const huge = read(labelled);
    assert.equal(huge.result.ok, false);
    assert.equal(huge.result.code, 'invalid');
    assert.equal(huge.result.sentences[0], 'A batch is at most 256 KB.');
    assert.ok(bestMs(labelled) < 1000);

    const ticks = '`'.repeat(10 * 1024 * 1024);
    assert.equal(findBlock(ticks), null);
    const bare = read(ticks);
    assert.equal(bare.result.ok, false);
    assert.equal(bare.result.code, 'no_block');
    assert.deepEqual(bare.result.sentences, [NO_BLOCK]);
    assert.ok(bestMs(ticks) < 1000);
});

test('ten thousand proposals, and 201, are refused', () => {
    const one = '{"op":"question","text":"x","evidence":[{"at":"1","quote":"y"}]}';
    const many = `{"format":"voyage-proposals","schemaVersion":1,"idempotencyKey":"abcdefghi","source":{"kind":"notes","label":"n","realDate":null},"proposals":[${Array.from({ length: 10000 }, () => one).join(',')}]}`;
    const ten = read(many);
    assert.equal(ten.result.ok, false);
    assert.equal(ten.result.code, 'invalid');
    assert.equal(ten.result.sentences[0], 'A batch holds at most 200 proposals.');
    assert.ok(ten.ms < 1000, `10_000 proposals took ${ten.ms} ms`);

    const over = read(fence(envelope(Array.from({ length: 201 }, () => ({ op: 'question', text: 'x', evidence })))));
    assert.equal(over.result.ok, false);
    assert.equal(over.result.code, 'invalid');
    assert.equal(over.result.sentences[0], 'A batch holds at most 200 proposals.');
});

test('a number where a string belongs, and a string where a number belongs, use the paste sentences', () => {
    const rev = read(fence(envelope([update(ID, '1')])));
    assert.equal(rev.result.ok, false);
    assert.equal(rev.result.sentences[0], 'Proposal 1 (record.update): baseRev has the wrong type of value.');
    const text = read(fence(envelope([{ op: 'question', text: 12, evidence }])));
    assert.equal(text.result.ok, false);
    assert.equal(text.result.sentences[0], 'Proposal 1 (question): text has the wrong type of value.');
});

test('a repeated record id, an id from outside this campaign, and odd characters in a name stay as the door reads them', () => {
    const dup = read(fence(envelope([update(ID), update(ID)])));
    assert.equal(dup.result.ok, true);
    assert.equal(dup.result.counts['record.update'], 2);

    const foreign = read(fence(envelope([update(FOREIGN)])));
    assert.equal(foreign.result.ok, true);
    assert.equal(foreign.result.counts['record.update'], 1);

    const record = (name) => ({
        op: 'record.create',
        ref: 'ada',
        evidence,
        record: { type: 'person', kind: '', name, summary: '', details: '', tags: [], anchor: null },
    });
    for (const name of ['Ada\u200bLane', 'Ada\u202eLane', 'Ada\u0001Lane']) {
        const found = read(fence(envelope([record(name)])));
        assert.equal(found.result.ok, true, name);
        assert.equal(found.result.batch.proposals[0].record.name, name);
    }

    const raw = read('```json\n{"name":"Ada\u0001"}\n```');
    assert.equal(raw.result.ok, false);
    assert.equal(raw.result.code, 'not_json');
    assert.deepEqual(raw.result.sentences, [NOT_JSON]);
});
