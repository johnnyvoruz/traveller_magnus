// Copies the example packages from a built local state into a target: D1 rows (the packages, their versions and
// the universes they name) and R2 objects (manifests and the content-addressed objects they list).
//   node tools/examples/seed_production.mjs --from <built state> --to-local <stand-in state>        (print only)
//   node tools/examples/seed_production.mjs --from <built state> --to-local <stand-in state> --apply
//   node tools/examples/seed_production.mjs --from <built state> --to-local <stand-in state> --remove --apply
//   node tools/examples/seed_production.mjs --from <built state> --production [--apply | --remove --apply]
// Without --apply it only prints. Running it again changes nothing. Install counts start at 0.
// --production uses the repo's apps/api/wrangler.toml with --remote. Only Johnny runs that.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
    EXAMPLE_HANDLE, EXAMPLE_USER_ID, HERE, ROOT, arg, flag, localState, objectHashes, q, r2Get, select, sqlFile, wrangler,
} from './lib.mjs';

const WRANGLER = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');

/** The target: a local stand-in state, or production through the repo config with --remote. */
export function target() {
    if (flag('--production') && arg('--to-local')) throw new Error('Pass --production or --to-local, not both.');
    if (arg('--to-local')) {
        const st = localState(path.resolve(arg('--to-local')), Number(arg('--port', '8851')));
        if (!existsSync(st.persist)) throw new Error(`${st.persist} does not exist. Make it with build_local.mjs --bare first.`);
        return {
            name: `local state ${path.relative(ROOT, st.dir)}`,
            select: (sql) => select(st, sql),
            exec: (sql) => sqlFile(st, sql),
            put: (key, body, type) => { const f = path.join(st.dir, 'seed.tmp'); writeFileSync(f, body); wrangler(st, ['r2', 'object', 'put', 'voyage-public/' + key, '--file', f, ...(type ? ['--content-type', type] : [])]); },
            del: (key) => wrangler(st, ['r2', 'object', 'delete', 'voyage-public/' + key]),
        };
    }
    if (!flag('--production')) throw new Error('Name the target: --to-local <dir> or --production.');
    const config = path.join(ROOT, 'apps/api/wrangler.toml');
    const tmp = path.join(ROOT, 'findings/examples/seed_tmp');
    mkdirSync(tmp, { recursive: true });
    const run = (args) => {
        const r = spawnSync(process.execPath, [WRANGLER, ...args, '--remote', '--config', config], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28, env: { ...process.env, CI: '1' } });
        if (r.status) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed\n${r.stdout}${r.stderr}`);
        return r.stdout;
    };
    return {
        name: 'production (remote)',
        select: (sql) => { const out = run(['d1', 'execute', 'voyage', '--json', '--command', sql]); return JSON.parse(out.slice(out.indexOf('[')))[0].results; },
        exec: (sql) => { const f = path.join(tmp, 'seed.sql'); writeFileSync(f, sql); run(['d1', 'execute', 'voyage', '--file', f]); },
        put: (key, body, type) => { const f = path.join(tmp, 'seed.tmp'); writeFileSync(f, body); run(['r2', 'object', 'put', 'voyage-public/' + key, '--file', f, ...(type ? ['--content-type', type] : [])]); },
        del: (key) => run(['r2', 'object', 'delete', 'voyage-public/' + key]),
    };
}

/** Everything the copy writes, read from the built local state. */
export function readSource(dir) {
    const st = localState(path.resolve(dir), 8831);
    const built = JSON.parse(readFileSync(path.join(st.dir, 'built.json'), 'utf8'));
    if (built.house.id !== EXAMPLE_USER_ID || built.house.handle !== EXAMPLE_HANDLE) {
        throw new Error(`${path.relative(ROOT, st.dir)}/built.json was built for ${built.house.handle} (${built.house.id}), not ${EXAMPLE_HANDLE} (${EXAMPLE_USER_ID}).`);
    }
    const ids = built.packages.map((p) => p.packageId);
    const list = ids.map(q).join(', ');
    const packages = select(st, `SELECT * FROM packages WHERE id IN (${list}) ORDER BY id`);
    const versions = select(st, `SELECT * FROM package_versions WHERE package_id IN (${list}) AND state = 'done' ORDER BY package_id, version`);
    const universes = select(st, `SELECT * FROM universes WHERE id IN (${packages.map((p) => q(p.universe_id)).join(', ')}) ORDER BY id`);
    if (packages.length !== ids.length) throw new Error(`built.json lists ${ids.length} packages; the state holds ${packages.length}.`);
    const objects = new Map();
    const manifests = new Map();
    for (const v of versions) {
        const key = `packages/${v.package_id}/${v.version}/manifest.json`;
        const body = r2Get(st, key);
        if (!body) throw new Error(`${key} is missing from the built state.`);
        manifests.set(key, body);
        for (const hash of objectHashes(JSON.parse(body.toString('utf8')))) {
            const object = r2Get(st, `objects/${hash}`);
            if (object) objects.set(`objects/${hash}`, object);
        }
    }
    // F17. Each uploaded cover pair, read from the built state's rows and bucket.
    const covers = [];
    for (const p of packages) {
        if (!p.cover_hash || !p.cover_thumb_hash) continue;
        const image = r2Get(st, `objects/${p.cover_hash}`);
        const thumb = r2Get(st, `objects/${p.cover_thumb_hash}`);
        if (!image || !thumb) throw new Error(`The cover of ${p.id} is missing from the built state.`);
        covers.push({ packageId: p.id, title: p.title, hash: p.cover_hash, thumbHash: p.cover_thumb_hash, image, thumb });
    }
    return { built, packages, versions, universes, manifests, objects, covers };
}

/** Whether the target has 0019's columns. */
export function targetHasCovers(to) {
    return to.select(`SELECT COUNT(*) AS n FROM pragma_table_info('packages') WHERE name = 'cover_hash'`)[0].n > 0;
}

/** The cover objects --remove deletes: those no package outside the examples names, as a cover or a record image. */
export function coversToDelete(to, source) {
    if (!source.covers.length || !targetHasCovers(to)) return [];
    const ours = source.packages.map((p) => q(p.id)).join(', ');
    const out = [];
    for (const hash of new Set(source.covers.flatMap((c) => [c.hash, c.thumbHash]))) {
        const named = to.select(`SELECT
            (SELECT COUNT(*) FROM packages WHERE id NOT IN (${ours}) AND (cover_hash = ${q(hash)} OR cover_thumb_hash = ${q(hash)}))
          + (SELECT COUNT(*) FROM package_versions WHERE package_id NOT IN (${ours}) AND image_hashes IS NOT NULL
               AND EXISTS (SELECT 1 FROM json_each(package_versions.image_hashes) WHERE json_each.value = ${q(hash)})) AS n`)[0].n;
        if (!named) out.push(hash);
    }
    return out;
}

const columns = (row) => Object.keys(row);
function upsert(table, row, key, keep = []) {
    const cols = columns(row);
    const update = cols.filter((c) => !key.includes(c) && !keep.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
    return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => (typeof row[c] === 'number' ? row[c] : q(row[c]))).join(', ')})
ON CONFLICT (${key.join(', ')}) DO ${update ? 'UPDATE SET ' + update : 'NOTHING'};`;
}

/** The SQL for an apply. Universes are bare rows owned by the house account; installs start at 0. */
export function planSql({ packages, versions, universes }) {
    const now = new Date().toISOString();
    const out = [];
    for (const u of universes) {
        out.push(upsert('universes', { ...u, owner_id: EXAMPLE_USER_ID, hex_override_count: 0, object_bytes: 0, deleted_at: null, purge_after: null, last_snapshot_at: null, updated_at: u.updated_at ?? now }, ['id'], ['created_at']));
    }
    for (const p of packages) {
        out.push(upsert('packages', { ...p, author_id: EXAMPLE_USER_ID, installs: 0, hidden: 0, takedown_reason: null, takedown_by: null }, ['id'], ['installs', 'created_at']));
    }
    for (const v of versions) out.push(upsert('package_versions', v, ['package_id', 'version'], ['created_at']));
    return out.join('\n') + '\n';
}
export function removeSql({ packages, universes }) {
    const pk = packages.map((p) => q(p.id)).join(', ');
    const un = universes.map((u) => q(u.id)).join(', ');
    return `DELETE FROM package_versions WHERE package_id IN (${pk});
DELETE FROM packages WHERE id IN (${pk}) AND author_id = ${q(EXAMPLE_USER_ID)};
DELETE FROM universes WHERE id IN (${un}) AND owner_id = ${q(EXAMPLE_USER_ID)} AND id NOT IN (SELECT universe_id FROM packages);
`;
}

async function main() {
    const from = arg('--from', path.join(ROOT, 'findings/examples/local'));
    const to = target();
    const apply = flag('--apply');
    const source = readSource(from);
    console.log(`Target: ${to.name}${apply ? '' : ' (print only; pass --apply to write)'}`);
    const house = to.select(`SELECT u.id AS id, p.handle AS handle FROM user u JOIN profile p ON p.user_id = u.id WHERE u.id = ${q(EXAMPLE_USER_ID)}`);
    if (!house.length) throw new Error(`No account ${EXAMPLE_USER_ID} with a profile on the target. Nothing written.`);
    if (house[0].handle !== EXAMPLE_HANDLE) throw new Error(`Account ${EXAMPLE_USER_ID} has handle ${house[0].handle}, not ${EXAMPLE_HANDLE}. Nothing written.`);
    console.log(`House account found: ${house[0].handle} (${house[0].id}).`);
    const present = to.select(`SELECT id, installs FROM packages WHERE id IN (${source.packages.map((p) => q(p.id)).join(', ')})`);
    const held = new Map(present.map((r) => [r.id, r.installs]));
    if (flag('--remove')) {
        console.log(`Remove: ${held.size} of ${source.packages.length} packages are on the target.`);
        for (const p of source.packages) console.log(`  ${held.has(p.id) ? 'delete' : 'absent'}  ${p.id}  ${p.title}`);
        console.log('  Manifests and objects in R2 stay; they are content-addressed and nothing lists them once the rows are gone.');
        const drop = coversToDelete(to, source);
        for (const hash of drop) console.log(`  delete cover object  objects/${hash}`);
        if (apply) {
            to.exec(removeSql(source));
            for (const hash of drop) to.del(`objects/${hash}`);
            console.log('Removed.');
        }
        return;
    }
    for (const p of source.packages) {
        const v = source.versions.filter((x) => x.package_id === p.id);
        console.log(`  ${held.has(p.id) ? 'update' : 'insert'}  ${p.id}  ${p.kind.padEnd(13)} ${p.title}  (versions ${v.map((x) => x.version).join(', ')}; installs ${held.has(p.id) ? held.get(p.id) + ', kept' : '0'})`);
    }
    for (const c of source.covers) console.log(`  cover   ${c.packageId}  ${c.title}  objects/${c.hash.slice(0, 12)}… and thumbnail objects/${c.thumbHash.slice(0, 12)}…`);
    console.log(`  universes ${source.universes.length}, manifests ${source.manifests.size}, objects ${source.objects.size}, covers ${source.covers.length}`);
    if (!targetHasCovers(to) && source.packages.some((p) => 'cover_hash' in p)) {
        throw new Error('The target has no 0019 columns (packages.cover_hash). Apply the migrations there first. Nothing written.');
    }
    if (!apply) return;
    for (const c of source.covers) {
        to.put(`objects/${c.hash}`, c.image, 'image/webp');
        to.put(`objects/${c.thumbHash}`, c.thumb, 'image/webp');
    }
    for (const [key, body] of source.objects) to.put(key, body);
    for (const [key, body] of source.manifests) to.put(key, body);
    to.exec(planSql(source));
    const after = to.select(`SELECT id, installs, latest_version AS v FROM packages WHERE id IN (${source.packages.map((p) => q(p.id)).join(', ')})`);
    console.log(`Applied: ${after.length} packages on the target.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, 'seed_production.mjs')) {
    main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}