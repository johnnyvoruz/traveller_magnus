import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { linkAllowed } from '@voyage/shared';
import { parseExport } from '../../apps/web/src/campaign/import.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHART_SKIP = 'truth-local/v10 is not in this checkout';
/** Set to a missing folder to prove the chart skip without moving truth-local/. */
const sectorsDir = process.env.VOYAGE_TRUTH_SECTORS || path.join(root, 'truth-local/v10/sectors');
const chartSkip = fs.existsSync(sectorsDir) ? false : CHART_SKIP;

function load(slug) {
    const dir = path.join(root, 'tools/examples/packs', slug);
    const text = fs.readFileSync(path.join(dir, 'campaign.json'), 'utf8');
    const listing = JSON.parse(fs.readFileSync(path.join(dir, 'listing.json'), 'utf8'));
    return { text, listing };
}

function words(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function accept(slug) {
    const { text, listing } = load(slug);
    const parsed = parseExport(text);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
    const doc = parsed.document;
    assert.equal(doc.journal.length, 0);
    assert.equal(doc.universe.truthVersion, 'v10');
    assert.equal(doc.clock, null);
    assert.deepEqual(listing.tags.includes('example'), true);
    assert.equal(listing.tags.length >= 3 && listing.tags.length <= 5, true);
    const ids = new Set(doc.records.map((row) => row.id));
    assert.equal(ids.size, doc.records.length);
    for (const row of doc.records) {
        assert.equal(row.sheet, null);
        assert.equal(words(row.details) <= 120, true, row.name);
        assert.equal((row.summary.match(/\./g) || []).length, 1, row.name);
        assert.equal(row.anchor && row.anchor.kind, 'system', row.name);
        assert.equal(typeof row.anchor.hexKey, 'string', row.name);
    }
    for (const row of doc.links) {
        assert.equal(ids.has(row.from), true, row.id);
        assert.equal(ids.has(row.to), true, row.id);
        const from = doc.records.find((item) => item.id === row.from);
        const to = doc.records.find((item) => item.id === row.to);
        assert.equal(linkAllowed(row.kind, from.type, to.type), true, row.kind + ' ' + from.type + ' ' + to.type);
    }
    return doc;
}

test('regina-highport-contacts parses and stays on Regina', () => {
    const { listing } = load('regina-highport-contacts');
    assert.equal(listing.kind, 'people');
    assert.equal(listing.tags.includes('Regina'), true);
    const doc = accept('regina-highport-contacts');
    const types = doc.records.map((row) => row.type);
    assert.equal(types.filter((type) => type === 'person').length, 8);
    assert.equal(types.filter((type) => type === 'business').length, 3);
    assert.equal(types.filter((type) => type === 'place').length, 2);
    assert.deepEqual(new Set(doc.records.map((row) => row.anchor.hexKey)), new Set(['Spinward_Marches/1910']));
    const seen = new Set(doc.records.map((row) => row.visibility));
    assert.equal(seen.has('players') && seen.has('referee'), true);
});

test('jewell-patrons parses across charted Jewell worlds', () => {
    const { listing } = load('jewell-patrons');
    assert.equal(listing.kind, 'patrons');
    assert.equal(listing.tags.includes('Jewell'), true);
    const doc = accept('jewell-patrons');
    const jobs = doc.records.filter((row) => row.type === 'job');
    const patrons = doc.links.filter((row) => row.kind === 'patron');
    assert.equal(jobs.length, 6);
    assert.equal(patrons.length, 6);
    assert.equal(doc.records.filter((row) => row.type === 'event').length, 2);
    const hexes = new Set(jobs.map((row) => row.anchor.hexKey));
    assert.equal(hexes.size >= 4 && hexes.size <= 6, true);
    for (const job of jobs) assert.match(job.details, /Pay: the referee's call/);
});

test('example pack anchors are on the v10 chart', { skip: chartSkip }, () => {
    const indexes = new Map();
    function present(hexKey) {
        const slash = hexKey.lastIndexOf('/');
        const sector = hexKey.slice(0, slash);
        const local = hexKey.slice(slash + 1);
        if (!indexes.has(sector)) {
            const file = path.join(sectorsDir, sector, 'index.json');
            indexes.set(sector, JSON.parse(fs.readFileSync(file, 'utf8')));
        }
        const world = indexes.get(sector).hexes[local];
        assert.equal(world && world.type, 'SYSTEM_PRESENT', hexKey);
    }
    for (const slug of ['regina-highport-contacts', 'jewell-patrons']) {
        const parsed = parseExport(load(slug).text);
        assert.equal(parsed.ok, true);
        for (const row of parsed.document.records) present(row.anchor.hexKey);
    }
});
