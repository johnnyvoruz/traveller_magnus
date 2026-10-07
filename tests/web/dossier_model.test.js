import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatUwpDigit } from '@voyage/engines';
import { buildSector } from '@voyage/generation';
import { environmentPolicy, reconcileTree } from '../../packages/engines/src/reconcile_environment.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { celsiusOf, fahrenheitOf, formatKelvin, formatTempFull, wholeDegrees } from '../../apps/web/src/design/units.ts';
import { bodyKeys, bodyModel, climateDisplay, liquidDisplay, mainworldProfile, overviewModel, pickSystem, rowFor } from '../../apps/web/src/dossier/model.ts';
import { cardFor } from '../../apps/web/src/orbit/card.ts';
import { planSystem } from '../../apps/web/src/orbit/layout.ts';

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
    assert.equal(model.header.title, 'Regina system');
    assert.equal(model.header.name, 'Regina');
    assert.equal(model.header.place, 'Spinward Marches - Regina');
    assert.equal(model.ribbon.kind, 'cells');
    const digits = model.ribbon.cells.map((cell) => cell.digit);
    assert.equal(digits.slice(0, 7).join(' ') + ' ' + model.ribbon.dash + ' ' + digits[7], 'A 7 8 8 8 9 9 - C');
    assert.equal(model.rows.some((row) => row.label === 'Starport'), false);
    assert.ok(model.rows.some((row) => row.label === 'Allegiance'));
    assert.ok(model.callout);
    assert.equal(model.holdLead, true);
    assert.equal(model.journey, null);
    assert.equal(model.journeyNote, '');
    assert.equal(model.socio.rows, null);
    assert.ok(model.socio.headline);
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
    assert.equal(model.journey, null);

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
    assert.equal(mainBody.crumbSystem, 'Regina system');
    assert.equal(mainBody.place, 'Mainworld of the Regina system · 1910');
    assert.ok(mainBody.journey);
    assert.deepEqual(mainBody.journey.map((item) => item.g), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(mainBody.journey.map((item) => item.hours), host.journeyTimes.map((hours) => String(hours) + 'h'));
    const starport = mainBody.mainSections.find((section) => section.heading === 'World profile');
    assert.ok(starport);
    const starportRow = starport.rows.find((row) => row.label === 'Starport');
    assert.ok(starportRow);
    assert.equal(starportRow.text, formatUwpDigit('starport', 'A'));
    assert.ok(mainBody.socio);
    assert.ok(mainBody.socio.rows.some((row) => row.label === 'Importance'));
    assert.equal(gasBody.place.startsWith('Mainworld of the '), false);
    assert.equal(gasBody.crumbSystem, 'Regina system');
    const otherMoon = model.tree.rows.find((row) => row.moon && row.tag !== 'Mainworld');
    assert.ok(otherMoon);
    const moonBody = bodyModel(tree, otherMoon.key);
    assert.ok(moonBody);
    assert.equal(moonBody.place.startsWith('Mainworld of the '), false);
    assert.equal(moonBody.socio, null);
    assert.equal(moonBody.crumbSystem, 'Regina system');

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
    assert.equal(starTemp.value, formatKelvin(system.stars[0].temp));

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

    const ten = ['Starport', 'Size', 'Atmosphere', 'Hydrographics', 'Population', 'Government', 'Law level', 'Tech level', 'Trade codes', 'Travel zone'];
    function formerTen(state) {
        const world = mainworldProfile(state);
        return [
            rowFor('Starport', world.starport),
            rowFor('Size', world.size),
            rowFor('Atmosphere', world.atm),
            rowFor('Hydrographics', world.hydro),
            rowFor('Population', world.pop ?? world.population),
            rowFor('Government', world.gov ?? world.government),
            rowFor('Law level', world.law),
            rowFor('Tech level', world.tl),
            rowFor('Trade codes', world.tradeCodes || state.tradeCodes),
            rowFor('Travel zone', state.travelZone || world.travelZone),
        ].filter(Boolean);
    }
    let opened = 0;
    for (const [hex, entry] of Object.entries(marches.index.hexes)) {
        if (!entry.tree) continue;
        const doc = JSON.parse(marches.objects.get(entry.tree));
        const page = overviewModel({
            sectorName: 'Spinward Marches',
            subsectorName: 'Regina',
            hex,
            entry,
            tree: doc,
            allegiances: marches.index.metadata.allegiances,
        });
        if (!page.mainworldKey) continue;
        opened += 1;
        for (const label of ten) assert.equal(page.rows.some((row) => row.label === label), false, hex + ' ' + label);
        const worldPage = bodyModel(doc, page.mainworldKey);
        assert.ok(worldPage, hex);
        const profileSection = worldPage.mainSections.find((section) => section.heading === 'World profile');
        const got = profileSection ? profileSection.rows : [];
        const expected = formerTen(doc.body);
        assert.deepEqual(got.map((row) => row.label + '\t' + row.text), expected.map((row) => row.label + '\t' + row.text), hex);
        assert.equal(worldPage.crumbSystem, page.header.title, hex);
        assert.equal(worldPage.place.startsWith('Mainworld of the '), true, hex);
        if (worldPage.journey) {
            assert.equal(page.journey, null, hex);
            assert.equal(page.journeyNote, '', hex);
        }
        if (worldPage.socio) {
            assert.ok(worldPage.socio.rows.length > 0, hex);
            assert.equal(page.socio.rows, null, hex);
        }
    }
    assert.ok(opened > 100);

    const closed = structuredClone(tree);
    const closedSystem = pickSystem(closed.body);
    for (const world of closedSystem.worlds || []) {
        if (world.type === 'Mainworld') world.type = 'Planet';
        for (const moon of world.moons || []) if (moon.type === 'Mainworld') moon.type = 'Planet';
    }
    const closedModel = overviewModel({
        sectorName: 'Spinward Marches',
        subsectorName: 'Regina',
        hex: '1910',
        entry: regina,
        tree: closed,
        allegiances: marches.index.metadata.allegiances,
    });
    assert.equal(closedModel.mainworldKey, null);
    assert.equal(closedModel.callout, null);
    assert.equal(closedModel.holdLead, false);
    assert.equal(closedModel.journeyNote, '');
    assert.ok(closedModel.rows.some((row) => row.label === 'Starport'));
    assert.ok(closedModel.journey);
    assert.ok(closedModel.socio.rows);

    const unnamed = structuredClone(tree);
    unnamed.body.name = '';
    delete mainworldProfile(unnamed.body).name;
    const unnamedModel = overviewModel({
        sectorName: 'Spinward Marches',
        subsectorName: 'Regina',
        hex: '1910',
        entry: { ...regina, name: '' },
        tree: unnamed,
        allegiances: marches.index.metadata.allegiances,
    });
    assert.equal(unnamedModel.header.title, '1910');

    const waiting = overviewModel({
        sectorName: 'Spinward Marches',
        subsectorName: 'Regina',
        hex: '1910',
        entry: regina,
        tree: null,
        allegiances: marches.index.metadata.allegiances,
    });
    assert.equal(waiting.partial, false);
    assert.equal(waiting.holdLead, true);
    assert.equal(waiting.callout, null);
    assert.equal(waiting.journeyNote, '');
    assert.equal(waiting.mainworldKey, null);

    const plan = planSystem(system, 'Spinward_Marches/1910');
    const mainCard = cardFor(plan, mainRow.moon ? 'moon' : 'world', mainRow.key, 10);
    assert.ok(mainCard);
    assert.ok(mainCard.now);
    assert.ok(mainCard.survey);
    assert.equal(mainCard.now.length + mainCard.survey.length, mainCard.lines.length);
    assert.deepEqual(mainCard.now, mainCard.lines.filter((line) => line.group === 'now'));
    assert.deepEqual(mainCard.survey, mainCard.lines.filter((line) => line.group === 'survey'));
    const surveyNames = new Set(['UWP', 'Starport', 'Spaceport', 'TL', 'Codes', 'Zone', 'Diameter', 'Rotation', 'Sidereal day', 'Gravity', 'Climate', 'Mean temp.', 'High temp.', 'Low temp.']);
    for (const line of mainCard.lines) {
        if (surveyNames.has(line.label)) assert.equal(line.group, 'survey', line.label);
        if (line.label === 'Orbit #' || line.label === 'Orbit' || line.label === 'Distance' || line.label.startsWith('Today,') || line.label.startsWith('Daylight ') || line.label === 'Solar day' || line.label === 'Day and night') {
            assert.equal(line.group, 'now', line.label);
        }
    }
    assert.ok(mainCard.survey.some((line) => line.label === 'UWP'));
    assert.ok(mainCard.now.some((line) => line.label === 'Orbit #' || line.label === 'Orbit' || line.label === 'Distance'));
    assert.equal(mainCard.lines.some((line) => /season/i.test(line.label)), false);
    const gasCard = cardFor(plan, 'world', gasRow.key, 10);
    assert.ok(gasCard);
    assert.ok(gasCard.survey);
    assert.ok(gasCard.survey.some((line) => line.label === 'Diameter' || line.label === 'Mean temp.' || line.label === 'UWP'));
    assert.deepEqual(gasCard.now, gasCard.lines.filter((line) => line.group === 'now'));

    const legacyPage = JSON.stringify(mainBody);
    const legacyCard = JSON.stringify(mainCard);
    assert.equal(JSON.stringify(bodyModel(tree, mainRow.key)), legacyPage);
    assert.equal(JSON.stringify(cardFor(plan, mainRow.moon ? 'moon' : 'world', mainRow.key, 10)), legacyCard);
    const legacyRows = physicalRows(mainBody);
    assert.equal(rowText(legacyRows, 'Temperature band'), String(host.tempBand));
    assert.equal(rowText(legacyRows, 'Climate'), null);
    assert.equal(rowText(legacyRows, 'Orbital zone'), null);
    const legacyClimate = mainCard.lines.find((line) => line.label === 'Climate');
    assert.ok(legacyClimate);
    assert.equal(legacyClimate.value, String(host.tempBand));
    assert.equal(mainCard.lines.some((line) => line.label === 'Orbital zone'), false);
    assert.equal(rowText(legacyRows, 'High temperature'), fullTemp(host.highTempK));
    assert.equal(rowText(legacyRows, 'Low temperature'), fullTemp(host.lowTempK));

    const reconciled = reconcileTree(structuredClone(tree), environmentPolicy);
    const mainRec = hostOf(reconciled.tree);
    assert.equal(mainRec.body.surfaceTempBand.status, 'known');
    assert.equal(mainRec.body.orbitalTempBand.status, 'known');
    assert.equal(mainRec.key, mainRow.key);
    const knownPage = bodyModel(reconciled.tree, mainRec.key);
    const knownRows = physicalRows(knownPage);
    assert.equal(rowText(knownRows, 'Climate'), mainRec.body.surfaceTempBand.band);
    assert.equal(rowText(knownRows, 'Orbital zone'), mainRec.body.orbitalTempBand.band);
    assert.equal(rowText(knownRows, 'Temperature band'), null);
    assert.equal(rowText(knownRows, 'High temperature'), fullTemp(host.highTempK));
    assert.equal(rowText(knownRows, 'Low temperature'), fullTemp(host.lowTempK));
    const knownCard = cardOf(reconciled.tree, mainRec);
    const knownClimate = knownCard.lines.find((line) => line.label === 'Climate');
    assert.ok(knownClimate);
    assert.equal(knownClimate.value, mainRec.body.surfaceTempBand.band);
    assert.equal(knownCard.lines.some((line) => line.label === 'Orbital zone'), false);
    assert.equal(knownCard.lines.find((line) => line.label === 'Mean temp.').value, mainCard.lines.find((line) => line.label === 'Mean temp.').value);
    assert.equal(knownCard.lines.find((line) => line.label === 'High temp.').value, mainCard.lines.find((line) => line.label === 'High temp.').value);
    assert.equal(knownCard.lines.find((line) => line.label === 'Low temp.').value, mainCard.lines.find((line) => line.label === 'Low temp.').value);

    const surfaceRec = reconcileTree(withHost(tree, (body) => {
        body.meanTempK = null;
        body.tempBand = 'NOT-A-BAND';
    }).doc, environmentPolicy);
    const surfaceHost = hostOf(surfaceRec.tree);
    assert.equal(surfaceHost.body.surfaceTempBand.status, 'unknown');
    assert.equal(surfaceHost.body.orbitalTempBand.status, 'known');
    assert.equal(surfaceHost.body.tempBand, 'NOT-A-BAND');
    const surfaceRows = physicalRows(bodyModel(surfaceRec.tree, surfaceHost.key));
    assert.equal(rowText(surfaceRows, 'Climate'), 'not classified');
    assert.equal(rowText(surfaceRows, 'Orbital zone'), surfaceHost.body.orbitalTempBand.band);
    assert.equal(rowText(surfaceRows, 'Temperature band'), null);
    assert.equal(rowText(surfaceRows, 'High temperature'), fullTemp(host.highTempK));
    const surfaceCard = cardOf(surfaceRec.tree, surfaceHost);
    assert.equal(surfaceCard.lines.find((line) => line.label === 'Climate').value, 'not classified');
    assert.equal(surfaceCard.lines.some((line) => line.value === 'NOT-A-BAND'), false);

    const orbitRec = reconcileTree(withHost(tree, (body, system) => {
        delete body.orbitId;
        delete body.worldHzco;
        delete system.hzco;
        body.tempBand = 'NOT-A-BAND';
    }).doc, environmentPolicy);
    const orbitHost = hostOf(orbitRec.tree);
    assert.equal(orbitHost.body.orbitalTempBand.status, 'unknown');
    assert.equal(orbitHost.body.surfaceTempBand.status, 'known');
    assert.equal(orbitHost.body.tempBand, 'NOT-A-BAND');
    const orbitRows = physicalRows(bodyModel(orbitRec.tree, orbitHost.key));
    assert.equal(rowText(orbitRows, 'Climate'), orbitHost.body.surfaceTempBand.band);
    assert.equal(rowText(orbitRows, 'Orbital zone'), 'not classified');
    assert.equal(rowText(orbitRows, 'Temperature band'), null);
    assert.notEqual(rowText(orbitRows, 'Climate'), 'NOT-A-BAND');
    assert.notEqual(rowText(orbitRows, 'Orbital zone'), 'NOT-A-BAND');
    const orbitCard = cardOf(orbitRec.tree, orbitHost);
    assert.equal(orbitCard.lines.find((line) => line.label === 'Climate').value, orbitHost.body.surfaceTempBand.band);

    const bothRec = reconcileTree(withHost(tree, (body, system) => {
        body.meanTempK = null;
        delete body.orbitId;
        delete body.worldHzco;
        delete system.hzco;
        body.tempBand = 'NOT-A-BAND';
    }).doc, environmentPolicy);
    const bothHost = hostOf(bothRec.tree);
    assert.equal(bothHost.body.surfaceTempBand.status, 'unknown');
    assert.equal(bothHost.body.orbitalTempBand.status, 'unknown');
    const bothRows = physicalRows(bodyModel(bothRec.tree, bothHost.key));
    assert.equal(rowText(bothRows, 'Climate'), 'not classified');
    assert.equal(rowText(bothRows, 'Orbital zone'), 'not classified');
    assert.equal(rowText(bothRows, 'Temperature band'), null);
    const bothCard = cardOf(bothRec.tree, bothHost);
    assert.equal(bothCard.lines.find((line) => line.label === 'Climate').value, 'not classified');
    assert.equal(bothCard.lines.some((line) => line.value === 'NOT-A-BAND'), false);

    const water = environmentPolicy.liquids.find((row) => row.name === environmentPolicy.liquid.q3.ordinarySubstance);
    assert.ok(water);
    const step = liquidStep(environmentPolicy.liquids);
    const ordinary = ordinaryAtmosphere(environmentPolicy);
    const vacuum = environmentPolicy.liquid.q3.vacuumAtmospheres[0];
    const ice = environmentPolicy.liquid.q3.iceLabel;
    const unknownLabel = environmentPolicy.liquid.q3.unknownLabel;
    const midpoint = (water.mp + water.bp) / 2;
    const liquidCases = [
        { name: 'none', fields: { hydroPercent: 0, liquidType: unknownLabel, atmCode: ordinary, meanTempK: midpoint, lowTempK: midpoint, highTempK: midpoint }, status: 'none', text: 'None', absent: [unknownLabel, 'dry'] },
        { name: 'none-ice', fields: { hydroPercent: 0, liquidType: ice, atmCode: vacuum, meanTempK: midpoint, highTempK: midpoint }, status: 'none', text: 'None', absent: [ice, 'dry'] },
        { name: 'unknown', fields: { hydroPercent: Number.NaN, liquidType: water.name, atmCode: ordinary, meanTempK: midpoint }, status: 'unknown', text: 'Not classified', absent: [water.name] },
        { name: 'unresolved', wipe: ['atmCode'], fields: { liquidType: water.name, hydroPercent: 40, meanTempK: midpoint }, status: 'unresolved', text: 'Unresolved. No listed liquid fits this world\'s temperature.', absent: [water.name, 'dry', 'None'] },
        { name: 'known-solid', fields: { liquidType: ice, hydroPercent: 20, atmCode: ordinary, meanTempK: water.mp - step, lowTempK: water.mp - step, highTempK: water.mp - step }, status: 'known', phase: 'solid', substance: water.name, text: water.name + ', frozen.' },
        { name: 'known-notes', fields: { liquidType: water.name, hydroPercent: 40, atmCode: ordinary, meanTempK: midpoint, lowTempK: water.mp - step, highTempK: midpoint }, status: 'known', substance: water.name, text: water.name + ', frozen at the low.' },
        { name: 'known-ends', fields: { liquidType: water.name, hydroPercent: 40, atmCode: ordinary, meanTempK: midpoint, lowTempK: water.mp - step, highTempK: water.bp + step }, status: 'known', substance: water.name, text: water.name + ', frozen at the low, boils at the high.' },
        { name: 'known-open', fields: { liquidType: water.name, hydroPercent: 40, atmCode: ordinary, meanTempK: midpoint, lowTempK: midpoint, highTempK: midpoint }, status: 'known', substance: water.name, text: water.name },
    ];
    for (const item of liquidCases) {
        const made = withHost(tree, (body) => {
            body.tempBand = 'NOT-A-BAND';
            for (const key of item.wipe || []) delete body[key];
            Object.assign(body, item.fields);
        });
        const result = reconcileTree(made.doc, environmentPolicy);
        const found = hostOf(result.tree);
        assert.equal(found.body.liquidStatus.status, item.status, item.name);
        if (item.phase) assert.equal(found.body.liquidStatus.phase, item.phase, item.name);
        if (item.substance) assert.equal(found.body.liquidStatus.substance, item.substance, item.name);
        if (item.name === 'known-notes') assert.equal(found.body.liquidStatus.phase.low, 'solid', item.name);
        if (item.name === 'known-ends') {
            assert.equal(found.body.liquidStatus.phase.low, 'solid', item.name);
            assert.equal(found.body.liquidStatus.phase.high, 'gas', item.name);
        }
        if (item.name === 'known-open') assert.equal(found.body.liquidStatus.phase, undefined, item.name);
        const page = bodyModel(result.tree, found.key);
        const card = cardOf(result.tree, found);
        const rows = physicalRows(page);
        assert.equal(rowText(rows, 'Climate'), found.body.surfaceTempBand.status === 'known' ? found.body.surfaceTempBand.band : 'not classified', item.name);
        assert.equal(rowText(rows, 'Orbital zone'), found.body.orbitalTempBand.status === 'known' ? found.body.orbitalTempBand.band : 'not classified', item.name);
        assert.equal(rowText(rows, 'Temperature band'), null, item.name);
        assert.notEqual(rowText(rows, 'Climate'), 'NOT-A-BAND', item.name);
        assert.equal(card.lines.find((line) => line.label === 'Climate').value, rowText(rows, 'Climate'), item.name);
        assert.equal(liquidDisplay(found.body), item.text, item.name);
        assert.equal(rowText(rows, 'Surface liquid'), item.text, item.name);
        const labels = rows.map((row) => row.label);
        const liquidAt = labels.indexOf('Surface liquid');
        const lowAt = labels.indexOf('Low temperature');
        const albedoAt = labels.indexOf('Albedo');
        if (lowAt !== -1) assert.ok(liquidAt > lowAt, item.name);
        if (albedoAt !== -1) assert.ok(liquidAt < albedoAt, item.name);
        for (const word of item.absent || []) {
            assert.equal(item.text.includes(word), false, item.name + ' shows ' + word);
        }
        if (typeof found.body.liquidType === 'string' && found.body.liquidType !== found.body.liquidStatus.substance) {
            assert.equal(item.text.includes(found.body.liquidType), false, item.name + ' old label');
        }
        assertCardHasNoLiquid(card.lines, [item.text, found.body.liquidStatus.substance], item.name);
        if (item.fields.highTempK != null) assert.equal(rowText(rows, 'High temperature'), fullTemp(item.fields.highTempK), item.name);
        if (item.fields.lowTempK != null) assert.equal(rowText(rows, 'Low temperature'), fullTemp(item.fields.lowTempK), item.name);
    }
    let bare = null;
    walkBodies(pickSystem(reconciled.tree.body), (body, key, moon) => {
        if (!bare && body.liquidStatus === undefined && body.surfaceTempBand && body.type !== 'Empty') bare = { body, key, moon };
    });
    assert.ok(bare);
    const barePage = bodyModel(reconciled.tree, bare.key);
    const bareCard = cardOf(reconciled.tree, bare);
    assert.equal(bare.body.liquidStatus, undefined);
    assert.equal(liquidDisplay(bare.body), null);
    assert.equal(rowText(physicalRows(barePage), 'Surface liquid'), null);
    assertNoLiquid(physicalRows(barePage), bareCard ? bareCard.lines : [], [], 'no-liquid-field');

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
    assert.equal(partialModel.journey, null);
    assert.equal(partialModel.journeyNote, '');
    assert.equal(partialModel.holdLead, false);
    assert.equal(partialModel.callout, null);
    assert.equal(partialModel.mainworldKey, null);
    assert.equal(partialModel.header.title, partial.name ? partial.name + ' system' : '0914');
    const chartLabels = new Set(['Trade codes', 'Travel zone', 'Allegiance', 'Bases', 'PBG']);
    for (const row of partialModel.rows) assert.ok(chartLabels.has(row.label), row.label);
    assert.equal(partialModel.rows.some((row) => row.label === 'Starport'), false);
});

function walkBodies(system, visit) {
    (system.worlds || []).forEach((world, index) => {
        visit(world, 'w' + index, false);
        (world.moons || []).forEach((moon, moonIndex) => visit(moon, 'w' + index + 'm' + moonIndex, true));
    });
}

function hostOf(doc) {
    const system = pickSystem(doc.body);
    let found = null;
    walkBodies(system, (body, key, moon) => {
        if (!found && body.type === 'Mainworld') found = { body, key, moon, system };
    });
    assert.ok(found);
    return found;
}

function withHost(source, mutate) {
    const doc = structuredClone(source);
    const host = hostOf(doc);
    mutate(host.body, host.system);
    return { doc, key: host.key, moon: host.moon };
}

function physicalRows(page) {
    const section = page.sideSections.find((item) => item.heading === 'Physical');
    return section ? section.rows : [];
}

function rowText(rows, label) {
    const row = rows.find((item) => item.label === label);
    return row ? row.text : null;
}

function cardOf(doc, found) {
    const planned = planSystem(pickSystem(doc.body), 'Spinward_Marches/1910');
    return cardFor(planned, found.moon ? 'moon' : 'world', found.key, 10);
}

function assertNoLiquid(rows, lines, words, name) {
    for (const row of rows) assert.equal(/liquid|substance|phase/i.test(row.label), false, name + ' ' + row.label);
    for (const line of lines) assert.equal(/liquid|substance|phase/i.test(line.label), false, name + ' ' + line.label);
    const texts = rows.map((row) => row.text).concat(lines.map((line) => line.value));
    for (const word of words) assert.equal(texts.some((text) => text === word), false, name + ' ' + word);
}

function assertCardHasNoLiquid(lines, words, name) {
    for (const line of lines) assert.equal(/liquid|substance|phase/i.test(line.label), false, name + ' ' + line.label);
    const blob = lines.map((line) => line.label + '\n' + line.value).join('\n');
    for (const word of words) {
        if (typeof word !== 'string' || word === '') continue;
        assert.equal(blob.includes(word), false, name + ' card has ' + word);
    }
}

function liquidStep(rows) {
    const points = [];
    for (const row of rows) points.push(row.mp, row.bp);
    points.sort((left, right) => left - right);
    let gap = Infinity;
    for (let index = 1; index < points.length; index += 1) {
        if (points[index] > points[index - 1]) gap = Math.min(gap, points[index] - points[index - 1]);
    }
    return gap / 1000;
}

function ordinaryAtmosphere(policy) {
    const blocked = new Set([...policy.liquid.q3.exoticAtmospheres, ...policy.liquid.q3.vacuumAtmospheres]);
    let code = 2;
    while (blocked.has(code)) code += 1;
    return code;
}

test('climate words come only from the body', () => {
    assert.deepEqual(climateDisplay({ tempBand: 'Boiling', meanTempK: 1 }), { climate: null, zone: null });
    assert.deepEqual(
        climateDisplay({
            surfaceTempBand: { status: 'known', band: 'Made-up' },
            orbitalTempBand: { status: 'known', band: 'Also-made-up' },
            tempBand: 'Boiling',
        }),
        { climate: 'Made-up', zone: 'Also-made-up' },
    );
    assert.deepEqual(
        climateDisplay({
            surfaceTempBand: { status: 'unknown' },
            orbitalTempBand: { status: 'unknown', missing: ['orbitId'] },
            tempBand: 'Boiling',
        }),
        { climate: 'not classified', zone: 'not classified' },
    );
    assert.deepEqual(
        climateDisplay({ surfaceTempBand: { status: 'known', band: '  ' }, orbitalTempBand: { status: 'known' } }),
        { climate: 'not classified', zone: 'not classified' },
    );
    assert.deepEqual(
        climateDisplay({ surfaceTempBand: { status: 'unknown', band: 'Boiling' } }),
        { climate: 'not classified', zone: 'not classified' },
    );
    assert.equal(liquidDisplay({ tempBand: 'Boiling' }), null);
    assert.equal(liquidDisplay({ liquidType: 'Old label' }), null);
    assert.equal(liquidDisplay({ liquidStatus: { status: 'none', outcome: 'zero' } }), 'None');
    assert.equal(liquidDisplay({ liquidStatus: { status: 'unknown', outcome: 'hydro-invalid', substance: 'Old label' } }), 'Not classified');
    assert.equal(
        liquidDisplay({ liquidStatus: { status: 'unresolved', outcome: 'missing' }, liquidType: 'Old label' }),
        'Unresolved. No listed liquid fits this world\'s temperature.',
    );
    assert.equal(
        liquidDisplay({ liquidStatus: { status: 'known', substance: 'Made-up', phase: { low: 'solid', high: 'gas' } } }),
        'Made-up, frozen at the low, boils at the high.',
    );
    assert.equal(liquidDisplay({ liquidStatus: { status: 'known', substance: 'Made-up', phase: 'solid' } }), 'Made-up, frozen.');
    assert.equal(liquidDisplay({ liquidStatus: { status: 'known', substance: 'Made-up', phase: 'gas' } }), 'Made-up, boils.');
    assert.equal(
        liquidDisplay({ liquidStatus: { status: 'known', substance: 'Made-up', phase: { mean: 'solid' } } }),
        'Made-up, frozen at the mean.',
    );
    assert.equal(liquidDisplay({ liquidStatus: { status: 'known', substance: 'Made-up' } }), 'Made-up');
    assert.equal(liquidDisplay({ liquidStatus: { status: 'known', phase: 'solid' } }), 'Frozen.');
    assert.equal(liquidDisplay({ liquidStatus: { status: 'known' } }), null);
    const files = [];
    function collect(target) {
        if (!fs.existsSync(target)) return;
        const stat = fs.statSync(target);
        if (stat.isFile()) {
            files.push(target);
            return;
        }
        for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
            collect(path.join(target, entry.name));
        }
    }
    collect(path.join(ROOT, 'apps/web/src/dossier'));
    collect(path.join(ROOT, 'apps/web/src/orbit/card.ts'));
    collect(path.join(ROOT, 'apps/web/src/orbit/BodyCard.vue'));
    const forbidden = [
        /273\.15/,
        /maxC/,
        /mgt2e_climate_bands/,
        /climate_bands/,
        /tempBandFromKelvin/,
        /exoticLiquids/,
        /reconcile_environment/,
        /@voyage\/engines/,
    ];
    assert.ok(files.length > 2);
    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        for (const pattern of forbidden) assert.equal(pattern.test(source), false, file + ' ' + pattern);
    }
});
