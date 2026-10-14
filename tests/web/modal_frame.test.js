/**
 * One modal frame (prompts/d_polish_note_and_frame.md): design/base.css draws the layer, the
 * scrim, the card and its bar, and the four modals use it. None borrows the Lightbox's classes,
 * so the person card and the deck plan look right before the Lightbox's chunk has loaded.
 * Also the Generate sheet's note, which says the method as its label does.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8');

const MODALS = ['workspace/Lightbox.vue', 'workspace/build/OrbitPicker.vue', 'workspace/PersonCard.vue', 'workspace/PlanModal.vue'];

/** The body of the first rule whose selector is exactly this one. */
function rule(css, selector) {
    const at = css.indexOf('\n' + selector + ' {');
    if (at < 0) return null;
    return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}

test('base.css draws the frame as the Lightbox drew it', () => {
    const css = read('design/base.css');
    const layer = rule(css, '.ui-modal');
    assert.ok(layer, '.ui-modal');
    for (const line of ['position: fixed;', 'inset: 0;', 'z-index: 40;', 'padding: 24px;', 'animation: ui-modal-in var(--t-fast) var(--ease-out) both;']) {
        assert.ok(layer.includes(line), '.ui-modal ' + line);
    }
    assert.ok(rule(css, '.ui-modal-scrim').includes('background: color-mix(in srgb, var(--bg-0) 88%, transparent);'));
    const card = rule(css, '.ui-modal-card');
    for (const line of ['width: min(1100px, 100%);', 'max-height: 100%;', 'padding: 12px 14px 14px;', 'border: 1px solid var(--line-1);', 'border-radius: var(--r-4);', 'background: var(--bg-1);', 'box-shadow: var(--shadow-pop);', 'font: 400 14px/1.5 var(--font-text);']) {
        assert.ok(card.includes(line), '.ui-modal-card ' + line);
    }
    for (const selector of ['.ui-modal-bar', '.ui-modal-title', '.ui-modal-meta']) assert.ok(rule(css, selector), selector);
    assert.match(css, /@keyframes ui-modal-in/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ui-modal \{\s*animation: none;/);
});

test('the four modals use the frame and keep no copy of it', () => {
    for (const file of MODALS) {
        const source = read(file);
        assert.match(source, /<Teleport to="body">/, file);
        assert.match(source, /class="ui-modal[ "]/, file + ': the layer');
        assert.match(source, /class="ui-modal-scrim"/, file + ': the scrim');
        assert.match(source, /class="ui-modal-card[ "]/, file + ': the card');
        const style = source.slice(source.indexOf('<style>'));
        assert.doesNotMatch(style, /position: fixed/, file + ': no layer of its own');
        assert.doesNotMatch(style, /color-mix\(in srgb, var\(--bg-0\) 88%/, file + ': no scrim of its own');
        assert.doesNotMatch(style, /@keyframes/, file + ': no motion of its own');
    }
});

test('no component borrows the Lightbox’s frame classes', () => {
    const borrowed = /\blightbox-(card|scrim|bar|count|meta)\b|class="lightbox[ "]/;
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(vue|ts|css)$/.test(entry.name) ? [full] : [];
    });
    const found = walk(src).filter((file) => borrowed.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(src, file));
    assert.deepEqual(found, []);
});

test('the Generate sheet says "from the star outward", as the method’s label does', () => {
    const sheet = read('workspace/build/GenerateSheet.vue');
    assert.match(sheet, /'bottom up' : 'from the star outward'/);
    assert.doesNotMatch(sheet, /'top down'/);
    assert.match(read('workspace/build/state.ts'), /'top-down': 'Full system, from the star outward'/);
});
