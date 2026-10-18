/**
 * ZT6: freight and passengers available at a world. Seeded dice: `faces` hands
 * out exactly the faces a test expects, and fails if the code asks for more.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    fare, freightPay, freightTraffic, lateReduction, mailOffer, passageNeeds, passengerTraffic, worldDmApplies,
} from '../../apps/web/src/campaign/traffic_lots.ts';

function faces(...values) {
    let at = 0;
    const f = () => {
        assert.ok(at < values.length, 'asked for more dice than the test gave');
        return values[at++];
    };
    f.left = () => values.length - at;
    return f;
}
const world = (over = {}) => ({ tradeCodes: [], starport: 'C', population: 5, techLevel: 8, lawLevel: 0, zone: null, ...over });
const TRADE_LINE = /^assets\/trade\.txt:\d+(?:-\d+)?$/;
const cited = (list) => {
    assert.ok(list.length > 0);
    for (const one of list) assert.match(one, TRADE_LINE);
};
function tradeSet(edit) {
    const tables = JSON.parse(readFileSync('rules/mgt2e_trade.json', 'utf8'));
    edit(tables);
    return { schemaVersion: 1, kind: 'trade', id: 'ts_mine', name: 'My trade tables', basedOn: 'official:trade', edition: 'MgT2E', tables };
}

test('passengers: four rolls, Low to High, with the check, the steward and both worlds', () => {
    const face = faces(3, 4, 1, 2, 3, 4, 5, 6, 1, 1, 2, 2, 2, 6, 6, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3);
    const r = passengerTraffic({
        from: world({ starport: 'A', population: 8 }), to: world(), parsecs: 1, effect: 2, steward: 1, face,
    });
    assert.equal(face.left(), 0);
    assert.equal(r.sharedDm, 8);
    assert.deepEqual(r.rolls.map((x) => x.kind), ['Low', 'Basic', 'Middle', 'High']);
    assert.deepEqual(r.rolls.map((x) => x.total), [16, 10, 20, 6]);
    assert.deepEqual(r.rolls.map((x) => x.row), ['16', '10', '20 or more', '6']);
    assert.deepEqual(r.rolls.map((x) => x.rowDice), ['6D', '3D', '10D', '2D']);
    assert.deepEqual(r.rolls.map((x) => x.count), [21, 6, 10, 6]);
    assert.deepEqual(r.unread, []);
    for (const roll of r.rolls) cited(roll.cites);
    assert.ok(r.rolls[0].cites.includes('assets/trade.txt:100'), 'Low DM+1');
    assert.ok(r.rolls[3].cites.includes('assets/trade.txt:99'), 'High DM-4');
    assert.ok(r.rolls[0].cites.includes('assets/trade.txt:105'), 'Population 8+');
    assert.ok(r.rolls[0].cites.includes('assets/trade.txt:153'), 'row 16');
});

test('passengers: an empty red-zone world and a long jump find nobody', () => {
    const face = faces(6, 6, 6, 6, 6, 6, 6, 6);
    const r = passengerTraffic({
        from: world({ starport: 'X', population: 0, zone: 'red' }), to: world({ starport: 'E', population: 1 }), parsecs: 3, face,
    });
    assert.equal(face.left(), 0, 'a 0 row rolls no dice');
    assert.equal(r.sharedDm, -4 - 3 - 4 - 4 - 1 - 2);
    assert.deepEqual(r.rolls.map((x) => x.count), [0, 0, 0, 0]);
    assert.deepEqual(r.rolls.map((x) => x.row), ['1 or less', '1 or less', '1 or less', '1 or less']);
    assert.ok(r.sharedDms.some((d) => d.label === 'Each parsec of destination past the first (2)' && d.dm === -2));
});

test('freight: three rolls, Incidental to Major, then each lot\'s tons', () => {
    const face = faces(
        1, 2, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 2,
        1, 1, 1, 1, 1,
        1, 2, 3, 4, 5,
        6, 1, 2, 3, 4,
        2, 4, 6,
    );
    const r = freightTraffic({
        from: world({ starport: 'A', population: 9, techLevel: 12, zone: 'amber' }),
        to: world({ starport: 'B', population: 6, techLevel: 8 }), parsecs: 2, effect: 1, face,
    });
    assert.equal(face.left(), 0);
    assert.equal(r.sharedDm, 1 + 4 + 2 + 2 - 2 + 2 + 1 - 1);
    assert.deepEqual(r.rolls.map((x) => x.kind), ['Incidental', 'Minor', 'Major']);
    assert.deepEqual(r.rolls.map((x) => x.total), [14, 11, 7]);
    assert.deepEqual(r.rolls.map((x) => x.count), [5, 5, 3]);
    assert.deepEqual(r.lots.map((l) => l.tons), [1, 2, 3, 4, 5, 30, 5, 10, 15, 20, 20, 40, 60]);
    assert.ok(r.lots[0].cites.includes('assets/trade.txt:170'));
    assert.ok(r.lots[5].cites.includes('assets/trade.txt:169'));
    assert.ok(r.lots[10].cites.includes('assets/trade.txt:168'));
    assert.ok(!r.sharedDms.some((d) => d.label === 'Chief Steward'), 'no steward on freight');
    for (const roll of r.rolls) cited(roll.cites);
});

test('world DMs read the printed labels; an unknown label is returned, not guessed', () => {
    const w = world({ starport: 'E', population: 7, techLevel: 6, zone: 'amber' });
    assert.equal(worldDmApplies('World Population 6-7', w), true);
    assert.equal(worldDmApplies('World Population 8 or more', w), false);
    assert.equal(worldDmApplies('World Population 1 or less', w), false);
    assert.equal(worldDmApplies('Starport E', w), true);
    assert.equal(worldDmApplies('Tech Level 6 or less', w), true);
    assert.equal(worldDmApplies('Tech Level 9 or more', w), false);
    assert.equal(worldDmApplies('Amber Zone', w), true);
    assert.equal(worldDmApplies('Red Zone', w), false);
    assert.equal(worldDmApplies('Tech Level 6 or less', world({ techLevel: null })), false);
    assert.equal(worldDmApplies('A tourist attraction', w), null);
    const set = tradeSet((t) => { t.passengers.traffic.worldDms.rows.push({ label: 'A tourist attraction', dm: 2, _src: 'assets/trade.txt:113-116' }); });
    const r = passengerTraffic({ from: world(), to: world(), parsecs: 1, face: faces(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), set });
    assert.deepEqual(r.unread, ['A tourist attraction']);
});

test('mail: the freight DM band, arms, rank and SOC; 12 or more, 1D containers, all or none', () => {
    const yes = mailOffer({ freightDm: 9, armed: true, world: world({ techLevel: 12 }), navalOrScoutRank: 2, socDm: 1, face: faces(3, 3, 4) });
    assert.equal(yes.total, 12);
    assert.equal(yes.offered, true);
    assert.equal(yes.containers, 4);
    assert.equal(yes.tons, 20);
    assert.equal(yes.credits, 100000);
    assert.equal(yes.allOrNone, true);
    assert.ok(yes.cites.includes('assets/trade.txt:279'));
    cited(yes.cites);
    const no = mailOffer({ freightDm: -10, armed: false, world: world({ techLevel: 5 }), face: faces(6, 6) });
    assert.equal(no.total, 12 - 2 - 4);
    assert.equal(no.offered, false);
    assert.deepEqual(no.containerDice, []);
    const band = (dm) => mailOffer({ freightDm: dm, armed: false, world: world(), face: faces(1, 1) }).total - 2;
    assert.deepEqual([-11, -10, -9, -5, -4, 4, 5, 9, 10, 15].map(band), [-2, -2, -1, -1, 0, 0, 1, 1, 2, 2]);
    assert.equal(mailOffer({ freightDm: 0, armed: false, world: world(), face: faces(), set: tradeSet((t) => { delete t.mail; }) }), null);
});

test('fares and freight pay by parsec; past the table is null', () => {
    assert.deepEqual(fare(1, 'high'), { credits: 9000, cites: ['assets/trade.txt:159-160', 'assets/trade.txt:161'] });
    assert.equal(fare(6, 'low').credits, 27000);
    assert.equal(fare(3, 'middle').credits, 14000);
    assert.equal(fare(2, 'basic').credits, 3000);
    assert.equal(fare(7, 'high'), null);
    assert.equal(fare(0, 'high'), null);
    const pay = freightPay(2, 30);
    assert.equal(pay.perTon, 1600);
    assert.equal(pay.credits, 48000);
    cited(pay.cites);
    const mine = tradeSet((t) => { t.fares.rows[0].high = 9500; });
    assert.equal(fare(1, 'high', mine).credits, 9500);
});

test('late delivery takes 1D+4 x 10% off', () => {
    assert.equal(lateReduction(faces(1)).percent, 50);
    assert.equal(lateReduction(faces(6)).percent, 100);
    assert.deepEqual(lateReduction(faces(3)).cites, ['assets/trade.txt:264-266']);
});

test('what passengers need aboard', () => {
    const n = passageNeeds({ high: 11, middle: 3, basic: 2, low: 4 });
    assert.equal(n.staterooms, 14);
    assert.equal(n.cargoTons, 11.3);
    assert.equal(n.spareTons, 4);
    assert.equal(n.lowBerths, 4);
    assert.equal(n.stewardLevels, 3);
    cited(n.cites);
    assert.deepEqual(passageNeeds({}).stewardLevels, 0);
});

test('a jump of zero or a fraction of a parsec is refused', () => {
    assert.throws(() => passengerTraffic({ from: world(), to: world(), parsecs: 0, face: faces() }));
    assert.throws(() => freightTraffic({ from: world(), to: world(), parsecs: 1.5, face: faces() }));
});