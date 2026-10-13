import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PUBLIC_DEFAULT_DAYS,
    PublicGamesSector,
    PublicGamesSetting,
    publicMarkHex,
} from '@voyage/shared';

const STAMP = '2026-10-12T00:00:00.000Z';
const VESSEL = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

function settings(vesselId) {
    return {
        party: { vesselId, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
    };
}

function vessel(over = {}) {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name: 'Beowulf',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' },
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 0,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function leg(mode, from, to, departs, arrives) {
    return { from: { kind: 'system', hexKey: from }, to: { kind: 'system', hexKey: to }, departs, arrives, mode };
}

test('public mark hex follows the party track', () => {
    assert.equal(PUBLIC_DEFAULT_DAYS, 403326);
    const parked = publicMarkHex({
        settings: settings(VESSEL),
        records: [vessel()],
        clock: { days: 10 },
    });
    assert.deepEqual(parked, { sector: 'Spinward_Marches', localHex: '1910' });

    const holding = publicMarkHex({
        settings: settings(VESSEL),
        records: [vessel({
            anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', point: { x: 1, y: 2 } },
        })],
        clock: null,
    });
    assert.deepEqual(holding, { sector: 'Spinward_Marches', localHex: '1910' });

    const moving = vessel({
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/0101' },
        status: { track: [leg('flight', 'Spinward_Marches/1910', 'Spinward_Marches/1911', 10, 20)] },
    });
    assert.deepEqual(publicMarkHex({
        settings: settings(VESSEL),
        records: [moving],
        clock: { days: 15 },
    }), { sector: 'Spinward_Marches', localHex: '1911' });
    assert.deepEqual(publicMarkHex({
        settings: settings(VESSEL),
        records: [vessel({
            status: { track: [leg('jump', 'Spinward_Marches/1910', 'Spinward_Marches/1911', 10, 20)] },
        })],
        clock: { days: 15 },
    }), { sector: 'Spinward_Marches', localHex: '1910' });

    assert.equal(publicMarkHex({
        settings: settings(VESSEL),
        records: [vessel({ anchor: { kind: 'system', hexKey: '~0123456789ABCDEFGHJKMNPQRS/1910' } })],
        clock: { days: 10 },
    }), null);
    assert.equal(publicMarkHex({
        settings: settings(null),
        records: [],
        clock: null,
    }), null);

    assert.equal(PublicGamesSetting.safeParse({ public: true }).success, true);
    assert.equal(PublicGamesSetting.safeParse({ public: true, extra: 1 }).success, false);
    assert.equal(PublicGamesSector.safeParse({
        hexes: [{ hex: '1910', count: 1, name: 'Regina run' }],
    }).success, true);
    assert.equal(PublicGamesSector.safeParse({ hexes: [], universeId: 'x' }).success, false);
});
