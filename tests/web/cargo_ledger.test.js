import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as cargo from '../../apps/web/src/campaign/cargo.ts';
import * as ledger from '../../apps/web/src/campaign/ledger.ts';
import * as money from '../../apps/web/src/campaign/money.ts';

const RECORD = 'cr_11111111-1111-1111-1111-111111111111';
const OTHER = 'cr_22222222-2222-2222-2222-222222222222';

test('cargo adds, removes, and sums tons, and capacity is the Cargo Capacity box', () => {
    const first = { label: 'Computers', tons: 4 };
    const second = { label: 'Ore', tons: 2.5 };
    const added = cargo.addCargo(cargo.addCargo([], first), second);
    assert.deepEqual(added, [first, second]);
    assert.equal(cargo.tonsUsed(added), 6.5);
    assert.deepEqual(cargo.removeCargo(added, 0), [second]);
    assert.deepEqual(cargo.removeCargo(added, 9), added);
    assert.equal(cargo.capacityTons({ 'Cargo Capacity': '82' }), 82);
    assert.equal(cargo.capacityTons({ 'Cargo Capacity': '1,200 tons' }), 1200);
    assert.equal(cargo.capacityTons({ 'Cargo Capacity': 'none' }), null);
    assert.equal(cargo.capacityTons({}), null);
    assert.equal(cargo.capacityTons(null), null);
});

test('sheet row n is cargo n, the first sixteen, then and N more', () => {
    const lot = {
        label: 'Computers',
        tons: 4,
        itemId: RECORD,
        value: 10,
        origin: 'Regina',
        destination: 'Jewell',
        note: 'crated',
    };
    const sheet = cargo.sheetFromCargo({ 'Cargo Capacity': '82' }, [lot]);
    assert.equal(sheet['Cargo Capacity'], '82');
    assert.equal(sheet['Cargo Type 1'], 'Computers');
    assert.equal(sheet['Cargo Tons 1'], '4');
    assert.equal(sheet['Cargo Notes 1'], 'crated');
    assert.equal(sheet['Cargo Type 2'], '');
    const edited = { ...sheet, 'Cargo Type 1': 'Machine parts', 'Cargo Tons 1': '6' };
    const back = cargo.cargoFromSheet(edited, [lot]);
    assert.equal(back.length, 1);
    assert.equal(back[0].label, 'Machine parts');
    assert.equal(back[0].tons, 6);
    assert.equal(back[0].itemId, RECORD);
    assert.equal(back[0].value, 10);
    assert.equal(back[0].origin, 'Regina');
    assert.equal(back[0].destination, 'Jewell');

    const many = [];
    for (let i = 1; i <= 17; i += 1) many.push({ label: 'Lot ' + i, tons: 1 });
    const wide = cargo.sheetFromCargo({}, many);
    assert.equal(wide['Cargo Type 16'], 'Lot 16');
    assert.equal(Object.values(wide).includes('Lot 17'), false);
    assert.equal(cargo.cargoMore(many), 'and 1 more');
    assert.equal(cargo.cargoView(many).rows.length, 16);
    assert.equal(cargo.cargoView(many).more, 1);
    const round = cargo.cargoFromSheet(wide, many);
    assert.equal(round.length, 17);
    assert.equal(round[16].label, 'Lot 17');
});

test('a blank cargo row is not stored, and a later row keeps its own lot', () => {
    const lots = [
        { label: 'A', tons: 1, itemId: RECORD },
        { label: 'B', tons: 2, itemId: OTHER },
    ];
    const values = cargo.sheetFromCargo({}, lots);
    values['Cargo Type 1'] = '';
    values['Cargo Tons 1'] = '';
    values['Cargo Notes 1'] = '';
    const next = cargo.cargoFromSheet(values, lots);
    assert.equal(next.length, 1);
    assert.equal(next[0].label, 'B');
    assert.equal(next[0].itemId, OTHER);
    assert.equal(next[0].tons, 2);
});

test('passenger row n is passengers n, with Name, Passage and Notes', () => {
    const lot = { label: 'Ada', class: 'High', note: 'cabin 2', personId: RECORD };
    const sheet = cargo.sheetFromPassengers({}, [lot]);
    assert.equal(sheet['Passenger Name 1'], 'Ada');
    assert.equal(sheet['Passage 1'], 'High');
    assert.equal(sheet['Passenger Notes 1'], 'cabin 2');
    const edited = { ...sheet, 'Passage 1': 'Middle' };
    const back = cargo.passengersFromSheet(edited, [lot]);
    assert.equal(back[0].class, 'Middle');
    assert.equal(back[0].personId, RECORD);
    assert.equal(back[0].note, 'cabin 2');
    const many = [];
    for (let i = 1; i <= 17; i += 1) many.push({ label: 'P' + i, class: 'Low' });
    const wide = cargo.sheetFromPassengers({}, many);
    assert.equal(Object.values(wide).includes('P17'), false);
    assert.equal(cargo.passengerMore(many), 'and 1 more');
    assert.equal(cargo.passengersFromSheet(wide, many)[16].label, 'P17');
    assert.deepEqual(cargo.removePassenger(cargo.addPassenger([], lot), 0), []);
});

test('the ledger posts, sums, and groups by the day on the line', () => {
    const sale = { when: { year: 1105, day: 12 }, amount: 100, memo: 'sale', kind: 'income' };
    const berth = { when: { year: 1105, day: 12 }, amount: -40, memo: 'berth', kind: 'expense' };
    const stipend = { when: { year: 1105, day: 40 }, amount: 5, memo: 'stipend', kind: 'recurring' };
    const posted = ledger.postLedger(ledger.postLedger(ledger.postLedger([], sale), berth), stipend);
    assert.equal(posted.length, 3);
    assert.equal(ledger.ledgerBalance(posted), 65);
    const periods = ledger.ledgerByPeriod(posted);
    assert.equal(periods.length, 2);
    assert.deepEqual({ year: periods[0].year, day: periods[0].day, balance: periods[0].balance }, { year: 1105, day: 12, balance: 60 });
    assert.equal(periods[0].lines.length, 2);
    assert.equal(periods[1].balance, 5);
});

test('credits and megacredits format, and party cash is not these modules', () => {
    assert.equal(money.formatCredits(1234), 'Cr1,234');
    assert.equal(money.formatCredits(-4800), '−Cr4,800');
    assert.equal(money.formatMegaCredits(1.2), 'MCr1.2');
    assert.equal(money.formatMegaCredits(-1.2), '−MCr1.2');
    assert.equal(money.formatMegaCredits(2), 'MCr2');
    const names = [...Object.keys(cargo), ...Object.keys(ledger), ...Object.keys(money)];
    assert.equal(names.some((name) => /cash|hand/i.test(name)), false);
});
