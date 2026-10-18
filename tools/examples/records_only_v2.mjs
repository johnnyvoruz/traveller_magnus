// Publishes a records-only version of two example packages (Johnny's answer 6, 2026-10-17): "Regina highport
// contacts" and "Jewell patrons" get a new version with no hexes and the same records as their latest version,
// through the app's own publish route, in a built local state. Their package ids don't change.
//   node tools/examples/records_only_v2.mjs [--state findings/examples/local] [--port 8861]           (print only)
//   node tools/examples/records_only_v2.mjs [--state findings/examples/local] [--port 8861] --apply
// Local only: every wrangler call passes --local. Production gets the new versions afterwards from
// seed_production.mjs, which copies the rows and manifests by id.
import path from 'node:path';
import {
    EXAMPLE_HANDLE, EXAMPLE_USER_ID, HERE, ROOT, account, arg, client, flag, localState, must, q, r2Get, select, settle,
    startApi, stopApi, up,
} from './lib.mjs';

export const RECORDS_ONLY_TITLES = ['Regina highport contacts', 'Jewell patrons'];

/**
 * The plan from each package's latest version row: publish version n+1 with no hexes and the same record ids, or
 * skip one whose latest version already has no hexes. Refuses (throws) on a missing or unfinished package.
 */
export function planRecordsOnly(rows, titles = RECORDS_ONLY_TITLES) {
    return titles.map((title) => {
        const found = rows.filter((r) => r.title === title);
        if (found.length !== 1) throw new Error(`Expected one package titled "${title}" by the house account, found ${found.length}. Nothing written.`);
        const row = found[0];
        if (row.state !== 'done') throw new Error(`"${title}" version ${row.version} is ${row.state}, not done. Nothing written.`);
        const recordIds = JSON.parse(row.record_ids);
        if (!recordIds.length) throw new Error(`"${title}" version ${row.version} has no records. Nothing written.`);
        const action = row.hex_count === 0 ? 'skip' : 'publish';
        return { action, packageId: row.id, title, universeId: row.universe_id, from: row.version, to: action === 'skip' ? row.version : row.version + 1, hexes: row.hex_count, recordIds };
    });
}

/** Checks a published records-only manifest against the plan. Returns a list of problems (empty when right). */
export function checkManifest(manifest, step) {
    const problems = [];
    if (manifest.packageId !== step.packageId) problems.push(`packageId is ${manifest.packageId}`);
    if (Object.keys(manifest.hexes ?? {}).length) problems.push(`${Object.keys(manifest.hexes).length} hexes`);
    if (manifest.records?.count !== step.recordIds.length) problems.push(`records.count is ${manifest.records?.count}, expected ${step.recordIds.length}`);
    return problems;
}

async function main() {
    const st = localState(path.resolve(arg('--state', path.join(ROOT, 'findings/examples/local'))), Number(arg('--port', '8861')));
    const apply = flag('--apply');
    const rows = select(st, `SELECT p.id, p.title, p.universe_id, v.version, v.state, v.hex_count, v.record_ids
        FROM packages p JOIN package_versions v ON v.package_id = p.id AND v.version = p.latest_version
        WHERE p.author_id = ${q(EXAMPLE_USER_ID)} AND p.title IN (${RECORDS_ONLY_TITLES.map(q).join(', ')})`);
    const plan = planRecordsOnly(rows);
    console.log(`State ${path.relative(ROOT, st.dir)}${apply ? '' : ' (print only; pass --apply to publish)'}`);
    for (const s of plan) {
        console.log(`  ${s.action.padEnd(7)} ${s.packageId}  ${s.title}  version ${s.from} (${s.hexes} hexes, ${s.recordIds.length} records)${s.action === 'publish' ? ` -> version ${s.to} (0 hexes, ${s.recordIds.length} records)` : ': already records-only'}`);
    }
    const todo = plan.filter((s) => s.action === 'publish');
    if (!apply || !todo.length) return;
    const cookie = account(st, EXAMPLE_USER_ID, EXAMPLE_HANDLE);
    const call = client(st, cookie);
    const child = startApi(st);
    console.log(`API pid ${child.pid} on ${st.api}`);
    try {
        await up(st);
        for (const s of todo) {
            const made = must(await call('POST', `/api/packages/${s.packageId}/versions`, { universeId: s.universeId, hexKeys: [], recordIds: s.recordIds }), 'publish ' + s.title);
            if (made?.version !== undefined && made.version !== s.to) throw new Error(`${s.title}: the route made version ${made.version}, expected ${s.to}.`);
            await settle(call, s.packageId, s.to);
            console.log(`  published ${s.packageId} version ${s.to}`);
        }
    } finally {
        stopApi(child);
        console.log(`API pid ${child.pid} stopped.`);
    }
    for (const s of todo) {
        const body = r2Get(st, `packages/${s.packageId}/${s.to}/manifest.json`);
        if (!body) throw new Error(`packages/${s.packageId}/${s.to}/manifest.json is missing.`);
        const problems = checkManifest(JSON.parse(body.toString('utf8')), s);
        if (problems.length) throw new Error(`${s.title} version ${s.to}: ${problems.join('; ')}`);
        const [row] = select(st, `SELECT p.latest_version AS latest, v.hex_count, v.record_count, v.record_ids FROM packages p JOIN package_versions v ON v.package_id = p.id AND v.version = ${s.to} WHERE p.id = ${q(s.packageId)}`);
        const same = JSON.stringify([...JSON.parse(row.record_ids)].sort()) === JSON.stringify([...s.recordIds].sort());
        if (row.latest !== s.to || row.hex_count !== 0 || !same) throw new Error(`${s.title}: latest ${row.latest}, hexes ${row.hex_count}, same records ${same}.`);
        console.log(`  checked ${s.packageId} version ${s.to}: 0 hexes, ${row.record_count} records, the same ids as version ${s.from}`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, 'records_only_v2.mjs')) {
    main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}