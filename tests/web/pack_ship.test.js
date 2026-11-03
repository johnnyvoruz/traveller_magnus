/**
 * AQ11. A players vessel that is one of the party's ships prints the player's
 * page: Cargo, Passengers, Fuel, Ledger and the sheet, as lines. A vessel that
 * is not the party's stays on the AQ10 sheet lines, with no status.
 * planPack is apps/web/src/pack/plan.ts. renderPack is apps/web/src/pack/html.ts.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPack } from '../../apps/web/src/pack/plan.ts';
import { renderPack } from '../../apps/web/src/pack/html.ts';

const HIDDEN = 'cr_22222222-2222-4222-8222-222222222222';
const PERSON = 'cr_11111111-1111-4111-8111-111111111111';
const SHIP = 'cr_33333333-3333-4333-8333-333333333333';
const OTHER = 'cr_44444444-4444-4444-8444-444444444444';
const EMPTY = 'cr_55555555-5555-4555-8555-555555555555';
const LINK = 'cl_66666666-6666-4666-8666-666666666666';
const GHOST_LINK = 'cl_77777777-7777-4777-8777-777777777777';

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
        anchor: null,
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: '2026-11-02T00:00:00.000Z',
        updatedAt: '2026-11-02T00:00:00.000Z',
        deleted: false,
    };
}

function link(id, from, to) {
    return {
        id,
        from,
        to,
        kind: 'crew',
        role: '',
        order: 0,
        since: null,
        until: null,
        notes: '',
        visibility: 'players',
        provenance: null,
        rev: 1,
        createdAt: '2026-11-02T00:00:00.000Z',
        updatedAt: '2026-11-02T00:00:00.000Z',
        deleted: false,
    };
}

function campaign() {
    const person = row(PERSON, 'person', 'Ada');
    const ghost = row(HIDDEN, 'person', 'Ghost');
    ghost.visibility = 'referee';
    const ship = row(SHIP, 'vessel', 'Beowulf');
    ship.sheet = {
        schema: 'mgt2e_ship_sheet@1',
        fields: {
            Size: '200',
            'Distinguishing Features': 'scarred',
            'Purchase Cost': '50',
            'Fuel Capacity': '41',
            'Cargo Capacity': '10',
            'Armour Critical Hit 1': true,
            'Armour Critical Hit 2': false,
            'Yard note': 'kept',
        },
        deckPlan: {
            meta: 'Traveller Geomorph Ship',
            name: 'Beowulf plan',
            parts: [{ code: 'BRIDGE-1', corner: [3.5, 9.25], rotation: 0 }],
        },
    };
    ship.status = {
        track: [{ mode: 'docked', note: 'berthed-secret' }],
        cargo: [{
            itemId: HIDDEN,
            label: 'Textiles',
            tons: 12,
            value: 2400,
            origin: 'Regina',
            destination: 'Jenghe',
            note: 'See ' + HIDDEN + ' at the dock.\n:::referee\nsecret berth\n:::',
        }],
        passengers: [
            { personId: HIDDEN, label: 'Courier', class: 'High' },
            { personId: PERSON, label: 'Ada label', class: 'Middle', fareCr: 6600 },
            { label: '', class: '' },
        ],
        ledger: [
            { when: { year: 1105, day: 10 }, amount: -500, memo: 'berthing', kind: 'expense' },
            { when: { year: 1105, day: 14 }, amount: 4000, memo: 'charter', kind: 'income' },
        ],
        owners: [{ holder: 'party', shares: 1, name: 'OwnerSecret' }],
        payment: { amountCr: 1000, everyDays: 30, nextDueDay: { year: 1105, day: 30 }, payee: 'PayeeSecret' },
        fuelTons: 30,
        fuelMark: 'naval',
    };
    const other = row(OTHER, 'vessel', 'Pinnace');
    other.sheet = {
        schema: 'mgt2e_ship_sheet@1',
        fields: {
            'Distinguishing Features': 'plain hull',
            'Armour Critical Hit 1': true,
        },
    };
    other.status = {
        cargo: [{ label: 'SideLot', tons: 1 }],
        fuelTons: 4,
        fuelMark: 'scout',
    };
    const empty = row(EMPTY, 'vessel', 'Empty Hull');
    const hiddenShip = row('cr_88888888-8888-4888-8888-888888888888', 'vessel', 'Black Box');
    hiddenShip.visibility = 'referee';
    hiddenShip.status = { fuelMark: 'naval', cargo: [{ label: 'SecretCrate', tons: 1 }] };
    return {
        records: {
            [PERSON]: person,
            [HIDDEN]: ghost,
            [SHIP]: ship,
            [OTHER]: other,
            [EMPTY]: empty,
            [hiddenShip.id]: hiddenShip,
        },
        links: {
            [LINK]: link(LINK, PERSON, SHIP),
            [GHOST_LINK]: link(GHOST_LINK, HIDDEN, SHIP),
        },
        settings: {
            party: {
                vesselIds: [SHIP, EMPTY, hiddenShip.id],
                aboard: {},
                memberIds: [PERSON],
                anchor: null,
            },
            kinds: {},
        },
    };
}

function packOf() {
    const built = campaign();
    return planPack({
        name: 'Open',
        clockDays: null,
        records: built.records,
        links: built.links,
        journal: {},
        settings: built.settings,
    });
}

function article(html, id) {
    const start = html.indexOf('id="r-' + id + '"');
    assert.equal(start > -1, true);
    const next = html.indexOf('<article', start + 1);
    return html.slice(start, next === -1 ? html.length : next);
}

test('a party ship prints the player page as lines', () => {
    const plan = packOf();
    const ship = plan.records.find((item) => item.id === SHIP);
    assert.equal(ship.status, null);
    assert.equal(
        ship.cargo,
        '12 t of 10 t\n'
        + 'The hold is over capacity by 2 t.\n'
        + 'Textiles 12 t\n'
        + 'Cr2,400 · from Regina · to Jenghe · See a record at the dock.',
    );
    assert.equal(
        ship.passengers,
        'Courier · High\nAda · Middle · Boarded, Cr6,600\nUnnamed passenger',
    );
    assert.equal(ship.fuel, '30 t of 41 t');
    assert.equal(
        ship.ledger,
        'Cr3,500\n'
        + '014-1105 Cr4,000\n'
        + 'charter Income Cr4,000\n'
        + '010-1105 \u2212Cr500\n'
        + 'berthing Expense \u2212Cr500',
    );
    assert.equal(
        ship.sheet,
        'Ship Data File\n'
        + 'Size: 200\n'
        + 'Ship SHeet\n'
        + 'Distinguishing Features: scarred\n'
        + 'Purchase Cost: 50\n'
        + 'Drives\n'
        + 'Fuel Capacity: 41\n'
        + 'Critical Hits\n'
        + 'Armour Critical Hit 1: Yes\n'
        + 'Cargo Hold Contents\n'
        + 'Cargo Capacity: 10\n'
        + 'Cargo Type 1: Textiles\n'
        + 'Cargo Tons 1: 12\n'
        + 'Cargo Notes 1: See a record at the dock.\n'
        + 'Passengers\n'
        + 'Passenger Name 1: Courier\n'
        + 'Passage 1: High\n'
        + 'Passenger Name 2: Ada\n'
        + 'Passage 2: Middle · Cr6,600\n'
        + 'Crew\n'
        + 'People: Ada\n'
        + 'Yard note: kept\n'
        + 'Deck plan',
    );
    assert.equal(ship.sheet.includes('yes'), false);
    assert.equal(JSON.stringify(ship).includes(HIDDEN), false);
    assert.equal(JSON.stringify(ship).includes('secret berth'), false);
    assert.equal(JSON.stringify(ship).includes('BRIDGE-1'), false);
    assert.equal(JSON.stringify(ship).includes('3.5'), false);
    assert.equal(JSON.stringify(ship).includes('Ghost'), false);
    assert.equal(JSON.stringify(ship).includes('Ada label'), false);
    assert.equal(JSON.stringify(ship).includes('fuelMark'), false);
    assert.equal(JSON.stringify(ship).includes('berthed-secret'), false);
    assert.equal(JSON.stringify(ship).includes('OwnerSecret'), false);
    assert.equal(JSON.stringify(ship).includes('PayeeSecret'), false);
    assert.equal(JSON.stringify(ship).includes('naval'), false);

    const html = renderPack(plan, PAINT);
    const body = article(html, SHIP);
    assert.equal(body.includes('<h3>Cargo</h3>'), true);
    assert.equal(body.includes('<h3>Passengers</h3>'), true);
    assert.equal(body.includes('<h3>Fuel</h3>'), true);
    assert.equal(body.includes('<h3>Ledger</h3>'), true);
    assert.equal(body.includes('<h3>Sheet</h3>'), true);
    assert.equal(body.includes('<h3>Status</h3>'), false);
    assert.equal(body.includes('Show all'), false);
    assert.equal(html.includes('Black Box'), false);
    assert.equal(html.includes('SecretCrate'), false);
    assert.equal(plan.records.some((item) => item.name === 'Black Box'), false);
    assert.equal(plan.records.some((item) => item.name === 'Ghost'), false);
});

test('a players vessel that is not the party ship prints as before', () => {
    const plan = packOf();
    const other = plan.records.find((item) => item.id === OTHER);
    assert.equal(other.status, null);
    assert.equal(other.cargo, null);
    assert.equal(other.passengers, null);
    assert.equal(other.fuel, null);
    assert.equal(other.ledger, null);
    assert.equal(
        other.sheet,
        'Distinguishing Features: plain hull\nArmour Critical Hit 1: yes',
    );
    const html = renderPack(plan, PAINT);
    const body = article(html, OTHER);
    assert.equal(body.includes('<h3>Cargo</h3>'), false);
    assert.equal(body.includes('<h3>Passengers</h3>'), false);
    assert.equal(body.includes('<h3>Fuel</h3>'), false);
    assert.equal(body.includes('<h3>Ledger</h3>'), false);
    assert.equal(body.includes('<h3>Status</h3>'), false);
    assert.equal(body.includes('SideLot'), false);
    assert.equal(body.includes('scout'), false);
    assert.equal(body.includes('plain hull'), true);
});

test('an empty party ship still prints the four sections', () => {
    const plan = packOf();
    const empty = plan.records.find((item) => item.id === EMPTY);
    assert.equal(empty.cargo, '0 t aboard.\nThe hold is empty.');
    assert.equal(empty.passengers, 'No passengers.');
    assert.equal(empty.fuel, 'The ship sheet says nothing about fuel yet.');
    assert.equal(empty.ledger, 'Cr0\nNothing on the ledger yet.');
    assert.equal(empty.sheet, null);
    assert.equal(empty.status, null);
    const body = article(renderPack(plan, PAINT), EMPTY);
    assert.equal(body.includes('<h3>Cargo</h3>'), true);
    assert.equal(body.includes('<h3>Passengers</h3>'), true);
    assert.equal(body.includes('<h3>Fuel</h3>'), true);
    assert.equal(body.includes('<h3>Ledger</h3>'), true);
    assert.equal(body.includes('<h3>Sheet</h3>'), false);
    assert.equal(body.includes('<h3>Status</h3>'), false);
    assert.equal(body.includes('The hold is empty.'), true);
    assert.equal(body.includes('Nothing on the ledger yet.'), true);
});
