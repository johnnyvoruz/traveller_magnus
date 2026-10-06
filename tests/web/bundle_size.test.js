import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Vite prints chunk sizes in kB of 1000 bytes. The warning line is 500 of those. */
const MAIN_LIMIT = 450_000;

test('the main chunk in dist is under 450 kB', () => {
    const htmlPath = path.join(root, 'apps/web/dist/index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const match = html.match(/assets\/(index-[^"]+\.js)/);
    assert.ok(match, 'dist/index.html names the main chunk');
    const file = path.join(root, 'apps/web/dist/assets', match[1]);
    const bytes = fs.statSync(file).size;
    assert.ok(bytes < MAIN_LIMIT, `${match[1]} is ${(bytes / 1000).toFixed(1)} kB`);
});
