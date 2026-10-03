/**
 * Pack universe/raw/<Slug>.tsv and .xml into inputs-only sector scripts.
 * No browser. buildSettings are the generation* defaults from collectMapSettings()
 * in js/io_manager.js, copied here and kept in step by hand (2026-10-02).
 *
 * Fair use: the sector text is the published Traveller Map chart, stored locally
 * so the cartographer can run offline. Do not republish the snapshot.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const rawDir = path.join(root, 'universe', 'raw');
const sectorDir = path.join(root, 'universe', 'sectors');
const coreText = fs.readFileSync(path.join(root, 'js', 'core.js'), 'utf8');
const versionMatch = coreText.match(/APP_VERSION\s*=\s*"([^"]+)"/);
const buildVersion = versionMatch ? versionMatch[1] : '';
const dataText = fs.readFileSync(path.join(root, 'js', 'universe_data.js'), 'utf8');
const marker = 'window.UNIVERSE_SECTORS = ';
const start = dataText.indexOf(marker);
if (start < 0) throw new Error('UNIVERSE_SECTORS marker missing');
const jsonStart = dataText.indexOf('[', start);
const sectors = JSON.parse(dataText.slice(jsonStart, dataText.indexOf('];', jsonStart) + 1));

const buildSettings = {
    generationPopMax: 20,
    generationPopMod: 0,
    generationTlMax: 20,
    generationTlMod: 0,
    generationUseRealisticStellar: false,
    generationUseTlFloor: false,
    generationRttSettlement: 2,
    generationRttTL: 15,
    generationStarportMax: 'A',
    generationStarportMod: 0
};

function slugOf(name) {
    return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function jsString(value) {
    return JSON.stringify(value);
}

const indexSectors = [];
fs.mkdirSync(sectorDir, { recursive: true });
const files = fs.readdirSync(rawDir).filter(name => name.endsWith('.tsv'));
files.forEach(file => {
    const slug = file.replace(/\.tsv$/, '');
    const xmlFile = path.join(rawDir, slug + '.xml');
    if (!fs.existsSync(xmlFile)) throw new Error('Missing ' + xmlFile);
    const tsv = fs.readFileSync(path.join(rawDir, file), 'utf8');
    const metadataXml = fs.readFileSync(xmlFile, 'utf8');
    const meta = sectors.find(item => slugOf(item.name) === slug);
    if (!meta) throw new Error('No universe sector named like ' + slug);
    const body = {
        name: meta.name,
        x: meta.x,
        y: meta.y,
        milieu: 'M1105',
        snapshotVersion: 'm1105-1',
        tsv,
        metadataXml
    };
    const text = 'window.UNIVERSE_SECTOR_DATA = window.UNIVERSE_SECTOR_DATA || {};\n'
        + 'window.UNIVERSE_SECTOR_DATA[' + jsString(meta.name) + '] = ' + JSON.stringify(body) + ';\n';
    const out = path.join(sectorDir, slug + '.js');
    fs.writeFileSync(out, text);
    indexSectors.push({
        name: meta.name,
        slug,
        x: meta.x,
        y: meta.y,
        defaultSlot: String(meta.defaultSlot),
        bytes: Buffer.byteLength(text)
    });
    console.log(slug, Buffer.byteLength(text));
});

const index = {
    milieu: 'M1105',
    snapshotVersion: 'm1105-1',
    builtAt: '2026-10-02',
    buildVersion,
    seed: 'TravellerMagnus',
    buildSettings,
    sectors: indexSectors
};
fs.writeFileSync(path.join(root, 'universe', 'index.js'), 'window.UNIVERSE_INDEX = ' + JSON.stringify(index, null, 2) + ';\n');
console.log('index', indexSectors.length, 'buildVersion', buildVersion);
