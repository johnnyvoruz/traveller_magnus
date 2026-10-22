import assert from 'node:assert/strict';
import test from 'node:test';
import { changesFrom, loadExample, readExample, sameCampaign } from '../../tools/demo/seed_example.mjs';

const where = 'tools/demo/example_campaign.json';

test('the example file is a players campaign with no referee field', () => {
    const page = readExample();
    assert.equal(page.records.length > 0, true);
    assert.equal(page.journal.length, 6);
    const changes = changesFrom(page);
    assert.equal(changes.records.every((row) => row.baseRev === 0), true);
    assert.equal(changes.links.every((row) => row.baseRev === 0), true);
    assert.equal(changes.journal.every((row) => row.baseRev === 0), true);
    assert.equal(changes.settings.baseRev, 0);
    assert.equal(changes.clock.baseRev, 0);
    assert.equal(changes.clock.days, page.clock.days);
    assert.equal(sameCampaign(page, page), true);
});

test('a referee row, a provenance, a fuel mark, or a referee note is refused', () => {
    const page = readExample();
    const hidden = structuredClone(page);
    hidden.records[0].visibility = 'referee';
    assert.throws(() => loadExample(JSON.stringify(hidden), where), /not visible to players/);
    const copied = structuredClone(page);
    copied.records[0].provenance = { mode: 'copy', universeId: 'other', recordId: 'cr_x', rev: 1, at: '2026-10-18T00:00:00.000Z' };
    assert.throws(() => loadExample(JSON.stringify(copied), where), /provenance/);
    const marked = structuredClone(page);
    marked.records[0].status = { ...marked.records[0].status, fuelMark: 'naval' };
    assert.throws(() => loadExample(JSON.stringify(marked), where), /fuelMark/);
    const noted = structuredClone(page);
    noted.journal[0].body += '\n:::referee\nA note.\n:::';
    assert.throws(() => loadExample(JSON.stringify(noted), where), /referee note/);
});
