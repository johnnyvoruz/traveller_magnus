/**
 * CU38b: the session's view day. A scrub does not write the campaign date.
 * The map's marks follow the view day, the pill names it and a reset clears it,
 * and the campaign-date stroke is placed on that frame with no slide.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { campaign } from '../../apps/web/src/campaign/store.ts';
import { publishViewDay, readingDay, resetViewDay, viewDay, viewIsOff, viewingLabel } from '../../apps/web/src/campaign/view_day.ts';
import { drawCampaignLayer, partyShipTags } from '../../apps/web/src/map/campaign_layer.ts';
import { hexCentre, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { PPP_NAMES } from '../../apps/web/src/map/tiers.ts';
import { partyShipMarks, thenPlaces } from '../../apps/web/src/map/vessel_marks.ts';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';
import { dayIsAfter } from '../../apps/web/src/workspace/timeline.ts';
import { stardate } from '../../apps/web/src/workspace/stardate.ts';
import { recordingContext } from './orbit_fixture.js';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');

const STAMP = '2026-10-06T00:00:00.000Z';
const rid = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const REGINA = { kind: 'system', hexKey: 'Spinward_Marches/1910' };
const JEWELL = { kind: 'system', hexKey: 'Spinward_Marches/1106' };
const RHYLANOR = { kind: 'system', hexKey: 'Spinward_Marches/2716' };
const SHIP = rid(1);

function row(over = {}) {
    return {
        id: SHIP,
        type: 'vessel',
        kind: '',
        name: 'Far Margin',
        summary: '',
        details: '',
        tags: [],
        anchor: REGINA,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

const track = [
    { from: REGINA, to: REGINA, departs: 10, arrives: 10, mode: 'docked' },
    { from: REGINA, to: JEWELL, departs: 10, arrives: 20, mode: 'flight' },
    { from: JEWELL, to: RHYLANOR, departs: 20, arrives: 30, mode: 'jump' },
    { from: RHYLANOR, to: RHYLANOR, departs: 30, arrives: 40, mode: 'docked' },
];

const party = { vesselIds: [SHIP], aboard: {}, memberIds: [], anchor: null };

function records() {
    return { [SHIP]: row({ status: { track } }) };
}

test('a drag publishes the view day and does not write the campaign date', () => {
    const orbit = read('views/OrbitView.vue');
    const scrub = orbit.slice(orbit.indexOf('function scrub('), orbit.indexOf('function showLineup'));
    assert.match(scrub, /setDays\(scrubbed\(scrubStart, offset\)\)/);
    assert.doesNotMatch(scrub, /setCampaignDate/);
    const setAs = orbit.slice(orbit.indexOf('function setAsCampaignDate'), orbit.indexOf('function advanceWeek'));
    assert.match(setAs, /setCampaignDate\(next\)/);
    const store = read('campaign/store.ts');
    const writer = store.slice(store.indexOf('export function setCampaignDate'), store.indexOf('export async function switchCampaign'));
    assert.match(writer, /resetViewDay\(\)/);

    const clock = campaign.clock;
    campaign.clock = { days: 15, rev: 1 };
    try {
        publishViewDay(35, 15);
        assert.equal(campaign.clock.days, 15);
        assert.equal(readingDay(15), 35);
        assert.equal(viewIsOff(15), true);
    } finally {
        resetViewDay();
        campaign.clock = clock;
    }
});

test('the map marks follow the view day, and the pill names that day until a reset', () => {
    const view = read('views/MapView.vue');
    assert.match(view, /const ships = settings \? partyShipMarks\(campaign\.records, settings\.party, days\) : \[\];/);
    assert.match(view, /vesselsOnMap\(campaign\.records, settings\.party, days\)/);
    assert.match(view, /readingDay\(campaign\.clock\.days\)/);
    assert.match(view, /class="map-viewday"/);
    assert.match(view, /function backToCampaignDate/);
    const list = read('workspace/TimelineList.vue');
    assert.match(list, /clockDays: campaign\.clock \? campaign\.clock\.days : null/);
    assert.match(list, /data-after/);
    assert.match(list, /class="tl-today">Today/);

    resetViewDay();
    const camp = partyShipMarks(records(), party, 15);
    publishViewDay(35, 15);
    const shown = partyShipMarks(records(), party, readingDay(15));
    assert.equal(camp[0].hexKey, JEWELL.hexKey);
    assert.equal(shown[0].hexKey, RHYLANOR.hexKey);
    assert.deepEqual(thenPlaces(
        shown.map((ship) => ({ id: ship.id, hexKey: ship.hexKey })),
        camp.map((ship) => ({ id: ship.id, hexKey: ship.hexKey, lead: ship.lead })),
    ), [{ id: SHIP, hexKey: JEWELL.hexKey, lead: true }]);
    const label = viewingLabel(viewDay.value);
    assert.equal(label, 'Viewing ' + stardate(35).date + ' · Back to the campaign date');
    assert.match(label, /^Viewing \d{3}-\d{4} · Back to the campaign date$/);
    resetViewDay();
    assert.equal(viewIsOff(15), false);
    assert.equal(readingDay(15), 15);
    assert.deepEqual(thenPlaces(
        partyShipMarks(records(), party, 15).map((ship) => ({ id: ship.id, hexKey: ship.hexKey })),
        camp.map((ship) => ({ id: ship.id, hexKey: ship.hexKey, lead: ship.lead })),
    ), []);
});

test('rows after the view day are the ones that dim, and Today stays the campaign date', () => {
    const on = totalDays(1105, 100);
    assert.equal(dayIsAfter({ year: 1105, day: 101 }, on), true);
    assert.equal(dayIsAfter({ year: 1105, day: 100 }, on), false);
    assert.equal(dayIsAfter({ year: 1106, day: 1 }, on), true);
    assert.equal(dayIsAfter({ year: 1105, day: 99 }, null), false);
});

test('the campaign-date stroke is at that hex on the frame, with no fill and no slide', () => {
    const regina = hexCentre(toGlobal(-4, -1, 19, 10).q, toGlobal(-4, -1, 19, 10).r);
    const cam = { x: regina.x, y: regina.y, ppp: PPP_NAMES + 10 };
    const sectors = [{ slug: 'Spinward_Marches', x: -4, y: -1 }];
    const vp = { width: 800, height: 600 };
    const ink = { signal: 'signal', tag: 'tag', bg: 'bg', font: 'Font', pulseMs: 1000, then: 'edge' };
    const snapshot = {
        party: null,
        ships: partyShipTags([{ id: SHIP, name: 'Far Margin', hexKey: RHYLANOR.hexKey, lead: true, inJump: false, aboard: [] }]),
        then: [{ id: SHIP, hexKey: REGINA.hexKey, lead: true }],
        locate: null,
        reducedMotion: true,
    };
    function paint() {
        const rec = recordingContext();
        const frame = drawCampaignLayer(rec.ctx, { cam, vp, sectors, snapshot, ink, nowMs: 0 });
        return { calls: rec.calls, frame };
    }
    const first = paint();
    const second = paint();
    assert.equal(first.frame.animating, false);
    const edgeStrokes = (painted) => painted.calls.filter((call) => call.op === 'arc' && call.stroke === 'edge');
    assert.ok(edgeStrokes(first).length >= 1);
    assert.deepEqual(edgeStrokes(first).map((call) => [call.args[0], call.args[1]]), edgeStrokes(second).map((call) => [call.args[0], call.args[1]]));
    assert.equal(first.calls.filter((call) => call.op === 'fill' && call.fill === 'edge').length, 0);
    const live = first.frame.ships.find((mark) => mark.id === SHIP);
    const thenArc = edgeStrokes(first)[0];
    assert.ok(Math.hypot(thenArc.args[0] - live.cx, thenArc.args[1] - live.cy) > 20);
});
