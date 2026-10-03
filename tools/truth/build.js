import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setNamePool } from '@voyage/engines';
import { SYSTEM_NAMES } from '../../packages/engines/src/generated/names_data.js';
import { stable, sha256Hex } from '@voyage/shared';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS, TRUTH_MILIEU } from './settings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/engines/package.json'), 'utf8')).version;
const OUT = path.join(ROOT, 'truth-local');
const TRUTH_VERSION = 'v1';

function fillNamePool() {
    const pool = [];
    for (const name of SYSTEM_NAMES) {
        const cleaned = name ? name.trim() : '';
        if (cleaned) pool.push(cleaned);
    }
    pool.sort();
    setNamePool(pool);
}

const started = Date.now();
fs.rmSync(OUT, { recursive: true, force: true });
fillNamePool();

const rawDir = path.join(ROOT, 'universe/raw');
const failed = [];
const sectors = [];
let objects = 0;
let bytes = 0;
let largest = 0;
let systems = 0;
let builtTotal = 0;
let partial = 0;
const sectorCounts = [];
const pinned = { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };

const only = process.env.TRUTH_SLUGS
    ? new Set(process.env.TRUTH_SLUGS.split(',').map(slug => slug.trim()).filter(Boolean))
    : null;

for (const file of fs.readdirSync(rawDir).filter(name => name.endsWith('.tsv')).sort()) {
    const slug = file.slice(0, -4);
    if (only && !only.has(slug)) continue;
    const xmlPath = path.join(rawDir, `${slug}.xml`);
    if (!fs.existsSync(xmlPath)) {
        failed.push(`${slug}: no metadata xml`);
        continue;
    }
    try {
        const tsv = fs.readFileSync(path.join(rawDir, file), 'utf8');
        const metadataXml = fs.readFileSync(xmlPath, 'utf8');
        const sector = await buildSector({ slug, tsv, metadataXml, pinned });
        if (sector.index.x === undefined || sector.index.y === undefined) {
            throw new Error('coordinates missing after parse');
        }
        const objDir = path.join(OUT, 'objects');
        fs.mkdirSync(objDir, { recursive: true });
        for (const [hash, json] of sector.objects) {
            fs.writeFileSync(path.join(objDir, `${hash}.json`), json);
            const size = Buffer.byteLength(json);
            objects += 1;
            bytes += size;
            if (size > largest) largest = size;
        }
        const indexJson = stable(sector.index);
        const indexDir = path.join(OUT, TRUTH_VERSION, 'sectors', slug);
        fs.mkdirSync(indexDir, { recursive: true });
        fs.writeFileSync(path.join(indexDir, 'index.json'), indexJson);
        const indexHash = await sha256Hex(indexJson);
        systems += sector.counts.systems;
        builtTotal += sector.counts.built;
        partial += sector.counts.partial;
        sectorCounts.push({ slug, systems: sector.counts.systems, built: sector.counts.built, partial: sector.counts.partial });
        sectors.push({
            slug,
            name: sector.index.name,
            x: sector.index.x,
            y: sector.index.y,
            systems: sector.counts.systems,
            indexHash,
        });
        console.error(`${slug} systems=${sector.counts.systems} built=${sector.counts.built} partial=${sector.counts.partial}`);
        if (!metadataXml.includes(`Milieu="${TRUTH_MILIEU}"`)) failed.push(`${slug}: milieu is not ${TRUTH_MILIEU}`);
    } catch (err) {
        failed.push(`${slug}: ${err.message}`);
        console.error(`${slug} FAILED ${err.message}`);
    }
}

const manifest = {
    truthVersion: TRUTH_VERSION,
    milieu: TRUTH_MILIEU,
    seed: TRUTH_SEED,
    settings: TRUTH_SETTINGS,
    engineVersion,
    attribution: "Sector data from the Traveller Map (travellermap.com), used under Far Future Enterprises' Fair Use Policy. Traveller is a registered trademark of Far Future Enterprises.",
    sectors: sectors.map(({ slug, name, x, y, systems, indexHash }) => ({ slug, name, x, y, systems, indexHash })),
};
fs.mkdirSync(path.join(OUT, TRUTH_VERSION), { recursive: true });
fs.writeFileSync(path.join(OUT, TRUTH_VERSION, 'manifest.json'), stable(manifest));

const elapsed = Date.now() - started;
console.log(JSON.stringify({ failed, systems, built: builtTotal, partial, objects, bytes, largest, elapsed, sectors: sectorCounts }, null, 2));
if (failed.length) process.exitCode = 1;
