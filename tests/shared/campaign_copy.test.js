import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_LIMITS, CampaignChanges, copyRecords } from '@voyage/shared';

const PERSON = 'cr_11111111-1111-4111-8111-111111111111';
const VESSEL = 'cr_22222222-2222-4222-8222-222222222222';
const PLACE = 'cr_33333333-3333-4333-8333-333333333333';
const LINK = 'cl_44444444-4444-4444-8444-444444444444';
const STAMP = '2026-10-04T00:00:00.000Z';
const NOW = '2026-10-05T12:00:00.000Z';
const FROM = 'uni-source';
const REGINA = { kind: 'system', hexKey: 'Spinward_Marches/1910', bodyKey: 'w3m1', locationLabel: 'Regina' };

function idFor(prefix, n) {
    const hex = n.toString(16).padStart(12, '0');
    return `${prefix}_00000000-0000-4000-8000-${hex}`;
}

function record(over = {}) {
    return {
        id: PERSON,
        type: 'person',
        kind: '',
        name: 'Voss',
        summary: 'Pilot',
        details: 'Ex-scout.',
        tags: ['pilot'],
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910' },
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 3,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function link(over = {}) {
    return {
        id: LINK,
        from: PERSON,
        to: VESSEL,
        kind: 'crew',
        role: 'pilot',
        order: 1,
        since: { year: 1105, day: 1 },
        until: null,
        notes: 'aboard',
        visibility: 'players',
        provenance: null,
        rev: 2,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: false,
        ...over,
    };
}

function queue(ids) {
    let n = 0;
    return () => {
        const id = ids[n];
        n += 1;
        return id;
    };
}

function rows(result) {
    const records = [];
    const links = [];
    for (const change of result.changes) {
        assert.equal(CampaignChanges.safeParse(change).success, true);
        records.push(...(change.records ?? []));
        links.push(...(change.links ?? []));
    }
    return { records, links };
}

test('copies a person, the vessel they crew, and the link', () => {
    const personId = idFor('cr', 1);
    const vesselId = idFor('cr', 2);
    const linkId = idFor('cl', 3);
    const person = record({
        anchor: { kind: 'record', id: VESSEL },
        visibility: 'players',
        tags: ['pilot', 'scout'],
        rev: 7,
    });
    const vessel = record({
        id: VESSEL,
        type: 'vessel',
        name: 'Beowulf',
        summary: 'Free trader',
        details: 'Armed.',
        tags: ['trader'],
        anchor: REGINA,
        visibility: 'players',
        rev: 4,
    });
    const crew = link();
    const result = copyRecords({
        records: [person, vessel],
        links: [crew],
        ids: [PERSON, VESSEL],
        fromUniverseId: FROM,
        now: NOW,
        newId: queue([personId, vesselId, linkId]),
    });

    assert.deepEqual(result.copied, [
        { id: personId, sourceId: PERSON },
        { id: vesselId, sourceId: VESSEL },
    ]);
    assert.equal(result.linksCopied, 1);
    assert.equal(result.linksLeftBehind, 0);
    assert.deepEqual(result.anchorsChanged, []);
    assert.equal(person.anchor.id, VESSEL);
    assert.equal(person.rev, 7);

    const { records, links } = rows(result);
    assert.equal(records.length, 2);
    assert.equal(links.length, 1);
    assert.equal(records[0].id, personId);
    assert.deepEqual(records[0].anchor, { kind: 'record', id: vesselId });
    assert.deepEqual(records[0].tags, ['pilot', 'scout']);
    assert.equal(records[0].visibility, 'players');
    assert.equal(records[0].name, 'Voss');
    assert.equal(records[0].summary, 'Pilot');
    assert.equal(records[0].details, 'Ex-scout.');
    assert.equal(records[0].rev, 0);
    assert.equal(records[0].baseRev, 0);
    assert.equal(records[0].deleted, false);
    assert.equal(records[0].createdAt, NOW);
    assert.equal(records[0].updatedAt, NOW);
    assert.deepEqual(records[0].provenance, {
        mode: 'copy', universeId: FROM, recordId: PERSON, rev: 7, at: NOW,
    });
    assert.deepEqual(records[1].anchor, REGINA);
    assert.equal(records[1].name, 'Beowulf');
    assert.deepEqual(records[1].provenance, {
        mode: 'copy', universeId: FROM, recordId: VESSEL, rev: 4, at: NOW,
    });
    assert.equal(links[0].id, linkId);
    assert.equal(links[0].from, personId);
    assert.equal(links[0].to, vesselId);
    assert.equal(links[0].kind, 'crew');
    assert.equal(links[0].role, 'pilot');
    assert.equal(links[0].notes, 'aboard');
    assert.equal(links[0].visibility, 'players');
    assert.equal(links[0].rev, 0);
    assert.equal(links[0].baseRev, 0);
    assert.deepEqual(links[0].since, { year: 1105, day: 1 });
    assert.deepEqual(links[0].provenance, {
        mode: 'copy', universeId: FROM, recordId: LINK, rev: 2, at: NOW,
    });
});

test('a person copied alone falls back to the vessel system and leaves the link', () => {
    const personId = idFor('cr', 11);
    const person = record({ anchor: { kind: 'record', id: VESSEL }, rev: 5 });
    const vessel = record({
        id: VESSEL,
        type: 'vessel',
        name: 'Beowulf',
        anchor: { kind: 'record', id: PLACE },
    });
    const place = record({
        id: PLACE,
        type: 'place',
        name: 'Startown',
        anchor: REGINA,
    });
    const crew = link();
    const stranger = link({
        id: idFor('cl', 99),
        from: idFor('cr', 50),
        to: idFor('cr', 51),
        kind: 'contact',
    });
    const result = copyRecords({
        records: [person, vessel, place],
        links: [crew, stranger],
        ids: [PERSON],
        fromUniverseId: FROM,
        now: NOW,
        newId: queue([personId]),
    });

    const { records, links } = rows(result);
    assert.equal(records.length, 1);
    assert.equal(links.length, 0);
    assert.deepEqual(records[0].anchor, REGINA);
    assert.equal(result.linksCopied, 0);
    assert.equal(result.linksLeftBehind, 1);
    assert.deepEqual(result.anchorsChanged, [{
        id: personId,
        sourceId: PERSON,
        from: { kind: 'record', id: VESSEL },
        to: REGINA,
    }]);

    const nowhere = copyRecords({
        records: [record({ anchor: { kind: 'record', id: VESSEL } }), record({
            id: VESSEL,
            type: 'vessel',
            name: 'Beowulf',
            anchor: null,
        })],
        links: [],
        ids: [PERSON],
        fromUniverseId: FROM,
        now: NOW,
        newId: queue([idFor('cr', 12)]),
    });
    assert.equal(nowhere.anchorsChanged[0].to, null);
    assert.equal(rows(nowhere).records[0].anchor, null);
});

test('a cycle of record anchors is re-pointed when both records are copied', () => {
    const aId = idFor('cr', 21);
    const bId = idFor('cr', 22);
    const other = idFor('cr', 23);
    const a = record({ id: PERSON, name: 'A', anchor: { kind: 'record', id: VESSEL } });
    const b = record({ id: VESSEL, name: 'B', type: 'vessel', anchor: { kind: 'record', id: PERSON } });
    const kept = copyRecords({
        records: [a, b],
        links: [],
        ids: [PERSON, VESSEL],
        fromUniverseId: FROM,
        now: NOW,
        newId: queue([aId, bId]),
    });
    const copied = rows(kept).records;
    assert.deepEqual(copied[0].anchor, { kind: 'record', id: bId });
    assert.deepEqual(copied[1].anchor, { kind: 'record', id: aId });
    assert.deepEqual(kept.anchorsChanged, []);

    const broken = copyRecords({
        records: [a, b],
        links: [],
        ids: [PERSON],
        fromUniverseId: FROM,
        now: NOW,
        newId: queue([other]),
    });
    assert.equal(rows(broken).records[0].anchor, null);
    assert.deepEqual(broken.anchorsChanged, [{
        id: other,
        sourceId: PERSON,
        from: { kind: 'record', id: VESSEL },
        to: null,
    }]);
});

test('new ids come only from newId', () => {
    const fresh = [idFor('cr', 31), idFor('cr', 32), idFor('cl', 33)];
    let n = 0;
    const result = copyRecords({
        records: [
            record({ anchor: { kind: 'record', id: VESSEL } }),
            record({ id: VESSEL, type: 'vessel', name: 'Beowulf', anchor: REGINA }),
        ],
        links: [link()],
        ids: [PERSON, VESSEL, PERSON],
        fromUniverseId: FROM,
        now: NOW,
        newId: () => fresh[n++],
    });
    const { records, links } = rows(result);
    assert.deepEqual([records[0].id, records[1].id, links[0].id], fresh);
    assert.deepEqual(result.copied.map((row) => row.id), [fresh[0], fresh[1]]);
    assert.equal(n, 3);
    for (const id of fresh) {
        assert.equal(id === PERSON || id === VESSEL || id === LINK, false);
    }
});

test('batches past the patch row and byte limits, records before links', () => {
    const count = CAMPAIGN_LIMITS.patchRows + 1;
    const records = [];
    const fresh = [];
    for (let i = 1; i <= count; i += 1) {
        records.push(record({ id: idFor('cr', i), name: `R${i}`, anchor: null, tags: [] }));
        fresh.push(idFor('cr', 1000 + i));
    }
    fresh.push(idFor('cl', 1));
    const crew = link({
        id: LINK,
        from: records[0].id,
        to: records[1].id,
        kind: 'contact',
    });
    let n = 0;
    const result = copyRecords({
        records,
        links: [crew],
        ids: records.map((row) => row.id),
        fromUniverseId: FROM,
        now: NOW,
        newId: () => fresh[n++],
    });

    assert.equal(result.copied.length, count);
    assert.equal(result.linksCopied, 1);
    assert.ok(result.changes.length >= 2);
    assert.equal(result.changes[0].records.length, CAMPAIGN_LIMITS.patchRows);
    assert.equal(result.changes[0].links, undefined);

    let seenLink = false;
    let recordCount = 0;
    let linkCount = 0;
    for (const change of result.changes) {
        const parsed = CampaignChanges.safeParse(change);
        assert.equal(parsed.success, true);
        if (seenLink) assert.equal(change.records, undefined);
        if (change.links?.length) seenLink = true;
        recordCount += change.records?.length ?? 0;
        linkCount += change.links?.length ?? 0;
    }
    assert.equal(recordCount, count);
    assert.equal(linkCount, 1);
    assert.equal(seenLink, true);

    const fat = [];
    const fatIds = [];
    for (let i = 1; i <= 60; i += 1) {
        fat.push(record({
            id: idFor('cr', 2000 + i),
            name: 'N',
            details: 'x'.repeat(CAMPAIGN_LIMITS.details),
            anchor: null,
            tags: [],
        }));
        fatIds.push(idFor('cr', 3000 + i));
    }
    let f = 0;
    const wide = copyRecords({
        records: fat,
        links: [],
        ids: fat.map((row) => row.id),
        fromUniverseId: FROM,
        now: NOW,
        newId: () => fatIds[f++],
    });
    assert.ok(wide.changes.length > 1);
    let fatCount = 0;
    for (const change of wide.changes) {
        assert.equal(CampaignChanges.safeParse(change).success, true);
        assert.ok((change.records?.length ?? 0) < 60);
        fatCount += change.records?.length ?? 0;
    }
    assert.equal(fatCount, 60);
});
