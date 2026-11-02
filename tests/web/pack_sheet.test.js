/**
 * AQ10. The Player Pack prints a sheet as "Label: value" lines, in the sheet
 * file's order, and prints no vessel status until question 129.
 * planPack is apps/web/src/pack/plan.ts. renderPack is apps/web/src/pack/html.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPack } from '../../apps/web/src/pack/plan.ts';
import { renderPack } from '../../apps/web/src/pack/html.ts';

const HIDDEN = 'cr_22222222-2222-4222-8222-222222222222';
const PERSON = 'cr_11111111-1111-4111-8111-111111111111';
const SHIP = 'cr_33333333-3333-4333-8333-333333333333';
const SECRET = 'The crate mark stays in this block.';

const PAINT = {
    bg: 'black',
    surface: 'black',
    text: 'white',
    muted: 'silver',
    line: 'silver',
    signal: 'teal',
    onSignal: 'black',
};

function row(id, type, name) {
    return {
        id,
        type,
        kind: type,
        name,
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: 'Regina/1910', locationLabel: 'downport' },
        when: null,
        visibility: 'players',
        playerNotes: 'For the table',
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

function pack(records) {
    return planPack({
        name: 'Open',
        clockDays: null,
        records,
        links: {},
        journal: {},
        settings: null,
    });
}

test('a sheet is label and value, in the file order, with empty boxes left out', () => {
    const person = row(PERSON, 'person', 'Helena');
    person.sheet = {
        schema: 'mgt2e_character@1',
        characterId: 'ch-1',
        homeworld: { id: HIDDEN },
        fields: {
            Species: '',
            'Career Survival 1': true,
            'Career Survival 2': false,
            Age: '34',
            Title: 'Captain',
            'Extra/Admin/4/Specialism': 'broker',
            'Passenger Name 1 record': HIDDEN,
        },
    };
    const ship = row(SHIP, 'vessel', 'Beowulf');
    ship.playerNotes = 'Your ship.';
    ship.sheet = {
        schema: 'mgt2e_ship_sheet@1',
        fields: {
            'Armour Critical Hit 1': true,
            'Purchase Cost': '50',
            'Mortgage Cost': '   ',
            'Distinguishing Features': 'scarred',
        },
    };
    ship.status = {
        track: [{ mode: 'docked', note: 'berthed' }],
        cargo: [{ label: 'Crate', tons: 4 }],
        payment: { amountCr: 1000, everyDays: 30, nextDueDay: { year: 1105, day: 30 } },
        fuelTons: 12,
        fuelMark: 'naval',
    };
    const hidden = row(HIDDEN, 'note', 'SECRETNAME');
    hidden.visibility = 'referee';

    const plan = pack({ [PERSON]: person, [SHIP]: ship, [HIDDEN]: hidden });
    const helena = plan.records.find((item) => item.id === PERSON);
    const beowulf = plan.records.find((item) => item.id === SHIP);
    assert.equal(helena.status, null);
    assert.equal(beowulf.status, null);
    assert.equal(helena.place, 'Regina/1910 · downport');
    assert.equal(helena.playerNotes, 'For the table');
    assert.equal(
        helena.sheet,
        'Title: Captain\nAge: 34\nCareer Survival 1: yes\nExtra/Admin/4/Specialism: broker',
    );
    assert.equal(
        beowulf.sheet,
        'Distinguishing Features: scarred\nPurchase Cost: 50\nArmour Critical Hit 1: yes',
    );
    assert.equal(helena.sheet.includes('ch-1'), false);
    assert.equal(helena.sheet.includes(HIDDEN), false);
    assert.equal(helena.sheet.includes('Species'), false);

    const html = renderPack(plan, PAINT);
    assert.equal(html.includes('<h3>Status</h3>'), false);
    assert.equal(html.includes('fuelMark'), false);
    assert.equal(html.includes('berthed'), false);
    assert.equal(html.includes('Crate'), false);
    assert.equal(html.includes('Your ship.'), true);
    assert.equal(html.includes('Regina/1910'), true);
    assert.equal(html.includes('Title: Captain'), true);
    assert.equal(html.includes('Distinguishing Features: scarred'), true);
});

test('a sheet value drops a referee passage and a hidden id', () => {
    const person = row(PERSON, 'person', 'Helena');
    person.sheet = {
        schema: 'mgt2e_character@1',
        fields: {
            Title: 'Seen [[' + HIDDEN + '|Secret label]]\n:::referee\n' + SECRET + '\n:::\nAlso ' + HIDDEN,
        },
    };
    const hidden = row(HIDDEN, 'note', 'SECRETNAME');
    hidden.visibility = 'referee';
    const plan = pack({ [PERSON]: person, [HIDDEN]: hidden });
    const sheet = plan.records.find((item) => item.id === PERSON).sheet;
    assert.equal(sheet.includes(SECRET), false);
    assert.equal(sheet.includes(':::referee'), false);
    assert.equal(sheet.includes(HIDDEN), false);
    assert.equal(sheet.includes('Secret label'), false);
    assert.equal(sheet, 'Title: Seen a record\nAlso a record');
});
