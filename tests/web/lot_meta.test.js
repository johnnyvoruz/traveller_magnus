/**
 * DF34: a cargo row's second line joins the parts the lot has with " · ", none leading; the referee's row and the
 * player's both read it, and leave the line out when there is nothing to say.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lotMeta } from '../../apps/web/src/workspace/vessel_trade.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');

test('the parts that exist, joined, none leading', () => {
    assert.equal(lotMeta({ value: 2400, origin: 'Regina' }), 'Cr2,400 · from Regina');
    assert.equal(lotMeta({ origin: 'Regina', destination: 'Jenghe', note: 'Cr20,000 on delivery' }), 'from Regina · to Jenghe · Cr20,000 on delivery');
    assert.equal(lotMeta({ destination: 'Jenghe' }), 'to Jenghe');
    assert.equal(lotMeta({ value: 0 }), 'Cr0', 'a value of nothing is still said');
    assert.equal(lotMeta({ note: 'Fragile' }), 'Fragile');
    assert.equal(lotMeta({}), '');
    assert.equal(lotMeta({ origin: '', destination: '', note: '' }), '');
});

test('pins: both rows read it and leave the line out when empty', () => {
    assert.match(src('workspace/VesselTrade.vue'), /<span v-if="lotMeta\(item\)" class="vt-meta" data-lot-meta>\{\{ lotMeta\(item\) \}\}<\/span>/);
    assert.match(src('workspace/players/PlayerShip.vue'), /<span v-if="lotMeta\(item\)" class="pship-meta" data-lot-meta>\{\{ lotMeta\(item\) \}\}<\/span>/);
    assert.doesNotMatch(src('workspace/VesselTrade.vue'), /> · from \{\{ item\.origin \}\}</, 'the old leading separator is gone');
});
