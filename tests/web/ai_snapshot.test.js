import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiSnapshot, aiSnapshotFileName, aiSnapshotSize } from '../../apps/web/src/campaign/ai_snapshot.ts';
import { pastedBatch } from '../../apps/web/src/campaign/proposals.ts';

const contracts = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/ai_snapshot');

function read(name) {
    return readFileSync(join(contracts, name), 'utf8');
}

const fixture = JSON.parse(read('ai_snapshot_fixture.json'));
const cases = JSON.parse(read('ai_paste_cases.json'));
const WARNING = 'This is more than many AIs can read at once. Choose fewer parts, or turn on Agent access and let your AI read the campaign itself.';

function textFor(parts) {
    return aiSnapshot(fixture.campaign, { ...fixture.options, parts });
}

test('the fixture text matches, part by part and all together', () => {
    const all = textFor('all');
    assert.equal(all, read(fixture.texts.all));
    for (const part of ['ships', 'characters', 'records', 'journal']) {
        assert.equal(textFor([part]), read(fixture.texts[part]));
    }
    assert.equal(all, textFor(['journal', 'ships', 'records', 'characters']));
    assert.equal(all.endsWith('\n'), true);
    assert.equal(all.endsWith('\n\n'), false);
});

test('the copy carries no token, no image key, no snapshot, and no deleted name', () => {
    for (const parts of ['all', ['ships'], ['characters'], ['records'], ['journal']]) {
        const text = textFor(parts);
        assert.equal(text.includes('Bearer $VOYAGE_TOKEN'), true);
        assert.equal(/Bearer (?!\$VOYAGE_TOKEN)\S+/.test(text), false);
        assert.equal(text.includes('"images"'), false);
        assert.equal(/snapshot/i.test(text), false);
        assert.equal(text.includes('Old Name'), false);
    }
});

test('the file name is the campaign, lower case, or campaign when nothing remains', () => {
    assert.equal(aiSnapshotFileName('The Efate Run'), 'the-efate-run-for-your-ai.md');
    assert.equal(aiSnapshotFileName('***'), 'campaign-for-your-ai.md');
});

test('the size estimates tokens and warns past 150,000', () => {
    const small = aiSnapshotSize('abcd');
    assert.deepEqual(small, { characters: 4, tokens: 1, warning: null });
    const heavy = aiSnapshotSize('x'.repeat(600002));
    assert.equal(heavy.tokens, 150001);
    assert.equal(heavy.warning, WARNING);
});

test('a pasted reply matches the paste cases', () => {
    for (const item of cases) {
        const found = pastedBatch(item.text);
        if (item.expect.ok) {
            assert.equal(found.ok, true, item.name);
            assert.equal(found.from, item.expect.from, item.name);
            assert.deepEqual(found.counts, item.expect.counts, item.name);
        } else {
            assert.equal(found.ok, false, item.name);
            assert.equal(found.code, item.expect.code, item.name);
            assert.deepEqual(found.problems, item.expect.problems, item.name);
            assert.deepEqual(found.sentences, item.expect.sentences, item.name);
            const said = found.sentences.join('\n');
            assert.equal(/Invalid |Expected |received /.test(said), false, item.name);
        }
    }
});

test('a missing field and an unknown record type are plain sentences', () => {
    const evidence = [{ at: '00:01:00', quote: 'A person at the table.' }];
    const envelope = (proposal) => '```json\n' + JSON.stringify({
        format: 'voyage-proposals',
        schemaVersion: 1,
        idempotencyKey: '7d2f1c4e-5b3a-4c9e-9f0a-1b2c3d4e5f60',
        source: { kind: 'transcript', label: 'Session 12', realDate: '2026-10-16' },
        proposals: [proposal],
    }) + '\n```';
    const record = { type: 'person', kind: '', name: 'Ada', summary: '', details: '', tags: [], anchor: null };
    const missing = pastedBatch(envelope({ op: 'record.create', ref: 'ada', record: { ...record, name: undefined }, evidence }));
    assert.equal(missing.ok, false);
    assert.match(missing.sentences[0], /Proposal 1 \(record\.create\): record\.name is missing\./);
    const unknown = pastedBatch(envelope({ op: 'record.create', ref: 'ada', record: { ...record, type: 'starship' }, evidence }));
    assert.equal(unknown.ok, false);
    assert.match(unknown.sentences[0], /the record type is not one this campaign has/);
    const said = missing.sentences.concat(unknown.sentences).join('\n');
    assert.equal(said.includes('Required'), false);
    assert.equal(said.includes('Invalid enum'), false);
});
