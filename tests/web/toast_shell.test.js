/**
 * The toast strip is mounted once, in the app shell. A toast can show that work is
 * running, and an action can leave its toast open. The busy words are said once.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { clearToasts, nextBusyAnnouncement, orbitToastBox, readPx, runToastAction, showToast, toasts } from '../../apps/web/src/shell/toast.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function source(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('a toast is quiet unless busy is set, and an action closes unless close is false', () => {
    clearToasts();
    showToast('Saved.');
    assert.equal(toasts[0].busy, false);
    assert.equal(toasts[0].action, null);

    let ran = 0;
    showToast('Generating.', {
        busy: true,
        action: { label: 'Stop', close: false, run: () => { ran += 1; } },
    });
    assert.equal(toasts.length, 2);
    assert.equal(toasts[1].busy, true);
    assert.equal(toasts[1].action.close, false);
    runToastAction(toasts[1]);
    assert.equal(ran, 1);
    assert.equal(toasts.length, 2, 'close: false leaves the toast up');

    clearToasts();
    showToast('Removed.', { action: { label: 'Undo', run: () => { ran += 1; } } });
    runToastAction(toasts[0]);
    assert.equal(ran, 2);
    assert.equal(toasts.length, 0, 'an action with no close flag still closes the toast');

    showToast('Kept.', { action: { label: 'Undo', close: true, run: () => { ran += 1; } } });
    runToastAction(toasts[0]);
    assert.equal(toasts.length, 0);
    clearToasts();
});

test('a busy toast is announced once, not when its count changes', () => {
    const seen = new Set();
    const job = { id: 4, busy: true, message: 'Generating 80 hexes · 12 of 80' };
    assert.equal(nextBusyAnnouncement([job], seen), job.message);
    job.message = 'Generating 80 hexes · 13 of 80';
    assert.equal(nextBusyAnnouncement([job], seen), null);
    assert.equal(nextBusyAnnouncement([{ id: 5, busy: false, message: 'Done.' }], seen), null);
    assert.equal(nextBusyAnnouncement([], seen), null);
    assert.equal(nextBusyAnnouncement([job], seen), job.message, 'a toast that left and came back is said again');
});

test('the orbit corner is the picture\'s upper right', () => {
    assert.equal(readPx(''), 0);
    assert.equal(readPx('12px'), 12);
    const placed = orbitToastBox({ top: 80, right: 900, width: 640, height: 500 }, 0, 40, 1000);
    assert.deepEqual(placed, { top: 138, right: 118, maxWidth: 460 });
    const low = orbitToastBox({ top: 0, right: 400, width: 200, height: 220 }, 100, 0, 400);
    assert.equal(low.top, 20);
    assert.equal(low.maxWidth, 164);
});

test('the strip is mounted once, draws its own ring, and keeps a busy toast quiet', () => {
    const app = source('apps/web/src/App.vue');
    const map = source('apps/web/src/views/MapView.vue');
    const orbit = source('apps/web/src/views/OrbitView.vue');
    const strip = source('apps/web/src/shell/ToastStrip.vue');

    assert.equal((app.match(/<ToastStrip\b/g) || []).length, 1);
    assert.equal((map.match(/ToastStrip/g) || []).length, 0);
    assert.equal((orbit.match(/ToastStrip/g) || []).length, 0);
    assert.equal((strip.match(/<ToastStrip\b/g) || []).length, 0);

    assert.match(strip, /v-if="toast\.busy"/);
    assert.match(strip, /class="toast-spin"/);
    assert.doesNotMatch(strip, /import\s.*BuildSpin/);
    assert.match(strip, /runToastAction\(toast\)/);
    assert.match(strip, /role="status"/);
    assert.match(strip, /:role="toast\.busy \? undefined : 'status'"/);
    assert.match(strip, /nextBusyAnnouncement\(toasts, announced\)/);
    assert.match(strip, /prefers-reduced-motion: reduce/);
    // The ring is the app's one spinner (Lane D, prompts/d_density_sheet.md part 2), which stands still under reduced motion.
    assert.match(strip, /import Spinner from '\.\.\/design\/Spinner\.vue'/);
    assert.match(source('apps/web/src/design/Spinner.vue'), /prefers-reduced-motion: reduce\) \{\s*\.ui-spin-arc \{\s*animation: none;/);
    assert.match(strip, /\.app:has\(\.map\) \.toasts/);
    assert.match(strip, /\.app:not\(:has\(\.map\)\):not\(:has\(\.orbit\)\) \.toasts/);
});
