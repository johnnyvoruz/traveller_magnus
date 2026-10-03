import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stable, sha256Hex, TruthPolities } from '@voyage/shared';
import { buildSector, polityOutlines, sectorOverview } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS, TRUTH_MILIEU } from './settings.js';

const version = process.argv[2];
if (!/^v\d+$/.test(version || '')) {
    console.error('usage: node tools/truth/build.js v<N>');
    process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/engines/package.json'), 'utf8')).version;
const OUT = path.join(ROOT, 'truth-local');

const started = Date.now();
fs.rmSync(OUT, { recursive: true, force: true });

const rawDir = path.join(ROOT, 'universe/raw');
const catalogueList = JSON.parse(fs.readFileSync(path.join(rawDir, 'sectors.json'), 'utf8')).sectors;
const catalogue = new Map(catalogueList.map(entry => [entry.slug, {
    name: entry.name,
    x: entry.x,
    y: entry.y,
    tags: entry.tags,
    canonical: entry.canonical,
}]));
const failed = [];
const sectors = [];
let objects = 0;
let bytes = 0;
let largest = 0;
let systems = 0;
let builtTotal = 0;
let partial = 0;
const sectorCounts = [];
const overviewSectors = [];
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
        const entry = catalogue.get(slug);
        if (!entry) throw new Error('no catalogue entry');
        const sector = await buildSector({ slug, tsv, metadataXml, pinned, version, catalogue: entry });
        if (sector.index.x === undefined || sector.index.y === undefined) {
            throw new Error('coordinates missing after parse');
        }
        const objDir = path.join(OUT, 'objects');
        fs.mkdirSync(objDir, { recursive: true });
        for (const [hash, json] of sector.objects) {
            fs.writeFileSync(path.join(objDir, hash), json);
            const size = Buffer.byteLength(json);
            objects += 1;
            bytes += size;
            if (size > largest) largest = size;
        }
        const indexJson = stable(sector.index);
        const indexDir = path.join(OUT, version, 'sectors', slug);
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
            tags: sector.index.tags,
            canonical: sector.index.canonical,
            systems: sector.counts.systems,
            built: sector.counts.built,
            partial: sector.counts.partial,
            indexHash,
        });
        overviewSectors.push(sectorOverview(sector.index));
        console.error(`${slug} systems=${sector.counts.systems} built=${sector.counts.built} partial=${sector.counts.partial}`);
        if (!metadataXml.includes(`Milieu="${TRUTH_MILIEU}"`)) failed.push(`${slug}: milieu is not ${TRUTH_MILIEU}`);
    } catch (err) {
        if (typeof err.message === 'string' && err.message.startsWith('sectorOverview ')) throw err;
        failed.push(`${slug}: ${err.message}`);
        console.error(`${slug} FAILED ${err.message}`);
    }
}

const overviewJson = stable({ truthVersion: version, sectors: overviewSectors });
const overviewHash = await sha256Hex(overviewJson);
fs.mkdirSync(path.join(OUT, version), { recursive: true });
fs.writeFileSync(path.join(OUT, version, 'overview.json'), overviewJson);

const politiesStarted = Date.now();
const polities = polityOutlines(overviewSectors);
const politiesMs = Date.now() - politiesStarted;
const politiesJson = stable(TruthPolities.parse({ truthVersion: version, polities }));
const politiesHash = await sha256Hex(politiesJson);
fs.writeFileSync(path.join(OUT, version, 'polities.json'), politiesJson);
let loopPoints = 0;
for (const polity of polities) for (const loop of polity.loops) loopPoints += loop.length / 2;

const manifest = {
    truthVersion: version,
    milieu: TRUTH_MILIEU,
    seed: TRUTH_SEED,
    settings: TRUTH_SETTINGS,
    engineVersion,
    overviewHash,
    politiesHash,
    attribution: "Sector data from the Traveller Map (travellermap.com), used under Far Future Enterprises' Fair Use Policy. Traveller is a registered trademark of Far Future Enterprises.",
    sectors: sectors.map(({ slug, name, x, y, tags, canonical, systems, built, partial, indexHash }) => (
        { slug, name, x, y, tags, canonical, systems, built, partial, indexHash }
    )),
};
fs.writeFileSync(path.join(OUT, version, 'manifest.json'), stable(manifest));

const elapsed = Date.now() - started;
console.log(JSON.stringify({
    failed, systems, built: builtTotal, partial, objects, bytes, largest, elapsed, sectors: sectorCounts,
    polities: polities.length, politiesBytes: Buffer.byteLength(politiesJson), loopPoints, politiesMs,
}, null, 2));
if (failed.length) process.exitCode = 1;
