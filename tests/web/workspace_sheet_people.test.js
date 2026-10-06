/**
 * The ship sheet's passengers and crew as people (slice 2 follow-up 9): which fields hold
 * a person, how the id sits beside the name, and the vessel's people from its links.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_LINK_KINDS, linkAllowed } from '@voyage/shared';
import { newLink } from '../../apps/web/src/workspace/links.ts';
import { newRecord } from '../../apps/web/src/workspace/records.ts';
import {
    heldPersonIds, isPersonField, linkBetween, newPersonName, peopleOfKind, personIdOf, personOf, recordKey, SECTION_KIND, withoutPerson, withPerson,
} from '../../apps/web/src/workspace/sheet_people.ts';
import { fieldNamed, fieldsOf, sheetWithFields } from '../../apps/web/src/workspace/ship_sheet.ts';

const NOW = '2026-10-05T12:00:00.000Z';
const SHIP = { ...newRecord('vessel', 'cr_00000000-0000-4000-8000-000000000001', NOW), name: 'Far Margin' };
const VOSS = { ...newRecord('person', 'cr_00000000-0000-4000-8000-000000000002', NOW), name: 'Ana Voss' };
const BEK = { ...newRecord('person', 'cr_00000000-0000-4000-8000-000000000003', NOW), name: 'Bek Tal' };
const GONE = { ...newRecord('person', 'cr_00000000-0000-4000-8000-000000000004', NOW), name: 'Gone', deleted: true };
const records = Object.fromEntries([SHIP, VOSS, BEK, GONE].map((r) => [r.id, r]));
const NAME_3 = fieldNamed('Passenger Name 3');

test('the section kinds are in the shared vocabulary, person to vessel', () => {
    for (const kind of Object.values(SECTION_KIND)) {
        assert.ok(CAMPAIGN_LINK_KINDS.some((row) => row.kind === kind), kind);
        assert.equal(linkAllowed(kind, 'person', 'vessel'), true, kind);
    }
    assert.equal(SECTION_KIND.Passengers, 'passenger');
    assert.equal(SECTION_KIND.Crew, 'crew');
});

test('only the Passenger Name fields can hold a person; the Crew box and the notes cannot', () => {
    assert.equal(isPersonField(NAME_3), true);
    assert.equal(isPersonField(fieldNamed('Passenger Name 16')), true);
    assert.equal(isPersonField(fieldNamed('Passenger Notes 3')), false);
    assert.equal(isPersonField(fieldNamed('Passage 3')), false);
    assert.equal(isPersonField(fieldNamed('Passenger Capactiy')), false);
    assert.equal(isPersonField(fieldNamed('Crew')), false);
    assert.equal(isPersonField({ name: 'Passenger Name 1', section: 'Crew' }), false);
});

test('a person goes into the field as name plus "<field> record"; taking it out leaves the name as text', () => {
    assert.equal(recordKey('Passenger Name 3'), 'Passenger Name 3 record');
    const held = withPerson({ 'Passage 3': 'High' }, NAME_3, VOSS);
    assert.deepEqual(held, { 'Passage 3': 'High', 'Passenger Name 3': 'Ana Voss', 'Passenger Name 3 record': VOSS.id });
    assert.equal(personIdOf(held, NAME_3), VOSS.id);
    assert.equal(personOf(held, NAME_3, records), VOSS);
    assert.deepEqual(heldPersonIds(held), [VOSS.id]);
    const sheet = sheetWithFields(null, held);
    assert.deepEqual(fieldsOf(sheet), held);
    const out = withoutPerson(held, NAME_3);
    assert.deepEqual(out, { 'Passage 3': 'High', 'Passenger Name 3': 'Ana Voss' });
    assert.equal(personIdOf(out, NAME_3), null);
    assert.deepEqual(heldPersonIds(out), []);
    assert.equal(personIdOf(null, NAME_3), null);
    assert.deepEqual(withoutPerson(null, NAME_3), {});
});

test('a held id that is deleted, not a person, or unknown shows no person', () => {
    assert.equal(personOf(withPerson(null, NAME_3, GONE), NAME_3, records), null);
    assert.equal(personOf(withPerson(null, NAME_3, SHIP), NAME_3, records), null);
    assert.equal(personOf({ 'Passenger Name 3 record': 'cr_nope' }, NAME_3, records), null);
    assert.equal(personOf({ 'Passenger Name 3 record': '' }, NAME_3, records), null);
    assert.deepEqual(heldPersonIds({ 'Passenger Notes 3 record': VOSS.id, 'Passenger Name 2 record': BEK.id }), [BEK.id]);
});

test('the vessel\'s crew and passengers come from its live links, by name; the link between two records is found', () => {
    const outward = (kind) => ({ kind, outward: true, label: kind });
    const crew1 = newLink('cl_00000000-0000-4000-8000-000000000001', BEK.id, SHIP.id, outward('crew'), 'Pilot', NOW);
    const crew2 = newLink('cl_00000000-0000-4000-8000-000000000002', VOSS.id, SHIP.id, outward('crew'), '', NOW);
    const pass = newLink('cl_00000000-0000-4000-8000-000000000003', VOSS.id, SHIP.id, outward('passenger'), '', NOW);
    const gone = { ...newLink('cl_00000000-0000-4000-8000-000000000004', GONE.id, SHIP.id, outward('crew'), '', NOW) };
    const dead = { ...newLink('cl_00000000-0000-4000-8000-000000000005', BEK.id, SHIP.id, outward('passenger'), '', NOW), deleted: true };
    const links = Object.fromEntries([crew1, crew2, pass, gone, dead].map((l) => [l.id, l]));
    assert.deepEqual(peopleOfKind(links, records, SHIP.id, 'crew').map((x) => [x.person.name, x.link.role]), [['Ana Voss', ''], ['Bek Tal', 'Pilot']]);
    assert.deepEqual(peopleOfKind(links, records, SHIP.id, 'passenger').map((x) => x.person.name), ['Ana Voss']);
    assert.deepEqual(peopleOfKind(links, records, VOSS.id, 'crew'), []);
    assert.equal(linkBetween(links, VOSS.id, SHIP.id, 'passenger'), pass);
    assert.equal(linkBetween(links, BEK.id, SHIP.id, 'passenger'), null);
    assert.equal(linkBetween(links, SHIP.id, VOSS.id, 'passenger'), null);
});

test('a new person made from a field takes the field\'s text as its name', () => {
    assert.equal(newPersonName({ 'Passenger Name 3': '  Dr.  Ketch ' }, NAME_3), 'Dr. Ketch');
    assert.equal(newPersonName({}, NAME_3), '');
    assert.equal(newPersonName(null, NAME_3), '');
});
