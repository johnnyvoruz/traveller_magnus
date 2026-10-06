import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressPane, campaignRedirect, escapePane, focusTarget, paneChanges, paneOf, withQuery } from '../../apps/web/src/shell/pane.ts';

const SECTOR = 'Spinward_Marches';
const HEX = '1910';
const BODY = 'w0';
const HOME = { kind: 'home' };
const SHUT = { kind: 'shut' };
const DOSSIER = { kind: 'dossier' };
const LIST = { kind: 'campaign', record: null };
const PARTY = { kind: 'party' };

function map(body) {
    return { kind: 'map', sector: SECTOR, hex: HEX, body };
}

function orbit(body) {
    return { kind: 'orbit', sector: SECTOR, hex: HEX, body };
}

test('the twelve addresses of today name a view and a pane', () => {
    const rows = [
        { path: '/', query: {}, view: HOME, pane: SHUT },
        { path: '/', query: { x: '1', y: '2', z: '3' }, view: HOME, pane: SHUT },
        { path: '/s/' + SECTOR, query: {}, view: { kind: 'sector', sector: SECTOR }, pane: SHUT },
        { path: '/s/' + SECTOR + '/' + HEX, query: {}, view: map(null), pane: DOSSIER },
        { path: '/s/' + SECTOR + '/' + HEX + '/b/' + BODY, query: {}, view: map(BODY), pane: DOSSIER },
        { path: '/s/' + SECTOR + '/' + HEX + '/orbit', query: {}, view: orbit(null), pane: DOSSIER },
        { path: '/s/' + SECTOR + '/' + HEX + '/orbit/b/' + BODY, query: {}, view: orbit(BODY), pane: DOSSIER },
        { path: '/campaign', query: {}, view: HOME, pane: LIST },
        { path: '/campaign/r/beo%20wulf', query: {}, view: HOME, pane: { kind: 'campaign', record: 'beo wulf' } },
        { path: '/campaign/party', query: {}, view: HOME, pane: PARTY },
        { path: '/account', query: {}, view: { kind: 'page' }, pane: SHUT },
        { path: '/design', query: {}, view: { kind: 'page' }, pane: SHUT },
    ];
    assert.equal(rows.length, 12);
    for (const row of rows) {
        assert.deepEqual(paneOf(row.path, row.query), { view: row.view, pane: row.pane });
    }
    assert.deepEqual(paneOf('/dev/deck-plan'), { view: { kind: 'page' }, pane: SHUT });
});

test('campaign and party name those panes and leave the view, on the map and in orbit', () => {
    const hex = '/s/' + SECTOR + '/' + HEX;
    const body = hex + '/b/' + BODY;
    const orbitPath = hex + '/orbit';
    const orbitBody = orbitPath + '/b/' + BODY;
    assert.deepEqual(paneOf(hex, { panel: 'campaign' }), { view: map(null), pane: LIST });
    assert.deepEqual(paneOf(body, { panel: 'party' }), { view: map(BODY), pane: PARTY });
    assert.deepEqual(paneOf(orbitPath, { panel: 'campaign' }), { view: orbit(null), pane: LIST });
    assert.deepEqual(paneOf(orbitBody, { panel: 'party' }), { view: orbit(BODY), pane: PARTY });
    assert.deepEqual(paneOf(orbitBody, { panel: 'campaign', record: 'beo%20wulf' }), {
        view: orbit(BODY),
        pane: { kind: 'campaign', record: 'beo wulf' },
    });
    assert.deepEqual(paneOf('/s/' + SECTOR, { panel: 'campaign' }), {
        view: { kind: 'sector', sector: SECTOR },
        pane: LIST,
    });
});

test('a record belongs to the campaign pane only, and closed is shut on every path', () => {
    const hex = '/s/' + SECTOR + '/' + HEX;
    const orbitPath = hex + '/orbit';
    assert.deepEqual(paneOf(hex, { panel: 'campaign' }).pane, LIST);
    assert.deepEqual(paneOf(orbitPath, { panel: 'party', record: 'beo%20wulf' }).pane, PARTY);
    for (const path of ['/', '/s/' + SECTOR, hex, hex + '/b/' + BODY, orbitPath, orbitPath + '/b/' + BODY, '/account']) {
        assert.deepEqual(paneOf(path, { panel: 'closed', record: 'beo%20wulf' }).pane, SHUT);
    }
});

test('an unknown panel matches an absent one, and panel=dossier is the dossier', () => {
    const hex = '/s/' + SECTOR + '/' + HEX;
    const orbitPath = hex + '/orbit/b/' + BODY;
    assert.deepEqual(paneOf(hex, { panel: 'ships' }).pane, paneOf(hex).pane);
    assert.deepEqual(paneOf('/', { panel: 'ships' }).pane, paneOf('/').pane);
    assert.deepEqual(paneOf('/s/' + SECTOR, { panel: 'ships' }).pane, SHUT);
    assert.deepEqual(paneOf(orbitPath, { panel: 'ships' }).pane, DOSSIER);
    assert.deepEqual(paneOf(hex, { panel: 'dossier' }).pane, DOSSIER);
    assert.deepEqual(paneOf('/', { panel: 'dossier' }).pane, DOSSIER);
    assert.deepEqual(paneOf(orbitPath, { panel: 'dossier' }).pane, DOSSIER);
});

test('the three old campaign paths redirect onto the home map and keep the camera and the clock', () => {
    const carried = { x: '1', y: '2', z: '3', date: '120', time: '0800', campaignStandIn: '1', panel: 'closed', record: 'old' };
    const kept = { x: '1', y: '2', z: '3', date: '120', time: '0800', campaignStandIn: '1' };
    const list = campaignRedirect('/campaign', carried);
    const party = campaignRedirect('/campaign/party', carried);
    const record = campaignRedirect('/campaign/r/beo%20wulf', carried);
    assert.deepEqual(list, { path: '/', query: { ...kept, panel: 'campaign' } });
    assert.deepEqual(party, { path: '/', query: { ...kept, panel: 'party' } });
    assert.deepEqual(record, { path: '/', query: { ...kept, panel: 'campaign', record: 'beo wulf' } });
    assert.deepEqual(paneOf(list.path, list.query).pane, LIST);
    assert.deepEqual(paneOf(party.path, party.query).pane, PARTY);
    assert.deepEqual(paneOf(record.path, record.query), { view: HOME, pane: { kind: 'campaign', record: 'beo wulf' } });
});

test('panel=dossier is stripped, and a canonical address is not redirected', () => {
    const hex = '/s/' + SECTOR + '/' + HEX;
    assert.deepEqual(campaignRedirect(hex, { panel: 'dossier', x: '1', record: 'no' }), {
        path: hex,
        query: { x: '1', record: 'no' },
    });
    assert.equal(campaignRedirect(hex, { panel: 'campaign', x: '1' }), null);
    assert.equal(campaignRedirect('/', { x: '1', y: '2', z: '3' }), null);
    assert.equal(campaignRedirect('/account'), null);
});

test('a pan sets the camera and keeps the pane, the clock and the stand-in', () => {
    const query = {
        panel: 'campaign',
        record: 'beowulf',
        x: '1',
        y: '2',
        z: '3',
        date: '120',
        time: '0800',
        campaignStandIn: '1',
        extra: 'drop',
    };
    assert.deepEqual(withQuery(query, { x: '9', y: '8', z: '7' }), {
        panel: 'campaign',
        record: 'beowulf',
        x: '9',
        y: '8',
        z: '7',
        date: '120',
        time: '0800',
        campaignStandIn: '1',
    });
});

test('a panel query wins on a legacy campaign path, and paneOf does not', () => {
    assert.deepEqual(paneOf('/campaign', { panel: 'closed' }).pane, LIST);
    assert.deepEqual(addressPane('/campaign', { panel: 'closed' }), { view: HOME, pane: SHUT });
    assert.deepEqual(addressPane('/campaign/party', { panel: 'campaign', record: 'beo%20wulf' }).pane, {
        kind: 'campaign',
        record: 'beo wulf',
    });
    assert.deepEqual(addressPane('/campaign'), paneOf('/campaign'));
    assert.deepEqual(addressPane('/s/' + SECTOR + '/' + HEX + '/orbit', { panel: 'campaign' }).pane, LIST);
});

test('pane changes are the query the screens write', () => {
    assert.deepEqual(paneChanges(SHUT), { panel: 'closed', record: null });
    assert.deepEqual(paneChanges(DOSSIER), { panel: null, record: null });
    assert.deepEqual(paneChanges(PARTY), { panel: 'party', record: null });
    assert.deepEqual(paneChanges(LIST), { panel: 'campaign', record: null });
    assert.deepEqual(paneChanges({ kind: 'campaign', record: 'beowulf' }), { panel: 'campaign', record: 'beowulf' });
    const orbitPath = '/s/' + SECTOR + '/' + HEX + '/orbit';
    const opened = withQuery({ date: '120', time: '0800', x: '1' }, paneChanges(LIST));
    assert.deepEqual(addressPane(orbitPath, opened).pane, LIST);
    assert.equal(addressPane(orbitPath, opened).view.kind, 'orbit');
});

test('escape steps the pane and leaves an orbit overview to the view', () => {
    const hex = '/s/' + SECTOR + '/' + HEX;
    const orbitPath = hex + '/orbit';
    assert.deepEqual(escapePane(orbitPath, { panel: 'campaign', record: 'beowulf', date: '120' }), {
        path: orbitPath,
        query: { panel: 'campaign', date: '120' },
    });
    assert.deepEqual(escapePane(orbitPath, { panel: 'party', date: '120' }), {
        path: orbitPath,
        query: { panel: 'closed', date: '120' },
    });
    assert.deepEqual(escapePane(hex + '/b/' + BODY, { x: '1' }), { path: hex, query: { x: '1' } });
    assert.deepEqual(escapePane(hex, { x: '1' }), { path: hex, query: { panel: 'closed', x: '1' } });
    assert.equal(escapePane(orbitPath, { date: '120' }), null);
    assert.equal(escapePane('/', { panel: 'closed' }), null);
});

test('focus stays on a cold load, and follows the pane table after that', () => {
    const shut = SHUT;
    const list = LIST;
    const record = { kind: 'campaign', record: 'beowulf' };
    const dossier = DOSSIER;
    assert.equal(focusTarget(null, list), 'leave');
    assert.equal(focusTarget(null, dossier), 'leave');
    assert.equal(focusTarget(shut, list), 'list-search');
    assert.equal(focusTarget(list, record), 'record-title');
    assert.equal(focusTarget(record, list), 'record-row');
    assert.equal(focusTarget(list, shut), 'rail-campaign');
    assert.equal(focusTarget(dossier, list), 'list-search');
    assert.equal(focusTarget(list, dossier), 'dossier-heading');
    assert.equal(focusTarget(dossier, shut), 'rail-system');
});
