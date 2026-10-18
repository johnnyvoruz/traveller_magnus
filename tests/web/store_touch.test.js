/**
 * The store at 390 px (streams/D.md D6): below 640 px every control in the store and its dialogs is a
 * 44 px target, the rail's items too, and the campaign picker never makes the page wider than the
 * window. The browser measurement is findings/storefront/sd_d6.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (rel) => readFileSync(new URL('../../apps/web/src/' + rel, import.meta.url), 'utf8');

/** The body of the first `@media (max-width: 640px)` block after `marker`. */
function narrow(text, marker) {
    const at = text.indexOf(marker);
    assert.ok(at >= 0, marker);
    const start = text.indexOf('@media (max-width: 640px) {', at);
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i++) {
        if (text[i] === '{') depth += 1;
        if (text[i] === '}') depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
    }
    return '';
}

test('every control in the store and its dialogs is 44 px tall below 640 px', () => {
    const block = narrow(read('workspace/market/market.css'), 'Touch, below 640 px');
    for (const sel of ['.mk-app .ui-btn', '.mk-app .mk-box', '.mk-sheet .ui-btn', '.mk-choose .ui-btn', '.mk-rpub .ui-btn', '.mk-rpub .mk-box', '.mk-ask .ui-btn', '.mk-imp .ui-seg button', '.mk-sheet .mk-fopt']) {
        assert.ok(block.includes(sel), sel);
    }
    assert.match(block, /min-height: 44px;/);
    assert.match(block, /\.mk-sheet-close,\n\s*\.mk-choose-close,[\s\S]*?min-width: 44px;/);
    // Inline links keep their look; their hit area reaches round them.
    assert.match(block, /\.mk-card-by::before,[\s\S]*?inset: -12px -6px;/);
    // The badge is placed absolutely: it must not be made relative.
    assert.doesNotMatch(block, /\.mk-badge,\n\s*\.mk-crumbs a,\n[\s\S]*?position: relative;/);
});

test('the rail\'s items are 44 px below 640 px', () => {
    assert.match(narrow(read('shell/Rail.vue'), 'Touch, below 640 px'), /\.rail-item \{\n\s*height: 44px;/);
});

test('the campaign picker under My packages is never wider than the page', () => {
    assert.match(read('workspace/market/ImportsList.vue'), /\.mk-ins-pick \{\n  width: auto;\n  min-width: min\(180px, 100%\);\n  max-width: 100%;/);
});
