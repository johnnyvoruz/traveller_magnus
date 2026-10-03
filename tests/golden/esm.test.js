import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stable } from '../../packages/shared/src/stable.ts';
import { hashString } from '../../packages/engines/src/core/rng.js';
import { loadLegacy } from '../oracle/legacy.js';
import { cases, pending } from './cases_esm.js';
import { withEngineRng } from './rng_lock.js';

function mapLegacyKeys(raw) {
    const mapped = {};
    for (const [key, value] of Object.entries(JSON.parse(raw))) mapped[key.split('-').pop()] = value;
    return mapped;
}

// The legacy fixture's companion orbitIDs were rolled by parseT5HomestarString on the
// session rng. A parser never rolls: those orbitIDs are null until placeCompanionOrbits.
// Mask them. Placement is tests/shared/stars.test.js.
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

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('hashString matches oracle', () => {
    const ctx = loadLegacy();
    const oracle = ctx.$eval("hashString('TravellerMagnus-1-A-0101')");
    assert.equal(hashString('TravellerMagnus-1-A-0101'), oracle);
});

for (const name of pending) test(`esm ${name}`, { skip: 'pending conversion' }, () => {});
// The engines share one rng binding across test files. Cases must not interleave.
for (const [name, fn] of Object.entries(cases))
    test(`esm ${name} matches legacy fixture`, async () => {
        await withEngineRng(async () => {
            const raw = fs.readFileSync(path.join(FIX, name + '.json'), 'utf8');
            const actual = await fn();
            const expected = name === 'parse_t5tab' ? stable(maskCompanionOrbitID(mapLegacyKeys(raw))) : raw;
            assert.equal(name === 'parse_t5tab' ? stable(maskCompanionOrbitID(actual)) : stable(actual), expected);
        });
    });
