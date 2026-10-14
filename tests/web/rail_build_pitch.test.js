/**
 * The rail's switched-off Build item tells the sign-in card it was opened from Build.
 * Campaign clears that. The pop-up clears it on close (Lane D).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { signInFrom } from '../../apps/web/src/workspace/account.ts';

const source = fs.readFileSync(new URL('../../apps/web/src/shell/Rail.vue', import.meta.url), 'utf8');

function loadOnLocked() {
    const start = source.indexOf('function onLocked');
    const end = source.indexOf('/** A tooltip');
    const text = source.slice(start, end).replace(/\(which:[^)]*\)/, '(which)').replace(/\): void/, ')');
    const lockFocus = { value: '' };
    const expanded = { value: false };
    const props = { accountOpen: true };
    const ran = [];
    const fn = new Function('signInFrom', 'lockFocus', 'expanded', 'props', 'run', `${text}\nreturn onLocked;`);
    return fn(signInFrom, lockFocus, expanded, props, (id) => { ran.push(id); });
}

test('choosing the switched-off Build item sets where the card was opened, and Campaign clears it', () => {
    const before = signInFrom.value;
    const onLocked = loadOnLocked();
    assert.match(source, /lockedGuest \? onLocked\('build'\) : run\('build'\)/);
    assert.match(source, /lockedGuest \? onLocked\('campaign'\) : run\('campaign'\)/);
    assert.match(source, /signInFrom\.value = which === 'build' \? 'build' : null;\s*if \(!props\.accountOpen\) run\('account'\);/);
    onLocked('build');
    assert.equal(signInFrom.value, 'build');
    onLocked('campaign');
    assert.equal(signInFrom.value, null);
    signInFrom.value = before;
});
