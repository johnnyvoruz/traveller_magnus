// Sensor contacts (apps/web/src/living/contacts.ts; Johnny, 2026-11-14): background ships are scenery until the
// referee promotes one. The card's words for a referee and a player, the record a promotion makes, the
// ping on the picture, the press that opens the card, and traffic showing in a campaign that never set it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contactWords, promotedSummary, UNIDENTIFIED } from '../../apps/web/src/living/contacts.ts';
import { LIVING_OFF, LIVING_UNSET, livingOf, livingShown } from '../../apps/web/src/living/quiet.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');
const ship = { id: 'bg|1910|42|3', name: 'Low Magpie', roleWord: 'patrol', line: 'Hold your course.' };

test('the referee reads the ship; a player reads that something is there, and what kind', () => {
    assert.deepEqual(contactWords(ship, true), { name: 'Low Magpie', role: 'Patrol', line: 'Hold your course.' });
    assert.deepEqual(contactWords(ship, false), { name: UNIDENTIFIED, role: 'Patrol', line: '' });
    assert.equal(contactWords({ id: 'x', name: 'N' }, true).role, 'Ship', 'no role word: a ship');
});

test('a promoted contact is a vessel record: its name, its role in words, where and when it was first seen', () => {
    assert.equal(promotedSummary(ship, 'Regina', '040-1105'), 'Patrol. First seen in the Regina system on 040-1105, as a sensor contact.');
    assert.equal(promotedSummary(ship, '', ''), 'Patrol. First seen in this system, as a sensor contact.');
    const contacts = read('living/contacts.ts');
    assert.match(contacts, /const id = createRecord\('vessel', systemAnchor\(hexKey, systemName, null\)\);\s+saveRecord\(id, \{ name: contact\.name, summary: promotedSummary\(contact, systemName, date\) \}\);\s+markPromoted\(contact\.id\);/);
    assert.doesNotMatch(contacts, /saveParty|visibility/, 'never a party ship, and it stays the referee\'s own (a new record is referee-only)');
    assert.match(read('workspace/records.ts'), /visibility: 'referee'/, 'which is what a new record is');
});

test('the orbit view: a press on a contact opens its card; Promote is the referee\'s; a player is not told the name', () => {
    const canvas = read('orbit/OrbitCanvas.vue');
    assert.match(canvas, /const contact = means\.kind !== 'ship' \? trafficUnder\(at\) : null;\s+if \(contact\) \{\s+emit\('contact', contact\);\s+return;/);
    assert.match(canvas, /lastMarks = contactsInOrbit\(placeShips\(/, 'the marks themselves are moved into orbit: drawn, hovered and pressed at one place');
    const view = read('views/OrbitView.vue');
    assert.match(view, /@contact="openContact"/);
    assert.match(view, /<button v-if="contactReferee" type="button" class="orbit-btn orbit-contact-promote" :disabled="!canSetDate" data-contact-promote @click="promoteShown">/);
    assert.match(view, /if \(isPromoted\(track\.id\)\) continue;\s+out\.push\(contactReferee\.value \? track : \{ \.\.\.track, name: UNIDENTIFIED, line: '' \} as ShipTrack\);/);
    assert.match(view, /const contactReferee = computed\(\(\) => campaign\.role === 'owner'\);/);
});

test('the picture: a contact is pinged on its own beat, carries no name, and stands steady with reduced motion', () => {
    const renderer = read('orbit/OrbitRenderer.ts');
    assert.match(renderer, /if \(mark\.kind === 'traffic' && this\.contactLook\) \{\s+this\.paintContact\(mark, alpha, scale\);\s+return;\s+\}/);
    assert.match(read('orbit/OrbitCanvas.vue'), /motion: !reduced, contacts: true, layers: stage\.layers,/, 'the orbit view asks for the contact look');
    const contact = renderer.slice(renderer.indexOf('private paintContact'), renderer.indexOf('/** One designator and its name.'));
    assert.match(contact, /const flare = this\.contactMotion \? \(beat < CONTACT_FADE \? 1 - beat \/ CONTACT_FADE : 0\) : 0\.35;/);
    assert.doesNotMatch(contact, /fillText/, 'no name on the picture');
    assert.match(contact, /if \(this\.contactMotion\) this\.deps\.stale\(\);/, 'the next ping gets its frame; none is asked for with reduced motion');
    assert.match(renderer, /const CONTACT_PERIOD_MS = 4200;/);
});

test('traffic shows in a campaign that never set the switches; a stored choice and Quiet still rule', () => {
    assert.deepEqual(livingOf(null), LIVING_OFF, 'no campaign: nothing');
    assert.deepEqual(livingOf({}), LIVING_UNSET);
    assert.equal(LIVING_UNSET.traffic, true);
    assert.deepEqual(livingOf({ living: { chatter: true, traffic: false } }), { chatter: true, traffic: false }, 'the referee turned it off');
    assert.deepEqual(livingShown({}, true), LIVING_OFF, 'quiet on this device');
});

test('contacts holding at a body orbit it: a ring from the body\'s radius, moving with the clock, the campaign\'s ships untouched', async () => {
    const { contactsInOrbit, HOLD_RING_MIN, HOLD_RING_SPAN, HOLD_GAP_PX } = await import('../../apps/web/src/orbit/ships.ts');
    const hits = [{ kind: 'world', key: 'w0', cx: 100, cy: 100, r: 20 }];
    const marks = [
        { id: 'bg-a', name: 'A', kind: 'traffic', shape: 'circle', x: 100, y: 100 },
        { id: 'bg-b', name: 'B', kind: 'traffic', shape: 'square', x: 100, y: 100 },
        { id: 'party', name: 'Ours', kind: 'party', shape: 'triangle', x: 100, y: 100 },
        { id: 'bg-fly', name: 'F', kind: 'traffic', shape: 'circle', x: 300, y: 40, heading: 1 },
        { id: 'bg-jump', name: 'J', kind: 'traffic', shape: 'circle', x: 100, y: 100, jump: 'out' },
    ];
    const now = contactsInOrbit(marks, hits, 10);
    const dist = (m) => Math.hypot(m.x - 100, m.y - 100);
    for (const id of ['bg-a', 'bg-b']) {
        const m = now.find((item) => item.id === id);
        assert.ok(dist(m) >= 20 * HOLD_RING_MIN + HOLD_GAP_PX - 1e-6 && dist(m) <= 20 * (HOLD_RING_MIN + HOLD_RING_SPAN) + HOLD_GAP_PX + 10 + 1e-6, id + ' rides a ring clear of the disc');
        assert.equal(typeof m.heading, 'number', 'and points the way it goes');
    }
    assert.notDeepEqual([now[0].x, now[0].y], [now[1].x, now[1].y], 'two contacts, two places: no line');
    assert.deepEqual(now[2], marks[2], 'a campaign ship keeps its docked place and its tag');
    assert.deepEqual(now[3], marks[3], 'a ship under way is left on its course');
    assert.deepEqual(now[4], marks[4], 'a jump is left alone');
    const later = contactsInOrbit(marks, hits, 10 + 1 / 24);
    assert.notDeepEqual([later[0].x, later[0].y], [now[0].x, now[0].y], 'an hour on, it has moved');
    assert.ok(Math.abs(dist(later[0]) - dist(now[0])) < 1e-6, 'along its own ring');
    // Zoomed in to twice the size, the ring scales with the world: the contact does not slide along the screen.
    const big = contactsInOrbit(marks.map((m) => ({ ...m, x: m.x === 100 ? 200 : m.x, y: m.y === 100 ? 200 : m.y })), [{ kind: 'world', key: 'w0', cx: 200, cy: 200, r: 40 }], 10);
    const a = now[0];
    const b = big[0];
    assert.ok(Math.abs(Math.atan2(a.y - 100, a.x - 100) - Math.atan2(b.y - 200, b.x - 200)) < 1e-9, 'the same bearing from the world at every zoom');
});

test('a contact flying between the 100D limit and its world is on the world\'s drawn disc: it holds in orbit, never on the disc', async () => {
    const { contactsInOrbit, placeShips } = await import('../../apps/web/src/orbit/ships.ts');
    const hits = [{ kind: 'world', key: 'w0', cx: 100, cy: 100, r: 30 }];
    const inbound = { id: 'bg-in', name: 'In', kind: 'traffic', shape: 'circle', x: 104, y: 97, heading: 2 };
    const [held] = contactsInOrbit([inbound], hits, 3);
    assert.ok(Math.hypot(held.x - 100, held.y - 100) > 30, 'clear of the disc');
    const clear = { ...inbound, x: 180, y: 100 };
    assert.deepEqual(contactsInOrbit([clear], hits, 3)[0], clear, 'past the disc, it flies its course');
    // A background shuttle's hop (a flight from a body to itself) is at the body, with no heading.
    const at = (anchor) => (anchor && anchor.bodyKey === 'w0' ? { x: 100, y: 100 } : null);
    const world = { kind: 'system', hexKey: 'S/0101', bodyKey: 'w0' };
    const marks = placeShips([{ id: 'sh', name: 'Shuttle', kind: 'traffic', shape: 'circle', legs: [{ from: world, to: world, departs: 0, arrives: 1, mode: 'flight' }] }], at, 0.5);
    assert.deepEqual(marks, [{ id: 'sh', name: 'Shuttle', kind: 'traffic', shape: 'circle', x: 100, y: 100 }]);
});
