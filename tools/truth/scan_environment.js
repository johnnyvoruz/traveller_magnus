/**
 * Read-only scan of released truth v5 trees on the public CDN.
 *
 * Paths match apps/web/src/map/truth_client.ts: index at
 *   {cdn}/truth/{version}/sectors/{slug}/index.json
 * and each tree at
 *   {cdn}/objects/{hash}
 * Default CDN is https://cdn.traveller.voyage, version v5.
 *
 * Streams one tree at a time. The only file written is
 * findings/environment_scan_v5.json.
 *
 * tests/generation/environment_audit.js was not present when this scanner
 * was written, so the checks live here. Liquid ranges come from
 * MgT2EData.atmosphereExtended.exoticLiquids in the generated rules module
 * (scripts/gen_rules_esm.js output of rules/mgt2e_data.js).
 *
 *   node tools/truth/scan_environment.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MgT2EData } from '../../packages/engines/src/generated/rules/mgt2e_data.js';
import { fromEHex } from '../../packages/engines/src/core/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CDN = 'https://cdn.traveller.voyage';
const VERSION = 'v5';
const CONCURRENCY = 6;
const OUT = path.join(ROOT, 'findings', 'environment_scan_v5.json');

// Spread: dense Imperial core, Vilani capital, Sol's neighbourhood, the
// Marches, a Vargr sector, an Aslan rim sector, a rift, and a sparse desert.
const SECTORS = [
    { slug: 'Spinward_Marches', why: 'Imperial frontier, mixed published spectra, moderate density' },
    { slug: 'Vland', why: 'Vilani capital sector, dense' },
    { slug: 'Core', why: 'Densest official Imperial sector' },
    { slug: 'Solomani_Rim', why: 'Sol and the surrounding G/K neighbourhood' },
    { slug: 'Gvurrdon', why: 'Vargr Extents, coreward of the Marches' },
    { slug: 'Dark_Nebula', why: 'Aslan rimward sector' },
    { slug: 'Reft', why: 'Great Rift, sparsest sector in this set' },
    { slug: 'Empty_Quarter', why: 'Sparse desert sector, trailing-coreward' },
];

const LIQUIDS = MgT2EData.atmosphereExtended.exoticLiquids;
if (!Array.isArray(LIQUIDS) || LIQUIDS.length === 0) {
    throw new Error('generated exoticLiquids table is missing');
}
const LIQUID_BY_NAME = new Map(LIQUIDS.map((row) => [row.name, row]));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
    let last;
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
            if (res.status === 429 || res.status >= 500) {
                last = new Error(`${res.status} ${url}`);
                await sleep(400 * attempt);
                continue;
            }
            if (!res.ok) throw new Error(`${res.status} ${url}`);
            return await res.json();
        } catch (err) {
            last = err;
            if (attempt === 4) throw err;
            await sleep(400 * attempt);
        }
    }
    throw last;
}

async function mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let cursor = 0;
    const workers = [];
    const n = Math.min(limit, items.length);
    for (let w = 0; w < n; w++) {
        workers.push((async () => {
            while (cursor < items.length) {
                const i = cursor;
                cursor += 1;
                out[i] = await fn(items[i], i);
            }
        })());
    }
    await Promise.all(workers);
    return out;
}

function blank() {
    return {
        atmDiff: 0,
        hydroDiff: 0,
        atmMissing: 0,
        hydroMissing: 0,
        liquidOut: 0,
        iceHydro0: 0,
        unknown: 0,
        below200: 0,
        above400: 0,
        moon: 0,
        contradiction: 0,
    };
}

function note(list, hex) {
    if (list.length < 3) list.push(hex);
}

function walk(worlds, visit) {
    for (const world of worlds || []) {
        visit(world);
        if (world && world.moons) walk(world.moons, visit);
        if (world && world.significantBodies) walk(world.significantBodies, visit);
    }
}

function isMainworld(world) {
    return world.type === 'Mainworld' || world.isLunarMainworld === true || world.targetWorld === 'Mainworld';
}

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function chartDigit(uwp, index) {
    const ch = uwp && uwp[index];
    if (!ch || ch === '?' || ch === '-' || ch === ' ') return null;
    return fromEHex(ch);
}

function liquidOut(body) {
    const row = LIQUID_BY_NAME.get(body.liquidType);
    if (!row || !finite(body.meanTempK)) return false;
    return body.meanTempK < row.mp || body.meanTempK > row.bp;
}

function tallyBody(counts, body) {
    counts.bodies += 1;
    if (liquidOut(body)) counts.liquidOut += 1;
    if (body.liquidType === 'Ice' && body.hydroPercent === 0) counts.iceHydro0 += 1;
    if (body.liquidType === 'Unknown Exotic Liquid') counts.unknown += 1;
    if (finite(body.meanTempK) && body.meanTempK < 200) counts.below200 += 1;
    if (finite(body.meanTempK) && body.meanTempK > 400) counts.above400 += 1;
}

function scanTree(envelope, hex, uwp, sector) {
    const system = envelope && envelope.body && envelope.body.mgtSystem;
    const worlds = system && system.worlds;
    const mainworlds = [];
    const bodies = { bodies: 0, liquidOut: 0, iceHydro0: 0, unknown: 0, below200: 0, above400: 0 };
    walk(worlds, (world) => {
        if (!world || typeof world !== 'object') return;
        tallyBody(bodies, world);
        if (isMainworld(world)) mainworlds.push(world);
    });

    const chartAtm = chartDigit(uwp, 2);
    const chartHydro = chartDigit(uwp, 3);
    let treeContradiction = false;
    if (bodies.liquidOut || bodies.iceHydro0 || bodies.unknown) treeContradiction = true;

    for (const mw of mainworlds) {
        sector.mainworlds += 1;
        const atm = finite(mw.atmCode) ? mw.atmCode : null;
        const hydro = finite(mw.hydroCode) ? mw.hydroCode : null;
        const atmDiff = chartAtm !== null && atm !== null && atm !== chartAtm;
        const hydroDiff = chartHydro !== null && hydro !== null && hydro !== chartHydro;
        if (chartAtm !== null && atm === null) sector.main.atmMissing += 1;
        if (chartHydro !== null && hydro === null) sector.main.hydroMissing += 1;
        if (atmDiff) {
            sector.main.atmDiff += 1;
            note(sector.examples.atmDiff, hex);
        }
        if (hydroDiff) {
            sector.main.hydroDiff += 1;
            note(sector.examples.hydroDiff, hex);
        }
        const out = liquidOut(mw);
        const ice = mw.liquidType === 'Ice' && mw.hydroPercent === 0;
        const unknown = mw.liquidType === 'Unknown Exotic Liquid';
        if (out) {
            sector.main.liquidOut += 1;
            note(sector.examples.liquidOut, hex);
        }
        if (ice) sector.main.iceHydro0 += 1;
        if (unknown) sector.main.unknown += 1;
        if (finite(mw.meanTempK) && mw.meanTempK < 200) sector.main.below200 += 1;
        if (finite(mw.meanTempK) && mw.meanTempK > 400) sector.main.above400 += 1;
        if (mw.isLunarMainworld === true || mw.isMoon === true || mw.isSatellite === true) sector.main.moon += 1;
        if (atmDiff || hydroDiff || out || ice || unknown) {
            sector.main.contradiction += 1;
            treeContradiction = true;
            note(sector.examples.contradiction, hex);
        }
    }
    if (mainworlds.length === 0) sector.noMainworld += 1;
    if (mainworlds.length > 1) sector.multiMainworld += 1;
    if (treeContradiction) sector.treesWithContradiction += 1;

    sector.bodies.bodies += bodies.bodies;
    sector.bodies.liquidOut += bodies.liquidOut;
    sector.bodies.iceHydro0 += bodies.iceHydro0;
    sector.bodies.unknown += bodies.unknown;
    sector.bodies.below200 += bodies.below200;
    sector.bodies.above400 += bodies.above400;
}

function addInto(target, source, keys) {
    for (const key of keys) target[key] += source[key];
}

async function scanSector(slug, why, manifestRow) {
    const index = await getJson(`${CDN}/truth/${VERSION}/sectors/${slug}/index.json`);
    const jobs = [];
    let partial = 0;
    for (const [hex, row] of Object.entries(index.hexes || {})) {
        if (!row || row.tree == null) {
            if (row && row.partial) partial += 1;
            continue;
        }
        jobs.push({ hex, hash: row.tree, uwp: row.uwp });
    }
    const sector = {
        slug,
        name: index.name || (manifestRow && manifestRow.name) || slug,
        x: index.x,
        y: index.y,
        why,
        manifestBuilt: manifestRow ? manifestRow.built : null,
        manifestPartial: manifestRow ? manifestRow.partial : null,
        trees: jobs.length,
        partialSkipped: partial,
        mainworlds: 0,
        noMainworld: 0,
        multiMainworld: 0,
        treesWithContradiction: 0,
        main: blank(),
        bodies: { bodies: 0, liquidOut: 0, iceHydro0: 0, unknown: 0, below200: 0, above400: 0 },
        examples: { atmDiff: [], hydroDiff: [], liquidOut: [], contradiction: [] },
    };
    let done = 0;
    await mapPool(jobs, CONCURRENCY, async (job) => {
        const envelope = await getJson(`${CDN}/objects/${encodeURIComponent(job.hash)}`);
        scanTree(envelope, job.hex, job.uwp, sector);
        done += 1;
        if (done % 100 === 0 || done === jobs.length) {
            console.log(`${slug} ${done}/${jobs.length}`);
        }
    });
    return sector;
}

async function main() {
    const manifest = await getJson(`${CDN}/truth/${VERSION}/manifest.json`);
    if (manifest.truthVersion !== VERSION) {
        throw new Error(`manifest truthVersion is ${manifest.truthVersion}`);
    }
    const bySlug = new Map((manifest.sectors || []).map((row) => [row.slug, row]));
    const sectors = [];
    for (const chosen of SECTORS) {
        if (!bySlug.has(chosen.slug)) throw new Error(`manifest has no ${chosen.slug}`);
        sectors.push(await scanSector(chosen.slug, chosen.why, bySlug.get(chosen.slug)));
    }

    const totals = {
        trees: 0,
        partialSkipped: 0,
        mainworlds: 0,
        noMainworld: 0,
        multiMainworld: 0,
        treesWithContradiction: 0,
        main: blank(),
        bodies: { bodies: 0, liquidOut: 0, iceHydro0: 0, unknown: 0, below200: 0, above400: 0 },
    };
    const mainKeys = Object.keys(blank());
    const bodyKeys = Object.keys(totals.bodies);
    for (const sector of sectors) {
        totals.trees += sector.trees;
        totals.partialSkipped += sector.partialSkipped;
        totals.mainworlds += sector.mainworlds;
        totals.noMainworld += sector.noMainworld;
        totals.multiMainworld += sector.multiMainworld;
        totals.treesWithContradiction += sector.treesWithContradiction;
        addInto(totals.main, sector.main, mainKeys);
        addInto(totals.bodies, sector.bodies, bodyKeys);
    }

    const report = {
        version: VERSION,
        cdn: CDN,
        concurrency: CONCURRENCY,
        scannedAt: new Date().toISOString(),
        auditModule: null,
        auditNote: 'tests/generation/environment_audit.js was not present at the start of this scan. Checks are local to tools/truth/scan_environment.js.',
        liquidTable: 'packages/engines/src/generated/rules/mgt2e_data.js MgT2EData.atmosphereExtended.exoticLiquids',
        liquids: LIQUIDS.map((row) => ({ name: row.name, mp: row.mp, bp: row.bp })),
        contradiction: 'A mainworld contradiction is any of: atmCode differs from the chart UWP atmosphere digit, hydroCode differs from the chart hydro digit, liquidType names an exoticLiquids row whose melting-to-boiling window does not contain meanTempK, liquidType Ice with hydroPercent 0, or liquidType "Unknown Exotic Liquid". meanTempK below 200, meanTempK above 400, and being a moon are counted and are not part of that share. A tree contradiction is a mainworld contradiction or the same liquid flags on any body. Chart digits are the sector-index UWP. Body counts include mainworlds.',
        sectors,
        totals,
        shares: {
            mainworldsWithContradiction: totals.mainworlds ? totals.main.contradiction / totals.mainworlds : 0,
            treesWithContradiction: totals.trees ? totals.treesWithContradiction / totals.trees : 0,
        },
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({
        out: OUT,
        trees: totals.trees,
        mainworlds: totals.mainworlds,
        mainworldContradiction: totals.main.contradiction,
        mainworldShare: report.shares.mainworldsWithContradiction,
        treeShare: report.shares.treesWithContradiction,
    }));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
