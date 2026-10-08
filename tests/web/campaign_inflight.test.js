/**
 * A change committed while a save is still travelling.
 * The follow-up names the rev that save applied, and it goes out on its own.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { commit, flushCampaign, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { toasts } from '../../apps/web/src/shell/toast.ts';

const memory = new Map();
globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(String(key), String(value)); },
    removeItem(key) { memory.delete(key); },
};

const RECORD = 'cr_11111111-1111-1111-1111-111111111111';
const LINK = 'cl_22222222-2222-2222-2222-222222222222';
const ENTRY = 'cj_33333333-3333-3333-3333-333333333333';
const OTHER = 'cr_44444444-4444-4444-4444-444444444444';
const STAMP = '2026-10-08T00:00:00.000Z';

function record(over = {}) {
    return {
        id: RECORD,
        type: 'person',
        kind: '',
        name: 'Marc',
        summary: '',
        details: '',
        tags: [],
        anchor: null,
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

function link(over = {}) {
    return {
        id: LINK,
        from: RECORD,
        to: OTHER,
        kind: 'ally',
        role: '',
        order: 0,
        since: null,
        until: null,
        notes: '',
        visibility: 'referee',
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function entry(over = {}) {
    return {
        id: ENTRY,
        kind: 'note',
        title: 'Note',
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function settings(over = {}) {
    return {
        party: { vesselId: null, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
        rev: 0,
        ...over,
    };
}

function jsonResponse(body) {
    return { ok: true, status: 200, json: async () => body };
}

/**
 * One campaign whose rev per row starts at `held`. A PATCH whose baseRev matches
 * advances that rev. Any other baseRev is a conflict and the stored copy comes back.
 */
function openServer(held) {
    const rev = {
        records: { ...held.records },
        links: { ...held.links },
        journal: { ...held.journal },
        settings: held.settings,
        clock: held.clock,
    };
    const stored = {
        records: { ...held.recordCopies },
        links: { ...held.linkCopies },
        journal: { ...held.entryCopies },
        settings: held.settingsCopy,
        clock: held.clockCopy,
    };
    const patches = [];
    let seq = 1;
    let release = () => {};
    let holding = true;
    const timers = [];

    function decide(table, id, baseRev, copy) {
        const current = table === 'settings' || table === 'clock' ? rev[table] : rev[table][id];
        if (baseRev !== current) return { conflict: { table, id, current: copy } };
        const next = current + 1;
        if (table === 'settings' || table === 'clock') rev[table] = next;
        else rev[table][id] = next;
        return { applied: { table, id, rev: next, seq: seq++ } };
    }

    function copyFor(table, id) {
        if (table === 'settings') return stored.settings;
        if (table === 'clock') return stored.clock;
        return stored[table][id];
    }

    function take(table, rows) {
        const applied = [];
        const conflicts = [];
        for (const row of rows) {
            const id = table === 'clock' ? 'campaignTime' : table === 'settings' ? 'settings' : row.id;
            const hit = decide(table, id, row.baseRev, copyFor(table, row.id));
            if (hit.applied) {
                applied.push({ ...hit.applied, id });
                if (table !== 'clock') {
                    const { baseRev, ...rest } = row;
                    void baseRev;
                    rest.rev = hit.applied.rev;
                    if (table === 'settings') stored.settings = rest;
                    else stored[table][row.id] = rest;
                } else {
                    stored.clock = { days: row.days, rev: hit.applied.rev };
                }
            } else {
                conflicts.push(hit.conflict);
            }
        }
        return { applied, conflicts };
    }

    transport.schedule = (fn, ms) => {
        const item = { fn, ms, dead: false };
        timers.push(item);
        return () => { item.dead = true; };
    };
    transport.fetch = async (_url, init = {}) => {
        assert.equal(init.credentials, 'same-origin');
        const body = JSON.parse(init.body);
        if (holding) {
            holding = false;
            await new Promise((resolve) => { release = resolve; });
        }
        patches.push(body);
        const applied = [];
        const conflicts = [];
        const records = take('records', body.records || []);
        const links = take('links', body.links || []);
        const journal = take('journal', body.journal || []);
        const settingsHit = body.settings ? take('settings', [body.settings]) : { applied: [], conflicts: [] };
        const clockHit = body.clock ? take('clock', [body.clock]) : { applied: [], conflicts: [] };
        for (const part of [records, links, journal, settingsHit, clockHit]) {
            applied.push(...part.applied);
            conflicts.push(...part.conflicts);
        }
        return jsonResponse({ ok: true, data: { applied, conflicts } });
    };

    return {
        patches,
        timers,
        release: () => release(),
        holdNext() { holding = true; },
    };
}

function ready() {
    resetCampaign();
    campaign.universeId = 'uni-1';
    campaign.status = 'ready';
}

function fieldsOf(row) {
    return (row && row.sheet && row.sheet.fields) || {};
}

test('a record edited while its save is in flight keeps both edits', async () => {
    ready();
    const row = record();
    campaign.records[RECORD] = row;
    const box = openServer({
        records: { [RECORD]: 1 },
        links: {},
        journal: {},
        settings: 0,
        clock: 0,
        recordCopies: { [RECORD]: row },
        linkCopies: {},
        entryCopies: {},
        settingsCopy: settings(),
        clockCopy: null,
    });
    const type = (name, value) => {
        const current = campaign.records[RECORD];
        commit({
            records: [{
                ...current,
                sheet: { fields: { ...fieldsOf(current), [name]: value } },
                baseRev: current.rev,
            }],
        });
    };
    type('A', '1');
    const first = flushCampaign();
    await Promise.resolve();
    type('B', '2');
    box.release();
    await first;
    assert.equal(box.patches.length, 1);
    assert.deepEqual(box.patches[0].records[0].sheet.fields, { A: '1' });
    assert.equal(toasts.length, 0);
    const armed = box.timers.filter((item) => !item.dead);
    assert.equal(armed.length, 1);
    assert.equal(armed[0].ms, 800);
    await flushCampaign();
    assert.equal(box.patches.length, 2);
    assert.equal(box.patches[1].records[0].baseRev, 2);
    assert.deepEqual(box.patches[1].records[0].sheet.fields, { A: '1', B: '2' });
    assert.deepEqual(fieldsOf(campaign.records[RECORD]), { A: '1', B: '2' });
    assert.equal(campaign.records[RECORD].rev, 3);
    assert.equal(toasts.length, 0);
});

test('three edits during one request leave on the next save', async () => {
    ready();
    campaign.records[RECORD] = record();
    const box = openServer({
        records: { [RECORD]: 1 },
        links: {},
        journal: {},
        settings: 0,
        clock: 0,
        recordCopies: {},
        linkCopies: {},
        entryCopies: {},
        settingsCopy: null,
        clockCopy: null,
    });
    const type = (name, value) => {
        const current = campaign.records[RECORD];
        commit({
            records: [{
                ...current,
                sheet: { fields: { ...fieldsOf(current), [name]: value } },
                baseRev: current.rev,
            }],
        });
    };
    type('A', '1');
    const first = flushCampaign();
    await Promise.resolve();
    type('B', '2');
    type('C', '3');
    box.release();
    await first;
    await flushCampaign();
    assert.equal(box.patches.length, 2);
    assert.equal(box.patches[1].records[0].baseRev, 2);
    assert.deepEqual(box.patches[1].records[0].sheet.fields, { A: '1', B: '2', C: '3' });
    assert.deepEqual(fieldsOf(campaign.records[RECORD]), { A: '1', B: '2', C: '3' });
    assert.equal(toasts.length, 0);
});

test('a link, a journal entry, the clock, and the settings follow the same way', async () => {
    ready();
    campaign.records[RECORD] = record();
    campaign.records[OTHER] = record({ id: OTHER, name: 'Ada' });
    campaign.links[LINK] = link();
    campaign.journal[ENTRY] = entry();
    campaign.settings = settings();
    campaign.clock = null;
    const box = openServer({
        records: {},
        links: { [LINK]: 1 },
        journal: { [ENTRY]: 1 },
        settings: 0,
        clock: 0,
        recordCopies: {},
        linkCopies: {},
        entryCopies: {},
        settingsCopy: settings(),
        clockCopy: { days: 1, rev: 0 },
    });

    commit({ links: [{ ...campaign.links[LINK], role: 'first', baseRev: 1 }] });
    const linkFlush = flushCampaign();
    await Promise.resolve();
    commit({ links: [{ ...campaign.links[LINK], role: 'second', baseRev: campaign.links[LINK].rev }] });
    box.release();
    await linkFlush;
    await flushCampaign();
    assert.equal(box.patches[1].links[0].baseRev, 2);
    assert.equal(box.patches[1].links[0].role, 'second');
    assert.equal(campaign.links[LINK].role, 'second');
    assert.equal(campaign.links[LINK].rev, 3);

    box.holdNext();
    commit({ journal: [{ ...campaign.journal[ENTRY], body: 'first', baseRev: campaign.journal[ENTRY].rev }] });
    const entryFlush = flushCampaign();
    await Promise.resolve();
    commit({ journal: [{ ...campaign.journal[ENTRY], body: 'second', baseRev: campaign.journal[ENTRY].rev }] });
    box.release();
    await entryFlush;
    await flushCampaign();
    const entryPatch = box.patches[box.patches.length - 1].journal[0];
    assert.equal(entryPatch.baseRev, 2);
    assert.equal(entryPatch.body, 'second');
    assert.equal(campaign.journal[ENTRY].body, 'second');
    assert.equal(toasts.length, 0);

    box.holdNext();
    commit({ settings: { ...campaign.settings, baseRev: campaign.settings.rev, calendar: { dateFormat: 'long' } } });
    const settingsFlush = flushCampaign();
    await Promise.resolve();
    commit({ settings: { ...campaign.settings, baseRev: campaign.settings.rev, calendar: { dateFormat: 'imperial' } } });
    box.release();
    await settingsFlush;
    await flushCampaign();
    const settingsPatch = box.patches[box.patches.length - 1].settings;
    assert.equal(settingsPatch.baseRev, 1);
    assert.equal(settingsPatch.calendar.dateFormat, 'imperial');
    assert.equal(campaign.settings.rev, 2);

    box.holdNext();
    commit({ clock: { days: 10, baseRev: 0 } });
    const clockFlush = flushCampaign();
    await Promise.resolve();
    commit({ clock: { days: 12, baseRev: campaign.clock.rev } });
    box.release();
    await clockFlush;
    await flushCampaign();
    const clockPatch = box.patches[box.patches.length - 1].clock;
    assert.equal(clockPatch.baseRev, 1);
    assert.equal(clockPatch.days, 12);
    assert.deepEqual(campaign.clock, { days: 12, rev: 2 });
    assert.equal(toasts.length, 0);
});

test('a real conflict still shows the server copy', async () => {
    ready();
    const local = record({ name: 'Local name' });
    const serverCopy = record({ name: 'Server name', rev: 4 });
    campaign.records[RECORD] = local;
    const box = openServer({
        records: { [RECORD]: 4 },
        links: {},
        journal: {},
        settings: 0,
        clock: 0,
        recordCopies: { [RECORD]: serverCopy },
        linkCopies: {},
        entryCopies: {},
        settingsCopy: null,
        clockCopy: null,
    });
    commit({ records: [{ ...local, name: 'Typed', baseRev: 1 }] });
    const first = flushCampaign();
    box.release();
    await first;
    assert.equal(campaign.records[RECORD].name, 'Server name');
    assert.equal(campaign.records[RECORD].rev, 4);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'Saved changes conflicted with a newer copy. The server copy is now shown.');
    assert.equal(box.timers.filter((item) => !item.dead).length, 0);
});
