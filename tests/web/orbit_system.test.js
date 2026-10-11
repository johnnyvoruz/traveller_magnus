import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSector } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { bodyKeys } from '../../apps/web/src/dossier/model.ts';
import { planSystem } from '../../apps/web/src/orbit/layout.ts';
import { normalizeSystem, starColor } from '../../apps/web/src/orbit/system.ts';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineVersion = require('../../packages/engines/package.json').version;

function catalogue(slug) {
    const listed = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe/raw/sectors.json'), 'utf8'))
        .sectors.find((sector) => sector.slug === slug);
    return { name: listed.name, x: listed.x, y: listed.y, tags: listed.tags, canonical: listed.canonical };
}

test('Regina normalises as MgT2E and a body with no mgtSystem is null', async () => {
    const marches = await buildSector({
        slug: 'Spinward_Marches',
        tsv: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8'),
        metadataXml: fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8'),
        pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion },
        version: 'v2',
        catalogue: catalogue('Spinward_Marches'),
    });
    const regina = marches.index.hexes['1910'];
    assert.ok(regina.tree);
    const tree = JSON.parse(marches.objects.get(regina.tree));
    const sys = normalizeSystem(tree.body);
    assert.ok(sys);
    assert.equal(sys.edition, 'MgT2E');
    const mainworld = (sys.worlds || []).some((world) => world.type === 'Mainworld'
        || (world.moons || []).some((moon) => moon.type === 'Mainworld'));
    assert.equal(mainworld, true);
    assert.equal(Number.isFinite(sys.hzAU), true);

    assert.equal(normalizeSystem({}), null);
    assert.equal(normalizeSystem({ ctSystem: { stars: [{ name: 'Sol' }] } }), null);
});

test('an Architect of Worlds document is drawn from the orbits it already stores', () => {
    const raw = {
        name: 'Hand',
        hzco: 0,
        stars: [
            { sType: 'G', subType: 2, sClass: 'V', luminosity: 1, radius: 0.00465, spectralClassification: 'G2 V' },
            { sType: 'M', subType: 5, sClass: 'V', luminosity: 0.04, radius: 0.002 },
        ],
        orbits: [{ R: 12, separation: 'Moderate' }],
        worlds: [{
            type: 'Mainworld',
            name: 'Prime',
            orbitalRadius: 1,
            radius: 6400,
            parentStarIdx: 0,
            orbitalPeriod: 8760,
            satellites: [{ name: 'Lune', type: 'Icy', radius: 1700, orbitalRadius: 380000, orbitalPeriod: 648 }],
        }],
    };
    assert.ok(bodyKeys(raw).includes('w0m0'));
    const sys = normalizeSystem({ aowSystem: raw });
    assert.ok(sys);
    assert.equal(sys.edition, 'AoW');
    assert.equal(sys.stars[1].orbitAU, 12);
    assert.equal(sys.worlds[0].au, 1);
    assert.equal(sys.worlds[0].moons.length, 1);
    assert.equal(sys.worlds[0].moons[0].name, 'Lune');
    assert.equal(sys.hzAU, 1);
    const plan = planSystem(sys, 'Spinward_Marches/2010');
    assert.equal(plan.stars.length, 2);
    assert.equal(plan.worlds.length, 1);
    assert.equal(plan.worlds[0].au, 1);
    assert.equal(plan.worlds[0].moons.length, 1);
    assert.equal(plan.hasOrbits, true);
});

test('a system with a star and no worlds still normalises', () => {
    const sys = normalizeSystem({ mgtSystem: { stars: [{ sType: 'G', name: 'G2 V' }], worlds: [] } });
    assert.ok(sys);
    assert.equal(sys.edition, 'MgT2E');
    assert.equal(sys.worlds.length, 0);
    const plan = planSystem(sys, 'Spinward_Marches/2008');
    assert.equal(plan.stars.length, 1);
    assert.equal(plan.worlds.length, 0);
    assert.equal(plan.hasOrbits, false);
});

const STAR_TOKENS = {
    O: '--star-o', B: '--star-b', A: '--star-a',
    F: '--star-f', G: '--star-g', K: '--star-k',
    M: '--star-m', D: '--star-d', BD: '--star-bd',
};

test('starColor carries the token name and resolves it when asked', () => {
    assert.equal(starColor(null), null);
    assert.equal(starColor({}), null);
    assert.equal(starColor({ sType: 'Q' }), null);
    assert.equal(starColor({ sType: 'G' }, (name) => name), '--star-g');
    assert.equal(starColor({ sType: 'BD' }, (name) => name), '--star-bd');
    assert.equal(starColor({ sType: 'M' }, () => '   '), null);
    const seen = [];
    assert.equal(starColor({ sType: 'F' }, (name) => { seen.push(name); return 'paint'; }), 'paint');
    assert.deepEqual(seen, ['--star-f']);
});

test('with no page, starColor reads each star token from tokens.css', () => {
    const css = fs.readFileSync(path.join(ROOT, 'apps/web/src/design/tokens.css'), 'utf8');
    for (const [type, name] of Object.entries(STAR_TOKENS)) {
        const match = css.match(new RegExp(name + '\\s*:\\s*([^;]+)'));
        assert.ok(match, name);
        assert.equal(starColor({ sType: type }), match[1].trim());
    }
});
