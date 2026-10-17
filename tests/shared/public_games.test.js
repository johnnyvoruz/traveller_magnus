import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PUBLIC_CARD_BODY,
    PUBLIC_DEFAULT_DAYS,
    PUBLIC_OVERVIEW_MAX,
    PublicGamesOverview,
    PublicGamesSector,
    PublicGamesSetting,
    publicCardJournal,
    fitPublicCard,
    publicCourseLegs,
    publicFinishedLegs,
    PublicShipCard,
    publicFirstHex,
    publicMarkId,
    publicShips,
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
    const parked = publicFirstHex({
        settings: settings(VESSEL),
        records: [vessel()],
        clock: { days: 10 },
    });
    assert.deepEqual(parked, { sector: 'Spinward_Marches', localHex: '1910' });

    const holding = publicFirstHex({
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
    assert.deepEqual(publicFirstHex({
        settings: settings(VESSEL),
        records: [moving],
        clock: { days: 15 },
    }), { sector: 'Spinward_Marches', localHex: '1911' });
    assert.deepEqual(publicFirstHex({
        settings: settings(VESSEL),
        records: [vessel({
            status: { track: [leg('jump', 'Spinward_Marches/1910', 'Spinward_Marches/1911', 10, 20)] },
        })],
        clock: { days: 15 },
    }), { sector: 'Spinward_Marches', localHex: '1910' });

    assert.equal(publicFirstHex({
        settings: settings(VESSEL),
        records: [vessel({ anchor: { kind: 'system', hexKey: '~0123456789ABCDEFGHJKMNPQRS/1910' } })],
        clock: { days: 10 },
    }), null);
    assert.equal(publicFirstHex({
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

test('each party ship publishes its own hex, and a referee record is left out', () => {
    const other = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    const person = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
    const hidden = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
    const outsider = 'cr_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
    const ships = publicShips({
        settings: {
            party: {
                vesselIds: [VESSEL, other, outsider],
                aboard: { [person]: VESSEL, [hidden]: VESSEL },
                memberIds: [person, hidden],
                anchor: null,
            },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
            rev: 1,
        },
        records: [
            vessel({ visibility: 'players', name: 'Far Margin' }),
            vessel({
                id: other,
                visibility: 'referee',
                name: 'Hidden hull',
                anchor: { kind: 'system', hexKey: 'Spinward_Marches/1911' },
            }),
            vessel({
                id: outsider,
                visibility: 'players',
                name: 'Not in the party',
                anchor: { kind: 'system', hexKey: '~own/1912' },
            }),
            vessel({
                id: person,
                type: 'person',
                visibility: 'players',
                name: 'Voss',
                anchor: null,
            }),
            vessel({
                id: hidden,
                type: 'person',
                visibility: 'referee',
                name: 'Referee only',
                anchor: null,
            }),
        ],
        clock: { days: 10 },
    });
    assert.deepEqual(ships.map((ship) => ({ name: ship.name, hex: ship.hex, aboard: ship.aboard })), [
        { name: 'Far Margin', hex: { sector: 'Spinward_Marches', localHex: '1910' }, aboard: ['Voss'] },
    ]);
});

test('a public mark id is stable and does not carry the record id', async () => {
    const universeId = 'uni_11111111-1111-4111-8111-111111111111';
    const first = await publicMarkId(universeId, VESSEL);
    const second = await publicMarkId(universeId, VESSEL);
    assert.equal(first, second);
    assert.match(first, /^pm_[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(first.includes(VESSEL), false);
    assert.equal(first.includes(universeId), false);
    assert.equal(first.includes('cr_'), false);
});

test('a public card keeps finished chart hexes and public notes', () => {
    const ship = vessel({
        visibility: 'players',
        status: {
            track: [
                {
                    from: { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w1' },
                    to: { kind: 'system', hexKey: 'Spinward_Marches/1911', point: { x: 1, y: 2 } },
                    departs: 1,
                    arrives: 10,
                    mode: 'jump',
                    note: 'zzsecretnote',
                },
                {
                    from: { kind: 'system', hexKey: 'Spinward_Marches/1911' },
                    to: { kind: 'system', hexKey: 'zzunfinished/1912' },
                    departs: 20,
                    arrives: 500,
                    mode: 'flight',
                },
            ],
        },
    });
    const legs = publicFinishedLegs(ship, { [VESSEL]: ship }, 100);
    assert.deepEqual(legs, [{ from: 'Spinward_Marches/1910', to: 'Spinward_Marches/1911', departs: 1, arrives: 10 }]);
    const notes = publicCardJournal([
        { id: 'b', deleted: false, visibility: 'public', title: 'New', body: 'x'.repeat(PUBLIC_CARD_BODY + 5), when: { year: 1105, day: 3 }, realDate: null, updatedAt: '2026-10-14T00:00:02.000Z' },
        { id: 'a', deleted: false, visibility: 'referee', title: 'Hidden', body: 'no', when: null, realDate: null, updatedAt: '2026-10-14T00:00:03.000Z' },
        { id: 'c', deleted: false, visibility: 'players', title: 'Party', body: 'no', when: null, realDate: null, updatedAt: '2026-10-14T00:00:01.000Z' },
    ]);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, 'New');
    assert.equal(notes[0].body.length, PUBLIC_CARD_BODY);
    assert.equal(PublicGamesSetting.safeParse({ public: true, showReferee: false }).success, true);
    assert.equal(PublicGamesSetting.safeParse({ public: true }).success, true);
    assert.equal(PublicGamesSetting.safeParse({ public: true, showCourse: false }).success, true);
    assert.equal(PublicGamesSetting.safeParse({ public: true, showCourse: false, later: true }).success, false);
    const course = publicCourseLegs(ship, { [VESSEL]: ship }, 100);
    assert.deepEqual(course, [{ from: 'Spinward_Marches/1911', to: 'zzunfinished/1912', departs: 20, arrives: 500 }]);
    assert.equal(PublicShipCard.safeParse({ game: 'Open', referee: null, example: false, ship: 'Far', aboard: [], legs: [], journal: [] }).success, false);
});

test('the course stays when the card is over its byte budget', () => {
    const wide = 'W'.repeat(4000);
    const finished = {
        from: `${wide}/1910`,
        to: `${wide}/1911`,
        departs: 1,
        arrives: 2,
    };
    const ahead = {
        from: `${wide}/1912`,
        to: `${wide}/1913`,
        departs: 10,
        arrives: 20,
    };
    const note = { title: 'Kept', body: 'x'.repeat(2000), when: null, realDate: null };
    const fitted = fitPublicCard(Array.from({ length: 40 }, () => finished), [note], [ahead]);
    assert.deepEqual(fitted.course, [ahead]);
    assert.equal(fitted.legs.length < 40, true);
    assert.equal(fitted.journal.length, 1);
    const alone = fitPublicCard([finished], [note], Array.from({ length: 40 }, () => ahead));
    assert.equal(alone.legs.length, 0);
    assert.deepEqual(alone.journal, []);
    assert.equal(alone.course.length, 40);
});

test('an overview is hex keys and counts', () => {
    assert.equal(PUBLIC_OVERVIEW_MAX, 20_000);
    const parsed = PublicGamesOverview.safeParse({ hexes: [{ key: 'Spinward_Marches/1910', count: 2 }] });
    assert.equal(parsed.success, true);
    assert.equal(PublicGamesOverview.safeParse({ hexes: [{ key: 'Spinward_Marches/1910', count: 2, name: 'Open' }] }).success, false);
    assert.equal(PublicGamesOverview.safeParse({ hexes: [{ key: '~mine/1910', count: 1 }] }).success, false);
    assert.equal(PublicGamesOverview.safeParse({ hexes: [{ key: 'Spinward_Marches/1910', count: 0 }] }).success, false);
    assert.equal(PublicGamesOverview.safeParse({ hexes: [], later: true }).success, false);
});
