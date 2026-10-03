/**
 * Fetch truth-build inputs from Traveller Map by catalogue tag.
 *
 *   node tools/truth/fetch_inputs.js                 # every sector with data, skipping files already present
 *   node tools/truth/fetch_inputs.js --only Nshofref # one sector
 *   node tools/truth/fetch_inputs.js --dry-run       # list what would be fetched
 *
 * Writes universe/raw/<slug>.tsv, universe/raw/<slug>.xml and universe/raw/sectors.json
 * (slug, name, abbreviation, x, y, tags for every selected sector). sectors.json is the
 * sector manifest the truth-build job reads alongside the inputs.
 *
 * Selection (decided 2026-10-03): every M1105 sector with world data, all of them. Each sector
 * carries its tags and a `canonical` flag (tagged OTU or ZCR, and none of Apocryphal, Alternate,
 * Unofficial). Alternates such as the Judges Guild sectors share coordinates with canonical ones;
 * the truth stores all of them and the viewer draws the canonical layer by default.
 *
 * Fair use: the sector text is the published Traveller Map chart. The truth manifest carries
 * the attribution sentence; see directives/data_model.md §5.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'universe', 'raw');
const MILIEU = 'M1105';
const CANONICAL_TAGS = new Set(['OTU', 'ZCR']);
const NON_CANONICAL_TAGS = new Set(['Apocryphal', 'Alternate', 'Unofficial']);
const DELAY_MS = 1200;   // polite spacing between Traveller Map requests

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const dryRun = args.includes('--dry-run');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const slugify = (name) => String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const coord = (n) => (n < 0 ? 'n' + Math.abs(n) : String(n));

async function fetchText(url) {
    const res = await fetch(url, { headers: { 'user-agent': 'traveller.voyage truth builder (johnny.voruz@protonmail.com)' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.text();
}

async function main() {
    fs.mkdirSync(RAW, { recursive: true });
    const catalogue = JSON.parse(await fetchText(`https://travellermap.com/api/universe?milieu=${MILIEU}&requireData=1`)).Sectors;

    const selected = catalogue.map(s => {
        const tags = String(s.Tags || '').split(/\s+/).filter(Boolean).sort();
        return {
            name: s.Names[0].Text,
            abbreviation: s.Abbreviation || null,
            x: s.X, y: s.Y,
            tags,
            canonical: tags.some(t => CANONICAL_TAGS.has(t)) && !tags.some(t => NON_CANONICAL_TAGS.has(t)),
        };
    }).sort((a, b) => a.y - b.y || a.x - b.x);

    // Unique slugs: name, then name + coordinates when names collide (several OTU sectors are "Unnamed").
    const counts = new Map();
    for (const s of selected) counts.set(slugify(s.name), (counts.get(slugify(s.name)) || 0) + 1);
    for (const s of selected) {
        const base = slugify(s.name);
        s.slug = counts.get(base) > 1 ? `${base}_${coord(s.x)}_${coord(s.y)}` : base;
    }
    const slugs = new Set(selected.map(s => s.slug));
    if (slugs.size !== selected.length) throw new Error('slug collision after coordinate suffixing');

    const chosen = only ? selected.filter(s => s.name === only || s.slug === only) : selected;
    console.log(JSON.stringify({ catalogue: catalogue.length, selected: selected.length, chosen: chosen.length, dryRun }, null, 2));
    if (dryRun) { for (const s of chosen) console.log(s.slug, s.tags.join(' ')); return; }

    fs.writeFileSync(path.join(RAW, 'sectors.json'), JSON.stringify({ milieu: MILIEU, fetchedAt: new Date().toISOString(), canonicalTags: [...CANONICAL_TAGS], nonCanonicalTags: [...NON_CANONICAL_TAGS], sectors: selected }, null, 2));

    let fetched = 0, skipped = 0, failed = [];
    for (const s of chosen) {
        const tsvPath = path.join(RAW, s.slug + '.tsv');
        const xmlPath = path.join(RAW, s.slug + '.xml');
        const needTsv = !fs.existsSync(tsvPath) || fs.statSync(tsvPath).size === 0;
        const needXml = !fs.existsSync(xmlPath) || fs.statSync(xmlPath).size === 0;
        if (!needTsv && !needXml) { skipped++; continue; }
        try {
            if (needTsv) {
                fs.writeFileSync(tsvPath, await fetchText(`https://travellermap.com/data/${encodeURIComponent(s.name)}/tab?milieu=${MILIEU}`));
                await sleep(DELAY_MS);
            }
            if (needXml) {
                fs.writeFileSync(xmlPath, await fetchText(`https://travellermap.com/api/metadata?sector=${encodeURIComponent(s.name)}&accept=text/xml&milieu=${MILIEU}`));
                await sleep(DELAY_MS);
            }
            fetched++;
            process.stdout.write(`${s.slug}\n`);
        } catch (err) {
            failed.push({ slug: s.slug, error: err.message });
            for (const p of [tsvPath, xmlPath]) if (fs.existsSync(p) && fs.statSync(p).size === 0) fs.unlinkSync(p);
        }
    }
    console.log(JSON.stringify({ fetched, skipped, failed }, null, 2));
    if (failed.length) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
