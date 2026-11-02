/**
 * DT6a: Find passengers and freight, the passengers part. The pure helpers around Z's traffic rolls
 * (traffic_lots.ts), the lots and fare lines a take writes, and the screen's wiring. Every number here
 * is read from rules/mgt2e_trade.json through the module, never typed from memory.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CargoLot, PassengerLot } from '@voyage/shared';
import { MARKET_RANGES } from '../../apps/web/src/campaign/markets.ts';
import { freightPay, freightTraffic, lateReduction, mailOffer, passageNeeds, passengerTraffic, trafficTables } from '../../apps/web/src/campaign/traffic_lots.ts';
import { fareMemo, unboarded } from '../../apps/web/src/workspace/passenger_fare.ts';
import {
    berthBoxes, berthLine, berthWords, countsOf, deliveredLine, disembarked, disembarkWords, dueFrom, effectOf, FIT_ORDER, fitTake, lastUpkeep, periodsShown, ROWS_SHOWN, shownRows, upkeepPostedWords, freightLot, freightWords, holdWords, isFreight, LOTS_SHOWN, LOW_BERTHS_FIELD, lotWords, mailLot, mailOfferWords, mailWords, needsWords, passengerWords, rangeFor, rankOf, reachable, rollWords, shownLots, STATEROOMS_FIELD, stewardOf, takeOf, takenLines, takenLots, tookWords,
} from '../../apps/web/src/workspace/traffic_here.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
const world = (over = {}) => ({ tradeCodes: [], starport: 'C', population: 5, techLevel: 8, lawLevel: 0, zone: null, ...over });
function faces(...values) {
    let at = 0;
    return () => { assert.ok(at < values.length, 'asked for more dice than the test gave'); return values[at++]; };
}

test('the markets range covers the jump: 2 for 1 and 2, 4 for 3 and 4, 6 past that', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 9].map(rangeFor), [2, 2, 4, 4, 6, 6, 6, 6]);
    assert.deepEqual(MARKET_RANGES, [2, 4, 6], 'the ranges the markets list offers');
});

test('reachable worlds: within the jump, not the one the ship is at, in the rows\' order', () => {
    const row = (hexKey, parsecs) => ({ hexKey, name: hexKey, starport: 'C', tradeCodes: [], population: '5', wtn: null, parsecs });
    const rows = [row('S/1910', 0), row('S/1911', 1), row('S/2110', 2), row('S/1705', 6)];
    assert.deepEqual(reachable(rows, 2).map((one) => one.hexKey), ['S/1911', 'S/2110']);
    assert.deepEqual(reachable(rows, 1).map((one) => one.hexKey), ['S/1911']);
    assert.deepEqual(reachable(rows, 6).map((one) => one.hexKey), ['S/1911', 'S/2110', 'S/1705']);
});

test('the typed inputs: a blank Steward is nobody, 0 is a trained level; a blank Effect is 0; words are errors', () => {
    assert.equal(stewardOf(''), undefined, 'left off the query: the untrained row (AT2)');
    assert.equal(stewardOf(' 0 '), 0);
    assert.equal(stewardOf('2'), 2);
    assert.equal(stewardOf('-1'), null);
    assert.equal(stewardOf('two'), null);
    assert.equal(effectOf(''), 0);
    assert.equal(effectOf('3'), 3);
    assert.equal(effectOf('-2'), -2);
    assert.equal(effectOf('x'), null);
    assert.equal(takeOf('', 6), 0);
    assert.equal(takeOf('4', 6), 4);
    assert.equal(takeOf('6', 6), 6);
    assert.equal(takeOf('7', 6), null, 'past the roll');
    assert.equal(takeOf('-1', 6), null);
    assert.equal(takeOf('a', 6), null);
});

test('the query leaves steward off when nobody aboard has it: the roll then takes the untrained row', () => {
    const q = { from: world(), to: world(), parsecs: 1, effect: 0, face: faces(3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1) };
    const none = passengerTraffic({ ...q, steward: stewardOf('') });
    assert.ok(none.sharedDms.some((line) => line.label.startsWith('Chief Steward (no steward aboard')), 'the AT2 row');
    const trained = passengerTraffic({ ...q, face: faces(3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), steward: stewardOf('0') });
    assert.ok(trained.sharedDms.some((line) => line.label === 'Chief Steward' && line.dm === 0), 'Steward 0 is trained');
});

test('a roll in words: its dice, each DM by the file\'s label, the row, the count dice', () => {
    const r = passengerTraffic({ from: world({ starport: 'A', population: 8 }), to: world(), parsecs: 2, effect: 2, steward: 1, face: faces(3, 4, 1, 2, 3, 4, 5, 6, 1, 1, 2, 2, 2, 6, 6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3) });
    const low = r.rolls[0];
    assert.equal(low.kind, 'Low');
    const words = rollWords(low);
    assert.ok(words.startsWith('2D: 3, 4 · '), words);
    assert.ok(words.includes('Chief Steward +1'), words);
    assert.ok(words.includes('Starport A (source) +'), words);
    assert.ok(words.includes('Each parsec of destination past the first (1) '), words);
    assert.ok(words.includes(' = ' + low.total + ' → row ' + low.row + ', ' + low.rowDice + ': '), words);
    assert.ok(words.endsWith(' = ' + low.count), words);
    const none = { ...low, rowDice: '0', countDice: [], count: 0, row: '1 or less' };
    assert.ok(rollWords(none).endsWith(' → row 1 or less: none'));
    assert.deepEqual([0, 1, 6].map(passengerWords), ['No passengers', '1 passenger', '6 passengers']);
});

test('the counts by the fares table\'s key, and what the file says they need, in words', () => {
    assert.deepEqual(countsOf({ High: 6, Middle: 0, Basic: 2, Low: 3, Odd: 4 }), { high: 6, basic: 2, low: 3 });
    const needs = passageNeeds(countsOf({ High: 6, Low: 3 }));
    const passages = trafficTables().passengers.passages;
    const high = passages.find((one) => one.name === 'High').requires;
    const low = passages.find((one) => one.name === 'Low').requires;
    const words = needsWords(needs);
    assert.ok(words.startsWith((high.stateroom ?? 0) * 6 + ' stateroom'), words);
    assert.ok(words.includes((low.lowBerth ?? 0) * 3 + ' low berth'), words);
    if (high.stewardLevelsPer) assert.ok(words.includes(Math.ceil(6 / high.stewardLevelsPer) + ' steward level'), words);
    assert.equal(needsWords(passageNeeds({})), '');
});

test('a take: n unnamed lots of the class, boarded with the fare; one fare line each, DT3\'s memo, income; DT3c can take one back', () => {
    const lots = takenLots(2, 'High', 14000);
    assert.deepEqual(lots, [{ label: '', class: 'High', fareCr: 14000 }, { label: '', class: 'High', fareCr: 14000 }]);
    for (const lot of lots) assert.ok(PassengerLot.safeParse(lot).success);
    const when = { year: 1105, day: 14 };
    const lines = takenLines(2, 'High', 2, 14000, when);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], { when, amount: 14000, memo: fareMemo('', 'High', 2), kind: 'income' });
    assert.equal(lines[0].memo, 'Fare: a passenger, High passage, 2 parsecs');
    assert.deepEqual(unboarded(lots, lines[0], (lot) => lot.label), [{ label: '', class: 'High' }, lots[1]], 'removing one line unboards one lot');
    assert.deepEqual(takenLots(0, 'Low', 1300), []);
    assert.equal(tookWords([{ kind: 'High', n: 6 }, { kind: 'Middle', n: 0 }, { kind: 'Low', n: 2 }], 8, 'Cr86,600'), 'Took 6 High and 2 Low passengers; 8 fares posted, Cr86,600.');
    assert.equal(tookWords([{ kind: 'Basic', n: 1 }], 1, 'Cr3,000'), 'Took 1 Basic passenger; 1 fare posted, Cr3,000.');
    assert.equal(tookWords([{ kind: 'High', n: 0 }], 0, 'Cr0'), '');
});

test('the screen\'s wiring: the record page mounts it after Trade here; the roll with the typed inputs and the crypto dice; one commit on Take', () => {
    const page = src('workspace/RecordPage.vue');
    assert.match(page, /<TradeHere v-if="record\.type === 'vessel'" :id="id" :read-only="readOnly" \/>\s+<TrafficHere v-if="record\.type === 'vessel'" :id="id" :read-only="readOnly" \/>/);
    const screen = src('workspace/TrafficHere.vue');
    assert.match(screen, /passengerTraffic\(\{ from, to, parsecs: row\.parsecs, effect, steward, face: cryptoFace, set: ownSet\.value \}\)/, 'the query as typed, the file or the chosen set');
    assert.match(screen, /const steward = stewardOf\(who\.steward\);/);
    assert.match(screen, /const effect = effectOf\(who\.effect\);/);
    assert.match(screen, /writeTrade\(now, \{ status: statusWithTrade\(now, \{ passengers: lots, ledger \}\) \}\);/, 'one commit: the lots and the fare lines');
    assert.match(screen, /data-traffic-dest/);
    assert.match(screen, /data-traffic-roll>Roll for passengers</);
    assert.match(screen, /:data-traffic-kind="roll\.kind"/);
    assert.match(screen, /data-traffic-dice>\{\{ rollWords\(roll\) \}\}</);
    assert.match(screen, /data-traffic-take-all @click="takeNow"/);
    assert.match(screen, /const jump = computed\(\(\) => jumpNumberOf\(values\.value\)\);/, 'the ring rule\'s jump number (DU2)');
    assert.match(screen, /marketsAround\(here\.hexKey, rangeFor\(max\)\)/);
    assert.match(screen, /reachable\(found\.rows, max\)/);
    const near = src('workspace/markets_near.ts');
    assert.match(near, /export function entryAt\(hexKey: string\): SectorHex \| null \{/);
});

test('freight (DT6b): a rolled lot as cargo with the pay on delivery from the fares table; the words; the hold', () => {
    const cycle = (...values) => { let at = 0; return () => values[at++ % values.length]; };
    const r = freightTraffic({ from: world({ starport: 'A', population: 9 }), to: world(), parsecs: 2, effect: 1, face: cycle(6, 5, 4, 3, 2, 1) });
    assert.deepEqual(r.rolls.map((x) => x.kind), ['Incidental', 'Minor', 'Major']);
    assert.ok(r.lots.length > 0, 'lots rolled');
    const lot = r.lots.find((one) => one.kind === 'Major') ?? r.lots[0];
    const pay = freightPay(2, lot.tons);
    const row = trafficTables().fares.rows.find((one) => one.parsecs === 2);
    assert.equal(pay.perTon, row.freightPerTon, 'the file\'s rate for 2 parsecs');
    const cargo = freightLot(lot, pay.credits, 'Regina', 'Ruie');
    assert.deepEqual(cargo, { label: 'Freight, ' + lot.kind + ' lot', tons: lot.tons, payCr: pay.credits, note: 'Cr' + pay.credits.toLocaleString('en-US') + ' on delivery', origin: 'Regina', destination: 'Ruie' });
    assert.ok(CargoLot.safeParse(cargo).success, 'the shared schema takes payCr');
    assert.ok(isFreight(cargo));
    assert.equal(isFreight({ label: 'Computers', tons: 4 }), false);
    const spec = trafficTables().freight.lots.find((one) => one.name === lot.kind).tons;
    const words = freightWords(lot, spec, pay);
    assert.ok(words.startsWith(lot.tons + ' t (' + spec + ': ' + lot.dice.join(', ') + ') · Cr'), words);
    assert.ok(words.endsWith(' on delivery, Cr' + pay.perTon.toLocaleString('en-US') + ' a ton'), words);
    assert.ok(freightWords(lot, spec, null).endsWith('the fares table has no freight rate for this jump'));
    assert.equal(holdWords(40, 82), '');
    assert.equal(holdWords(40, null), '', 'no Cargo Capacity on the sheet: nothing said');
    assert.equal(holdWords(40, 30), 'Larger than the free hold by 10 t. A lot cannot be broken up.');
    assert.deepEqual([0, 1, 3].map(lotWords), ['No lots', '1 lot', '3 lots']);
});

test('Deliver posts the pay as income, less the file\'s late cut when the referee says it was late', () => {
    const when = { year: 1105, day: 14 };
    const lot = { label: 'Freight, Major lot', tons: 40, payCr: 40000, destination: 'Ruie' };
    assert.deepEqual(deliveredLine(lot, when, null), { when, amount: 40000, memo: 'Delivered Freight, Major lot (40 t) at Ruie; on time', kind: 'income' });
    const half = lateReduction(faces(1));
    assert.equal(half.percent, 50);
    assert.deepEqual(deliveredLine(lot, when, half), { when, amount: 20000, memo: 'Delivered Freight, Major lot (40 t) at Ruie; late, 1D+4 x 10% (1D: 1) = 50% off', kind: 'income' });
    const all = lateReduction(faces(6));
    assert.equal(deliveredLine(lot, when, all).amount, 0, 'a 100% cut pays nothing');
    assert.equal(deliveredLine({ label: '', tons: 5, payCr: 5000 }, when, null).memo, 'Delivered a lot (5 t); on time');
    const screen = src('workspace/TrafficHere.vue');
    assert.match(screen, /freightTraffic\(\{ from, to, parsecs: row\.parsecs, effect, face: cryptoFace, set: ownSet\.value \}\)/, 'the freight roll: no steward row');
    assert.match(screen, /data-traffic-roll-freight @click="rollFreight">Roll for freight</);
    assert.match(screen, /writeTrade\(now, \{ status: statusWithTrade\(now, \{ cargo: addCargo\(hold\.value, cargo\) \}\) \}\);/, 'Take a lot: one commit into the hold');
    assert.match(screen, /data-traffic-take-lot @click="takeLot\(at\)"/);
    const vessel = src('workspace/VesselTrade.vue');
    assert.match(vessel, /<button v-if="isFreight\(item\) && delivering !== i && !underway" type="button" class="ui-btn" :disabled="readOnly" data-deliver @click="openDeliver\(i\)">Deliver</, 'Deliver only when the ship is somewhere (DW3 round 5)');
    assert.match(vessel, /<span v-else-if="isFreight\(item\) && underway" class="vt-fine" data-deliver-wait>Deliver when the ship arrives\.</);
    assert.match(vessel, /deliveredLine\(item, today\.value, late, world\.value \? world\.value\.name : undefined\)/, 'the memo names the world the ship is at');
    assert.match(vessel, /const late = deliver\.choice === 'late' \? lateReduction\(cryptoFace\) : null;/, 'the late choice (DU48) rolls the cut');
    assert.match(vessel, /writeTrade\(now, \{ status: statusWithTrade\(now, \{ cargo: removeCargo\(cargo\.value, i\), ledger: postLedger\(ledger\.value, line\) \}\) \}\);/, 'Deliver: the lot out, the line in, one commit');
});

test('mail (DT6c): the offer in words from the file, the one lot it makes, all or none, paid on delivery', () => {
    assert.equal(rankOf(''), 0);
    assert.equal(rankOf('2'), 2);
    assert.equal(rankOf('-1'), null);
    assert.equal(rankOf('x'), null);
    const yes = mailOffer({ freightDm: 9, armed: true, world: world({ techLevel: 12 }), navalOrScoutRank: 2, socDm: 1, face: faces(3, 3, 4) });
    assert.equal(yes.offered, true);
    const words = mailWords(yes);
    assert.ok(words.startsWith('2D: 3, 3 · Freight Traffic DM 5 to 9 +1 · Travellers\' ship is armed +2 · '), words);
    assert.ok(words.endsWith(' = 12, 12 or more needed: mail offered'), words);
    assert.equal(mailOfferWords(yes), '4 containers (1D: 4), 20 t, Cr100,000 on delivery; all or none.');
    const lot = mailLot(yes, 'Regina', 'Ruie');
    assert.deepEqual(lot, { label: 'Mail, 4 containers', tons: 20, payCr: 100000, note: 'Cr100,000 on delivery, all or none', origin: 'Regina', destination: 'Ruie' });
    assert.ok(CargoLot.safeParse(lot).success);
    assert.ok(isFreight(lot), 'Deliver on the cargo row posts it');
    assert.equal(deliveredLine(lot, { year: 1105, day: 14 }, null).amount, 100000);
    const no = mailOffer({ freightDm: -10, armed: false, world: world({ techLevel: 5 }), face: faces(6, 6) });
    assert.ok(mailWords(no).endsWith(' = 6, 12 or more needed: no mail'));
    const one = mailOffer({ freightDm: 10, armed: true, world: world({ techLevel: 12 }), navalOrScoutRank: 0, socDm: 0, face: faces(6, 6, 1) });
    assert.equal(mailOfferWords(one), '1 container (1D: 1), 5 t, Cr25,000 on delivery; all or none.');
    assert.equal(mailLot(one, '', '').label, 'Mail, 1 container');
    const screen = src('workspace/TrafficHere.vue');
    assert.match(screen, /mailOffer\(\{ freightDm: found\.sharedDm, armed: post\.armed, world: from, navalOrScoutRank: rank, socDm: soc, face: cryptoFace, set: ownSet\.value \}\)/, 'the freight roll\'s DM is the band (ZT0 Q8); the referee\'s word on the rest');
    assert.match(screen, /data-traffic-roll-mail>Is there mail\?</);
    assert.match(screen, /writeTrade\(now, \{ status: statusWithTrade\(now, \{ cargo: addCargo\(hold\.value, mailLot\(offer, worldName\.value, freightDest\.value\)\) \}\) \}\);/, 'Take the mail: one lot, one commit');
    assert.match(screen, /data-traffic-take-mail @click="takeMail"/);
});

test('a long freight list folds after the first ten lots (DU37); Show all unfolds it; a new roll folds it again', () => {
    assert.equal(LOTS_SHOWN, 10);
    assert.deepEqual(shownLots(5, false), { shown: 5, more: 0 });
    assert.deepEqual(shownLots(10, false), { shown: 10, more: 0 }, 'ten is not folded');
    assert.deepEqual(shownLots(58, false), { shown: 10, more: 48 });
    assert.deepEqual(shownLots(58, true), { shown: 58, more: 0 });
    assert.deepEqual(shownLots(0, false), { shown: 0, more: 0 });
    const screen = src('workspace/TrafficHere.vue');
    assert.match(screen, /v-for="\(lot, at\) in freight\.lots\.slice\(0, lotsShown\.shown\)"/, 'the first lots keep their places in the roll');
    assert.match(screen, /data-traffic-lots-more @click="allLots = true">Show all \{\{ freight\.lots\.length \}\} lots</);
    assert.match(screen, /takenLotAt\.value = \[\];\s+allLots\.value = false;/, 'a new roll folds the list');
});

test('the taken passengers against the sheet\'s Staterooms and Low Berths (DT6d): enough, short by N, no box, a worded box', () => {
    assert.equal(STATEROOMS_FIELD, 'Staterooms');
    assert.equal(LOW_BERTHS_FIELD, 'Low Berths');
    const fields = JSON.parse(fs.readFileSync(path.join(here, '../../rules/mgt2e_ship_sheet_fields.json'), 'utf8'));
    const names = (Array.isArray(fields) ? fields : fields.fields).map((f) => f.name);
    assert.ok(names.includes(STATEROOMS_FIELD) && names.includes(LOW_BERTHS_FIELD), 'A\'s AS8b put both boxes on the sheet');
    // The counts come from the file through passageNeeds; the test reads the same rows rather than typing a number.
    const passages = trafficTables().passengers.passages;
    const perHigh = passages.find((one) => one.name === 'High').requires.stateroom ?? 0;
    const perLow = passages.find((one) => one.name === 'Low').requires.lowBerth ?? 0;
    assert.ok(perHigh > 0 && perLow > 0, 'the file asks a stateroom per High and a low berth per Low passenger');
    const needs = passageNeeds(countsOf({ High: 24, Low: 3 }));
    const needRooms = perHigh * 24;
    const needBerths = perLow * 3;
    // Enough and short.
    assert.deepEqual(berthLine('30', needRooms, 'Staterooms', 'stateroom', 'staterooms'), { field: 'Staterooms', has: 30, need: needRooms, short: 0, words: 'The sheet has 30 staterooms: enough' });
    assert.deepEqual(berthLine('10', needRooms, 'Staterooms', 'stateroom', 'staterooms'), { field: 'Staterooms', has: 10, need: needRooms, short: needRooms - 10, words: 'The sheet has 10 staterooms: ' + (needRooms - 10) + ' short' });
    assert.equal(berthLine('1', 4, 'Staterooms', 'stateroom', 'staterooms').words, 'The sheet has 1 stateroom: 3 short');
    assert.equal(berthLine(' 24 ', needRooms, 'Staterooms', 'stateroom', 'staterooms').short, Math.max(0, needRooms - 24), 'spaces around the number are fine');
    // No box, a worded box, a negative, a fraction: nothing compared.
    for (const typed of [undefined, '', '  ', 'ten', '10 rooms', '-2', '2.5', true]) assert.equal(berthLine(typed, needRooms, 'Staterooms', 'stateroom', 'staterooms'), null, JSON.stringify(typed));
    assert.equal(berthLine('10', 0, 'Staterooms', 'stateroom', 'staterooms'), null, 'nothing needed, nothing compared');
    // The two lines and the one missing sentence.
    assert.deepEqual(berthWords({ Staterooms: '10', 'Low Berths': '4' }, needs).lines.map((line) => line.words), ['The sheet has 10 staterooms: ' + (needRooms - 10) + ' short', 'The sheet has 4 low berths: ' + (needBerths > 4 ? needBerths - 4 + ' short' : 'enough')]);
    assert.equal(berthWords({ Staterooms: '10', 'Low Berths': '4' }, needs).missing, '');
    assert.deepEqual(berthWords({ Staterooms: '30' }, needs).lines.map((line) => line.words), ['The sheet has 30 staterooms: enough']);
    assert.equal(berthWords({ Staterooms: '30' }, needs).missing, 'Write Low Berths on the ship sheet to compare.');
    assert.equal(berthWords({ Staterooms: 'ten', 'Low Berths': '' }, needs).missing, 'Write Staterooms and Low Berths on the ship sheet to compare.', 'once, both boxes named');
    assert.equal(berthWords(null, needs).missing, 'Write Staterooms and Low Berths on the ship sheet to compare.', 'no sheet at all');
    assert.deepEqual(berthWords(null, passageNeeds(countsOf({ High: 2 }))), { lines: [], missing: 'Write Staterooms on the ship sheet to compare.' }, 'only the boxes the take needs');
    assert.deepEqual(berthWords(null, passageNeeds({})), { lines: [], missing: '' }, 'no take, no line');
    // The screen: the lines under the needs line, short in the attention colour, the needs' sources on the Sources line.
    const screen = src('workspace/TrafficHere.vue');
    assert.match(screen, /const berths = computed\(\(\) => berthWords\(values\.value, needs\.value\)\);/);
    assert.match(screen, /data-traffic-needs>[\s\S]*?<p v-for="line in berths\.lines" :key="line\.field" class="tf-fine" :class="\{ 'is-short': line\.short > 0 \}" data-traffic-berths/);
    assert.match(screen, /<p v-if="berths\.missing" class="tf-fine" data-traffic-berths-missing>\{\{ berths\.missing \}\}<\/p>/);
    assert.match(screen, /\.tf-fine\.is-short \{\s+color: var\(--attention\);/);
    assert.match(screen, /\.\.\.\(takeTotal\.value > 0 \? needs\.value\.cites : \[\]\)/, 'the needs are cited on the Sources line');
});

test('arrival (DW3 round 5): Deliver names the world the ship is at; boarded passengers disembark, their fares staying on the Ledger', () => {
    const when = { year: 1105, day: 23 };
    const lot = { label: 'Freight, Minor lot', tons: 5, payCr: 5000, destination: 'Ruie' };
    assert.equal(deliveredLine(lot, when, null, 'Jenghe').memo, 'Delivered Freight, Minor lot (5 t) at Jenghe; on time', 'delivered where the ship is');
    assert.equal(deliveredLine(lot, when, null).memo, 'Delivered Freight, Minor lot (5 t) at Ruie; on time', 'no place given: the lot\'s destination');
    const list = [{ label: '', class: 'High', fareCr: 9000 }, { label: 'Bek Tal', class: 'Middle' }, { label: '', class: 'Low', fareCr: 700 }, { personId: 'cr_00000000-0000-4000-8000-000000000001', label: '', class: 'High', fareCr: 9000 }];
    assert.deepEqual(disembarked(list), [{ label: 'Bek Tal', class: 'Middle' }], 'every boarded one leaves, a person-linked one too; the unboarded stays');
    assert.deepEqual(disembarked(list, 2), [list[0], list[1], list[3]], 'one by its place');
    assert.deepEqual(disembarked([]), []);
    assert.equal(disembarkWords(16, 'Ruie'), '16 passengers disembarked at Ruie.');
    assert.equal(disembarkWords(1, 'Ruie'), '1 passenger disembarked at Ruie.');
    assert.equal(disembarkWords(3, ''), '3 passengers disembarked.');
    const vessel = src('workspace/VesselTrade.vue');
    assert.match(vessel, /data-disembark-all @click="disembarkAll">Disembark all</);
    assert.match(vessel, /<button v-if="isBoarded\(item\) && !underway" type="button" class="ui-btn" :disabled="readOnly" data-disembark @click="disembarkOne\(i\)">Disembark</);
    assert.match(vessel, /passengers: disembarked\(passengers\.value\) \}\) \}\);/, 'one commit, CRUD over undo');
    assert.match(vessel, /const underway = computed\(\(\) => \{[\s\S]*?\.underway;\s*\}\);/);
});

test('the Ledger and the Passengers list fold after ten (DU38): the rule, the day groups cut newest first, the screen', () => {
    assert.equal(ROWS_SHOWN, 10);
    assert.deepEqual(shownRows(7, false), { shown: 7, more: 0 });
    assert.deepEqual(shownRows(10, false), { shown: 10, more: 0 }, 'ten is not folded');
    assert.deepEqual(shownRows(31, false), { shown: 10, more: 21 });
    assert.deepEqual(shownRows(31, true), { shown: 31, more: 0 });
    assert.deepEqual(shownRows(58, false, 5), { shown: 5, more: 53 }, 'another limit');
    assert.deepEqual(shownLots(58, false), { shown: 10, more: 48 }, 'the lots keep their own rule');
    const line = (n) => ({ memo: 'line ' + n, amount: n, kind: 'income', when: { year: 1105, day: 1 } });
    const periods = [
        { year: 1105, day: 24, balance: 0, lines: [line(1), line(2), line(3)] },
        { year: 1105, day: 23, balance: 0, lines: [line(4), line(5), line(6), line(7), line(8), line(9), line(10), line(11)] },
        { year: 1105, day: 14, balance: 0, lines: [line(12)] },
    ];
    const cut = periodsShown(periods, 10);
    assert.deepEqual(cut.map((p) => [p.day, p.lines.length]), [[24, 3], [23, 7]], 'ten lines across the newest days; the last day folds away');
    assert.equal(cut[0], periods[0], 'a whole group is the same object');
    assert.equal(cut[1].lines[0], periods[1].lines[0], 'the lines are the same objects, so Remove this line still finds them');
    assert.deepEqual(periodsShown(periods, 12), periods, 'nothing to cut');
    assert.deepEqual(periodsShown(periods, 0), []);
    assert.deepEqual(periodsShown([], 10), []);
    const vessel = src('workspace/VesselTrade.vue');
    assert.match(vessel, /const linesShown = computed\(\(\) => shownRows\(ledger\.value\.length, allLines\.value\)\);/);
    assert.match(vessel, /<section v-for="period in periodsCut"/, 'the Ledger lists the cut groups');
    assert.match(vessel, /data-ledger-more @click="allLines = true">Show all \{\{ ledger\.length \}\} lines</);
    assert.match(vessel, /v-for="\(item, i\) in passengers\.slice\(0, passengersShown\.shown\)"/, 'the first passengers keep their places');
    assert.match(vessel, /data-passengers-more @click="allPassengers = true">Show all \{\{ passengers\.length \}\} passengers</);
    assert.doesNotMatch(vessel, /allLines\.value = false|allPassengers\.value = false/, 'a new line unfolds nothing and folds nothing: the fold state is the referee\'s');
});

test('Fit to the sheet (DU40): the dearest fares first into the staterooms, Low into the berths, Basic within the free hold; nothing without the boxes', () => {
    assert.deepEqual(FIT_ORDER, ['High', 'Middle', 'Basic', 'Low']);
    assert.deepEqual(berthBoxes({ Staterooms: '10', 'Low Berths': '6' }), { staterooms: 10, lowBerths: 6 });
    assert.deepEqual(berthBoxes({ Staterooms: 'ten', 'Low Berths': '' }), { staterooms: null, lowBerths: null });
    assert.deepEqual(berthBoxes(null), { staterooms: null, lowBerths: null });
    const needsOf = (counts) => passageNeeds(counts);
    const passages = trafficTables().passengers.passages;
    const perHigh = passages.find((one) => one.name === 'High').requires.stateroom ?? 0;
    const perLow = passages.find((one) => one.name === 'Low').requires.lowBerth ?? 0;
    const basicTons = passages.find((one) => one.name === 'Basic').requires.spareTons ?? 0;
    assert.ok(perHigh > 0 && perLow > 0 && basicTons > 0, 'the file: a stateroom per High, a low berth per Low, spare tons per Basic');
    const rolls = [{ kind: 'Low', count: 14 }, { kind: 'Basic', count: 20 }, { kind: 'Middle', count: 7 }, { kind: 'High', count: 11 }];
    const fit = fitTake(rolls, { staterooms: 10, lowBerths: 6 }, 45, needsOf);
    assert.equal(fit.High, Math.min(11, Math.floor(10 / perHigh)), 'High first, as far as the staterooms go');
    assert.equal(fit.Middle, 0, 'nothing left for Middle');
    assert.equal(fit.Low, Math.min(14, Math.floor(6 / perLow)));
    assert.equal(fit.Basic, Math.min(20, Math.floor((45 - needsOf(countsOf({ High: fit.High })).cargoTons) / basicTons)), 'Basic as far as the free hold takes their spare tons after the High baggage');
    const roomy = fitTake(rolls, { staterooms: 30, lowBerths: 20 }, null, needsOf);
    assert.deepEqual(roomy, { Low: 14, Basic: 20, Middle: 7, High: 11 }, 'room for every one, the hold unknown');
    const tight = fitTake(rolls, { staterooms: 4, lowBerths: 2 }, 10, needsOf);
    assert.equal(tight.High, Math.min(11, Math.floor(4 / perHigh)));
    assert.equal(tight.Low, Math.min(14, Math.floor(2 / perLow)));
    assert.ok(tight.Basic * basicTons + needsOf(countsOf({ High: tight.High })).cargoTons <= 10, 'Basic within ten free tons');
    assert.deepEqual(fitTake(rolls, { staterooms: 0, lowBerths: 0 }, 0, needsOf), { Low: 0, Basic: 0, Middle: 0, High: 0 });
    assert.equal(fitTake(rolls, { staterooms: null, lowBerths: 6 }, 45, needsOf), null, 'no Staterooms box: nothing to fit');
    assert.equal(fitTake(rolls, { staterooms: 10, lowBerths: null }, 45, needsOf), null);
    const screen = src('workspace/TrafficHere.vue');
    assert.match(screen, /const canFit = computed\(\(\) => result\.value !== null && boxes\.value\.staterooms !== null && boxes\.value\.lowBerths !== null\);/);
    assert.match(screen, /fitTake\(found\.rolls, boxes\.value, free\.value, \(counts\) => passageNeeds\(counts, ownSet\.value\)\)/, 'the same needs reading as the needs line, the campaign\'s set included');
    assert.match(screen, /data-traffic-fit @click="fitNow">Fit to the sheet</);
    assert.match(screen, /for \(const roll of found\.rolls\) taking\[roll\.kind\] = String\(fit\[roll\.kind\] \?\? 0\);/, 'the boxes stay editable: the fit only fills them');
});

test('the empty Ledger names the starting funds (DU41): one sentence, so a referee posts them before the first buy', () => {
    const vessel = src('workspace/VesselTrade.vue');
    assert.match(vessel, /No lines yet\. Post what the ship takes in and pays out; the balance is their sum\. The ship's starting funds go in as an Income line\.<\/p>/);
});

test('the payment\'s next due day fills itself from today plus Every (DU42); a typed day is kept', () => {
    assert.deepEqual(dueFrom({ year: 1105, day: 14 }, 28), { year: 1105, day: 42 });
    assert.deepEqual(dueFrom({ year: 1105, day: 350 }, 28), { year: 1106, day: 13 }, 'over the year\'s end');
    assert.deepEqual(dueFrom({ year: 1105, day: 1 }, 1), { year: 1105, day: 2 });
    for (const bad of [0, -3, 2.5, Number.NaN]) assert.equal(dueFrom({ year: 1105, day: 14 }, bad), null, String(bad));
    const vessel = src('workspace/VesselTrade.vue');
    assert.match(vessel, /watch\(\(\) => pay\.every, \(text\) => \{\s+if \(payDayTyped\.value \|\| payment\.value\) return;/, 'only a new payment whose day the referee has not typed');
    assert.match(vessel, /data-pay-day @input="payDayTyped = true"/);
    assert.match(vessel, /data-pay-year @input="payDayTyped = true"/);
    assert.match(vessel, /payDayTyped\.value = false;\s+payError\.value = '';/, 'the form opens fresh');
});

test('the upkeep says when it was last posted: the newest recurring cost line, in days before today (DU43)', () => {
    const fields = ['Mortgage Cost', 'Life Support Cost'];
    const line = (day, year, memo, kind) => ({ when: { year, day }, amount: -100, memo, kind });
    const ledger = [
        line(351, 1104, 'Mortgage Cost', 'recurring'),
        line(351, 1104, 'Life Support Cost', 'recurring'),
        line(10, 1105, 'Freight to Efate', 'income'),
        line(12, 1105, 'Docking fee', 'recurring'), // a recurring line of the referee's own, not a cost box
        line(13, 1105, 'Mortgage Cost', 'expense'), // Pay now's line is an expense, not the month's posting
    ];
    assert.deepEqual(lastUpkeep(ledger, fields), { year: 1104, day: 351 });
    assert.deepEqual(lastUpkeep(ledger.concat(line(14, 1105, 'Mortgage Cost', 'recurring'), line(2, 1105, 'Mortgage Cost', 'recurring')), fields), { year: 1105, day: 14 }, 'the newest by date, not by order');
    assert.equal(lastUpkeep([], fields), null);
    assert.equal(lastUpkeep(ledger.slice(2), fields), null);
    const today = { year: 1105, day: 14 };
    assert.equal(upkeepPostedWords({ year: 1104, day: 351 }, today), 'Last posted on 351-1104, 28 days ago.', 'across the year\'s end');
    assert.equal(upkeepPostedWords({ year: 1105, day: 14 }, today), 'Last posted on 014-1105, today.');
    assert.equal(upkeepPostedWords({ year: 1105, day: 13 }, today), 'Last posted on 013-1105, 1 day ago.');
    assert.equal(upkeepPostedWords({ year: 1105, day: 20 }, today), 'Last posted on 020-1105.', 'the clock set back: the date alone');
    assert.equal(upkeepPostedWords(null, today), 'Not posted yet.');
    const vessel = src('workspace/VesselTrade.vue');
    assert.match(vessel, /const monthLast = computed\(\(\) => upkeepPostedWords\(lastUpkeep\(ledger\.value, MONTHLY_COST_FIELDS\), today\.value\)\);/);
    assert.match(vessel, /<h4 class="vt-part-head">This month's upkeep<\/h4>\s+<template v-if="month\.length \|\| mortgageLeftOut">\s+<p class="vt-fine" data-month-last>\{\{ monthLast \}\}<\/p>/, 'under the head, before the lines (the mortgage line left out by DU47 still shows the head)');
});
