// Location census for the marketplace (directives/prompts/z_marketplace.md, phase 1).
// A placed package copy must rewrite every field that names where a system is.
// This walks every engine 1.2.0 golden fixture (tracked files only) and fails when a
// location field appears or disappears, so the rewrite module learns about it first.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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