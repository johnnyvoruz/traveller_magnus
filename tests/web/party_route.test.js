/**
 * Your own ships' routes (prompts/d_store_3.md item 3): the lead's while the Party tab is open, or the
 * party ship open as a record; the legs from the same shared functions as the public card, the
 * course ahead whatever the public switch says; drawn in the signal colour, and an open card's
 * route wins while it is open.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { partyRoute, routeShipId } from '../../apps/web/src/workspace/party_route.ts';

const read = (file) => readFileSync(new URL('../../apps/web/src/' + file, import.meta.url), 'utf8');

const STAMP = '2026-10-12T00:00:00.000Z';
const LEAD = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OTHER = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const PERSON = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

function record(id, type, over = {}) {
    return {
        id, type, kind: '', name: id.slice(-1), summary: '', details: '', tags: [],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' }, when: null, visibility: 'referee',
        playerNotes: null, sheet: null, status: null, images: null, provenance: null, rev: 0,
        createdAt: STAMP, updatedAt: STAMP, deleted: false, ...over,
    };
}

function leg(from, to, departs, arrives) {
    return { from: { kind: 'system', hexKey: from }, to: { kind: 'system', hexKey: to }, departs, arrives, mode: 'jump' };
}

const party = { vesselIds: [LEAD, OTHER], aboard: {}, memberIds: [], anchor: null };

test('the ship: a party ship open as a record, else the lead while the Party tab is open', () => {
    assert.equal(routeShipId({ kind: 'party' }, party), LEAD);
    assert.equal(routeShipId({ kind: 'campaign', record: OTHER }, party), OTHER);
    assert.equal(routeShipId({ kind: 'campaign', record: PERSON }, party), null, 'a record that is not a party ship');
    assert.equal(routeShipId({ kind: 'campaign', record: null }, party), null, 'the records list');
    assert.equal(routeShipId({ kind: 'dossier' }, party), null);
    assert.equal(routeShipId({ kind: 'journal', entry: null }, party), null);
    assert.equal(routeShipId({ kind: 'party' }, { vesselIds: [], aboard: {}, memberIds: [], anchor: null }), null, 'no ship');
    assert.equal(routeShipId({ kind: 'party' }, null), null);
});

test('the legs: finished and ahead at the campaign date, own-sector ends left out', () => {
    const ship = record(LEAD, 'vessel', {
        status: {
            track: [
                leg('Spinward_Marches/1910', 'Spinward_Marches/1911', 1, 10),
                leg('Spinward_Marches/1911', 'Spinward_Marches/2011', 30, 40),
                leg('Spinward_Marches/2011', '~own/0101', 50, 60),
                leg('Spinward_Marches/2011', 'Spinward_Marches/2111', 70, 80),
            ],
        },
    });
    const records = { [LEAD]: ship };
    assert.deepEqual(partyRoute(LEAD, records, 20), {
        legs: [{ from: 'Spinward_Marches/1910', to: 'Spinward_Marches/1911' }],
        course: [
            { from: 'Spinward_Marches/1911', to: 'Spinward_Marches/2011' },
            { from: 'Spinward_Marches/2011', to: 'Spinward_Marches/2111' },
        ],
    });
    assert.deepEqual(partyRoute(LEAD, records, 100).course, [], 'all arrived: no course');
    assert.equal(partyRoute(LEAD, records, 100).legs.length, 3);
});

test('no route: no ship, a deleted ship, a record that is not a vessel, or no track', () => {
    const records = {
        [LEAD]: record(LEAD, 'vessel'),
        [OTHER]: record(OTHER, 'vessel', { deleted: true, status: { track: [leg('Spinward_Marches/1910', 'Spinward_Marches/1911', 1, 10)] } }),
        [PERSON]: record(PERSON, 'person', { status: { track: [leg('Spinward_Marches/1910', 'Spinward_Marches/1911', 1, 10)] } }),
    };
    assert.equal(partyRoute(null, records, 20), null);
    assert.equal(partyRoute(LEAD, records, 20), null);
    assert.equal(partyRoute(OTHER, records, 20), null);
    assert.equal(partyRoute(PERSON, records, 20), null);
    assert.equal(partyRoute('cr_missing', records, 20), null);
});

test('one route at a time, in the signal colour; the card\'s wins; the map sets it from the pane and the records', () => {
    const renderer = read('map/MapRenderer.ts');
    assert.match(renderer, /const route = this\.publicRoute \?\? this\.partyRoute;/);
    assert.match(renderer, /const colour = this\.publicRoute \? this\.trafficColour \|\| this\.theme\.chart\.publicGame : this\.theme\.signal;/);
    assert.match(renderer, /setPartyRoute\(route: \{ legs: readonly RouteLeg\[\]; course\?: readonly RouteLeg\[\] \} \| null\): void \{/);
    const view = read('views/MapView.vue');
    assert.match(view, /return partyRoute\(routeShipId\(shownPane\.value, party\), campaign\.records, campaignDays\(campaign\.clock\)\);/);
    assert.match(view, /watch\(partyRouteNow, \(now\) => \{\s*if \(!renderer\) return;\s*renderer\.setPartyRoute\(now\);\s*markDirty\(\);/);
    assert.match(view, /renderer\.setTrafficColour\(ink\.traffic\);\s*renderer\.setPartyRoute\(partyRouteNow\.value\);/);
});
