/**
 * Tab stays inside the lightbox (apps/web/src/workspace/Lightbox.vue). The step
 * is wrapFocus in focus_trap.ts, the same steps the orbit picker uses.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { wrapFocus } from '../../apps/web/src/workspace/focus_trap.ts';

const lightbox = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src/workspace/Lightbox.vue');

test('tab wraps inside the lightbox and focus returns to the opener', () => {
    assert.equal(wrapFocus(0, 0, false), null);
    assert.equal(wrapFocus(3, -1, false), 0);
    assert.equal(wrapFocus(3, -1, true), 2);
    assert.equal(wrapFocus(3, 2, false), 0);
    assert.equal(wrapFocus(3, 0, true), 2);
    assert.equal(wrapFocus(3, 1, false), null);
    assert.equal(wrapFocus(3, 1, true), null);

    const source = fs.readFileSync(lightbox, 'utf8');
    assert.match(source, /import \{ wrapFocus \} from '\.\/focus_trap\.ts'/);
    assert.match(source, /wrapFocus\(list\.length, at, event\.shiftKey\)/);
    assert.match(source, /document\.addEventListener\('focusin', holdFocus\)/);
    assert.match(source, /document\.removeEventListener\('focusin', holdFocus\)/);
    assert.match(source, /if \(back && back\.isConnected\) back\.focus\(\)/);
});
