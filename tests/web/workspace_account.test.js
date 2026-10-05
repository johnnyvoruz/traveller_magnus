/**
 * The account pop-up's readings (apps/web/src/workspace/account.ts): the name shown, the line
 * under it, and the initials on the rail's button.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    SIGN_IN_FINE, SIGN_IN_FREE, SIGN_IN_LABEL, SIGN_IN_PITCH, accountLine, displayName, initials,
} from '../../apps/web/src/workspace/account.ts';

const user = (over = {}) => ({ id: 'u1', email: null, role: 'user', profile: null, ...over });

test('the name is the display name, else the handle, else the e-mail', () => {
    assert.equal(displayName(user({ profile: { handle: 'jvoruz', displayName: 'Johnny Voruz' } })), 'Johnny Voruz');
    assert.equal(displayName(user({ profile: { handle: 'jvoruz', displayName: '  ' } })), 'jvoruz');
    assert.equal(displayName(user({ profile: { handle: 'jvoruz', displayName: null } })), 'jvoruz');
    assert.equal(displayName(user({ email: 'j@example.com' })), 'j@example.com');
    assert.equal(displayName(user()), 'Signed in');
    assert.equal(displayName(null), '');
});

test('the line under the name is the handle with its @, and never repeats the name', () => {
    assert.equal(accountLine(user({ profile: { handle: 'jvoruz', displayName: 'Johnny Voruz' } })), '@jvoruz');
    assert.equal(accountLine(user({ profile: { handle: '@jvoruz', displayName: 'Johnny' } })), '@jvoruz');
    assert.equal(accountLine(user({ email: 'j@example.com', profile: { displayName: 'Johnny' } })), 'j@example.com');
    assert.equal(accountLine(user({ email: 'j@example.com' })), '', 'the e-mail is already the name');
    assert.equal(accountLine(user()), '');
    assert.equal(accountLine(null), '');
});

test('the initials are the first letters of the first two words', () => {
    assert.equal(initials(user({ profile: { displayName: 'Johnny Voruz' } })), 'JV');
    assert.equal(initials(user({ profile: { displayName: 'johnny de la voruz' } })), 'JD');
    assert.equal(initials(user({ profile: { handle: 'jvoruz' } })), 'J');
    assert.equal(initials(user({ profile: { handle: 'far_margin' } })), 'FM');
    assert.equal(initials(user({ profile: { displayName: 'Ældric Ørn' } })), 'ÆØ');
    assert.equal(initials(user({ profile: { displayName: '"Dusty" Rhodes' } })), 'DR');
    assert.equal(initials(user({ email: 'j@example.com' })), 'J');
    assert.equal(initials(user()), 'SI');
    assert.equal(initials(null), '');
});

test('the words: one provider, and the viewer needs no account', () => {
    assert.equal(SIGN_IN_LABEL, 'Sign in with X');
    assert.match(SIGN_IN_PITCH, /private campaign/);
    assert.match(SIGN_IN_FREE, /without an account/);
    assert.match(SIGN_IN_FINE, /Nothing you add changes the map/);
});
