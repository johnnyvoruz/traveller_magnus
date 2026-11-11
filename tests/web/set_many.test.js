/**
 * DH9, Set for N hexes: one draft kept per system, empty hexes left alone, the sentence, and pins
 * (the two field ids the editor already knows, no Undo, the pane mounts it for many hexes only).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { heldLine, SET_FIELDS, setButton, setForHexes, setSentence } from '../../apps/web/src/workspace/build/set_many.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');

/** A stand-in draft: records what was set, kept and discarded. `fail` throws on keep; `clash` loses the race. */
function opener(log, { fail = [], clash = [], offline = [] } = {}) {
    return async (key) => {
        if (offline.includes(key)) throw new Error('offline');
        const handle = {
            conflict: { value: null },
            set(id, value) { log.push(['set', key, id, value]); },
            async keep() {
                if (fail.includes(key)) throw new Error('This system could not be built.');
                if (clash.includes(key)) { handle.conflict.value = { rev: 9 }; return null; }
                log.push(['keep', key]);
                return { id: 'u-' + key };
            },
            discard() { log.push(['discard', key]); },
        };
        return handle;
    };
}

test('N keeps: each system is opened, set and kept in turn, in the order given', async () => {
    const log = [];
    const steps = [];
    const keys = ['spin/0101', 'spin/0102', 'spin/0103'];
    const out = await setForHexes(keys, 'chart.allegiance', 'ImDd', opener(log), (n) => steps.push(n));
    assert.deepEqual(out, { done: keys, failed: [] });
    assert.deepEqual(log, [
        ['set', 'spin/0101', 'chart.allegiance', 'ImDd'], ['keep', 'spin/0101'],
        ['set', 'spin/0102', 'chart.allegiance', 'ImDd'], ['keep', 'spin/0102'],
        ['set', 'spin/0103', 'chart.allegiance', 'ImDd'], ['keep', 'spin/0103'],
    ]);
    assert.deepEqual(steps, [1, 2, 3]);
});

test('a refusal, a conflict or no server leaves that hex and goes on', async () => {
    const log = [];
    const keys = ['s/0101', 's/0102', 's/0103', 's/0104'];
    const out = await setForHexes(keys, 'chart.region', 'Sword Worlds', opener(log, { fail: ['s/0101'], clash: ['s/0102'], offline: ['s/0103'] }));
    assert.deepEqual(out.done, ['s/0104']);
    assert.deepEqual(out.failed.map((f) => f.key), ['s/0101', 's/0102', 's/0103']);
    assert.equal(out.failed[0].why, 'This system could not be built.');
    assert.equal(out.failed[1].why, 'Someone else changed this system. Try again.');
    assert.match(out.failed[2].why, /^Cannot reach the server/);
    assert.ok(log.some((l) => l[0] === 'discard' && l[1] === 's/0101'));
    assert.ok(log.some((l) => l[0] === 'discard' && l[1] === 's/0102'));
});

test('the empty hexes: the line, and the button counts systems only', () => {
    assert.equal(heldLine(3, 5), '3 of 5 hexes hold a system');
    assert.equal(heldLine(1, 4), '1 of 4 hexes holds a system');
    assert.equal(heldLine(5, 5), '');
    assert.equal(setButton(3), 'Set for 3 hexes');
    assert.equal(setButton(1), 'Set for 1 hex');
});

test('the one sentence', () => {
    assert.equal(setSentence('Allegiance', { done: ['a', 'b', 'c'], failed: [] }), 'Allegiance set for 3 hexes.');
    assert.equal(setSentence('Region', { done: ['a'], failed: [] }), 'Region set for 1 hex.');
    assert.equal(
        setSentence('Allegiance', { done: ['a', 'b'], failed: [{ key: 'c', why: 'Someone else changed this system. Try again.' }] }),
        'Allegiance set for 2 of 3 hexes. One was not changed: Someone else changed this system. Try again.',
    );
    assert.equal(
        setSentence('Allegiance', { done: ['a'], failed: [{ key: 'b', why: 'No.' }, { key: 'c', why: 'No.' }] }),
        'Allegiance set for 1 of 3 hexes. 2 were not changed: No.',
    );
    assert.equal(setSentence('Region', { done: [], failed: [{ key: 'a', why: 'No.' }, { key: 'b', why: 'No.' }] }), 'Region was not set. No.');
});

test('pins: the editor’s own field ids, systems only, no Undo, many hexes only', () => {
    assert.deepEqual(SET_FIELDS.map((f) => f.id), ['chart.allegiance', 'chart.region']);
    const form = fs.readFileSync(path.join(here, '../../packages/generation/src/form.ts'), 'utf8');
    for (const f of SET_FIELDS) assert.ok(form.includes("field('" + f.id + "', '" + f.label + "'"), f.id);
    const view = src('workspace/build/SetMany.vue');
    assert.match(view, /\[\.\.\.count\.chart, \.\.\.count\.yours\]/);
    assert.doesNotMatch(view, /runUndo|offerUndo|action:/);
    assert.ok(view.includes('showToast(setSentence(label, outcome));'));
    for (const id of view.match(/'chart\.[a-zA-Z.]+'/g) ?? []) assert.ok(SET_FIELDS.some((f) => "'" + f.id + "'" === id), 'a new field name: ' + id);
    assert.match(view, /v-for="field in SET_FIELDS"/);
    const pane = src('workspace/build/BuildPane.vue');
    assert.match(pane, /<SetMany v-if="mode === 'many' && filled > 0" :keys="keys" :busy="busy" \/>/);
});
