import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkAllowed } from '@voyage/shared';
import { parseExport } from '../../apps/web/src/campaign/import.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SLUGS = ['free-traders-of-the-marches', 'the-glass-hand'];
/** Absent on CI. EXAMPLE_PACKS_TRUTH_SECTORS points the chart check at another folder. */
const SECTORS = process.env.EXAMPLE_PACKS_TRUTH_SECTORS || join(ROOT, 'truth-local/v10/sectors');
const chartHere = existsSync(SECTORS);

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function hexExists(hexKey) {
    const slash = hexKey.indexOf('/');
    const sector = hexKey.slice(0, slash);
    const hex = hexKey.slice(slash + 1);
    const file = join(SECTORS, sector, 'index.json');
    const data = readJson(file);
    const row = data.hexes[hex];
    return !!row && row.type === 'SYSTEM_PRESENT';
}

for (const slug of SLUGS) {
    test(`${slug} parses and links both ends`, () => {
        const dir = join(ROOT, 'tools/examples/packs', slug);
        const listing = readJson(join(dir, 'listing.json'));
        assert.equal(typeof listing.title, 'string');
        assert.equal(typeof listing.kind, 'string');
        assert.equal(typeof listing.description, 'string');
        assert.ok(Array.isArray(listing.tags));
        assert.ok(listing.tags.length >= 3 && listing.tags.length <= 5);
        assert.ok(listing.tags.includes('example'));
        const sentences = listing.description.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
        assert.ok(sentences.length >= 2 && sentences.length <= 3);

        const text = readFileSync(join(dir, 'campaign.json'), 'utf8');
        const parsed = parseExport(text);
        assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
        assert.deepEqual(parsed.document.journal, []);
        assert.equal(parsed.document.universe.truthVersion, 'v10');

        const byId = new Map(parsed.document.records.map((row) => [row.id, row]));
        assert.equal(byId.size, parsed.document.records.length);
        for (const row of parsed.document.records) {
            assert.equal(row.sheet, null);
            assert.equal(row.status, null);
            assert.equal(row.deleted, false);
            assert.ok(row.anchor && row.anchor.kind === 'system');
            const sentencesInSummary = row.summary.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
            assert.equal(sentencesInSummary.length, 1, row.name);
            const words = row.details.trim().split(/\s+/).filter(Boolean);
            assert.ok(words.length <= 120, `${row.name} ${words.length}`);
        }
        const linkIds = new Set();
        for (const row of parsed.document.links) {
            assert.equal(linkIds.has(row.id), false);
            linkIds.add(row.id);
            const from = byId.get(row.from);
            const to = byId.get(row.to);
            assert.ok(from, row.from);
            assert.ok(to, row.to);
            assert.equal(linkAllowed(row.kind, from.type, to.type), true, `${row.kind} ${from.type} ${to.type}`);
        }
    });
}

test('example pack anchors sit on the v10 chart', { skip: chartHere ? false : 'truth-local/v10 is not in this checkout' }, () => {
    for (const slug of SLUGS) {
        const text = readFileSync(join(ROOT, 'tools/examples/packs', slug, 'campaign.json'), 'utf8');
        const parsed = parseExport(text);
        assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
        for (const row of parsed.document.records) {
            assert.equal(hexExists(row.anchor.hexKey), true, row.anchor.hexKey);
        }
    }
});

test('the five ships each have a captain, two or three crew, and one hook', () => {
    const text = readFileSync(join(ROOT, 'tools/examples/packs/free-traders-of-the-marches/campaign.json'), 'utf8');
    const parsed = parseExport(text);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
    const records = parsed.document.records;
    const links = parsed.document.links;
    const vessels = records.filter((row) => row.type === 'vessel');
    assert.equal(vessels.length, 5);
    const home = new Set();
    for (const vessel of vessels) {
        home.add(vessel.anchor.hexKey);
        const commands = links.filter((row) => row.kind === 'commands' && row.to === vessel.id && row.visibility === 'players');
        const crew = links.filter((row) => row.kind === 'crew' && row.to === vessel.id);
        assert.equal(commands.length, 1, vessel.name);
        assert.ok(crew.length >= 2 && crew.length <= 3, vessel.name);
        assert.equal(vessel.status, null);
    }
    assert.equal(home.size, 5);
    const hooks = records.filter((row) => row.type === 'note' || row.type === 'item' || (row.type === 'person' && row.visibility === 'referee'));
    assert.equal(hooks.length, 5);
});

test('the Glass Hand has a leader, members, places and three rumours', () => {
    const text = readFileSync(join(ROOT, 'tools/examples/packs/the-glass-hand/campaign.json'), 'utf8');
    const parsed = parseExport(text);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
    const records = parsed.document.records;
    const links = parsed.document.links;
    const orgs = records.filter((row) => row.type === 'organization');
    assert.equal(orgs.length, 1);
    const members = links.filter((row) => row.kind === 'member' && row.to === orgs[0].id);
    assert.ok(members.length >= 5 && members.length <= 7);
    const commands = links.filter((row) => row.kind === 'commands' && row.to === orgs[0].id);
    assert.equal(commands.length, 1);
    const places = records.filter((row) => row.type === 'place');
    const notes = records.filter((row) => row.type === 'note');
    assert.ok(places.length >= 2 && places.length <= 3);
    assert.equal(notes.length, 3);
    const systems = new Set(records.map((row) => row.anchor.hexKey));
    assert.ok(systems.size >= 3 && systems.size <= 4);
});

test('no record name appears in more than one example pack', () => {
    const root = join(ROOT, 'tools/examples/packs');
    const seen = new Map();
    for (const slug of readdirSync(root)) {
        const file = join(root, slug, 'campaign.json');
        const parsed = parseExport(readFileSync(file, 'utf8'));
        assert.equal(parsed.ok, true, parsed.ok ? slug : `${slug}: ${parsed.message}`);
        for (const row of parsed.document.records) {
            const key = row.name.trim().toLowerCase();
            const prior = seen.get(key);
            assert.equal(prior, undefined, `${row.name} is in ${prior} and ${slug}`);
            seen.set(key, slug);
        }
    }
});
