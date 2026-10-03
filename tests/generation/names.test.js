import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseT5Tab } from '@voyage/shared';
import { generateHex } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';
import { withEngineRng } from '../golden/rng_lock.js';

const require = createRequire(import.meta.url);
const engineVersion = require('../../packages/engines/package.json').version;

const TSV = [
    'Hex\tName\tUWP\tBases\tRemarks\tZone\tPBG\tAllegiance\tStars',
    '1910\t\tA788899-C\t\t\t\t703\tIm\tG2 V',
].join('\n');

test('a nameless full UWP takes a pool name, and the same name again', async () => {
    await withEngineRng(async () => {
        const summary = parseT5Tab(TSV).get('1910');
        assert.equal(summary.name, '');
        const pinned = { seed: TRUTH_SEED, settings: TRUTH_SETTINGS, engineVersion };
        const input = { hexKey: 'Names/1910', edition: 'MgT2E', mode: 'flesh', summary, pinned };
        const first = generateHex(input);
        const second = generateHex(input);
        // The chart name stays blank. The rolled name is the mainworld name.
        const nameOf = (body) => body.mgtSystem.mainworld.name;
        assert.ok(nameOf(first.body));
        assert.notEqual(nameOf(first.body), 'Unnamed System');
        assert.equal(nameOf(second.body), nameOf(first.body));
    });
});
