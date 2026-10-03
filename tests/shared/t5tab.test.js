import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseT5Tab, stable } from '@voyage/shared';
import { TSV } from '../golden/cases.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../golden/fixtures/parse_t5tab.json');

/** Legacy id, or a value that is only that id. A bare "1" or "C" is a UWP digit, not a slot field. */
const LEGACY_ID = /\d+-[A-P]-\d{4}/;

export function mapLegacyKeys(raw) {
    const mapped = {};
    for (const [key, value] of Object.entries(JSON.parse(raw))) mapped[key.split('-').pop()] = value;
    return mapped;
}

function walk(legacy, got, path, diffs, idFields) {
    if (Object.is(legacy, got)) return;
    const legText = typeof legacy === 'string' ? legacy : null;
    const encodesId = legText !== null && LEGACY_ID.test(legText);
    if (encodesId && stable(legacy) !== stable(got)) {
        idFields.push({ path, legacy, got });
        return;
    }
    if (Array.isArray(legacy) || Array.isArray(got)) {
        if (!Array.isArray(legacy) || !Array.isArray(got) || legacy.length !== got.length) {
            diffs.push({ path, legacy, got });
            return;
        }
        for (let i = 0; i < legacy.length; i++) walk(legacy[i], got[i], `${path}[${i}]`, diffs, idFields);
        return;
    }
    if (legacy && got && typeof legacy === 'object' && typeof got === 'object') {
        const keys = [...new Set([...Object.keys(legacy), ...Object.keys(got)])].sort();
        for (const key of keys) {
            if (!Object.prototype.hasOwnProperty.call(legacy, key) || !Object.prototype.hasOwnProperty.call(got, key)) {
                diffs.push({ path: `${path}.${key}`, legacy: legacy[key], got: got[key] });
                continue;
            }
            walk(legacy[key], got[key], `${path}.${key}`, diffs, idFields);
        }
        return;
    }
    diffs.push({ path, legacy, got });
}

/** Fields whose legacy value contains a legacy hex id. Listed even when the values are equal. */
export function legacyIdFields(legacy) {
    const found = [];
    const visit = (value, path) => {
        if (typeof value === 'string' && LEGACY_ID.test(value)) found.push({ path, example: value });
        else if (Array.isArray(value)) value.forEach((v, i) => visit(v, `${path}[${i}]`));
        else if (value && typeof value === 'object') {
            for (const key of Object.keys(value).sort()) visit(value[key], `${path}.${key}`);
        }
    };
    visit(legacy, '$');
    return found;
}

export function compareParse(legacyMapped, got) {
    const diffs = [];
    const idDiffs = [];
    const keys = [...new Set([...Object.keys(legacyMapped), ...Object.keys(got)])].sort();
    for (const key of keys) {
        if (!(key in legacyMapped) || !(key in got)) {
            diffs.push({ path: key, legacy: legacyMapped[key], got: got[key] });
            continue;
        }
        walk(legacyMapped[key], got[key], key, diffs, idDiffs);
    }
    return { diffs, idDiffs, idFields: legacyIdFields(legacyMapped) };
}

// Companion orbitIDs in the fixture were session-rng rolls. The parser leaves them
// null. Mask both sides so every other field is still compared byte for byte.
function maskCompanionOrbitID(root) {
    const copy = structuredClone(root);
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (Array.isArray(node.stars)) {
            for (const star of node.stars) {
                if (star && star.role && star.role !== 'Primary') star.orbitID = null;
            }
        }
        for (const value of Object.values(node)) walk(value);
    };
    walk(copy);
    return copy;
}

test('parseT5Tab matches the golden fixture by four-digit hex', () => {
    const legacy = maskCompanionOrbitID(mapLegacyKeys(fs.readFileSync(FIX, 'utf8')));
    const got = Object.fromEntries(parseT5Tab(TSV));
    for (const star of got['1910'].t5System.stars) {
        if (star.role !== 'Primary') assert.equal(star.orbitID, null);
    }
    assert.equal(got['1910'].t5System.stars[0].orbitID, 0);
    const masked = maskCompanionOrbitID(got);
    const { diffs, idDiffs, idFields } = compareParse(legacy, masked);
    if (diffs.length) {
        const first = diffs[0];
        assert.fail(`${first.path}\nlegacy: ${stable(first.legacy)}\ngot: ${stable(first.got)}`);
    }
    assert.equal(idDiffs.length, 0);
    assert.deepEqual(idFields, []);
    assert.equal(stable(masked), stable(legacy));
    assert.equal(got['1910'].name, 'Regina');
});
