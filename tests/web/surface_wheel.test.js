/**
 * DF15: the scroll wheel zooms the large surface map, also after the stage is rebuilt. The stage sits under
 * `v-if="mappable"`, so a body that cannot be mapped (a gas giant) and back again gives a new element; a
 * listener added once in onMounted stayed on the old one. The wheel is bound in the template (Vue's listener is
 * not passive, so preventDefault holds), and the size observer follows the elements.
 * No DOM library is in the repo, so this reads the compiled template; findings/storefront/sd_df15.mjs drives
 * the real page in Edge (Regina's mainworld, its gas giant and back, a wheel over the large map).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileTemplate, parse } from '@vue/compiler-sfc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'apps/web/src/dossier/SurfaceStage.vue');
const source = fs.readFileSync(file, 'utf8');
const { descriptor } = parse(source, { filename: file });
const script = descriptor.scriptSetup ? descriptor.scriptSetup.content : '';

function find(node, pred, trail = []) {
    if (node.type === 1 && pred(node)) return { node, trail };
    for (const child of node.children || []) {
        const hit = find(child, pred, node.type === 1 ? [...trail, node] : trail);
        if (hit) return hit;
    }
    return null;
}
const attr = (el, name) => el.props.find((p) => p.type === 6 && p.name === name);
const on = (el, event) => el.props.find((p) => p.type === 7 && p.name === 'on' && p.arg && p.arg.content === event);

const stage = find(descriptor.template.ast, (el) => attr(el, 'ref') && attr(el, 'ref').value.content === 'stageEl');

test('the wheel is bound on the stage element in the template, not added once at mount', () => {
    assert.ok(stage, 'the stage element');
    const wheel = on(stage.node, 'wheel');
    assert.ok(wheel, 'a wheel binding on the stage');
    assert.equal(wheel.exp.content, 'onStageWheel');
    assert.deepEqual(wheel.modifiers.map((m) => (typeof m === 'string' ? m : m.content)), [], 'not passive: the handler calls preventDefault');
    assert.doesNotMatch(script, /addEventListener\(\s*'wheel'/);
    assert.doesNotMatch(script, /removeEventListener\(\s*'wheel'/);
});

test('the stage is rebuilt when the body stops being mappable, which is why the binding has to follow it', () => {
    assert.ok(stage.trail.some((el) => el.props.some((p) => p.type === 7 && p.name === 'if' && p.exp.content === 'mappable')));
});

test('compiled, the stage carries a plain onWheel handler beside the hover handlers', () => {
    const { code, errors } = compileTemplate({ source: descriptor.template.content, filename: file, id: 'df15' });
    assert.deepEqual(errors, []);
    const at = code.indexOf('ref: "stageEl"');
    assert.ok(at > 0);
    const props = code.slice(at, code.indexOf('}', at));
    assert.match(props, /onWheel: .*_ctx\.onStageWheel\(/);
    assert.doesNotMatch(props, /onWheelPassive/);
    assert.match(props, /onPointermove: .*_ctx\.onStageMove\(/);
    assert.match(props, /onPointerleave: .*_ctx\.onStageLeave\(/);
});

test('the wheel only zooms the large map; the small map lets the dossier scroll', () => {
    assert.match(script, /function onStageWheel\(event: WheelEvent\): void \{\s+if \(!large\.value\) return;\s+event\.preventDefault\(\);/);
});

test('the size observer follows a rebuilt stage', () => {
    assert.match(script, /watch\(\[figureEl, stageEl\], observeSize, \{ flush: 'post' \}\);/);
    assert.match(script, /function observeSize\(\): void \{\s+if \(!resizeObs\) return;\s+resizeObs\.disconnect\(\);\s+if \(figureEl\.value\) resizeObs\.observe\(figureEl\.value\);\s+if \(stageEl\.value\) resizeObs\.observe\(stageEl\.value\);/);
});
