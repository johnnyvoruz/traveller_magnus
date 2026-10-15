import assert from 'node:assert/strict';
import test from 'node:test';
import {
    CampaignChanges,
    CampaignChangesResult,
    CampaignPage,
    Universe,
    UniverseCreate,
} from '@voyage/shared';
import { parseRead } from '../../apps/web/src/campaign/read.ts';

const STAMP = '2026-10-14T00:00:00.000Z';
const RECORD = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const MEMBER = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const ENTRY = 'cj_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

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

function record(over = {}) {
    return {
        id: RECORD,
        type: 'vessel',
        kind: '',
        name: 'Far Margin',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' },
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: { track: [], spare: 'kept' },
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function entry(over = {}) {
    return {
        id: ENTRY,
        kind: 'note',
        title: 'At Regina',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'public',
        anchor: null,
        mentions: [],
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function page(over = {}) {
    return {
        records: [record()],
        links: [],
        settings: {
            party: { vesselId: RECORD, memberIds: [MEMBER], anchor: null },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
            rev: 0,
        },
        clock: null,
        journal: [entry()],
        seq: 1,
        done: true,
        ...over,
    };
}

test('a campaign read drops unknown keys and keeps a stored public entry', () => {
    const listed = parseRead(Universe.array(), [universe({ later: true, showReferee: false })]);
    assert.equal(Object.hasOwn(listed[0], 'later'), false);
    assert.equal(listed[0].showReferee, false);
    const one = parseRead(Universe, universe({ later: 1 }));
    assert.equal(Object.hasOwn(one, 'later'), false);

    const read = parseRead(CampaignPage, { ...page(), later: 'page' });
    assert.equal(Object.hasOwn(read, 'later'), false);
    assert.equal(read.journal[0].visibility, 'public');
    assert.equal(Object.hasOwn(read.records[0], 'later'), false);
    assert.equal(read.records[0].status.spare, 'kept');
    assert.deepEqual(read.settings.party.vesselIds, [RECORD]);
    assert.deepEqual(read.settings.party.aboard, { [MEMBER]: RECORD });

    const result = parseRead(CampaignChangesResult, {
        applied: [{ table: 'journal', id: ENTRY, rev: 2, seq: 4, later: true }],
        conflicts: [{
            table: 'journal',
            id: ENTRY,
            later: true,
            current: { ...entry(), later: 'entry' },
        }],
        later: true,
    });
    assert.equal(Object.hasOwn(result, 'later'), false);
    assert.equal(Object.hasOwn(result.applied[0], 'later'), false);
    assert.equal(Object.hasOwn(result.conflicts[0], 'later'), false);
    assert.equal(Object.hasOwn(result.conflicts[0].current, 'later'), false);
    assert.equal(result.conflicts[0].current.visibility, 'public');

    assert.equal(Universe.safeParse(universe({ later: true })).success, false);
    assert.equal(CampaignPage.safeParse({ ...page(), later: true }).success, false);
    assert.equal(CampaignChanges.safeParse({ later: true }).success, false);
    assert.equal(UniverseCreate.safeParse({ name: 'My campaign', truthVersion: null, editionDefault: 'MgT2E', later: true }).success, false);
    assert.throws(() => parseRead(CampaignPage, page({ journal: [entry({ visibility: 'secret' })] })));
});
