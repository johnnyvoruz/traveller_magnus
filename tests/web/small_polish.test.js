/**
 * Three small fixes (prompts/d_small_polish.md): the date chip at every width, the global
 * h1/p reset in base.css, and the orbit picker's card on the modal frame.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8');

/** The body of the @media block that opens with this query. */
function media(css, query) {
    const at = css.indexOf('@media ' + query + ' {');
    assert.ok(at >= 0, query);
    let depth = 0;
    for (let i = css.indexOf('{', at); i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
    }
    return '';
}

test('the date chip is never hidden by width: under the search below 680 px', () => {
    const chip = read('workspace/StardateChip.vue');
    assert.doesNotMatch(chip, /\.stardate \{\s*display: none;/, 'the chip itself is never display: none');
    const narrow = media(chip, '(max-width: 680px)');
    assert.match(narrow, /top: calc\(var\(--chrome-top\) \+ var\(--chrome-height\) \+ 8px\);/);
    assert.match(narrow, /left: auto;\s*right: var\(--chrome-inset\);\s*z-index: 2;/);
    assert.match(narrow, /\.stardate\.is-unset span \{\s*display: inline-block;/);
    assert.match(media(chip, '(max-width: 860px)'), /\.stardate span \{\s*display: none;/);
    assert.match(media(chip, '(min-width: 600px) and (max-width: 680px)'), /\.app:has\(\.panel\.is-open\) \.stardate \{\s*visibility: hidden;/);
    // One chip in the app: Lane E's phone rule moves this one, it does not draw another.
    assert.equal(read('views/MapView.vue').split('<StardateChip').length - 1, 1);
    assert.match(read('shell/Panel.vue'), /\.app \.stardate \{\s*display: inline-flex;/);
});

test('the h1 and p reset is base.css’s, unchanged, and Account.vue has no style', () => {
    const base = read('design/base.css');
    assert.ok(base.includes('h1 {\n  margin: 0;\n  font-family: var(--font-display);\n  font-weight: 500;\n  color: var(--signal);\n  letter-spacing: 0.06em;\n}\np {\n  margin: 0;\n  color: var(--text-2);\n}\n'));
    assert.doesNotMatch(read('views/Account.vue'), /<style/);
});

test('the orbit picker’s card is the frame’s colour and type', () => {
    const picker = read('workspace/build/OrbitPicker.vue');
    const card = picker.match(/\.ui-modal-card\.pick-card \{([^}]*)\}/);
    assert.ok(card);
    assert.doesNotMatch(card[1], /background|font/);
    assert.match(card[1], /width: min\(780px, 100%\);/);
    assert.match(card[1], /overflow: auto;/);
});
