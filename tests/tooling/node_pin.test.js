/**
 * AS4. CI, the engines field and .node-version name one Node.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const pin = readFileSync(new URL('.node-version', root), 'utf8').trim();
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const workflow = readFileSync(new URL('.github/workflows/test.yml', root), 'utf8');

test('the pin, the engines field and CI read one Node version', () => {
    assert.equal(pin, '24.22.1');
    assert.equal(pkg.engines.node, '>=' + pin);
    assert.equal(pkg.engines.npm, '>=11');
    assert.match(workflow, /node-version-file:\s*\.node-version/);
    assert.equal(/^\s*node-version:\s/m.test(workflow), false);
});
