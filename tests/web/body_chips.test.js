/**
 * The phone chip row shows a fade where it cuts, and the chips are 44 px targets
 * (apps/web/src/orbit/BodyChips.vue).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../../apps/web/src/orbit/BodyChips.vue', import.meta.url), 'utf8');

test('the phone chip row fades a cut edge and uses 44 px targets', () => {
    const block = source.slice(source.indexOf('@media (max-width: 599px)'));
    assert.match(block, /\.orbit-chip \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px;/);
    assert.match(block, /\.orbit-chip-bar\.is-cut-end \.orbit-chips \{[\s\S]*?mask-image: linear-gradient\(to right, black calc\(100% - 48px\), transparent\);/);
    assert.match(block, /\.orbit-chip-bar\.is-cut-start\.is-cut-end \.orbit-chips \{[\s\S]*?transparent\);/);
});
