/**
 * ES10: the router module is imported one way. main.ts imports it. Commands push
 * through shell/go.ts. The registry does not import the router.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');

function source(rel) {
    return fs.readFileSync(path.join(web, rel), 'utf8');
}

test('the router is imported by main, and commands do not import it', () => {
    assert.match(source('main.ts'), /import \{ router \} from '\.\/router'/);
    assert.match(source('router.ts'), /bindRouter\(router\)/);
    assert.equal(source('shell/registry.ts').includes('router.ts'), false);
    for (const file of ['workspace/help_command.ts', 'workspace/campaign_command.ts', 'workspace/market/command.ts']) {
        assert.equal(source(file).includes('router.ts'), false, file);
        assert.match(source(file), /shell\/go\.ts/);
    }
});
