import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readPack, fingerprint, coverFiles } from '../../tools/examples/build_local.mjs';
import { planSql, removeSql, coversToDelete, duplicateRefusal } from '../../tools/examples/seed_production.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { EXAMPLE_HANDLE, EXAMPLE_USER_ID, objectHashes, packFolders } from '../../tools/examples/lib.mjs';

test('six packs parse as CampaignExport on chart v10', () => {
    const packs = packFolders().map(readPack);
    assert.equal(packs.length, 6);
    assert.deepEqual(packs.map((p) => p.pack.mode).sort(), ['charted', 'records', 'records', 'records', 'records', 'sector']);
    for (const p of packs) {
        assert.equal(p.doc.universe.truthVersion, 'v10');
        assert.ok(p.listing.title && p.listing.kind && p.listing.tags.includes('example'), p.slug);
        if (p.pack.mode !== 'sector') assert.ok(p.anchors.length > 0 || p.pack.hexKeys.length > 0, p.slug);
    }
    const ids = packs.flatMap((p) => [...p.doc.records.map((r) => r.id), ...p.doc.links.map((l) => l.id)]);
    assert.equal(new Set(ids).size, ids.length, 'record and link ids are unique across packs');
});

test('house account defaults', () => {
    assert.equal(EXAMPLE_HANDLE, 'traveller_voyage');
    assert.equal(EXAMPLE_USER_ID, 'e2b2245a-5260-4b91-8f33-1e02997fd9d5');
});

test('a pack that fails CampaignExport parsing is refused with the file and the field', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'examples-'));
    try {
        const folder = path.join(dir, 'bad-pack');
        mkdirSync(folder);
        const doc = JSON.parse(readFileSync(path.join(packFolders()[0], 'campaign.json'), 'utf8'));
        doc.records[0].type = 'starship';
        writeFileSync(path.join(folder, 'campaign.json'), JSON.stringify(doc));
        writeFileSync(path.join(folder, 'listing.json'), JSON.stringify({ title: 'x', kind: 'x', description: 'x', tags: [] }));
        assert.throws(() => readPack(folder), (err) => /bad-pack[\\/]campaign\.json: records\.0\.type/.test(err.message));
        writeFileSync(path.join(folder, 'campaign.json'), JSON.stringify({ ...doc, records: [] }));
        writeFileSync(path.join(folder, 'listing.json'), JSON.stringify({ title: '', kind: 'x', description: 'x', tags: [] }));
        assert.throws(() => readPack(folder), (err) => /bad-pack[\\/]listing\.json: title: Required/.test(err.message));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the recorded sector piece is complete', () => {
    const sector = packFolders().map(readPack).find((p) => p.pack.mode === 'sector');
    const manifest = JSON.parse(readFileSync(path.join(sector.folder, 'recorded/manifest.json'), 'utf8'));
    assert.equal(Object.keys(manifest.hexes).length, sector.pack.hexes.length);
    assert.deepEqual(Object.values(manifest.ownSectors), [sector.pack.slot]);
    assert.equal(manifest.records.count, sector.doc.records.length);
    assert.ok(objectHashes(manifest).includes(manifest.records.contentHash));
});

test('the fingerprint ignores ids and times only', () => {
    const m = { packageId: 'pk_A', publishedAt: '2026-10-14T00:00:00.000Z', hexes: { '~01M4YA2WYWQ0R1ZMADZTBGT421/0101': { treeHash: 'a'.repeat(64) } } };
    const n = { packageId: 'pk_B', publishedAt: '2026-10-15T00:00:00.000Z', hexes: { '~NP6DFGPXW8TW8NCZEE6D2TNYP1/0101': { treeHash: 'b'.repeat(64) } } };
    assert.equal(fingerprint(m, ['{"name":"Gilgit"}']), fingerprint(n, ['{"name":"Gilgit"}']));
    assert.notEqual(fingerprint(m, ['{"name":"Gilgit"}']), fingerprint(n, ['{"name":"Gurzuf"}']));
});

test('the copy starts installs at 0, keeps them on a rerun, and removes only its own rows', () => {
    const source = {
        universes: [{ id: 'u1', owner_id: 'someone', name: 'Feri', object_bytes: 9, created_at: 'c', updated_at: 'u' }],
        packages: [{ id: 'pk_1', author_id: 'someone', universe_id: 'u1', title: "O'Neil", installs: 41, hidden: 1, created_at: 'c' }],
        versions: [{ package_id: 'pk_1', version: 1, state: 'done', created_at: 'c' }],
    };
    const sql = planSql(source);
    assert.match(sql, /INSERT INTO packages .*VALUES \('pk_1', 'e2b2245a-5260-4b91-8f33-1e02997fd9d5', 'u1', 'O''Neil', 0, 0/);
    assert.match(sql, /ON CONFLICT \(id\) DO UPDATE SET author_id = excluded\.author_id, universe_id = excluded\.universe_id, title = excluded\.title, hidden/);
    assert.doesNotMatch(sql, /installs = excluded/);
    assert.match(sql, /ON CONFLICT \(package_id, version\) DO UPDATE SET state = excluded\.state;/);
    const removal = removeSql(source);
    assert.match(removal, /DELETE FROM packages WHERE id IN \('pk_1'\) AND author_id = 'e2b2245a/);
    assert.match(removal, /DELETE FROM universes WHERE id IN \('u1'\) AND owner_id = 'e2b2245a/);
});
test('every pack names a cover that is WebP within the limits (F17)', () => {
    const packs = packFolders().map(readPack);
    for (const p of packs) {
        assert.equal(p.listing.cover, `covers/${p.slug}.webp`, p.slug);
        assert.ok(p.cover.image.bytes.byteLength <= 2 * 1024 * 1024, p.slug);
        assert.ok(p.cover.thumb.bytes.byteLength <= 200 * 1024, p.slug);
        assert.match(p.cover.image.hash, /^[0-9a-f]{64}$/);
        assert.notEqual(p.cover.image.hash, p.cover.thumb.hash);
    }
    assert.throws(() => coverFiles('art/x.png', 'listing.json'), /listing.json: cover: Expected "covers\/<name>.webp"/);
    assert.throws(() => coverFiles('covers/not-there.webp', 'listing.json'), /does not exist/);
});

test('--remove deletes only the cover objects nothing outside the examples names', () => {
    const asked = [];
    const to = {
        select: (sql) => {
            asked.push(sql);
            if (sql.includes('pragma_table_info')) return [{ n: 1 }];
            return [{ n: sql.includes("'shared'") ? 1 : 0 }];
        },
    };
    const source = { packages: [{ id: 'pk_A' }], covers: [{ packageId: 'pk_A', hash: 'own', thumbHash: 'shared' }] };
    assert.deepEqual(coversToDelete(to, source), ['own']);
    assert.ok(asked.some((sql) => sql.includes("NOT IN ('pk_A')") && sql.includes('image_hashes')));
    assert.deepEqual(coversToDelete({ select: () => [{ n: 0 }] }, source), [], 'a target without 0019 deletes nothing');
});

const builtState = path.resolve('findings/examples/local_covers');
const standIn = path.resolve('findings/examples/standin_covers');
test('the seeding dry run names each cover', { skip: existsSync(path.join(builtState, 'built.json')) && existsSync(path.join(standIn, 'state')) ? false : 'no built state and stand-in (build_local.mjs, then --bare)' }, () => {
    const r = spawnSync(process.execPath, ['tools/examples/seed_production.mjs', '--from', builtState, '--to-local', standIn, '--port', '8872'], { encoding: 'utf8', windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /print only/);
    const lines = r.stdout.split(/\r?\n/).filter((line) => line.trim().startsWith('cover '));
    assert.equal(lines.length, 6, r.stdout);
    for (const line of lines) assert.match(line, /objects\/[0-9a-f]{12}… and thumbnail objects\/[0-9a-f]{12}…/);
    assert.match(r.stdout, /covers 6/);
});

test('the seed refuses a target that holds an example package under another id', () => {
    const source = [{ id: 'pk_NEW', title: 'Feri terraces' }, { id: 'pk_B', title: 'Hollow Verge' }];
    assert.equal(duplicateRefusal(source, [{ id: 'pk_B', title: 'Hollow Verge' }]), null, 'same ids: an update');
    assert.equal(duplicateRefusal(source, []), null, 'a fresh target');
    assert.equal(
        duplicateRefusal(source, [{ id: 'pk_OLD', title: 'Feri terraces' }]),
        'The target already has "Feri terraces" as pk_OLD, and this source has it as pk_NEW; seed from the state the target came from. Nothing written.',
    );
});

test('the copy keeps only the columns the target has', () => {
    const sql = planSql({ universes: [{ id: 'u1', name: 'U', show_course: 1, created_at: 'T' }], packages: [], versions: [] }, { universes: ['id', 'name', 'created_at'] });
    assert.doesNotMatch(sql, /show_course/);
    assert.match(sql, /INSERT INTO universes \(id, name, created_at, owner_id/);
});
