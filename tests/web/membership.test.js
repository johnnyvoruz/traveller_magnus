import assert from 'node:assert/strict';
import { test } from 'node:test';
import { session } from '../../apps/web/src/account/session.ts';
import { saveEntry } from '../../apps/web/src/campaign/journal.ts';
import {
    createInvite,
    invitePreview,
    join,
    leave,
    listPlayers,
    loadPlaying,
    openPlaying,
    revokeInvite,
    setPerson,
} from '../../apps/web/src/campaign/membership.ts';
import { commit, flushCampaign, pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { applyPlayersPage, campaign, createCampaign, loadPlayerPages, transport } from '../../apps/web/src/campaign/store.ts';
import { NOT_IN_CAMPAIGN } from '../../apps/web/src/workspace/campaigns.ts';

const memory = new Map();
globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(String(key), String(value)); },
    removeItem(key) { memory.delete(key); },
};

const VESSEL = 'cr_11111111-1111-1111-1111-111111111111';
const KEPT = 'cr_22222222-2222-2222-2222-222222222222';
const NOTE = 'cj_44444444-4444-4444-4444-444444444444';
const STAMP = '2026-10-04T00:00:00.000Z';
const HEX = 'Spinward_Marches/1910';

function jsonResponse(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function record(id, over = {}) {
    return {
        id,
        type: 'vessel',
        kind: '',
        name: 'Beowulf',
        summary: '',
        details: '',
        tags: [],
        anchor: { kind: 'system', hexKey: HEX, locationLabel: 'Regina' },
        when: null,
        visibility: 'players',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function settings() {
    return {
        party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
        kinds: {},
        calendar: { dateFormat: 'imperial' },
    };
}

function note(over = {}) {
    return {
        id: NOTE,
        kind: 'note',
        title: '',
        body: 'We docked.',
        when: null,
        realDate: null,
        sequence: null,
        author: 'players',
        visibility: 'players',
        anchor: null,
        mentions: [],
        images: null,
        rev: 4,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function playersPage(over = {}) {
    return {
        records: [],
        links: [],
        journal: [],
        settings: settings(),
        clock: null,
        seq: 1,
        done: true,
        visible: { records: [], links: [], journal: [] },
        ...over,
    };
}

test('a row made referee leaves the store on the next page', () => {
    resetCampaign();
    campaign.records[VESSEL] = { ...record(VESSEL), provenance: null, rev: 0, visibility: 'players' };
    campaign.records[KEPT] = { ...record(KEPT), provenance: null, rev: 0, visibility: 'players' };
    applyPlayersPage(playersPage({
        records: [record(KEPT)],
        seq: 2,
        visible: { records: [KEPT], links: [], journal: [] },
    }));
    assert.equal(campaign.records[VESSEL], undefined);
    assert.equal(campaign.records[KEPT].rev, 0);
    assert.equal(campaign.records[KEPT].name, 'Beowulf');
});

test('a 403 clears and stops', async () => {
    resetCampaign();
    campaign.records[VESSEL] = { ...record(VESSEL), provenance: null, rev: 1 };
    let calls = 0;
    transport.fetch = async () => {
        calls += 1;
        return jsonResponse(403, { ok: false, error: { code: 'not_a_member', message: 'archived' } });
    };
    await loadPlayerPages('uni-play');
    assert.equal(calls, 1);
    assert.equal(campaign.status, 'gone');
    assert.equal(campaign.role, 'player');
    assert.equal(campaign.universeId, null);
    assert.equal(Object.keys(campaign.records).length, 0);
    assert.equal(NOT_IN_CAMPAIGN, 'You are not in this campaign.');
});

test('a 404 clears and stops', async () => {
    resetCampaign();
    let calls = 0;
    transport.fetch = async () => {
        calls += 1;
        return jsonResponse(404, { ok: false, error: { code: 'not_found', message: 'missing' } });
    };
    await loadPlayerPages('uni-missing');
    assert.equal(calls, 1);
    assert.equal(campaign.status, 'gone');
    assert.equal(campaign.role, 'player');
});

test('a player cannot build a record change', async () => {
    resetCampaign();
    campaign.role = 'player';
    campaign.universeId = 'uni-play';
    campaign.status = 'ready';
    let calls = 0;
    transport.fetch = async () => {
        calls += 1;
        return jsonResponse(500, { ok: false });
    };
    transport.schedule = () => () => {};
    commit({ records: [{ ...record(VESSEL), provenance: null, rev: 0, baseRev: 0 }] });
    commit({ journal: [{ ...note(), author: 'referee', visibility: 'referee', baseRev: 0 }] });
    await flushCampaign();
    assert.equal(campaign.records[VESSEL], undefined);
    assert.equal(campaign.journal[NOTE], undefined);
    assert.equal(pending.value, false);
    assert.equal(calls, 0);
});

test('own-note edit sends baseRev from its rev', async () => {
    resetCampaign();
    campaign.role = 'player';
    campaign.universeId = 'uni-play';
    campaign.status = 'ready';
    campaign.settings = { ...settings(), rev: 0 };
    const held = note();
    campaign.journal[NOTE] = held;
    let body = null;
    transport.schedule = () => () => {};
    transport.fetch = async (url, init = {}) => {
        assert.equal(init.credentials, 'same-origin');
        assert.equal(String(url), '/api/universes/uni-play/campaign/changes');
        body = JSON.parse(init.body);
        return jsonResponse(200, {
            ok: true,
            data: { applied: [{ table: 'journal', id: NOTE, rev: 5, seq: 2 }], conflicts: [] },
        });
    };
    assert.equal(saveEntry({ ...held, body: 'We left orbit.' }), true);
    await flushCampaign();
    assert.equal(body.journal.length, 1);
    assert.equal(body.journal[0].baseRev, 4);
    assert.equal(body.journal[0].body, 'We left orbit.');
    assert.equal(body.records, undefined);
});

test('a page entry keeps its author name and a save does not send it', async () => {
    resetCampaign();
    const held = note({ authorName: 'kim' });
    applyPlayersPage(playersPage({
        journal: [held],
        visible: { records: [], links: [], journal: [NOTE] },
    }));
    assert.equal(campaign.authorNames[NOTE], 'kim');
    assert.equal(campaign.journal[NOTE].body, 'We docked.');
    assert.equal('authorName' in campaign.journal[NOTE], false);
    campaign.role = 'player';
    campaign.status = 'ready';
    campaign.universeId = 'uni-play';
    let body = null;
    transport.schedule = () => () => {};
    transport.fetch = async (_url, init = {}) => {
        body = JSON.parse(init.body);
        return jsonResponse(200, {
            ok: true,
            data: { applied: [{ table: 'journal', id: NOTE, rev: 5, seq: 2 }], conflicts: [] },
        });
    };
    assert.equal(saveEntry({ ...campaign.journal[NOTE], body: 'Edited.' }), true);
    await flushCampaign();
    assert.equal(JSON.stringify(body).includes('authorName'), false);
    assert.equal(JSON.stringify(body).includes('kim'), false);
    assert.equal(campaign.authorNames[NOTE], 'kim');
});

test('playing, join, invite, person and leave', async () => {
    resetCampaign();
    session.user = {
        id: 'user-1',
        email: null,
        role: 'user',
        profile: null,
        username: 'ada',
        hasPasskey: false,
        unusedRecoveryCodes: 0,
        linkedProviders: [],
    };
    const seen = [];
    transport.fetch = async (url, init = {}) => {
        const method = init.method || 'GET';
        const target = String(url);
        seen.push(method + ' ' + target);
        if (target === '/api/me/playing') {
            return jsonResponse(200, {
                ok: true,
                data: { items: [{ id: 'uni-play', name: 'Regina', ownerHandle: 'ref', truthVersion: 'v9' }] },
            });
        }
        if (target === '/api/universes' && method === 'POST') {
            const posted = JSON.parse(init.body);
            assert.equal(posted.truthVersion, 'v9');
            return jsonResponse(201, {
                ok: true,
                data: {
                    id: posted.id,
                    ownerId: 'user-1',
                    name: posted.name,
                    slug: 'new',
                    truthVersion: 'v9',
                    engineVersion: '1.0.0',
                    editionDefault: 'MgT2E',
                    createdAt: STAMP,
                    updatedAt: STAMP,
                    deletedAt: null,
                    purgeAfter: null,
                    hexOverrideCount: 0,
                    objectBytes: 0,
                    lastSnapshotAt: null,
                },
            });
        }
        if (target.includes('/campaign?')) {
            return jsonResponse(200, {
                ok: true,
                data: {
                    records: [],
                    links: [],
                    journal: [],
                    settings: { ...settings(), rev: 0 },
                    clock: null,
                    seq: 1,
                    done: true,
                },
            });
        }
        if (target === '/api/universes' && method === 'GET') {
            return jsonResponse(200, { ok: true, data: [] });
        }
        if (target === '/api/join' && method === 'POST') {
            assert.deepEqual(JSON.parse(init.body), { token: 'invite-token' });
            return jsonResponse(200, {
                ok: true,
                data: { universeId: 'uni-play', name: 'Regina', role: 'player' },
            });
        }
        if (target === '/api/join/invite-token') {
            return jsonResponse(200, {
                ok: true,
                data: { name: 'Regina', ownerHandle: 'ref', expiresAt: STAMP },
            });
        }
        if (target === '/api/universes/uni-play/players/invite' && method === 'POST') {
            return jsonResponse(200, {
                ok: true,
                data: { url: 'https://traveller.voyage/join/invite-token', expiresAt: STAMP, role: 'player', uses: 0 },
            });
        }
        if (target === '/api/universes/uni-play/players/invite' && method === 'DELETE') {
            return jsonResponse(200, { ok: true, data: { revoked: true } });
        }
        if (target === '/api/universes/uni-play/players' && method === 'GET') {
            return jsonResponse(200, {
                ok: true,
                data: {
                    playing: [{
                        userId: 'user-1',
                        handle: 'ada',
                        personId: null,
                        joined: STAMP,
                        status: 'active',
                        archivedAt: null,
                        archivedBy: null,
                    }],
                    archived: [],
                },
            });
        }
        if (target === '/api/universes/uni-play/players/me' && method === 'PATCH') {
            assert.deepEqual(JSON.parse(init.body), { personId: KEPT });
            return jsonResponse(200, { ok: true, data: { personId: KEPT } });
        }
        if (target === '/api/universes/uni-play/players/user-1' && method === 'DELETE') {
            return jsonResponse(200, { ok: true, data: { status: 'archived' } });
        }
        if (target.startsWith('/api/universes/') && target.endsWith('/campaign/changes')) {
            return jsonResponse(200, { ok: true, data: { applied: [], conflicts: [] } });
        }
        return jsonResponse(500, { ok: false, error: { code: 'unexpected', message: target } });
    };
    transport.schedule = () => () => {};

    const playing = await loadPlaying();
    assert.equal(playing.length, 1);
    assert.equal(playing[0].truthVersion, 'v9');
    await openPlaying('uni-play');
    assert.equal(campaign.role, 'player');
    assert.equal(campaign.status, 'ready');
    assert.equal(campaign.universeId, 'uni-play');
    assert.equal(campaign.records[VESSEL], undefined);

    const created = await createCampaign('New');
    assert.equal(created.truthVersion, 'v9');

    const claim = await join('invite-token');
    assert.equal(claim.universeId, 'uni-play');
    const preview = await invitePreview('invite-token');
    assert.equal(preview.ownerHandle, 'ref');

    campaign.universeId = 'uni-play';
    campaign.role = 'player';
    const invite = await createInvite();
    assert.equal(invite.role, 'player');
    assert.equal(await revokeInvite(), true);
    const members = await listPlayers();
    assert.equal(members.playing.length, 1);
    const person = await setPerson(KEPT);
    assert.equal(person.personId, KEPT);
    assert.equal(await leave(), true);
    assert.equal(campaign.status, 'gone');
    assert.equal(campaign.role, 'player');
    assert.ok(seen.includes('DELETE /api/universes/uni-play/players/user-1'));
    session.user = null;
});
