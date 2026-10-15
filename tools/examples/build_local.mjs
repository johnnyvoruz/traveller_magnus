// Builds the six example packages in a fresh local state, published by the house account.
//   node tools/examples/build_local.mjs [--state <dir>] [--port 8831] [--fresh]
//   node tools/examples/build_local.mjs --bare --state <dir>   (a stand-in for production: house account and chart only)
//   node tools/examples/build_local.mjs --record               (once: generate the sector piece and record it)
// Local only. Every pack goes in through the app's routes. Nothing here talks to production.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseExport } from '../../apps/web/src/campaign/import.ts';
import { CAMPAIGN_LIMITS } from '@voyage/shared';
import {
    EDITION, EXAMPLE_HANDLE, EXAMPLE_USER_ID, HERE, ROOT, TRUTH_VERSION, account, arg, client, flag, localState,
    must, objectHashes, packFolders, prepare, r2Get, r2Put, select, settle, sha256, sqlFile, startApi, stopApi, up, q,
} from './lib.mjs';

const PLACEHOLDER = '~00000000000000000000000000';

/** Reads and checks one pack. Refuses with the file and the field. */
export function readPack(folder) {
    const campaignFile = path.join(folder, 'campaign.json');
    const listingFile = path.join(folder, 'listing.json');
    const parsed = parseExport(readFileSync(campaignFile, 'utf8'));
    if (!parsed.ok) throw new Error(`${path.relative(ROOT, campaignFile)}: ${parsed.message}`);
    let listing;
    try { listing = JSON.parse(readFileSync(listingFile, 'utf8')); } catch { throw new Error(`${path.relative(ROOT, listingFile)}: The file is not JSON.`); }
    for (const field of ['title', 'kind', 'description']) {
        if (typeof listing[field] !== 'string' || !listing[field].trim()) throw new Error(`${path.relative(ROOT, listingFile)}: ${field}: Required`);
    }
    if (!Array.isArray(listing.tags) || listing.tags.some((t) => typeof t !== 'string')) throw new Error(`${path.relative(ROOT, listingFile)}: tags: Expected array of strings`);
    const packFile = path.join(folder, 'pack.json');
    const pack = existsSync(packFile) ? JSON.parse(readFileSync(packFile, 'utf8')) : { mode: 'records' };
    const doc = parsed.document;
    if (doc.universe.truthVersion !== TRUTH_VERSION) throw new Error(`${path.relative(ROOT, campaignFile)}: universe.truthVersion: Expected ${TRUTH_VERSION}`);
    const anchors = [...new Set(doc.records.map((r) => r.anchor?.kind === 'system' ? r.anchor.hexKey : null).filter((k) => k && !k.startsWith('~')))].sort();
    return { slug: path.basename(folder), folder, doc, listing, pack, anchors };
}

/** PATCH batches within the campaign limits, records then links, each row at baseRev 0. */
function batches(records, links) {
    const rows = [...records.map((r) => ['records', { ...r, baseRev: 0 }]), ...links.map((l) => ['links', { ...l, baseRev: 0 }])];
    const out = [];
    let cur = { records: [], links: [] };
    let n = 0;
    for (const [kind, row] of rows) {
        const size = JSON.stringify(cur).length + JSON.stringify(row).length;
        if (n >= CAMPAIGN_LIMITS.patchRows || size > CAMPAIGN_LIMITS.patchBytes * 0.9) { out.push(cur); cur = { records: [], links: [] }; n = 0; }
        cur[kind].push(row);
        n++;
    }
    if (n) out.push(cur);
    return out.map((b) => Object.fromEntries(Object.entries(b).filter(([, v]) => v.length)));
}

async function loadRecords(call, universeId, records, links) {
    for (const patch of batches(records, links)) must(await call('PATCH', `/api/universes/${universeId}/campaign/changes`, patch), 'campaign changes');
}

async function publish(call, universeId, listing, hexKeys, recordIds) {
    const pkg = must(await call('POST', '/api/packages', { title: listing.title, kind: listing.kind, description: listing.description, tags: listing.tags, universeId }), 'create package ' + listing.title);
    must(await call('POST', `/api/packages/${pkg.id}/versions`, { universeId, hexKeys, recordIds }), 'publish ' + listing.title);
    await settle(call, pkg.id, 1);
    return pkg.id;
}

const universe = async (call, name) => must(await call('POST', '/api/universes', { name, truthVersion: TRUTH_VERSION, editionDefault: EDITION }), 'universe ' + name).id;

/** Record mode: generate the sector piece with the Builder and keep its manifest and objects. */
async function recordSector(st, call, p) {
    const id = await universe(call, p.listing.title);
    const sector = must(await call('POST', `/api/universes/${id}/sectors`, { name: p.pack.sectorName, slot: p.pack.slot }), 'sector').id;
    for (const local of p.pack.hexes) {
        must(await call('POST', `/api/universes/${id}/generate`, { hexKeys: [`${sector}/${local}`], edition: EDITION, generator: 'top-down', baseRev: 0 }), 'generate ' + local);
    }
    const records = JSON.parse(JSON.stringify(p.doc.records).replaceAll(PLACEHOLDER, sector));
    await loadRecords(call, id, records, p.doc.links);
    const pkg = await publish(call, id, p.listing, p.pack.hexes.map((l) => `${sector}/${l}`), records.map((r) => r.id));
    const manifestText = r2Get(st, `packages/${pkg}/1/manifest.json`).toString('utf8');
    const manifest = JSON.parse(manifestText);
    const dir = path.join(p.folder, 'recorded');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(path.join(dir, 'objects'), { recursive: true });
    writeFileSync(path.join(dir, 'manifest.json'), manifestText);
    for (const hash of objectHashes(manifest)) {
        const body = r2Get(st, `objects/${hash}`);
        if (body) writeFileSync(path.join(dir, 'objects', hash), body);
    }
    for (const [key, hex] of Object.entries(manifest.hexes)) console.log('  recorded', key, hex.summary?.name ?? '', hex.summary?.uwp ?? '');
}

/**
 * Restore: the recorded piece goes into the house account as a hidden bootstrap package (local D1 and R2 only),
 * is imported placed at its recorded slot, and the bootstrap rows are deleted. The house universe then publishes
 * it through the routes like the other packs.
 */
async function restoreSector(st, call, p) {
    const dir = path.join(p.folder, 'recorded');
    if (!existsSync(path.join(dir, 'manifest.json'))) throw new Error(`${path.relative(ROOT, dir)}: missing. Run build_local.mjs --record once.`);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const file of readdirSync(path.join(dir, 'objects'))) {
        const body = readFileSync(path.join(dir, 'objects', file));
        if (sha256(body) !== file) throw new Error(`${path.relative(ROOT, dir)}/objects/${file}: hash does not match the body`);
        r2Put(st, `objects/${file}`, body);
    }
    const id = await universe(call, p.listing.title);
    const boot = 'example-bootstrap-' + p.slug;
    const now = new Date().toISOString();
    const keys = Object.keys(manifest.hexes);
    const recorded = Object.keys(manifest.ownSectors ?? {})[0];
    if (!recorded) throw new Error(`${path.relative(ROOT, dir)}/manifest.json: ownSectors: Required`);
    const bootManifest = { ...manifest, packageId: boot };
    r2Put(st, `packages/${boot}/1/manifest.json`, JSON.stringify(bootManifest));
    sqlFile(st, `INSERT INTO packages (id, author_id, universe_id, kind, title, slug, description, tags, edition, truth_version, engine_version, latest_version, installs, created_at, updated_at, hidden)
VALUES (${q(boot)}, ${q(EXAMPLE_USER_ID)}, ${q(id)}, ${q(manifest.kind)}, ${q(manifest.title)}, ${q(boot)}, '', '[]', ${q(manifest.edition)}, ${q(TRUTH_VERSION)}, ${q(manifest.engineVersion)}, 1, 0, ${q(now)}, ${q(now)}, 1);
INSERT INTO package_versions (package_id, version, state, hex_count, record_count, hex_keys, record_ids, created_at) VALUES (${q(boot)}, 1, 'done', ${keys.length}, ${manifest.records.count}, ${q(JSON.stringify(keys))}, '[]', ${q(now)});
`);
    const slot = manifest.ownSectors[recorded];
    const anchor = `${recorded}/${p.pack.anchor}`;
    const placement = { anchor, to: `~slot_${slot.x}_${slot.y}/${p.pack.anchor}` };
    const installed = must(await call('POST', `/api/universes/${id}/install`, { packageId: boot, version: 1, placement, resolutions: {}, recordResolutions: {}, expect: { conflicts: 0 } }), 'restore ' + p.slug);
    const rows = select(st, `SELECT placement FROM package_installs WHERE id = ${q(installed.installId)}`);
    // The recorded manifest predates F16, so the pack's links go in from campaign.json; their ends are the restored record ids.
    await loadRecords(call, id, [], p.doc.links);
    sqlFile(st, `DELETE FROM package_installs WHERE package_id = ${q(boot)}; DELETE FROM package_versions WHERE package_id = ${q(boot)}; DELETE FROM packages WHERE id = ${q(boot)};`);
    const sectors = await call('GET', `/api/universes/${id}/sectors`);
    if (sectors.status >= 300) throw new Error(`sectors: ${sectors.status}`);
    const list = sectors.body?.data?.items ?? sectors.body?.items ?? [];
    const made = list.find((s) => s.slot?.x === slot.x && s.slot?.y === slot.y) ?? list[0];
    if (!made) throw new Error(`restore ${p.slug}: no own sector after the import (${JSON.stringify(rows)})`);
    must(await call('POST', `/api/universes/${id}/sectors/${encodeURIComponent(made.id)}/rename`, { name: p.pack.sectorName, baseRev: made.rev ?? 0 }), 'rename sector');
    const hexKeys = keys.map((k) => made.id + k.slice(recorded.length));
    const recordIds = p.doc.records.map((r) => r.id);
    return { universeId: id, packageId: await publish(call, id, p.listing, hexKeys, recordIds) };
}

/** Same bytes except ids and times: the run is deterministic when this matches between two fresh runs. */
export function fingerprint(manifest, objects) {
    const norm = (text) => text
        .replace(/~[0-9A-HJKMNP-TV-Z]{26}/g, '~SECTOR')
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, 'T')
        .replace(/[0-9a-f]{64}/g, 'H')
        .replace(/[0-9A-HJKMNP-TV-Z]{26}/g, 'ID');
    const m = { ...manifest, packageId: 'P', publishedAt: 'T' };
    return sha256(norm(JSON.stringify(m)) + objects.map((o) => norm(o)).sort().join('\n'));
}

async function main() {
    const st = localState(path.resolve(arg('--state', path.join(ROOT, 'findings/examples/local'))), Number(arg('--port', '8831')));
    if (existsSync(st.persist)) {
        if (!flag('--fresh')) throw new Error(`${st.persist} is not empty. Pass --fresh to start again.`);
        rmSync(st.persist, { recursive: true, force: true });
    }
    const packs = flag('--bare') ? [] : packFolders().map(readPack);
    if (!flag('--bare') && packs.length !== 6) throw new Error(`Expected six packs, found ${packs.length}: ${packs.map((p) => p.slug).join(', ')}`);
    const hexKeys = [...new Set(packs.flatMap((p) => [...p.anchors, ...(p.pack.mode === 'charted' ? p.pack.hexKeys : [])]))].sort();
    const truth = await prepare(st, hexKeys.length ? hexKeys : ['Spinward_Marches/1910']);
    console.log(`State ${path.relative(ROOT, st.dir)}: ${truth.version}, house account ${EXAMPLE_HANDLE} (${EXAMPLE_USER_ID}).`);
    if (flag('--bare')) return;
    const call = client(st, account(st, EXAMPLE_USER_ID, EXAMPLE_HANDLE));
    const child = startApi(st);
    console.log(`API pid ${child.pid} on ${st.api}`);
    const built = [];
    try {
        await up(st);
        for (const p of packs) {
            if (flag('--record')) { if (p.pack.mode === 'sector') await recordSector(st, call, p); continue; }
            if (p.pack.mode === 'sector') {
                built.push({ slug: p.slug, ...(await restoreSector(st, call, p)) });
            } else {
                const id = await universe(call, p.listing.title);
                await loadRecords(call, id, p.doc.records, p.doc.links);
                const keys = p.pack.mode === 'charted' ? p.pack.hexKeys : p.anchors;
                built.push({ slug: p.slug, universeId: id, packageId: await publish(call, id, p.listing, keys, p.doc.records.map((r) => r.id)) });
            }
            console.log('  published', p.slug);
        }
    } finally {
        stopApi(child);
        console.log(`API pid ${child.pid} stopped.`);
    }
    if (flag('--record')) return;
    for (const b of built) {
        const manifest = JSON.parse(r2Get(st, `packages/${b.packageId}/1/manifest.json`).toString('utf8'));
        const objects = objectHashes(manifest).map((h) => (r2Get(st, `objects/${h}`) ?? Buffer.from('')).toString('utf8'));
        b.hexes = Object.keys(manifest.hexes).length;
        b.records = manifest.records.count;
        b.fingerprint = fingerprint(manifest, objects);
    }
    writeFileSync(path.join(st.dir, 'built.json'), JSON.stringify({ house: { id: EXAMPLE_USER_ID, handle: EXAMPLE_HANDLE }, truthVersion: TRUTH_VERSION, packages: built }, null, 1) + '\n');
    for (const b of built) console.log(`${b.slug.padEnd(30)} ${b.packageId}  hexes ${b.hexes}  records ${b.records}  ${b.fingerprint.slice(0, 16)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, 'build_local.mjs')) {
    main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}