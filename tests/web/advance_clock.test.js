/**
 * DU39: the referee's time toolset for trade. The pure rules (the days a rolled wait or an arrival means, the
 * typed box, the button's words), the clock change itself (one change of `days` on the held rev, a toast with
 * Undo; nothing for a player or without a clock), and the screens' wiring: Trade here's rolled wait and the
 * Track block's legs still to arrive.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { flushCampaign, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { toasts } from '../../apps/web/src/shell/toast.ts';
import { advanceDays, advanceWords, daysTo, typedDays, waitDays } from '../../apps/web/src/workspace/advance_clock.ts';
import { viewAs } from '../../apps/web/src/workspace/players/view_as.ts';
import { trackRows } from '../../apps/web/src/workspace/track_rows.ts';

const memory = new Map();
globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(String(key), String(value)); },
    removeItem(key) { memory.delete(key); },
};

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');
/** 014-1105 as the clock counts it (day 1 is day 0 of the count). */
const DAY = 1105 * 365 + 13;

/** Every PATCH body sent; the server applies the clock at rev + 1. */
function capture() {
    const sent = [];
    transport.schedule = () => () => {};
    transport.fetch = async (url, init) => {
        const body = JSON.parse(init.body);
        sent.push({ url: String(url), method: init.method, body });
        const applied = body.clock ? [{ table: 'clock', id: 'campaignTime', rev: body.clock.baseRev + 1, seq: 1 }] : [];
        return { ok: true, status: 200, json: async () => ({ data: { applied, conflicts: [] } }) };
    };
    return sent;
}

function referee() {
    resetCampaign();
    campaign.universeId = 'uni-test';
    campaign.role = 'owner';
    campaign.status = 'ready';
    campaign.clock = { days: DAY + 0.5, rev: 4 };
    viewAs.on = false;
    toasts.splice(0, toasts.length);
}

test('a rolled wait as whole days: days as they are, hours up to the day, weeks by seven; nothing else', () => {
    assert.equal(waitDays({ amount: 2, unit: 'days' }), 2);
    assert.equal(waitDays({ amount: 1, unit: 'day' }), 1);
    assert.equal(waitDays({ amount: 5, unit: 'hours' }), 1, 'five hours is a day on the clock');
    assert.equal(waitDays({ amount: 48, unit: 'hours' }), 2);
    assert.equal(waitDays({ amount: 1, unit: 'weeks' }), 7);
    assert.equal(waitDays({ amount: 3, unit: 'months' }), null, 'a unit the toolset does not read');
    assert.equal(waitDays({ amount: 3, unit: null }), null);
    assert.equal(waitDays(null), null);
    assert.equal(waitDays({ amount: -1, unit: 'days' }), null);
});

test('the days to an arrival round the fraction up, so the ship has arrived; none when it has', () => {
    assert.equal(daysTo(DAY + 0.5, DAY + 8.58), 9);
    assert.equal(daysTo(DAY, DAY + 7), 7);
    assert.equal(daysTo(DAY + 0.5, DAY + 0.5), 0);
    assert.equal(daysTo(DAY + 3, DAY + 1), 0, 'already there');
});

test('the typed box takes a whole number of days; the button says what it will do', () => {
    assert.equal(typedDays('3'), 3);
    assert.equal(typedDays(' 12 '), 12);
    assert.equal(typedDays('0'), 0);
    for (const bad of ['', '2.5', '-1', 'three', '1d']) assert.equal(typedDays(bad), null, JSON.stringify(bad));
    assert.equal(advanceWords(3, DAY + 0.5), 'Advance 3 days to 017-1105');
    assert.equal(advanceWords(1, DAY + 0.5), 'Advance 1 day to 015-1105');
    assert.equal(advanceWords(8, DAY + 0.5), 'Advance 8 days to 022-1105');
});

test('the referee\'s press sends one clock change of the days on the held rev, and the toast says the date with Undo', async () => {
    referee();
    const sent = capture();
    try {
        assert.equal(advanceDays(3), true);
        await flushCampaign();
        assert.equal(sent.length, 1);
        assert.deepEqual(sent[0].body.clock, { days: DAY + 3.5, baseRev: 4 });
        assert.equal(sent[0].body.records, undefined, 'the time only: no ship moves');
        assert.equal(sent[0].body.journal, undefined, 'no journal entry');
        assert.equal(campaign.clock.days, DAY + 3.5);
        assert.equal(toasts.length, 1);
        assert.equal(toasts[0].message, 'Advanced 3 days. The campaign date is now 017-1105.');
        assert.equal(toasts[0].action.label, 'Undo');
        toasts[0].action.run();
        await flushCampaign();
        assert.equal(sent.length, 2);
        assert.equal(sent[1].body.clock.days, DAY + 0.5, 'Undo puts the date back');
    } finally {
        resetCampaign();
    }
});

test('nothing for a player, while viewing as players, without a clock, or for zero or broken days', async () => {
    referee();
    const sent = capture();
    try {
        assert.equal(advanceDays(0), false);
        assert.equal(advanceDays(2.5), false);
        viewAs.on = true;
        assert.equal(advanceDays(3), false, 'viewing as players');
        viewAs.on = false;
        campaign.role = 'player';
        assert.equal(advanceDays(3), false, 'a player');
        campaign.role = 'owner';
        campaign.clock = null;
        assert.equal(advanceDays(3), false, 'no clock');
        await flushCampaign();
        assert.equal(sent.length, 0);
        assert.equal(toasts.length, 0);
    } finally {
        resetCampaign();
    }
});

test('the screens: the control, Trade here beside a rolled wait, the Track block beside a leg still to arrive', () => {
    const control = src('workspace/AdvanceClock.vue');
    assert.match(control, /<form v-if="canAdvanceClock" class="adv" data-advance @submit\.prevent="go">/, 'nothing for anyone but the referee with the clock');
    assert.match(control, /data-advance-days/);
    assert.match(control, /<button type="submit" class="ui-btn adv-go" :disabled="!can" data-advance-go>\{\{ words \}\}<\/button>/);
    assert.match(control, /watch\(\(\) => props\.days, \(next\) => \{ text\.value = next === null \? '' : String\(next\); \}\);/, 'a new roll refills the box');
    const trade = src('workspace/TradeHere.vue');
    assert.match(trade, /<AdvanceClock v-if="search\.found && search\.time && waitDays\(search\.time\) !== null" :days="waitDays\(search\.time\)" label="Days the search took" data-trade-advance \/>/);
    const track = src('workspace/TrackBlock.vue');
    assert.match(track, /<AdvanceClock v-if="now !== null && row\.arrivesDays > now" :days="daysTo\(now, row\.arrivesDays\)"/, 'only a leg still to arrive');
    const rows = trackRows([{ mode: 'jump', from: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' }, to: { kind: 'system', hexKey: 'Spinward_Marches/1809', locationLabel: 'Ruie' }, departs: DAY, arrives: DAY + 7.58 }], {});
    assert.equal(rows[0].arrivesDays, DAY + 7.58, 'the row carries the arrival as the clock counts it');
    const traffic = src('workspace/TrafficHere.vue');
    assert.doesNotMatch(traffic, /AdvanceClock/, 'the passenger, freight and mail rolls carry no wait in the file: nothing to advance there');
});
