/**
 * Below 600 px the pane is a bottom sheet and Back walks the panes opened
 * in this tab. The side pane above 600 px is unchanged.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { centreAbove, toScreen } from '../../apps/web/src/map/camera.ts';
import { backTo, canPaneBack, notePane, resetPaneBack } from '../../apps/web/src/shell/pane_back.ts';

const panel = fs.readFileSync(new URL('../../apps/web/src/shell/Panel.vue', import.meta.url), 'utf8');

test('a world point under the sheet moves to the centre of the space above it', () => {
    const vp = { width: 520, height: 900 };
    const cam = { x: 10, y: 20, ppp: 40 };
    const sheet = 450;
    // The point sits at the viewport centre, which is the sheet's top edge.
    const under = toScreen(cam, vp, cam.x, cam.y);
    assert.equal(under.sy, 450);
    const next = centreAbove(cam, vp, cam.x, cam.y, sheet);
    const placed = toScreen(next, vp, cam.x, cam.y);
    assert.equal(placed.sx, 260);
    assert.equal(placed.sy, 225);
    assert.equal(next.ppp, cam.ppp);
    // No sheet: the point stays at the viewport centre.
    const full = centreAbove(cam, vp, cam.x, cam.y, 0);
    assert.equal(toScreen(full, vp, cam.x, cam.y).sy, 450);
});

test('Back returns to the earlier pane, and the first pane has none', () => {
    resetPaneBack();
    const regina = '/s/Spinward_Marches/1910';
    const sector = '/s/Spinward_Marches';
    notePane(regina, {});
    assert.equal(canPaneBack.value, false);
    assert.equal(backTo(), null);
    notePane(sector, {});
    notePane(sector, { x: '1', y: '2', z: '3' });
    notePane(sector, { panel: 'journal' });
    assert.equal(canPaneBack.value, true);
    const sectorAgain = backTo();
    assert.equal(sectorAgain.path, sector);
    assert.equal(sectorAgain.query.panel, undefined);
    notePane(sectorAgain.path, sectorAgain.query);
    const first = backTo();
    assert.equal(first.path, regina);
    notePane(first.path, first.query);
    assert.equal(canPaneBack.value, false);
    notePane(regina, { panel: 'closed' });
    assert.equal(canPaneBack.value, false);
    assert.equal(backTo(), null);
});

test('on a phone the sheet starts at the rail, clear of the world name', () => {
    const block = panel.slice(panel.indexOf('@media (max-width: 599px)'));
    const rule = block.slice(block.indexOf('.panel {'), block.indexOf('.panel.is-open'));
    assert.match(rule, /left: var\(--rail-width\);/);
    assert.doesNotMatch(rule, /left:\s*0/);
});

test('the sheet is only below 600 px, and Back sits left of Close', () => {
    assert.match(panel, /max-width: 599px/);
    assert.match(panel, /class="panel-grab"/);
    assert.match(panel, /aria-label="Resize sheet"/);
    assert.match(panel, /v-if="canPaneBack"/);
    assert.match(panel, /class="panel-back"/);
    assert.match(panel, /aria-label="Back"/);
    assert.match(panel, /name="chevron-left" :size="18"/);
    assert.match(panel, /class="panel-close"/);
    assert.match(panel, /\.app \.stardate/);
    const back = panel.indexOf('class="panel-back"');
    const close = panel.indexOf('class="panel-close"');
    assert.ok(back > 0 && back < close);
});
