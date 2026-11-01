/**
 * AQ5. A player record's name in the Player Pack.
 * planPack is apps/web/src/pack/plan.ts. Names go through the same strip,
 * token read, and bare-id replacement as redactString in players_view.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPack } from '../../apps/web/src/pack/plan.ts';

const HIDDEN = 'cr_22222222-2222-4222-8222-222222222222';
const PERSON = 'cr_11111111-1111-4111-8111-111111111111';
const SHIP = 'cr_33333333-3333-4333-8333-333333333333';
const INTERIOR = 'The crate mark stays in this block.';
const OPEN = 'Seen a record\nAlso a record';

function row(id, type, name, visibility) {
    return {
        id,
        type,
        kind: type,
        name,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: { start: { year: 1105, day: 1 } },
        visibility,
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: '2026-10-31T00:00:00.000Z',
        updatedAt: '2026-10-31T00:00:00.000Z',
        deleted: false,
    };
}

test('a player record name drops a referee passage and a hidden id', () => {
    const name = 'Seen [[' + HIDDEN + '|Secret label]]\n:::referee\n' + INTERIOR + '\n:::\nAlso ' + HIDDEN;
    const person = row(PERSON, 'person', name, 'players');
    const ship = row(SHIP, 'vessel', 'Beowulf', 'players');
    ship.anchor = { kind: 'record', id: PERSON };
    const hidden = row(HIDDEN, 'note', 'SECRETNAME', 'referee');
    const plan = planPack({
        name: 'Open',
        clockDays: null,
        records: { [PERSON]: person, [SHIP]: ship, [HIDDEN]: hidden },
        links: {
            cl_1: {
                id: 'cl_44444444-4444-4444-8444-444444444444',
                from: PERSON,
                to: SHIP,
                kind: 'member',
                role: '',
                order: 0,
                since: null,
                until: null,
                notes: '',
                visibility: 'players',
                provenance: null,
                rev: 1,
                createdAt: '2026-10-31T00:00:00.000Z',
                updatedAt: '2026-10-31T00:00:00.000Z',
                deleted: false,
            },
        },
        journal: {},
        settings: {
            party: { vesselIds: [SHIP], aboard: { [PERSON]: SHIP }, memberIds: [PERSON], anchor: null },
            kinds: {},
            rev: 0,
        },
    });

    const packed = JSON.stringify(plan);
    assert.equal(packed.includes(INTERIOR), false);
    assert.equal(packed.includes(':::referee'), false);
    assert.equal(packed.includes(HIDDEN), false);
    assert.equal(packed.includes('Secret label'), false);
    assert.equal(packed.includes('SECRETNAME'), false);
    assert.equal(plan.records.find((item) => item.id === PERSON).name, OPEN);
    assert.equal(plan.records.find((item) => item.id === SHIP).place, OPEN);
    assert.equal(plan.links[0].fromName, OPEN);
    assert.equal(plan.links[0].toName, 'Beowulf');
    assert.equal(plan.party.members[0].name, OPEN);
    assert.equal(plan.party.ships[0].name, 'Beowulf');
    assert.equal(plan.party.ships[0].aboard[0].name, OPEN);
    assert.equal(plan.timeline.find((item) => item.id === PERSON).title, OPEN);
});
