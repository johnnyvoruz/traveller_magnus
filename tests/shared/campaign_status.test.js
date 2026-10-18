import test from 'node:test';
import assert from 'node:assert/strict';
import { CampaignRecord, CargoLot, LedgerLine, OwnerShare, PassengerLot, ShipPayment } from '@voyage/shared';

const RECORD = 'cr_11111111-1111-1111-1111-111111111111';
const STAMP = '2026-10-04T00:00:00.000Z';

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

test('an old record still parses, and cargo, passengers and the ledger are optional', () => {
    assert.equal(CampaignRecord.safeParse(record()).success, true);
    assert.equal(CampaignRecord.safeParse(record({ status: null })).success, true);
    const tracked = CampaignRecord.parse(record({ status: { track: [], kept: true } }));
    assert.deepEqual(tracked.status.track, []);
    assert.equal(tracked.status.kept, true);
    assert.equal(tracked.status.cargo, undefined);
    assert.equal(tracked.status.passengers, undefined);
    assert.equal(tracked.status.ledger, undefined);
});

test('cargo, passengers and a ledger line round-trip, and a bad lot fails', () => {
    const cargo = {
        itemId: RECORD,
        label: 'Computers',
        tons: 4,
        value: 10,
        origin: 'Regina',
        destination: 'Jewell',
        note: 'crated',
    };
    const passenger = { personId: RECORD, label: 'Ada', class: 'High', note: 'cabin 2' };
    const line = { when: { year: 1105, day: 12 }, amount: -40, memo: 'berth', kind: 'expense' };
    assert.deepEqual(CargoLot.parse(cargo), cargo);
    assert.deepEqual(PassengerLot.parse(passenger), passenger);
    assert.deepEqual(LedgerLine.parse(line), line);
    const parsed = CampaignRecord.parse(record({
        status: { cargo: [cargo], passengers: [passenger], ledger: [line], note: 'free' },
    }));
    assert.equal(parsed.status.passengers[0].class, 'High');
    assert.equal(parsed.status.passengers[0].note, 'cabin 2');
    assert.equal(parsed.status.note, 'free');
    assert.equal(CargoLot.safeParse({ label: 'Ore', tons: -1 }).success, false);
    assert.equal(CargoLot.safeParse({ label: 'Ore', tons: Number.NaN }).success, false);
    assert.equal(LedgerLine.safeParse({ ...line, kind: 'tax' }).success, false);
    assert.equal(PassengerLot.safeParse({ label: 'Ada', class: 'High', extra: true }).success, false);
});

test('owners, a payment and fuel tons round-trip, and a bad share fails', () => {
    const owner = { holder: { kind: 'record', id: RECORD }, shares: 25 };
    const party = { holder: 'party', shares: 75 };
    const payment = { amountCr: 4800, everyDays: 30, nextDueDay: { year: 1105, day: 40 }, payee: 'The bank' };
    assert.deepEqual(OwnerShare.parse(owner), owner);
    assert.deepEqual(OwnerShare.parse(party), party);
    assert.deepEqual(ShipPayment.parse(payment), payment);
    const parsed = CampaignRecord.parse(record({
        status: { owners: [owner, party], payment, fuelTons: 31, note: 'free' },
    }));
    assert.equal(parsed.status.fuelTons, 31);
    assert.equal(parsed.status.owners[1].holder, 'party');
    assert.equal(parsed.status.payment.amountCr, 4800);
    assert.equal(parsed.status.note, 'free');
    assert.equal(OwnerShare.safeParse({ holder: { kind: 'record', id: RECORD }, shares: 1, price: 2 }).success, false);
    assert.equal(ShipPayment.safeParse({ ...payment, everyDays: 0 }).success, false);
    assert.equal(CampaignRecord.safeParse(record({ status: { fuelTons: Number.NaN } })).success, false);
});
