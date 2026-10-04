import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatUwpDigit } from '@voyage/engines';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { celsiusOf, fahrenheitOf, formatTempFull, wholeDegrees } from '../../apps/web/src/design/units.ts';
import { bodyKeys, bodyModel, overviewModel, pickSystem, rowFor } from '../../apps/web/src/dossier/model.ts';

/** The same conversion the dossier uses: °C, then °F, then kelvin. */
function fullTemp(kelvin) {
    const celsius = celsiusOf(kelvin);
    return wholeDegrees(celsius) + ' °C · ' + wholeDegrees(fahrenheitOf(celsius)) + ' °F · ' + wholeDegrees(kelvin) + ' K';
}

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;

function catalogue(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

function pinned() {
    return { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };
}

test('formatTempFull is the §7.5 full style', () => {
    assert.equal(formatTempFull(288), fullTemp(288));
    assert.equal(formatTempFull(288), '15 °C · 59 °F · 288 K');
    assert.equal(formatTempFull(189), fullTemp(189));
    assert.equal(formatTempFull(0), fullTemp(0));
    assert.equal(formatTempFull(6300), fullTemp(6300));
    assert.equal(formatTempFull(null), '');
    assert.equal(formatTempFull(undefined), '');
    assert.equal(formatTempFull(Number.NaN), '');
    assert.equal(formatTempFull('288'), '');
});

test('Regina overview and Caesillian 0914 partial follow the inspector', async () => {
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: pinned(),
        version: 'v2',
        catalogue: catalogue('Spinward_Marches'),
    });
    const regina = marches.index.hexes['1910'];
    assert.equal(regina.uwp, 'A788899-C');
    assert.ok(regina.tree);
    const tree = JSON.parse(marches.objects.get(regina.tree));
    const model = overviewModel({
        sectorName: 'Spinward Marches',
        subsectorName: 'Regina',
        hex: '1910',
        entry: regina,
        tree,
        allegiances: marches.index.metadata.allegiances,
    });
    assert.equal(model.header.title, 'Regina');
    assert.equal(model.ribbon.kind, 'cells');
    const digits = model.ribbon.cells.map((cell) => cell.digit);
    assert.equal(digits.slice(0, 7).join(' ') + ' ' + model.ribbon.dash + ' ' + digits[7], 'A 7 8 8 8 9 9 - C');
    const starport = model.rows.find((row) => row.label === 'Starport');
    assert.ok(starport);
    assert.equal(starport.text, formatUwpDigit('starport', 'A'));
    const system = pickSystem(tree.body);
    assert.ok(system);
    const worlds = (system.worlds || []).filter((world) => world.type !== 'Empty');
    assert.equal(model.tree.count, (system.stars || []).length + worlds.length);
    assert.equal(model.tree.rows.filter((row) => row.tag === 'Mainworld').length, 1);
    const body = bodyModel(tree, 'w0');
    assert.ok(body);
    assert.ok(body.title);
    assert.ok(body.facts.length >= 1);
    const keys = bodyKeys(system);
    assert.equal(keys[0], 's0');

    const starRow = model.tree.rows[0];
    assert.equal(starRow.key, 's0');
    assert.deepEqual(starRow.glyph, { kind: 'star', star: system.stars[0].sType });
    const starBody = bodyModel(tree, 's0');
    assert.ok(starBody);
    assert.deepEqual(starBody.glyph, starRow.glyph);
    assert.equal(starBody.journey, null);

    const host = (system.worlds || []).find((world) => world.type === 'Mainworld')
        || (system.worlds || []).flatMap((world) => world.moons || []).find((moon) => moon.type === 'Mainworld');
    assert.ok(host);
    assert.ok(Array.isArray(host.journeyTimes));
    assert.ok(model.journey);
    assert.deepEqual(model.journey.map((item) => item.g), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(model.journey.map((item) => item.hours), host.journeyTimes.map((hours) => String(hours) + 'h'));

    const gasRow = model.tree.rows.find((row) => row.glyph.kind === 'gasGiant');
    assert.ok(gasRow);
    assert.equal(gasRow.glyph.star, '');
    const gasBody = bodyModel(tree, gasRow.key);
    assert.ok(gasBody);
    assert.deepEqual(gasBody.glyph, { kind: 'gasGiant', star: '' });

    const mainRow = model.tree.rows.find((row) => row.tag === 'Mainworld');
    assert.ok(mainRow);
    const mainBody = bodyModel(tree, mainRow.key);
    assert.ok(mainBody);
    assert.equal(mainBody.glyph.star, '');
    assert.equal(mainBody.glyph.kind, mainRow.moon ? 'moon' : 'world');
    assert.deepEqual(mainRow.glyph, mainBody.glyph);
    assert.deepEqual(mainBody.journey, model.journey);

    assert.equal(typeof host.meanTempK, 'number');
    assert.equal(typeof host.highTempK, 'number');
    assert.equal(typeof host.lowTempK, 'number');
    const mean = mainBody.facts.find((fact) => fact.label === 'Mean temp.');
    assert.ok(mean);
    assert.equal(mean.value, fullTemp(host.meanTempK));
    assert.equal(mean.value, formatTempFull(host.meanTempK));
    assert.equal(mean.note, '');
    const scales = mean.value.split(' · ');
    assert.equal(scales.length, 3);
    assert.match(scales[0], /°C$/);
    assert.match(scales[1], /°F$/);
    assert.match(scales[2], / K$/);
    const physical = mainBody.sideSections.find((section) => section.heading === 'Physical');
    assert.ok(physical);
    const high = physical.rows.find((row) => row.label === 'High temperature');
    const low = physical.rows.find((row) => row.label === 'Low temperature');
    assert.ok(high);
    assert.ok(low);
    assert.equal(high.text, fullTemp(host.highTempK));
    assert.equal(low.text, fullTemp(host.lowTempK));
    assert.equal(physical.rows.some((row) => row.label.includes('(K)')), false);

    assert.equal(typeof system.stars[0].temp, 'number');
    const starTemp = starBody.facts.find((fact) => fact.label === 'Temperature');
    assert.ok(starTemp);
    assert.equal(starTemp.value, fullTemp(system.stars[0].temp));

    const stripped = structuredClone(tree);
    const strippedSystem = pickSystem(stripped.body);
    const strippedHost = (strippedSystem.worlds || []).find((world) => world.type === 'Mainworld')
        || (strippedSystem.worlds || []).flatMap((world) => world.moons || []).find((moon) => moon.type === 'Mainworld');
    assert.ok(strippedHost);
    delete strippedHost.highTempK;
    delete strippedHost.lowTempK;
    const strippedBody = bodyModel(stripped, mainRow.key);
    assert.ok(strippedBody);
    const strippedPhysical = strippedBody.sideSections.find((section) => section.heading === 'Physical');
    const strippedLabels = strippedPhysical ? strippedPhysical.rows.map((row) => row.label) : [];
    assert.equal(strippedLabels.includes('High temperature'), false);
    assert.equal(strippedLabels.includes('Low temperature'), false);
    const strippedMean = strippedBody.facts.find((fact) => fact.label === 'Mean temp.');
    assert.ok(strippedMean);
    assert.equal(strippedMean.value, fullTemp(host.meanTempK));
    assert.equal(rowFor('High temperature', formatTempFull(null)), null);
    assert.equal(rowFor('Low temperature', formatTempFull(undefined)), null);

    const firstBody = bodyModel(tree, keys[0]);
    const lastBody = bodyModel(tree, keys[keys.length - 1]);
    assert.ok(firstBody);
    assert.ok(lastBody);
    assert.equal(firstBody.index, 1);
    assert.equal(firstBody.total, keys.length);
    assert.equal(lastBody.index, keys.length);
    assert.equal(lastBody.total, keys.length);

    const caes = await buildSector({
        slug: 'Caesillian',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Caesillian.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Caesillian.xml'), 'utf8'),
        pinned: pinned(),
        version: 'v2',
        catalogue: catalogue('Caesillian'),
    });
    const partial = caes.index.hexes['0914'];
    assert.ok(partial);
    assert.equal(partial.tree, null);
    const partialModel = overviewModel({
        sectorName: 'Caesillian',
        subsectorName: 'Subsector F',
        hex: '0914',
        entry: partial,
        tree: null,
    });
    assert.equal(partialModel.partial, true);
    assert.ok(partialModel.ribbon);
    assert.equal(partialModel.socio, null);
    assert.equal(partialModel.tree, null);
});
