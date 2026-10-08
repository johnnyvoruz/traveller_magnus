/**
 * A person's page and a Character (apps/web/src/workspace/person_character.ts;
 * directives/character_mvp.md "In a universe" and "D, Part 2"): the record's sheet as a
 * reference, the frozen copy a detach leaves, presence as the sheet takes it, and the seam
 * the Characters store fills.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { characterDoc, otherKeys } from '../../apps/web/src/workspace/character_sheet.ts';
import {
    attachedSheet, characterIdOf, characterSource, detachedSheet, lastSeenFields, ownerWords, presenceMap, setCharacterSource, statusWords,
} from '../../apps/web/src/workspace/person_character.ts';

const tone = (colour) => '--tone-' + colour;

test('a record refers to a Character by id; a plain sheet, a free-form one and none do not', () => {
    assert.equal(characterIdOf({ schema: 'mgt2e_character@1', characterId: 'ch_1' }), 'ch_1');
    assert.equal(characterIdOf({ schema: 'mgt2e_character@1', fields: { Name: 'x' } }), null);
    assert.equal(characterIdOf({ schema: 'something@1', characterId: 'ch_1' }), null);
    assert.equal(characterIdOf({ characterId: '' }), null);
    assert.equal(characterIdOf(null), null);
    assert.equal(characterIdOf('ch_1'), null);
});

test('attaching replaces the record’s own boxes with the reference and keeps whatever else the sheet held', () => {
    const before = { schema: 'mgt2e_character@1', fields: { Name: 'old' }, homeworld: { slug: 's', hex: '1910', name: 'Regina' }, notes: 'free-form' };
    const sheet = attachedSheet(before, 'ch_9');
    assert.deepEqual(sheet, { schema: 'mgt2e_character@1', characterId: 'ch_9', homeworld: before.homeworld, notes: 'free-form' });
    assert.deepEqual(before.fields, { Name: 'old' }, 'the record it was made from is not changed');
    assert.deepEqual(attachedSheet(null, 'ch_9'), { schema: 'mgt2e_character@1', characterId: 'ch_9' });
    assert.deepEqual(otherKeys(sheet), { notes: 'free-form' }, 'the reference is not shown as a free-form key');
});

test('detaching writes the boxes as they stand into the record and drops the reference: a plain sheet again', () => {
    const attached = { schema: 'mgt2e_character@1', characterId: 'ch_9', homeworld: { slug: 's', hex: '1910', name: 'Regina' } };
    const sheet = detachedSheet(attached, { Name: 'Marc Hault', Strength: '7', 'Career Survival 1': true, Traits: '', 'Career Advancement 1': false, odd: 3 });
    assert.deepEqual(sheet, { schema: 'mgt2e_character@1', homeworld: attached.homeworld, fields: { Name: 'Marc Hault', Strength: '7', 'Career Survival 1': true } });
    assert.equal(characterIdOf(sheet), null);
    assert.deepEqual(characterDoc(sheet).fields, { Name: 'Marc Hault', Strength: '7', 'Career Survival 1': true });
    // Nothing was ever seen of it (no handle): an empty plain sheet, never a dangling reference.
    assert.deepEqual(detachedSheet(attached, lastSeenFields(null)), { schema: 'mgt2e_character@1', homeworld: attached.homeworld, fields: {} });
});

test('detaching a Character that can no longer be reached keeps the last boxes seen as the frozen copy, not an empty sheet', () => {
    const attached = { schema: 'mgt2e_character@1', characterId: 'ch_9' };
    for (const status of ['gone', 'offline', 'connecting', 'live']) {
        const handle = { status, fields: { Name: 'Shared Scout', Strength: '8' } };
        assert.deepEqual(lastSeenFields(handle), { Name: 'Shared Scout', Strength: '8' }, status);
        assert.deepEqual(detachedSheet(attached, lastSeenFields(handle)), { schema: 'mgt2e_character@1', fields: { Name: 'Shared Scout', Strength: '8' } }, status);
    }
});

test('presence as the sheet takes it: a box to a name and a colour token; two in one box are both named; nobody in no box', () => {
    const who = [
        { id: 'u1', name: 'Mara', colour: 0, field: 'Species' },
        { id: 'u2', name: 'Jon', colour: 3, field: 'Species' },
        { id: 'u3', name: 'Asti', colour: 1, field: 'Weapon Type 1' },
        { id: 'u4', name: 'Idle', colour: 2, field: null },
    ];
    assert.deepEqual(presenceMap(who, tone), {
        Species: { name: 'Mara, Jon', tone: '--tone-0' },
        'Weapon Type 1': { name: 'Asti', tone: '--tone-1' },
    });
    assert.deepEqual(presenceMap([], tone), {});
});

test('the hookup is one file: it registers the Characters store behind the seam and holds no logic', () => {
    const text = fs.readFileSync(new URL('../../apps/web/src/workspace/character_wiring.ts', import.meta.url), 'utf8');
    assert.match(text, /from '\.\.\/characters\/index\.ts'/);
    assert.match(text, /setCharacterSource\(\{/);
    for (const part of ['list:', 'load:', 'create:', 'open:', 'tone:']) assert.ok(text.includes(part), part);
    // The page reaches the store only through it.
    const page = fs.readFileSync(new URL('../../apps/web/src/workspace/PersonSheet.vue', import.meta.url), 'utf8');
    assert.ok(page.includes("import './character_wiring.ts'"));
    assert.ok(!/from '\.\.\/characters\//.test(page), 'the page imports nothing of the store itself');
});

test('whose it is and how it stands, in the page’s words', () => {
    assert.equal(ownerWords({ role: 'owner' }), 'Yours');
    assert.equal(ownerWords({ role: 'editor', ownerName: 'Johnny' }), 'Owned by Johnny, shared with you');
    assert.equal(ownerWords({ role: 'editor' }), 'Shared with you');
    assert.equal(statusWords('live'), '');
    assert.equal(statusWords('connecting'), 'Connecting');
    assert.match(statusWords('offline'), /^Offline/);
    assert.match(statusWords('gone'), /No longer available/);
});

test('the seam: with no Characters store the page has none; one registered is the one handed back', () => {
    assert.equal(characterSource(), null);
    const fake = { list: () => [], load() {}, create: async () => 'ch_1', open: () => ({}), tone };
    setCharacterSource(fake);
    assert.equal(characterSource(), fake);
    setCharacterSource(null);
    assert.equal(characterSource(), null);
});
