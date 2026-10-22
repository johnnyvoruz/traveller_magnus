/**
 * AU6: the campaign timeline lists vessel legs and where the party is today.
 * The record page's list does not ask for legs.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { buildTimeline, campaignTimeline, timelineKeeps } from '../../apps/web/src/workspace/timeline.ts';

const SHIP = 'cr_00000000-0000-4000-8000-000000000001';
const OTHER = 'cr_00000000-0000-4000-8000-000000000002';

function vessel(id, name, track, over = {}) {
    return {
        id,
        type: 'vessel',
        kind: '',
        name,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: { track },
        images: null,
        provenance: null,
        rev: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deleted: false,
        ...over,
    };
}

const d1 = totalDays(1105, 10);
const d2 = totalDays(1105, 12);
const d3 = totalDays(1105, 20);
const regina = { kind: 'system', hexKey: 'Spinward_Marches/1910' };
const rhylanor = { kind: 'system', hexKey: 'Spinward_Marches/2717', locationLabel: 'Rhylanor' };

function legs() {
    return [
        { from: regina, to: rhylanor, departs: d1, arrives: d2, mode: 'flight' },
        { from: rhylanor, to: regina, departs: d2, arrives: d3, mode: 'jump' },
        { from: regina, to: regina, departs: d3, arrives: d3, mode: 'docked' },
    ];
}

test('a vessel track becomes departure, arrival, jump entry and jump exit, grouped by day', () => {
    const ship = vessel(SHIP, 'Beowulf', legs());
    const records = { [SHIP]: ship };
    const off = buildTimeline({ entries: [], records, clockDays: null });
    assert.equal(off.count, 0);

    const model = campaignTimeline({ entries: [], records, clockDays: null, party: null });
    const rows = model.years.flatMap((year) => year.days.flatMap((day) => day.rows.map((row) => row.date + ' ' + row.kind + ' ' + row.place)));
    assert.deepEqual(rows, [
        '020-1105 Jump exit Spinward Marches 1910',
        '020-1105 Arrival Spinward Marches 1910',
        '012-1105 Arrival Rhylanor system',
        '012-1105 Jump entry Rhylanor system',
        '010-1105 Departure Spinward Marches 1910',
    ]);
    assert.equal(model.count, 5);
    assert.equal(model.years.length, 1);
    assert.equal(model.years[0].days.length, 3);
});

test('today is the party row, and a hidden place is the hex with no name', () => {
    const ship = vessel(SHIP, 'Beowulf', legs());
    const other = vessel(OTHER, 'Other', [{ from: rhylanor, to: rhylanor, departs: d1, arrives: d1, mode: 'orbit' }]);
    const party = { vesselIds: [SHIP], aboard: {}, memberIds: [], anchor: null };
    const model = campaignTimeline({
        entries: [],
        records: { [SHIP]: ship, [OTHER]: other },
        clockDays: d3,
        party,
    });
    const today = model.years[0].days.find((day) => day.today);
    assert.ok(today);
    assert.equal(today.rows[0].source, 'party');
    assert.equal(today.rows[0].kind, 'Today');
    assert.equal(today.rows[0].title, 'Beowulf');
    assert.equal(today.rows[0].place, 'Spinward Marches 1910');
    assert.equal(today.rows[0].place.includes('Regina'), false);
    const narrow = {
        type: null,
        shipId: SHIP,
        aboard: {},
        recordType: () => null,
        entryAnchorId: () => null,
    };
    const listed = model.years.flatMap((year) => year.days.flatMap((day) => day.rows));
    assert.equal(listed.some((row) => row.shipId === OTHER), true);
    for (const row of listed) {
        if (row.shipId === SHIP) assert.equal(timelineKeeps(row, narrow), true);
        if (row.shipId === OTHER) assert.equal(timelineKeeps(row, narrow), false);
    }
});

test('a Vessels filter keeps ship legs, and another type drops them', () => {
    const ship = vessel(SHIP, 'Beowulf', legs());
    const party = { vesselIds: [SHIP], aboard: {}, memberIds: [], anchor: null };
    const model = campaignTimeline({
        entries: [],
        records: { [SHIP]: ship },
        clockDays: d3,
        party,
    });
    const listed = model.years.flatMap((year) => year.days.flatMap((day) => day.rows));
    const legRows = listed.filter((row) => row.source === 'leg');
    const partyRows = listed.filter((row) => row.source === 'party');
    assert.ok(legRows.length > 0);
    assert.equal(partyRows.length, 1);
    const base = {
        shipId: null,
        aboard: {},
        recordType: (id) => (id === SHIP ? 'vessel' : null),
        entryAnchorId: () => null,
    };
    for (const row of legRows) assert.equal(timelineKeeps(row, { ...base, type: 'vessel' }), true);
    for (const row of legRows) assert.equal(timelineKeeps(row, { ...base, type: 'place' }), false);
    for (const row of partyRows) assert.equal(timelineKeeps(row, { ...base, type: 'vessel' }), false);
    for (const row of legRows) assert.equal(timelineKeeps(row, { ...base, type: 'vessel', shipId: SHIP }), true);
    for (const row of legRows) assert.equal(timelineKeeps(row, { ...base, type: 'vessel', shipId: OTHER }), false);
});
