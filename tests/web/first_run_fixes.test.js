/**
 * The first ten minutes (prompts/d_first_run_fixes.md; findings/first_run_review.md findings
 * 1, 5, 6, 7, 8, 16): where a bare address opens, the line of help, where Clear leaves the map,
 * Build's first step, and copy that names what is on screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FIRST_HINT, FIRST_PLACE, FIRST_WORLD, firstNear, hintShown, openingFor, parseView, viewText } from '../../apps/web/src/workspace/first_visit.ts';
import { afterClear } from '../../apps/web/src/workspace/build/clear.ts';
import { firstStep, stripLine } from '../../apps/web/src/workspace/build/state.ts';
import { blankUndone } from '../../apps/web/src/workspace/build/undo_words.ts';
import { targetFor } from '../../apps/web/src/map/routes.ts';
import { toGlobal, hexCentre } from '../../apps/web/src/map/geometry.ts';
import { addressPane } from '../../apps/web/src/shell/pane.ts';

const read = (file) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');

test('a first visit is a browser with no stored view; an address or a camera in it always wins', () => {
    const stored = { x: 1, y: 2, ppp: 30 };
    assert.equal(openingFor({ named: false, linked: false, stored: null }), 'first');
    assert.equal(openingFor({ named: false, linked: false, stored }), 'last');
    assert.equal(openingFor({ named: true, linked: false, stored }), 'address');
    assert.equal(openingFor({ named: false, linked: true, stored: null }), 'address');
});

test('the stored view reads back; anything else is no view', () => {
    assert.deepEqual(parseView(viewText({ x: -12.3456, y: 7, ppp: 63.75 })), { x: -12.346, y: 7, ppp: 63.75 });
    for (const bad of [null, undefined, '', '1,2', '1,2,3,4', 'a,b,c', '1,,3', '1,2,0', '1,2,-4', '1,2,NaN']) assert.equal(parseView(bad), null, String(bad));
    // A zoom outside the camera's range is brought inside it, not trusted.
    assert.ok(parseView('0,0,100000').ppp < 100000);
});

test('the first place is the subsector that holds Regina (Spinward Marches 1910), framed whole', () => {
    const chart = { sectors: [{ slug: 'Spinward_Marches', x: -4, y: -1, tags: ['OTU'] }] };
    const target = targetFor({ path: FIRST_PLACE }, chart);
    assert.equal(target.kind, 'fit');
    const at = toGlobal(-4, -1, 19, 10);
    const regina = hexCentre(at.q, at.r);
    assert.ok(regina.x > target.rect.x0 && regina.x < target.rect.x1 && regina.y > target.rect.y0 && regina.y < target.rect.y1, 'Regina is in view');
    // A chart without the sector has no first place: the view falls back to the home view.
    assert.equal(targetFor({ path: FIRST_PLACE }, { sectors: [] }).kind, 'unknown');
});

test('a narrow window opens on Regina itself, at the zoom where names show', () => {
    const chart = { sectors: [{ slug: 'Spinward_Marches', x: -4, y: -1, tags: ['OTU'] }] };
    const world = targetFor({ path: FIRST_WORLD }, chart);
    assert.equal(world.kind, 'camera');
    // The subsector framed whole reads: nothing changes.
    assert.equal(firstNear(75.3, world.camera), null);
    assert.equal(firstNear(63.75, world.camera), null);
    // Framed below the names: Regina, centred, at the names' zoom.
    assert.deepEqual(firstNear(50.2, world.camera), { x: world.camera.x, y: world.camera.y, ppp: 63.75 });
    assert.equal(firstNear(50.2, null), null);
});

test('the line of help: until dismissed or a hex is opened, and never over a pane or Build', () => {
    const open = { done: false, chartReady: true, paneOpen: false, buildOn: false };
    assert.equal(FIRST_HINT, 'Search for a world, or select a hex to read its system.');
    assert.equal(hintShown(open), true);
    for (const key of ['done', 'paneOpen', 'buildOn']) assert.equal(hintShown({ ...open, [key]: true }), false, key);
    assert.equal(hintShown({ ...open, chartReady: false }), false);
});

test('Clear goes back to where the selection was started, with the camera where it is now', () => {
    const now = { path: '/s/Spinward_Marches', query: { panel: 'dossier', x: '5.000', y: '6.000', z: '70.000' } };
    // Started from the map with no pane.
    assert.deepEqual(afterClear({ path: '/', query: { x: '1.000', y: '1.000', z: '60.000' } }, now), { path: '/', query: { x: '5.000', y: '6.000', z: '70.000' } });
    // Started from one hex with its pane open: that hex again.
    assert.deepEqual(afterClear({ path: '/s/Spinward_Marches/1910', query: {} }, now), { path: '/s/Spinward_Marches/1910', query: { x: '5.000', y: '6.000', z: '70.000' } });
    // Not known (the page was loaded on the selection's address): the map, no pane.
    assert.deepEqual(afterClear(null, now), { path: '/', query: { x: '5.000', y: '6.000', z: '70.000' } });
});

test('Clear never leaves a sector or a subsector with its pane open: that pane is the whole sector', () => {
    const now = { path: '/s/Spinward_Marches/sub/C', query: { panel: 'dossier', x: '5.000', y: '6.000', z: '70.000' } };
    for (const path of ['/s/Spinward_Marches', '/s/Spinward_Marches/sub/C']) {
        const to = afterClear({ path, query: { panel: 'dossier' } }, now);
        assert.equal(to.path, path);
        assert.equal(addressPane(to.path, to.query).pane.kind, 'shut');
    }
    for (const before of [null, { path: '/', query: {} }, { path: '/s/Spinward_Marches/1910', query: {} }]) {
        const to = afterClear(before, now);
        const view = addressPane(to.path, to.query).view.kind;
        assert.ok(view !== 'sector' && view !== 'subsector');
    }
});

test('the map view sends Clear and Esc through the one function', () => {
    const view = read('apps/web/src/views/MapView.vue');
    assert.match(view, /@clear="clearSelection\(\)"/);
    assert.ok(!view.includes('@clear="build.selection = []"'));
    assert.match(view, /if \(build\.selection\.length > 1\) \{\s+clearSelection\(\);/);
});

test('Build gives a first step at every zoom: one or two sentences and the one control that starts it', () => {
    assert.deepEqual([firstStep('galaxy').act, firstStep('galaxy').does], ['Go to the Spinward Marches', 'go']);
    assert.deepEqual([firstStep('sector').act, firstStep('sector').does], ['Zoom in', 'zoom']);
    assert.deepEqual([firstStep('hex').act, firstStep('hex').does], ['Select hexes', 'select']);
    for (const tier of ['galaxy', 'sector', 'hex']) {
        const say = firstStep(tier).say;
        assert.ok(say.split('. ').length <= 2, say);
        // It names the pane's button as the pane writes it.
        assert.ok(say.includes('Generate a system'));
    }
    assert.ok(read('apps/web/src/workspace/build/BuildPane.vue').includes("'Generate a system'"));
    assert.ok(read('apps/web/src/workspace/build/BuildStrip.vue').includes('Select hexes<kbd'));
});

test('the map is "your map" wherever Build names it; the name is the universe\'s', () => {
    assert.match(read('apps/web/src/workspace/build/BuildStrip.vue'), /<small>Your map<\/small>\s+<b>\{\{ name \}\}/);
    assert.equal(stripLine('Deneb run', 'v5').title, 'Deneb run is your copy of the published chart, version v5');
    for (const file of ['BuildPane.vue', 'GenerateSheet.vue', 'BuildStrip.vue', 'BuildScope.vue', 'SectorPane.vue', 'DensityAsk.vue']) {
        const template = (read('apps/web/src/workspace/build/' + file).split('<template>')[1] || '').split('<style')[0];
        const words = template.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ');
        assert.ok(!/\buniverse\b/i.test(words), file + ' says "universe" to the person');
    }
});

test('the hand designer names controls that are on screen', () => {
    const designer = read('apps/web/src/workspace/build/HandDesigner.vue');
    assert.ok(designer.includes('To add a star, select Add star.'));
    assert.ok(!designer.includes('select Star.'));
    // The add buttons read "Add " and the kind's word; the bar's button is Discard with changes, Close without.
    assert.match(designer, /Add \{\{ KIND_WORD\[item\.kind\]\.toLowerCase\(\) \}\}/);
    assert.match(designer, /dirty \? 'To undo every change in the draft, select Discard\.' : 'To leave the designer, select Close\.'/);
    assert.match(read('apps/web/src/workspace/build/BuildBar.vue'), /\{\{ dirty \? 'Discard' : 'Close' \}\}/);
});

test('Undo after Blank system says what it did, naming the hex by number', () => {
    assert.equal(blankUndone('Spinward_Marches/1409'), 'Removed the blank system at 1409.');
    assert.match(read('apps/web/src/workspace/build/edit.ts'), /\.then\(\(gone\) => \{ if \(gone\) showToast\(blankUndone\(hexKey\)\); \}\)/);
});
