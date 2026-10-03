import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLegacy } from '../oracle/legacy.js';
import { stable } from '../../packages/shared/src/stable.ts';
import { cases, settings, seed, skipped } from './cases.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const UPDATE = process.env.UPDATE_GOLDEN === '1';
function run(name) {
    const value = cases[name](loadLegacy({ seed, settings }));
    assert.notEqual(value, undefined, `${name} returned undefined`);
    const out = stable(value);
    assert.ok(out && out !== '{}' && out !== '[]', `${name} produced an empty result`);
    return out;
}

for (const name of Object.keys(cases)) {
    test(`legacy ${name} is deterministic`, () => assert.equal(run(name), run(name)));
    test(`legacy ${name} matches fixture`, () => {
        const file = path.join(FIX, name + '.json');
        const out = run(name);
        if (UPDATE || !fs.existsSync(file)) { fs.mkdirSync(FIX, { recursive: true }); fs.writeFileSync(file, out); return; }
        assert.equal(out, fs.readFileSync(file, 'utf8'));
    });
}

for (const name of skipped) {
    test(`legacy ${name}`, { skip: 'parseXmlRouteGroups needs a DOMParser; the new parser is verified in §8' }, () => {});
}
