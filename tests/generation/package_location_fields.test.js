// Location census for the marketplace (directives/prompts/z_marketplace.md, phase 1).
// A placed package copy must rewrite every field that names where a system is.
// This walks every engine 1.2.0 golden fixture (tracked files only) and fails when a
// location field appears or disappears, so the rewrite module learns about it first.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateHex } from '@voyage/generation';
import { parseT5Tab } from '@voyage/shared';
import { withEngineRng } from '../golden/rng_lock.js';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const DIR = fileURLToPath(new URL('../golden/fixtures/engine_1.2.0/', import.meta.url));

/** Key names that hold a location whatever their value. */
const LOCATION_KEY = /^(hexId|hexKey|parentId|hex|sector|sectorSlug|subsector)$/;

/** Values that name a hex: a hex key, a legacy slot id, or a profile id "<ccrr>|<body>". */
const LOCATION_VALUE = [
    /^[A-Za-z0-9_'.~-]+\/\d{4}(?:$|-)/,
    /^\d+-[A-P]-\d{4}(?:$|-)/,
    /^\d{4}\|/,
];

/** Every location path in the fixtures. Array indexes are written []. */
const EXPECTED = [
    '$.bodies[].profile.id',
    '$.hex',
    '$.hexId',
    '$.mainworld.hexId',
    '$.mainworld.parentId',
    '$.mgt2eData.hexId',
    '$.mgt2eData.parentId',
    '$.mgtSocio.hexId',
    '$.mgtSocio.parentId',
    '$.mgtSystem.hexId',
    '$.mgtSystem.mainworld.hexId',
    '$.mgtSystem.mainworld.parentId',
    '$.mgtSystem.worlds[].moons[].hexId',
    '$.mgtSystem.worlds[].moons[].parentId',
    '$.worlds[].hexId',
    '$.worlds[].moons[].hexId',
    '$.worlds[].moons[].parentId',
];

function walkInto(found, root, label) {
    const walk = (value, path, key) => {
        if (Array.isArray(value)) {
            for (const item of value) walk(item, `${path}[]`, key);
            return;
        }
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, k);
            return;
        }
        if (value == null) return;
        const text = String(value);
        if (LOCATION_KEY.test(key) || LOCATION_VALUE.some((re) => re.test(text))) {
            if (!found.has(path)) found.set(path, new Set());
            found.get(path).add(label);
        }
    };
    walk(root, '$', '');
}

function census() {
    const found = new Map();
    const note = (path, file) => {
        if (!found.has(path)) found.set(path, new Set());
        found.get(path).add(file);
    };
    const walk = (value, path, key, file) => {
        if (Array.isArray(value)) {
            for (const item of value) walk(item, `${path}[]`, key, file);
            return;
        }
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, k, file);
            return;
        }
        if (value == null) return;
        const text = String(value);
        if (LOCATION_KEY.test(key) || LOCATION_VALUE.some((re) => re.test(text))) note(path, file);
    };
    const files = readdirSync(DIR).filter((name) => name.endsWith('.json')).sort();
    for (const file of files) walk(JSON.parse(readFileSync(DIR + file, 'utf8')), '$', '', file);
    return { files, found };
}

test('the census reads every engine 1.2.0 fixture', () => {
    const { files } = census();
    assert.equal(files.length, 11);
});

test('every location field in the engine 1.2.0 fixtures is listed', () => {
    const { found } = census();
    assert.deepEqual([...found.keys()].sort(), [...EXPECTED].sort());
});

/**
 * Review correction 3: a stored envelope, as the truth build stores it (packages/generation
 * buildSector: mode `flesh`, the TSV row as summary), from the tracked Spinward_Marches.tsv.
 */
export async function regina() {
    const row = parseT5Tab(readFileSync(new URL('../../universe/raw/Spinward_Marches.tsv', import.meta.url), 'utf8')).get('1910');
    let envelope;
    await withEngineRng(async () => {
        envelope = generateHex({
            hexKey: 'Spinward_Marches/1910', edition: 'MgT2E', mode: 'flesh', summary: row,
            pinned: { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion: '1.2.0' },
        });
    });
    return envelope;
}

/** A hand-made tree, the shape `blankHand` writes (packages/generation/src/hand.ts). */
export function handTree() {
    return { kind: 'hand', engineVersion: '1.2.0', hexKey: 'Spinward_Marches/1910', edition: 'MgT2E', system: { name: 'Hand', notes: '', stars: [], bodies: [] } };
}

const ENVELOPE_EXPECTED = [
    '$.body.mgt2eData.hexId',
    '$.body.mgt2eData.parentId',
    '$.body.mgtSocio.hexId',
    '$.body.mgtSocio.parentId',
    '$.body.mgtSystem.hexId',
    '$.body.mgtSystem.mainworld.hexId',
    '$.body.mgtSystem.mainworld.parentId',
    '$.body.mgtSystem.worlds[].moons[].hexId',
    '$.body.mgtSystem.worlds[].moons[].parentId',
    '$.hexKey',
];

test('a stored envelope from generateHex holds the location fields the live Regina tree holds', async () => {
    const found = new Map();
    walkInto(found, await regina(), 'regina');
    assert.deepEqual([...found.keys()].sort(), [...ENVELOPE_EXPECTED].sort());
    assert.equal([...found.keys()].some((path) => path.startsWith('$.derivation')), false);
});

test('a hand-made tree holds only its hexKey', () => {
    const found = new Map();
    walkInto(found, handTree(), 'hand');
    assert.deepEqual([...found.keys()], ['$.hexKey']);
});