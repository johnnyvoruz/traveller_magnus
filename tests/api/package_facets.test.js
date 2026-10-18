// Z6: server-side catalogue facets. The pure counts match the store's own (filters.ts facets()),
// the SQL reads only public packages, and GET /api/packages/facets answers on a private worker.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PackageFacets, PackageFacetsQuery } from '@voyage/shared';
import { FACET_SCAN, facetCounts, facetRows, familyOfKind } from '../../apps/api/src/routes/package_facets.ts';
import { facets as browserFacets, NO_FILTERS } from '../../apps/web/src/workspace/market/filters.ts';
import { kindFamily } from '../../apps/web/src/marketplace/covers.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NOW = Date.parse('2026-10-17T12:00:00Z');
const ago = (days) => new Date(NOW - days * 86_400_000).toISOString();

const ROWS = [
    { kind: 'subsector', edition: 'MgT2E', tags: ['spinward', 'official'], updatedAt: ago(1), hexCount: 40, handle: 'ann' },
    { kind: 'sector', edition: 'MgT2E', tags: ['spinward'], updatedAt: ago(10), hexCount: 0, handle: 'ann' },
    { kind: 'ship', edition: 'CT', tags: ['official'], updatedAt: ago(3), hexCount: 0, handle: 'bob' },
    { kind: 'system', edition: 'MgT2E', tags: [], updatedAt: ago(40), hexCount: 1, handle: 'cy' },
    { kind: 'oddity', edition: '', tags: ['misc'], updatedAt: ago(5), hexCount: 0, handle: '' },
];

const card = (row) => ({ ...row, authorHandle: row.handle });
const strip = (list) => list.map(({ value, count }) => ({ value, count }));
const toStore = (f) => ({
    kinds: f.family ?? [], contents: f.contents ?? [], editions: f.edition ?? [], tags: f.tag ?? [], updated: f.updated ?? '', by: f.author ?? [],
});

test('families follow the store\'s first-match rule', () => {
    for (const kind of ['subsector', 'sector', 'ship', 'system', 'oddity', 'Starship deckplan', '']) {
        assert.equal(familyOfKind(kind), kindFamily(kind), kind);
    }
});

test('counts equal the store\'s own facets for the same cards and filters', () => {
    const cases = [
        {},
        { family: ['map'] },
        { contents: ['records'] },
        { edition: ['MgT2E'], tag: ['spinward'] },
        { updated: '7' },
        { author: ['ann', 'bob'], contents: ['hexes', 'records'] },
        { family: ['ship', 'other'], updated: '30', tag: ['official', 'misc'] },
        { edition: ['T5'] },
    ];
    for (const f of cases) {
        const ours = facetCounts(ROWS, f, NOW);
        const theirs = browserFacets(ROWS.map(card), { ...NO_FILTERS, ...toStore(f) }, NOW);
        for (const key of ['kinds', 'contents', 'editions', 'tags', 'updated', 'by']) {
            assert.deepEqual(ours[key], strip(theirs[key]), `${JSON.stringify(f)} ${key}`);
        }
    }
});

test('a section counts over the other sections only, and total over all of them', () => {
    const out = facetCounts(ROWS, { family: ['map'], contents: ['hexes'] }, NOW);
    assert.equal(out.total, 1);
    assert.deepEqual(out.contents, [{ value: 'hexes', count: 1 }, { value: 'records', count: 1 }]);
    assert.deepEqual(out.kinds.find((row) => row.value === 'ship'), { value: 'ship', count: 0 });
    assert.deepEqual(out.by, [{ value: 'ann', count: 1 }, { value: 'bob', count: 0 }, { value: 'cy', count: 0 }]);
    assert.deepEqual(out.updated, [{ value: '7', count: 1 }, { value: '30', count: 1 }, { value: '', count: 1 }]);
});

test('a chosen value nobody has is still listed, at 0', () => {
    const out = facetCounts(ROWS, { edition: ['T5'], author: ['zed'] }, NOW);
    assert.deepEqual(out.editions.find((row) => row.value === 'T5'), { value: 'T5', count: 0 });
    assert.deepEqual(out.by.find((row) => row.value === 'zed'), { value: 'zed', count: 0 });
    assert.equal(out.total, 0);
});

test('the query refuses unknown keys and bad values', () => {
    assert.equal(PackageFacetsQuery.safeParse({ family: ['map'], updated: '7', q: 'regina' }).success, true);
    assert.equal(PackageFacetsQuery.safeParse({ cursor: 'x' }).success, false);
    assert.equal(PackageFacetsQuery.safeParse({ updated: '90' }).success, false);
    assert.equal(PackageFacetsQuery.safeParse({ family: ['planets'] }).success, false);
    assert.equal(PackageFacetsQuery.safeParse({ contents: ['maps'] }).success, false);
});

function d1(db) {
    return {
        prepare(sql) {
            return { bind: (...params) => ({ all: async () => ({ results: db.prepare(sql).all(...params) }) }) };
        },
    };
}

function open() {
    const db = new DatabaseSync(':memory:');
    db.exec(`
        CREATE TABLE user (id TEXT PRIMARY KEY);
        CREATE TABLE universes (id TEXT PRIMARY KEY, owner_id TEXT, engine_version TEXT, truth_version TEXT, deleted_at TEXT, edition_default TEXT);
        CREATE TABLE profile (user_id TEXT PRIMARY KEY, handle TEXT);
    `);
    const sql = readFileSync(path.join(root, 'apps/api/src/db/migrations/0010_packages.sql'), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) if (statement.trim()) db.exec(statement.trim());
    db.prepare(`INSERT INTO user (id) VALUES ('u1'), ('u2')`).run();
    db.prepare(`INSERT INTO profile (user_id, handle) VALUES ('u1', 'ann')`).run();
    db.prepare(`INSERT INTO universes (id, owner_id) VALUES ('uni', 'u1')`).run();
    return db;
}

const like = (text) => `%${text.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

function addPackage(db, { id, author = 'u1', kind = 'subsector', title = id, tags = [], edition = 'MgT2E', latest = 1, hidden = 0, hexCount = 3, updated = ago(1) }) {
    db.prepare(
        `INSERT INTO packages (id, author_id, universe_id, kind, title, slug, description, tags, edition, truth_version,
            engine_version, latest_version, installs, created_at, updated_at, hidden)
         VALUES (?, ?, 'uni', ?, ?, ?, '', ?, ?, 'v1', '1.1.0', ?, 0, 't', ?, ?)`,
    ).run(id, author, kind, title, id, JSON.stringify(tags), edition, latest, updated, hidden);
    for (let version = 1; version <= latest; version += 1) {
        const hexes = version === latest ? hexCount : 9;
        db.prepare(
            `INSERT INTO package_versions (package_id, version, state, hex_count, record_count, hex_keys, record_ids, created_at)
             VALUES (?, ?, 'done', ?, 1, '[]', '[]', 't')`,
        ).run(id, version, hexes);
    }
}

test('rows: public packages only, the latest version\'s hexes, the current handle, q as the catalogue reads it', async () => {
    const db = open();
    addPackage(db, { id: 'pk_A', title: 'Regina', tags: ['spinward'] });
    addPackage(db, { id: 'pk_B', title: 'Jewell', latest: 2, hexCount: 0, author: 'u2' });
    addPackage(db, { id: 'pk_HIDDEN', title: 'Regina hidden', hidden: 1 });
    addPackage(db, { id: 'pk_DRAFT', title: 'Regina draft', latest: 0 });
    addPackage(db, { id: 'pk_PCT', title: '100% Regina' });
    const all = await facetRows(d1(db), undefined, like);
    assert.equal(all.capped, false);
    assert.equal(all.rows.length, 3);
    const jewell = all.rows.find((row) => row.handle === '');
    assert.equal(jewell.hexCount, 0, 'latest version, not version 1');
    const regina = await facetRows(d1(db), 'regina', like);
    assert.equal(regina.rows.length, 2);
    const pct = await facetRows(d1(db), '%', like);
    assert.equal(pct.rows.length, 1, '% is a literal');
    const capped = await facetRows(d1(db), undefined, like, 2);
    assert.deepEqual([capped.rows.length, capped.capped], [2, true]);
    assert.equal(FACET_SCAN, 5000);
    const out = facetCounts(all.rows, { contents: ['records'] }, NOW);
    assert.equal(PackageFacets.parse({ ...out, scanned: all.rows.length, capped: false }).total, 1);
});

if (process.env.RUN_API_TESTS !== '1') {
    test('GET /api/packages/facets on the worker', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('GET /api/packages/facets on a private worker', { timeout: 300000 }, async () => {
        const { runWrangler } = await import('./session.js');
        const { startDev, stopDev } = await import('./server.js');
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-facets-'));
        const port = 18871;
        const inspectorPort = 19871;
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const now = Date.now();
            const stamp = new Date(now - 86_400_000).toISOString();
            const rows = [
                ['pk_FACET0000000000000000001', 'subsector', 'Regina', '["spinward"]', 'MgT2E', 1, 0, 40],
                ['pk_FACET0000000000000000002', 'ship', 'Far trader', '["official"]', 'CT', 2, 0, 0],
                ['pk_FACET0000000000000000003', 'sector', 'Hidden one', '[]', 'MgT2E', 1, 1, 5],
            ];
            const sql = [
                `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned) VALUES ('fct', 'fct', 'fct@localhost', 1, ${now}, ${now}, 'user', 0);`,
                `INSERT INTO profile (user_id, handle, display_name, created_at) VALUES ('fct', 'facets', 'Facets', ${now});`,
                `INSERT INTO universes (id, owner_id, name, slug, engine_version, edition_default, created_at, updated_at) VALUES ('uni-fct', 'fct', 'Facets', 'facets', '1.1.0', 'MgT2E', '${stamp}', '${stamp}');`,
                ...rows.flatMap(([id, kind, title, tags, edition, latest, hidden, hexes]) => [
                    `INSERT INTO packages (id, author_id, universe_id, kind, title, slug, description, tags, edition, truth_version, engine_version, latest_version, installs, created_at, updated_at, hidden) VALUES ('${id}', 'fct', 'uni-fct', '${kind}', '${title}', '${id.toLowerCase()}', '', '${tags}', '${edition}', 'v1', '1.1.0', ${latest}, 0, '${stamp}', '${stamp}', ${hidden});`,
                    `INSERT INTO package_versions (package_id, version, state, hex_count, record_count, hex_keys, record_ids, created_at) VALUES ('${id}', ${latest}, 'done', ${hexes}, 1, '[]', '[]', '${stamp}');`,
                ]),
            ].join('\n');
            const dir = mkdtempSync(path.join(tmpdir(), 'voyage-facets-sql-'));
            const file = path.join(dir, 'seed.sql');
            writeFileSync(file, sql);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
            rmSync(dir, { recursive: true, force: true });
            child = startDev({ port, persistTo, inspectorPort });
            const deadline = Date.now() + 90000;
            for (;;) {
                try {
                    if ((await fetch(`${base}/api/health`)).ok) break;
                } catch {
                    // not up yet
                }
                if (Date.now() > deadline) throw new Error('wrangler did not answer /api/health');
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            const get = async (query) => {
                const response = await fetch(`${base}/api/packages/facets${query}`);
                return { status: response.status, body: await response.json() };
            };
            const all = await get('');
            assert.equal(all.status, 200, JSON.stringify(all.body));
            const data = PackageFacets.parse(all.body.data);
            assert.deepEqual([data.total, data.scanned, data.capped], [2, 2, false]);
            assert.deepEqual(data.by, [{ value: 'facets', count: 2 }]);
            assert.deepEqual(data.contents, [{ value: 'hexes', count: 1 }, { value: 'records', count: 1 }]);
            assert.deepEqual(data.updated, [{ value: '7', count: 2 }, { value: '30', count: 2 }, { value: '', count: 2 }]);
            const ships = await get('?family=ship&contents=records&contents=hexes');
            assert.equal(ships.body.data.total, 1);
            assert.deepEqual(ships.body.data.contents, [{ value: 'hexes', count: 0 }, { value: 'records', count: 1 }]);
            const q = await get('?q=regina');
            assert.deepEqual([q.body.data.total, q.body.data.tags], [1, [{ value: 'spinward', count: 1 }]]);
            const bad = await get('?updated=90');
            assert.equal(bad.status, 400);
            const unknown = await get('?cursor=abc');
            assert.equal(unknown.status, 400);
            const page = await fetch(`${base}/api/packages/pk_FACET0000000000000000001`);
            assert.equal(page.status, 200, 'the package page route still answers');
        } finally {
            if (child) {
                console.log(`facets worker pid ${child.pid} on ${port}, stopped`);
                stopDev(child.pid);
            }
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}