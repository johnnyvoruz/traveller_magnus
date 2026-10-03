/**
 * Download Traveller Map chart text for local snapshots.
 * Read Far Future Enterprises' fair-use policy before publishing the result.
 *
 *   node utilities/build_universe_snapshot/fetch.js
 *   node utilities/build_universe_snapshot/fetch.js --only "Spinward Marches"
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.resolve(__dirname, '..', '..');
const rawDir = path.join(root, 'universe', 'raw');
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : '';

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                get(res.headers.location).then(resolve, reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(url + ' HTTP ' + res.statusCode));
                res.resume();
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        }).on('error', reject);
    });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function slug(name) {
    return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function main() {
    const dataText = fs.readFileSync(path.join(root, 'js', 'universe_data.js'), 'utf8');
    const marker = 'window.UNIVERSE_SECTORS = ';
    const start = dataText.indexOf(marker);
    if (start < 0) throw new Error('universe_data.js has no sector list');
    const sectors = JSON.parse(dataText.slice(start + marker.length, dataText.lastIndexOf(']') + 1));
    fs.mkdirSync(rawDir, { recursive: true });
    const chosen = only ? sectors.filter(sector => sector.name === only) : sectors;
    if (!chosen.length) throw new Error('No sector named ' + only);
    for (const sector of chosen) {
        const tabUrl = 'https://travellermap.com/data/' + encodeURIComponent(sector.name) + '/tab?milieu=M1105';
        const metaUrl = 'https://travellermap.com/api/metadata?sector=' + encodeURIComponent(sector.name) + '&accept=text/xml&milieu=M1105';
        process.stdout.write(sector.name + '\n');
        const tsv = await get(tabUrl);
        await sleep(1100);
        const xml = await get(metaUrl);
        await sleep(1100);
        fs.writeFileSync(path.join(rawDir, slug(sector.name) + '.tsv'), tsv);
        fs.writeFileSync(path.join(rawDir, slug(sector.name) + '.xml'), xml);
    }
    const alleg = await get('https://travellermap.com/t5ss/allegiances');
    const list = JSON.parse(alleg);
    const names = {};
    (Array.isArray(list) ? list : []).forEach(item => {
        if (item && item.Code && item.Name) names[item.Code] = item.Name;
    });
    fs.writeFileSync(path.join(root, 'universe', 'allegiances.js'),
        'window.UNIVERSE_ALLEGIANCES = ' + JSON.stringify(names) + ';\n');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
