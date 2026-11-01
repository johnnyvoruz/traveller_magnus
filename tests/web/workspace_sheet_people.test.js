/**
 * The ship sheet's passengers and crew as people (slice 2 follow-up 9): which fields hold
 * a person, how the id sits beside the name, and the vessel's people from its links.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CAMPAIGN_LINK_KINDS, linkAllowed, PassengerLot } from '@voyage/shared';
import { passengersFromSheet } from '../../apps/web/src/campaign/cargo.ts';
import {
    boarded, boardStart, fareFor, fareLine, fareMemo, fareOfPassageField, fareParsecs, isBoarded, nextJump, passageClasses, passageKey, unboarded, withClass,
} from '../../apps/web/src/workspace/passenger_fare.ts';
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

// ---- Passengers with fares (streams/D.md DT3) ------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const trade = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'rules', 'mgt2e_trade.json'), 'utf8'));
const src = (p) => fs.readFileSync(path.join(here, '..', '..', 'apps', 'web', 'src', p), 'utf8');

test('the passage classes are the rules file\'s, in its order, with the fares table\'s keys', () => {
    assert.deepEqual(passageClasses().map((one) => one.name), trade.passengers.passages.map((row) => row.name));
    assert.deepEqual(passageClasses().map((one) => one.key), ['high', 'middle', 'basic', 'low']);
    assert.equal(passageKey('High'), 'high');
    assert.equal(passageKey(' middle '), 'middle');
    assert.equal(passageKey('Steerage'), null, 'a word the file does not name has no fare');
    assert.equal(passageKey(''), null);
});

test('a fare is the file\'s row for the jump and the class; past the table or an unnamed class, none', () => {
    assert.deepEqual(fareParsecs(), trade.fares.rows.map((row) => row.parsecs));
    const two = trade.fares.rows.find((row) => row.parsecs === 2);
    const high2 = fareFor('High', 2);
    assert.equal(high2.credits, two.high);
    assert.ok(high2.cites.includes(two._src), 'cites the row');
    assert.equal(fareFor('low', 1).credits, trade.fares.rows.find((row) => row.parsecs === 1).low);
    assert.equal(fareFor('Basic', 7), null, 'past the table');
    assert.equal(fareFor('Steerage', 1), null);
    assert.equal(fareFor('', 1), null);
});

test('Board: the ledger line as income, the class as the file names it, the fare kept on the lot', () => {
    const when = { year: 1105, day: 14 };
    assert.equal(fareMemo('Ada Voss', 'high', 2), 'Fare: Ada Voss, High passage, 2 parsecs');
    assert.equal(fareMemo('', 'Low', 1), 'Fare: a passenger, Low passage, 1 parsec');
    const line = fareLine('Ada Voss', 'High', 2, 14000, when);
    assert.deepEqual(line, { when, amount: 14000, memo: 'Fare: Ada Voss, High passage, 2 parsecs', kind: 'income' });
    const lots = [{ label: 'Ada Voss', class: 'High' }, { label: 'Bek Tal', class: '', personId: BEK.id }];
    const after = boarded(lots, 1, 'Middle', 10000);
    assert.deepEqual(after[0], lots[0]);
    assert.deepEqual(after[1], { label: 'Bek Tal', class: 'Middle', personId: BEK.id, fareCr: 10000 });
    assert.equal(isBoarded(after[1]), true);
    assert.equal(isBoarded(after[0]), false);
    assert.deepEqual(withClass(lots, 0, 'Low')[0], { label: 'Ada Voss', class: 'Low' });
    assert.equal(fareOfPassageField(after, 'Passage 2'), 10000);
    assert.equal(fareOfPassageField(after, 'Passage 1'), null);
    assert.equal(fareOfPassageField(after, 'Passenger Name 2'), null);
    assert.equal(fareOfPassageField(after, 'Passage 9'), null);
});

test('the lot keeps its fare through the schema and a sheet edit', () => {
    const lot = { label: 'Ada Voss', class: 'High', fareCr: 14000 };
    assert.deepEqual(PassengerLot.parse(lot), lot);
    assert.equal(PassengerLot.safeParse({ ...lot, fareCr: -1 }).success, false);
    assert.equal(PassengerLot.safeParse({ ...lot, fareCr: 'Cr14,000' }).success, false);
    const edited = passengersFromSheet({ 'Passenger Name 1': 'Ada Voss', 'Passage 1': 'High', 'Passenger Notes 1': 'cabin 2' }, [lot]);
    assert.deepEqual(edited, [{ label: 'Ada Voss', class: 'High', note: 'cabin 2', fareCr: 14000 }]);
    assert.deepEqual(passengersFromSheet({ 'Passenger Name 1': 'Ada Voss', 'Passage 1': 'High' }, [{ label: 'Ada Voss', class: 'High' }]), [{ label: 'Ada Voss', class: 'High' }], 'no fare, no key');
});

test('the vessel page boards a passenger and the ship sheet shows the fare under the Passage box', () => {
    const page = src('workspace/VesselTrade.vue');
    assert.match(page, /<select class="vt-box vt-class" :value="item\.class" :disabled="readOnly"[^>]*data-passage @change="setClass\(i, \$event\)">/);
    assert.match(page, /<option v-for="one in classes" :key="one\.key" :value="one\.name">\{\{ one\.name \}\}<\/option>/, 'the classes from the file');
    assert.match(page, /<span v-if="isBoarded\(item\)" class="vt-fare" data-fare>/);
    assert.match(page, /<button v-else-if="boarding !== i" type="button" class="ui-btn" :disabled="readOnly" data-board @click="openBoard\(i\)">Board<\/button>/);
    assert.match(page, /passengers: boarded\(passengers\.value, i, lot\.class, found\.credits\), ledger: postLedger\(ledger\.value, line\)/, 'one commit: the lot and the ledger line');
    assert.match(page, /const line = fareLine\(passengerName\(lot\), lot\.class, parsecs, found\.credits, today\.value\);/);
    const sheet = src('workspace/ShipSheet.vue');
    assert.match(sheet, /<small v-if="fareWords\(field\)" class="sheet-fare" data-sheet-fare>\{\{ fareWords\(field\) \}\}<\/small>/);
    assert.match(sheet, /const fare = fareOfPassageField\(lots\.value, field\.name\);/);
});

test('a removed fare line unboards the lot it boarded; any other line leaves the list alone (DT3c)', () => {
    const nameOf = (lot) => lot.label;
    const lots = [{ label: 'Ada Voss', class: 'High', fareCr: 14000 }, { label: 'Bek Tal', class: 'High', fareCr: 14000 }, { label: 'Cy', class: 'Low' }];
    const ada = fareLine('Ada Voss', 'High', 2, 14000, { year: 1105, day: 14 });
    const bek1 = fareLine('Bek Tal', 'High', 1, 14000, { year: 1105, day: 14 });
    assert.deepEqual(unboarded(lots, ada, nameOf), [{ label: 'Ada Voss', class: 'High' }, lots[1], lots[2]], 'the first lot whose name, class and fare match');
    assert.deepEqual(unboarded(lots, bek1, nameOf), [lots[0], { label: 'Bek Tal', class: 'High' }, lots[2]], 'a one parsec memo too');
    assert.deepEqual(unboarded(lots, { memo: 'Fare: Ada Voss, High passage, 2 parsecs', amount: 9000, kind: 'income' }, nameOf), lots, 'the amount must match the kept fare');
    assert.deepEqual(unboarded(lots, { memo: 'Berthing fees', amount: -200, kind: 'expense' }, nameOf), lots);
    assert.deepEqual(unboarded(lots, { memo: 'Fare: Cy, Low passage, 1 parsec', amount: 700, kind: 'income' }, nameOf), lots, 'a lot with no fare kept is not touched');
    const page = src('workspace/VesselTrade.vue');
    assert.match(page, /<button type="button" class="ui-btn vt-drop" :disabled="readOnly" aria-label="Remove this line" title="Remove this line" data-drop-line @click="dropLine\(item\)">/);
    assert.match(page, /ledger: ledger\.value\.filter\(\(one\) => one !== line\), passengers: unboarded\(passengers\.value, line, passengerName\)/, 'one commit: the line and the lot');
});

test('the next jump on the track gives the Board form its jump (DT3d); no jump ahead, no hexes, or off the grid gives none', () => {
    const sectorAt = (slug) => (slug === 'Spinward_Marches' ? { sx: 0, sy: 0 } : null);
    const regina = { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' };
    const two = { kind: 'system', hexKey: 'Spinward_Marches/2110', locationLabel: 'Two out' };
    const six = { kind: 'system', hexKey: 'Spinward_Marches/2710', locationLabel: 'Six out' };
    const seven = { kind: 'system', hexKey: 'Spinward_Marches/2610' };
    const off = { kind: 'system', hexKey: 'Deneb/0101' };
    const leg = (from, to, departs, arrives, mode = 'jump') => ({ from, to, departs, arrives, mode });
    const track = [leg(regina, regina, 10, 12, 'docked'), leg(regina, regina, 12, 12.5, 'flight'), leg(regina, two, 12.5, 19.5), leg(two, six, 21, 28)];
    assert.deepEqual(nextJump(track, 11, sectorAt), { from: regina, to: two, parsecs: 2 }, 'the first jump ahead, past the docked and flight legs');
    assert.deepEqual(nextJump(track, 15, sectorAt), { from: regina, to: two, parsecs: 2 }, 'a jump under way is still the next one');
    assert.deepEqual(nextJump(track, 20, sectorAt), { from: two, to: six, parsecs: 6 }, 'a jump that arrived is behind');
    assert.equal(nextJump(track, 28, sectorAt), null, 'nothing ahead once the last jump arrived');
    assert.equal(nextJump(null, 11, sectorAt), null, 'no track');
    assert.equal(nextJump([leg(regina, { kind: 'record', id: 'cr_00000000-0000-4000-8000-000000000001' }, 1, 8)], 0, sectorAt), null, 'a record at one end has no hex');
    assert.equal(nextJump([leg(null, two, 1, 8)], 0, sectorAt), null, 'nowhere at one end');
    assert.equal(nextJump([leg(regina, off, 1, 8)], 0, sectorAt), null, 'a sector the grid does not place');
    assert.equal(boardStart({ from: regina, to: two, parsecs: 2 }), '2', 'a row the fares table has');
    assert.equal(boardStart({ from: regina, to: six, parsecs: 6 }), '6', 'the last row of the table');
    assert.equal(boardStart(nextJump([leg(regina, seven, 1, 8)], 0, sectorAt)), '', 'seven parsecs is past the table: the field stays empty');
    assert.equal(boardStart(null), '');
    assert.deepEqual(fareParsecs(), [1, 2, 3, 4, 5, 6], 'the rows boardStart reads by default');
    const page = src('workspace/VesselTrade.vue');
    assert.match(page, /return now && sectors \? nextJump\(trackOf\(now\), campaignDays\(campaign\.clock\), sectorAtOf\(sectors\)\) : null;/, 'the track, today, the chart grid');
    assert.match(page, /board\.parsecs = boardStart\(nextLeg\.value, jumps\);/, 'the form opens on the next leg');
    assert.match(page, /if \(record\.value && trackOf\(record\.value\)\) void startMarkets\(\);/, 'the grid is asked for only when there is a track');
    assert.match(page, /<p v-if="nextLegWords" class="vt-fine vt-leg" data-board-leg>\{\{ nextLegWords \}\}<\/p>/, 'the words say where the jump came from');
    assert.match(page, /'Next leg, ' \+ anchorName\(next\.from, campaign\.records\) \+ ' to ' \+ anchorName\(next\.to, campaign\.records\) \+ ': '/);
});
