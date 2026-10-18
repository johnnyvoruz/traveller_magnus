/**
 * DT3b (backlog step T3b, D's half): Roll a passenger on a vessel. The roll is Lane A's, from the rules
 * file; here it is said as the backlog shows ("34 · Causes Trouble · 5: Violent") and kept as a person
 * aboard, linked as a passenger, on the ship's list. The dice are fixed so the table's own rows are read.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { rollPassenger } from '../../apps/web/src/campaign/passengers.ts';
import { keptPassenger, passengerSummary, PASSENGER_NAME, rollWords } from '../../apps/web/src/workspace/passenger_roll.ts';

const faces = (...values) => { let i = 0; return () => values[i++]; };

test('said as the backlog shows: the roll, the printed words, the second die or the skills', () => {
    const trouble = rollPassenger(faces(3, 4, 5));
    assert.equal(rollWords(trouble), '34 · Causes Trouble · 5: Violent');
    assert.equal(passengerSummary(trouble), 'Causes Trouble (1–3: Drunkard, 4–5: Violent, 6: Insane) · Violent');
    const engineer = rollPassenger(faces(3, 6, 3, 1));
    assert.equal(rollWords(engineer), '36 · Engineer · Mechanic 2, Engineer 0');
    assert.equal(passengerSummary(engineer), 'Engineer (Mechanic and Engineer 1D–1 each) · Mechanic 2, Engineer 0');
    const refugee = rollPassenger(faces(1, 1));
    assert.equal(rollWords(refugee), '11 · Refugee – Political');
    assert.deepEqual(refugee.dice, [1, 1]);
});

const SHIP = 'cr_e1000000-0000-4000-8000-000000000001';
const PERSON = 'cr_12121212-1212-4121-8121-121212121212';
const LINK = 'cl_12121212-1212-4121-8121-121212121212';

test('kept: a person aboard, of kind passenger, named to be typed over, linked, and on the list', () => {
    const vessel = {
        id: SHIP, type: 'vessel', kind: '', name: 'Bright Ledger', summary: '', details: '', tags: [], anchor: null, when: null, visibility: 'referee',
        playerNotes: null, sheet: null, images: null, provenance: null, rev: 4, createdAt: '', updatedAt: '', deleted: false,
        status: { passengers: [{ label: 'Doc', class: 'Middle' }], track: [] },
    };
    const kept = keptPassenger(vessel, rollPassenger(faces(3, 4, 5)), { person: PERSON, link: LINK }, '2026-10-17T20:30:00.000Z');
    assert.equal(kept.person.id, PERSON);
    assert.equal(kept.person.type, 'person');
    assert.equal(kept.person.kind, 'passenger');
    assert.equal(kept.person.name, PASSENGER_NAME);
    assert.equal(kept.person.summary, 'Causes Trouble (1–3: Drunkard, 4–5: Violent, 6: Insane) · Violent');
    assert.deepEqual(kept.person.anchor, { kind: 'record', id: SHIP }, 'aboard the ship');
    assert.equal(kept.link.kind, 'passenger');
    assert.equal(kept.link.from, PERSON);
    assert.equal(kept.link.to, SHIP);
    assert.deepEqual(kept.passengers, [{ label: 'Doc', class: 'Middle' }, { label: 'Passenger', class: '', personId: PERSON }]);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the vessel page rolls, says it, and keeps it in one change', () => {
    const page = fs.readFileSync(path.join(root, 'apps/web/src/workspace/VesselTrade.vue'), 'utf8');
    assert.match(page, /data-roll-passenger @click="rollOne">Roll a passenger<\/button>/);
    assert.match(page, /<p class="vt-roll-words" role="status">\{\{ rollWords\(rolled\) \}\}<\/p>/);
    assert.match(page, /data-keep-passenger @click="keepRolled">Keep<\/button>/);
    assert.match(page, /data-roll-again @click="rollOne">Roll again<\/button>/);
    assert.match(page, /commit\(\{ records: \[created\(kept\.person\), \{ \.\.\.now, status, baseRev: now\.rev \}\], links: \[createdLink\(kept\.link\)\] \}\);/);
    assert.match(page, /justCreated\.value = kept\.person\.id;/);
});
