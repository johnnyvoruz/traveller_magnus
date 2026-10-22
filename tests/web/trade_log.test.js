/**
 * AT7. A ticked buy or sell writes one journal note in the same save as the cargo and the ledger.
 * Unticked writes none. A hidden vessel's note is referee-only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mentionsOf } from '@voyage/shared';
import { flushCampaign, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { tradeLogEntry, tradeLogOn, tradeLogSave, TRADE_LOG_PREFIX } from '../../apps/web/src/workspace/trade_here.ts';
import { writeTrade } from '../../apps/web/src/workspace/vessel_trade.ts';

const VESSEL = 'cr_11111111-1111-4111-8111-111111111111';
const NOTE = 'cj_22222222-2222-4222-8222-222222222222';
const HEX = 'Spinward_Marches/1910';
const MEMO = 'Bought Common Electronics (5 t) at Mora';
const STAMP = '2026-10-18T22:04:00.000Z';

function vessel(visibility) {
    return {
        id: VESSEL,
        type: 'vessel',
        kind: '',
        name: 'Beowulf',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Mora' },
        when: null,
        visibility,
        playerNotes: null,
        sheet: null,
        status: { cargo: [], ledger: [] },
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
    };
}

function args(over = {}) {
    return {
        on: true,
        memo: MEMO,
        vessel: { id: VESSEL, name: 'Beowulf', visibility: 'players' },
        hexKey: HEX,
        worldName: 'Mora',
        when: { year: 1105, day: 147 },
        id: NOTE,
        whenReal: STAMP,
        ...over,
    };
}

test('the tick is off until this device stores it for this campaign', () => {
    const box = new Map();
    const read = (key) => (box.has(key) ? box.get(key) : null);
    const write = (key, value) => { box.set(key, value); };
    assert.equal(tradeLogOn(null, read), false);
    assert.equal(tradeLogOn('uni-a', read), false);
    tradeLogSave(null, true, write);
    assert.equal(box.size, 0);
    tradeLogSave('uni-a', true, write);
    assert.equal(box.get(TRADE_LOG_PREFIX + 'uni-a'), '1');
    assert.equal(tradeLogOn('uni-a', read), true);
    assert.equal(tradeLogOn('uni-b', read), false);
    tradeLogSave('uni-a', false, write);
    assert.equal(tradeLogOn('uni-a', read), false);
});

test('unticked writes nothing; ticked writes one note in the ledger line\'s own words', () => {
    assert.equal(tradeLogEntry(args({ on: false })), null);
    const note = tradeLogEntry(args());
    assert.equal(note.kind, 'note');
    assert.equal(note.author, 'referee');
    assert.equal(note.visibility, 'players');
    assert.equal(note.title, '');
    assert.equal(note.sequence, null);
    assert.equal(note.baseRev, 0);
    assert.equal(note.when.year, 1105);
    assert.equal(note.when.day, 147);
    assert.equal(note.body.startsWith(MEMO + '\n\n'), true);
    assert.equal(note.body.includes('[[hex:' + HEX + '|Mora]]'), true);
    assert.equal(note.body.includes('[[' + VESSEL + '|Beowulf]]'), true);
    assert.deepEqual(note.mentions, ['hex:' + HEX, VESSEL]);
    assert.deepEqual(mentionsOf(note.body), note.mentions);
});

test('a hidden vessel\'s entry is referee-only', () => {
    const note = tradeLogEntry(args({ vessel: { id: VESSEL, name: 'Beowulf', visibility: 'referee' } }));
    assert.equal(note.visibility, 'referee');
    assert.deepEqual(note.mentions, ['hex:' + HEX, VESSEL]);
});

test('the note and the cargo and the ledger are one save', async () => {
    resetCampaign();
    transport.schedule = () => () => {};
    campaign.status = 'ready';
    campaign.role = 'owner';
    campaign.universeId = 'uni-a';
    const ship = vessel('players');
    campaign.records[ship.id] = ship;

    const bought = {
        cargo: [{ label: 'Common Electronics', tons: 5, value: 20000, origin: 'Mora' }],
        ledger: [{ when: { year: 1105, day: 147 }, amount: -20000, memo: MEMO, kind: 'expense' }],
    };
    writeTrade(ship, { status: bought });
    assert.equal(Object.keys(campaign.journal).length, 0, 'unticked');
    assert.equal(campaign.records[ship.id].status.cargo.length, 1);
    assert.equal(campaign.records[ship.id].status.ledger[0].memo, MEMO);

    const note = tradeLogEntry(args());
    const held = campaign.records[ship.id];
    let sent = null;
    transport.fetch = async (_url, init) => {
        sent = JSON.parse(init.body);
        return { ok: true, status: 200, json: async () => ({ data: { applied: [], conflicts: [] } }) };
    };
    writeTrade(held, { status: bought }, [note]);
    assert.equal(Object.keys(campaign.journal).length, 1);
    assert.equal(campaign.journal[NOTE].body.startsWith(MEMO), true);
    assert.equal(campaign.journal[NOTE].visibility, 'players');
    assert.equal(campaign.records[ship.id].status.ledger[0].memo, MEMO);
    await flushCampaign();
    assert.equal(sent.records.length, 1);
    assert.equal(sent.journal.length, 1);
    assert.equal(sent.journal[0].id, NOTE);
    assert.equal(sent.records[0].status.cargo[0].label, 'Common Electronics');
    assert.equal(sent.records[0].status.ledger[0].memo, MEMO);
    resetCampaign();
});

test('Trade here ticks Log it once and passes that note with the buy and the sell', () => {
    const screen = readFileSync(new URL('../../apps/web/src/workspace/TradeHere.vue', import.meta.url), 'utf8');
    assert.match(screen, /data-trade-log/);
    assert.match(screen, /Log it/);
    assert.equal(screen.split('}, logTrade(').length - 1, 2);
    assert.match(screen, /tradeLogOn\(id, storageGet\)/);
    assert.match(screen, /let lines = postLedger\(ledger\.value, boughtLine\(good, tons, paid, worldName\.value, when\)\);[\s\S]{0,300}?cargo: addCargo\(cargo\.value, boughtLot\(good, tons, paid, worldName\.value\)\),\s+ledger: lines,/);
    assert.match(screen, /let lines = postLedger\(ledger\.value, soldLine\(item\.lot, slot\.price\.price, worldName\.value, when\)\);[\s\S]{0,300}?cargo: removeCargo\(cargo\.value, item\.index\),\s+ledger: lines,/);
});
