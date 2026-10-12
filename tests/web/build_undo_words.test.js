/**
 * What an Undo did, said truthfully (apps/web/src/workspace/build/undo_words.ts;
 * findings/builder_undo_faults.md): a refusal in the server's words with Undo offered again, a job
 * that left changed hexes named once, and nothing said when everything was put back.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOutcome, leftWords, nameList, runUndo, sayUndo, undoLeft } from '../../apps/web/src/workspace/build/undo_words.ts';
import { useBuildStore } from '../../apps/web/src/workspace/build/seam.ts';
import { clearToasts, dismissToast, toasts } from '../../apps/web/src/shell/toast.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const name = (key) => ({ 'A/0101': 'Kora', 'A/0102': 'Hebburn', 'A/0103': 'Kabelac', 'A/0104': 'Sethos', 'A/0105': 'Andhaka', 'A/0106': 'Angrilli' })[key] ?? key.slice(-4);

test('names read as a list: one, two, three, and capped with "and K more"', () => {
    assert.equal(nameList(['Kora']), 'Kora');
    assert.equal(nameList(['Kora', 'Hebburn']), 'Kora and Hebburn');
    assert.equal(nameList(['Kora', 'Hebburn', 'Kabelac']), 'Kora, Hebburn, and Kabelac');
    assert.equal(nameList(['Kora', 'Hebburn', 'Kabelac', 'Sethos', 'Andhaka', 'Angrilli']), 'Kora, Hebburn, Kabelac, Sethos, and 2 more');
});

test('the sentence for one left, for many, and when nothing was put back', () => {
    assert.equal(leftWords(1, ['Kora']), 'Undo put back 1 system. 1 system had changed, so it was left as it is: Kora.');
    assert.equal(leftWords(5, ['Kora', 'Hebburn']), 'Undo put back 5 systems. 2 systems had changed, so they were left as they are: Kora and Hebburn.');
    assert.equal(leftWords(0, ['Kora']), 'Undo didn’t put anything back. 1 system had changed, so it was left as it is: Kora.');
});

test('a report is told from a Restore token by `left`', () => {
    assert.equal(isOutcome({ id: 'x', restored: 0, left: [], message: 'No.' }), true);
    assert.equal(isOutcome({ id: 'x' }), false);
    assert.equal(isOutcome(null), false);
});

test('a refused Undo says the server’s sentence and offers Undo again; nothing is marked', () => {
    clearToasts();
    let again = 0;
    const out = sayUndo({ id: 't', restored: 0, left: ['A/0101'], message: 'This hex changed. Reload it, then try again.' }, { again: () => { again += 1; }, name });
    assert.equal(out, null);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].message, 'This hex changed. Reload it, then try again.');
    assert.equal(toasts[0].action.label, 'Undo');
    toasts[0].action.run();
    assert.equal(again, 1);
    assert.deepEqual(undoLeft.keys, []);
    clearToasts();
});

test('a job’s partial Undo: one toast naming the left hexes, no Undo, and the hexes marked while it shows', async () => {
    clearToasts();
    sayUndo({ id: 'job', restored: 3, left: ['A/0101', 'A/0102'], message: '' }, { again: () => assert.fail('a spent token is not offered again'), name });
    assert.deepEqual(toasts.map((item) => item.message), ['Undo put back 3 systems. 2 systems had changed, so they were left as they are: Kora and Hebburn.']);
    assert.equal(toasts[0].action, null);
    assert.deepEqual(undoLeft.keys, ['A/0101', 'A/0102']);
    dismissToast(toasts[0].id);
    await tick();
    assert.deepEqual(undoLeft.keys, []);
});

test('nothing is said when everything was put back; a Restore token is handed back', () => {
    clearToasts();
    assert.equal(sayUndo(null, { again: () => {}, name }), null);
    assert.deepEqual(sayUndo({ id: 'restore' }, { again: () => {}, name }), { id: 'restore' });
    assert.equal(toasts.length, 0);
});

test('runUndo asks the store once and says what it answered; a failure is said in its words', async () => {
    clearToasts();
    const asked = [];
    let answer = { id: 'one', restored: 0, left: ['A/0101'], message: 'This hex changed. Reload it, then try again.' };
    useBuildStore({
        tick: () => 0,
        row: () => null,
        undo: async (token) => { asked.push(token.id); if (answer instanceof Error) throw answer; return answer; },
    });
    await runUndo({ id: 'one' }, { again: () => {}, name });
    assert.deepEqual(asked, ['one']);
    assert.equal(toasts[toasts.length - 1].message, 'This hex changed. Reload it, then try again.');
    answer = new Error('Already undone.');
    await runUndo({ id: 'one' }, { again: () => {}, name });
    assert.equal(toasts[toasts.length - 1].message, 'Already undone.');
    useBuildStore(null);
    clearToasts();
});
