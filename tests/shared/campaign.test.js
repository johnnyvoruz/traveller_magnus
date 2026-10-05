import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CAMPAIGN_LIMITS,
    CAMPAIGN_LINK_KINDS,
    CAMPAIGN_RECORD_TYPES,
    CampaignAnchor,
    CampaignChanges,
    CampaignProvenance,
    CampaignClock,
    CampaignLink,
    CampaignPage,
    CampaignRecord,
    CampaignSettings,
    Universe,
    UniverseCreate,
    UniverseUpdate,
    linkAllowed,
    locate,
} from '@voyage/shared';

const RECORD = 'cr_11111111-1111-1111-1111-111111111111';
const OTHER = 'cr_22222222-2222-2222-2222-222222222222';
const LINK = 'cl_33333333-3333-3333-3333-333333333333';
const STAMP = '2026-10-04T00:00:00.000Z';

function record(over = {}) {
    return {
        id: RECORD,
        type: 'person',
        kind: '',
        name: 'Voss',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w3m1', locationLabel: 'Regina' },
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

function link(over = {}) {
    return {
        id: LINK,
        from: RECORD,
        to: OTHER,
        kind: 'contact',
        role: '',
        order: 0,
        since: null,
        until: null,
        notes: '',
        visibility: 'referee',
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function settings(over = {}) {
    return {
        party: { vesselId: null, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
        ...over,
    };
}

function universe(over = {}) {
    return {
        id: 'uni-1',
        ownerId: 'user-1',
        name: 'My campaign',
        slug: 'my-campaign',
        truthVersion: 'v5',
        engineVersion: '1.0.0',
        editionDefault: 'MgT2E',
        createdAt: STAMP,
        updatedAt: STAMP,
        deletedAt: null,
        purgeAfter: null,
        hexOverrideCount: 0,
        objectBytes: 0,
        lastSnapshotAt: null,
        ...over,
    };
}

function idFor(prefix, n) {
    const hex = n.toString(16).padStart(12, '0');
    return `${prefix}_00000000-0000-0000-0000-${hex}`;
}

test('each campaign schema accepts a good value', () => {
    assert.equal(Universe.safeParse(universe()).success, true);
    assert.equal(UniverseCreate.safeParse({ name: 'My campaign', truthVersion: 'v5', editionDefault: 'MgT2E' }).success, true);
    assert.equal(UniverseCreate.safeParse({ name: 'Blank chart', truthVersion: null, editionDefault: 'MgT2E' }).success, true);
    assert.equal(UniverseCreate.safeParse({ id: 'uni_client_1', name: 'My campaign', truthVersion: null, editionDefault: 'MgT2E' }).success, true);
    assert.equal(UniverseUpdate.safeParse({ name: 'My campaign' }).success, true);
    assert.equal(CampaignAnchor.safeParse(null).success, true);
    assert.equal(CampaignAnchor.safeParse({ kind: 'system', hexKey: 'Spinward_Marches/1910' }).success, true);
    assert.equal(CampaignAnchor.safeParse({ kind: 'record', id: RECORD }).success, true);
    assert.equal(CampaignRecord.safeParse(record()).success, true);
    const copied = { mode: 'copy', universeId: 'uni-9', recordId: OTHER, rev: 4, at: STAMP };
    const shared = { mode: 'shared', universeId: 'uni-9', recordId: RECORD, rev: 2, at: STAMP };
    assert.equal(CampaignProvenance.safeParse(copied).success, true);
    assert.equal(CampaignRecord.safeParse(record({ provenance: copied })).success, true);
    assert.equal(CampaignLink.safeParse(link({ provenance: shared })).success, true);
    assert.equal(CampaignRecord.safeParse(record({ name: 'V'.repeat(CAMPAIGN_LIMITS.name), summary: 's'.repeat(CAMPAIGN_LIMITS.summary), details: 'd'.repeat(CAMPAIGN_LIMITS.details), tags: Array.from({ length: CAMPAIGN_LIMITS.tags }, () => 't'.repeat(CAMPAIGN_LIMITS.tag)) })).success, true);
    assert.equal(CampaignLink.safeParse(link()).success, true);
    assert.equal(CampaignSettings.safeParse(settings()).success, true);
    assert.equal(CampaignClock.safeParse({ days: 403326.5, rev: 1 }).success, true);
    assert.equal(CampaignClock.safeParse({ days: 0, rev: 0 }).success, true);
    assert.equal(CampaignChanges.safeParse({ records: [{ ...record(), baseRev: 0 }] }).success, true);
    assert.equal(CampaignChanges.safeParse({ records: [{ id: RECORD, baseRev: 1, deleted: true }] }).success, true);
    assert.equal(CampaignChanges.safeParse({ clock: { days: 403326.5, baseRev: 0 } }).success, true);
    assert.equal(CampaignPage.safeParse({ records: [record()], links: [link()], settings: settings(), clock: { days: 403326.5, rev: 1 }, seq: 1, done: true }).success, true);
    assert.equal(CampaignPage.safeParse({ records: [], links: [], settings: settings(), clock: null, seq: 0, done: true }).success, true);
});

test('schemas reject §0.10 breaches and a legacy hex id', () => {
    assert.equal(Universe.safeParse(universe({ name: 'n'.repeat(201) })).success, false);
    assert.equal(UniverseCreate.safeParse({ name: '', truthVersion: null, editionDefault: 'MgT2E' }).success, false);
    assert.equal(UniverseCreate.safeParse({ id: '', name: 'My campaign', truthVersion: null, editionDefault: 'MgT2E' }).success, false);
    assert.equal(UniverseCreate.safeParse({ id: 'has space', name: 'My campaign', truthVersion: null, editionDefault: 'MgT2E' }).success, false);
    assert.equal(UniverseCreate.safeParse({ id: 'a/b', name: 'My campaign', truthVersion: null, editionDefault: 'MgT2E' }).success, false);
    assert.equal(UniverseUpdate.safeParse({ name: 'n'.repeat(201) }).success, false);
    assert.equal(CampaignAnchor.safeParse({ kind: 'system', hexKey: '1-A-0101' }).success, false);
    assert.equal(CampaignAnchor.safeParse({ kind: 'system', hexId: '1-A-0101' }).success, false);
    assert.equal(CampaignRecord.safeParse(record({ name: 'n'.repeat(201) })).success, false);
    assert.equal(CampaignRecord.safeParse(record({ summary: 's'.repeat(501) })).success, false);
    assert.equal(CampaignRecord.safeParse(record({ details: 'd'.repeat(20_001) })).success, false);
    assert.equal(CampaignRecord.safeParse(record({ tags: Array.from({ length: 33 }, () => 'tag') })).success, false);
    assert.equal(CampaignRecord.safeParse(record({ tags: ['t'.repeat(41)] })).success, false);
    assert.equal(CampaignRecord.safeParse(record({ anchor: { kind: 'system', hexKey: '1-C-1910' } })).success, false);
    const bare = record();
    delete bare.provenance;
    assert.equal(CampaignRecord.safeParse(bare).success, false);
    assert.equal(CampaignRecord.safeParse(record({ provenance: { mode: 'campaign', universeId: 'uni-9', recordId: OTHER, rev: 1, at: STAMP } })).success, false);
    assert.equal(CampaignLink.safeParse(link({ provenance: { mode: 'copy', universeId: '', recordId: OTHER, rev: 1, at: STAMP } })).success, false);
    assert.equal(CampaignSettings.safeParse(settings({ party: { vesselId: null, memberIds: [], anchor: { kind: 'system', hexKey: '1-A-0101' } } })).success, false);
    const tooMany = [];
    for (let i = 0; i < 201; i += 1) tooMany.push({ ...record({ id: idFor('cr', i) }), baseRev: 0 });
    assert.equal(CampaignClock.safeParse({ days: -1, rev: 0 }).success, false);
    assert.equal(CampaignClock.safeParse({ days: Number.POSITIVE_INFINITY, rev: 0 }).success, false);
    assert.equal(CampaignClock.safeParse({ days: Number.NaN, rev: 0 }).success, false);
    assert.equal(CampaignChanges.safeParse({ clock: { days: -0.25, baseRev: 0 } }).success, false);
    assert.equal(CampaignChanges.safeParse({ records: tooMany }).success, false);
    const atCap = [];
    for (let i = 0; i < CAMPAIGN_LIMITS.patchRows; i += 1) atCap.push({ ...record({ id: idFor('cr', i) }), baseRev: 0 });
    assert.equal(CampaignChanges.safeParse({ records: atCap, clock: { days: 1, baseRev: 0 } }).success, false);
    const bulky = [];
    for (let i = 0; i < 80; i += 1) bulky.push({ ...record({ id: idFor('cr', i), details: 'd'.repeat(20_000) }), baseRev: 0 });
    assert.equal(CampaignChanges.safeParse({ records: bulky }).success, false);
    assert.equal(CampaignPage.safeParse({ records: [record({ anchor: { kind: 'system', hexKey: '1-A-0101' } })], links: [], settings: settings(), clock: null, seq: 0, done: true }).success, false);
    assert.equal(CampaignPage.safeParse({ records: [], links: [], settings: settings(), seq: 0, done: true }).success, false);
});

test('link vocabulary rows use only record types and match linkAllowed', () => {
    assert.deepEqual(CAMPAIGN_LINK_KINDS.map((row) => row.kind), [
        'member', 'owns', 'crew', 'commands', 'ally', 'rival', 'enemy', 'contact', 'patron', 'client', 'target', 'involved',
    ]);
    for (const row of CAMPAIGN_LINK_KINDS) {
        for (const type of [...row.fromTypes, ...row.toTypes]) {
            assert.equal(CAMPAIGN_RECORD_TYPES.includes(type), true, `${row.kind} ${type}`);
        }
        assert.equal(linkAllowed(row.kind, row.fromTypes[0], row.toTypes[0]), true);
        if (row.symmetric) {
            assert.equal(linkAllowed(row.kind, row.toTypes[0], row.fromTypes[0]), true);
            assert.deepEqual([...row.fromTypes], [...row.toTypes]);
        }
    }
    assert.equal(linkAllowed('member', 'person', 'organization'), true);
    assert.equal(linkAllowed('member', 'person', 'person'), false);
    assert.equal(linkAllowed('crew', 'organization', 'vessel'), false);
    assert.equal(linkAllowed('target', 'job', 'vessel'), true);
    assert.equal(linkAllowed('target', 'person', 'job'), false);
    assert.equal(linkAllowed('involved', 'note', 'event'), true);
    assert.equal(linkAllowed('family', 'person', 'person'), false);
    assert.equal(linkAllowed('presence', 'organization', 'place'), false);
});

test('locate follows a chain, stops on a cycle, and returns null for a dangling id', () => {
    const system = { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w0' };
    const direct = { [RECORD]: { anchor: system } };
    assert.deepEqual(locate(RECORD, direct), system);

    const chain = {};
    for (let i = 0; i < 8; i += 1) {
        const id = idFor('cr', i);
        const next = i === 7 ? null : { kind: 'record', id: idFor('cr', i + 1) };
        chain[id] = { anchor: next };
    }
    chain[idFor('cr', 7)] = { anchor: system };
    assert.deepEqual(locate(idFor('cr', 0), chain), system);

    const longer = {};
    for (let i = 0; i < 9; i += 1) {
        longer[idFor('cr', i)] = { anchor: { kind: 'record', id: idFor('cr', i + 1) } };
    }
    longer[idFor('cr', 9)] = { anchor: system };
    assert.equal(locate(idFor('cr', 0), longer), null);

    const cycle = {
        [idFor('cr', 0)]: { anchor: { kind: 'record', id: idFor('cr', 1) } },
        [idFor('cr', 1)]: { anchor: { kind: 'record', id: idFor('cr', 0) } },
    };
    assert.equal(locate(idFor('cr', 0), cycle), null);
    assert.equal(locate(RECORD, { [RECORD]: { anchor: { kind: 'record', id: OTHER } } }), null);
    assert.equal(locate(RECORD, { [RECORD]: { anchor: null } }), null);
});
