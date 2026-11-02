/**
 * DU47: Payment is the mortgage, said clearly. With a Payment set, Post this month's upkeep leaves Mortgage Cost out and
 * says so in the row's place; the Payment line and form say it is the mortgage; with none, the upkeep posts the
 * mortgage as before and the empty box says where to set it. The last-posted line (DU43) still counts the upkeep.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MONTHLY_COST_FIELDS, monthlyLines } from '../../apps/web/src/campaign/refuel.ts';
import { lastUpkeep, upkeepPostedWords } from '../../apps/web/src/workspace/traffic_here.ts';
import { MORTGAGE_FIELD, PAYMENT_IS_MORTGAGE, SET_MORTGAGE_HERE, leftOutWords, monthWithPayment } from '../../apps/web/src/workspace/upkeep_payment.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
const today = { year: 1105, day: 14 };
const sheet = { 'Mortgage Cost': '160,000', 'Maintenance Cost': '13,000', 'Life Support Cost': '20,000', 'Salary Cost': '5,000', 'Running Cost': '3,200' };

test('with a Payment set the mortgage line comes out and is said; without one the upkeep posts it as before', () => {
    const all = monthlyLines(sheet, today);
    assert.equal(all.length, 5);
    assert.equal(MONTHLY_COST_FIELDS[0], MORTGAGE_FIELD, 'the mortgage is the first upkeep box');
    const none = monthWithPayment(all, false);
    assert.deepEqual(none.lines, all);
    assert.equal(none.leftOut, null);
    const paid = monthWithPayment(all, true);
    assert.equal(paid.lines.length, 4);
    assert.equal(paid.lines.some((line) => line.memo === MORTGAGE_FIELD), false);
    assert.deepEqual(paid.leftOut, { when: today, amount: -160000, memo: 'Mortgage Cost', kind: 'recurring' });
    assert.equal(leftOutWords(paid.leftOut), 'Mortgage Cost Cr160,000: paid by the Payment, not here.');
    assert.equal(paid.lines.reduce((sum, line) => sum + line.amount, 0), -41200, 'the total less the mortgage');
    const noMortgage = monthWithPayment(monthlyLines({ 'Salary Cost': '5,000' }, today), true);
    assert.equal(noMortgage.leftOut, null, 'nothing to leave out when the sheet has no mortgage');
    assert.equal(noMortgage.lines.length, 1);
    assert.equal(PAYMENT_IS_MORTGAGE, "This is the ship's mortgage. The month's upkeep leaves it out.");
    assert.equal(SET_MORTGAGE_HERE, 'Set the mortgage here and the upkeep leaves it out.');
});

test('the last-posted line still counts an upkeep posted without its mortgage (DU43)', () => {
    const posted = monthWithPayment(monthlyLines(sheet, { year: 1105, day: 1 }), true).lines;
    const last = lastUpkeep(posted, MONTHLY_COST_FIELDS);
    assert.deepEqual(last, { year: 1105, day: 1 });
    assert.equal(upkeepPostedWords(last, today), 'Last posted on 001-1105, 13 days ago.');
});

test('pins: the month list, the button, the Payment line, the form and the empty box', () => {
    const page = src('workspace/VesselTrade.vue');
    assert.match(page, /const monthCut = computed\(\(\) => monthWithPayment\(monthAll\.value, payment\.value !== null\)\);/);
    assert.match(page, /<template v-if="month\.length \|\| mortgageLeftOut">/);
    assert.match(page, /<li v-if="mortgageLeftOut" class="vt-row is-line" data-month-left-out>\s+<span class="vt-main vt-fine">\{\{ leftOutWords\(mortgageLeftOut\) \}\}<\/span>/, 'in the row\'s place, first as the box is first');
    assert.match(page, /data-post-month :disabled="readOnly \|\| !month\.length"/);
    assert.equal((page.match(/data-payment-mortgage>\{\{ PAYMENT_IS_MORTGAGE \}\}<\/p>/g) || []).length, 2, 'the Payment line and the form');
    assert.match(page, /<p v-else-if="!payOpen" class="vt-none" data-payment-none>\{\{ SET_MORTGAGE_HERE \}\} Say what the ship pays, how often, and when it is next due\.<\/p>/);
    assert.match(page, /if \(!now \|\| props\.readOnly \|\| !month\.value\.length\) return;/, 'postMonth posts the cut list');
});
