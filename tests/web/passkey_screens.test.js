/**
 * The passkey screens' words and readings (apps/web/src/workspace/passkey/words.ts;
 * prompts/d_passkey_screens.md; findings/passkey_screens_design.md): the username checked as
 * typed, the last way in, the codes file, where a recovery session (session.gate) sends a route,
 * and no email anywhere in the copy.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { session } from '../../apps/web/src/account/session.ts';
import * as words from '../../apps/web/src/workspace/passkey/words.ts';

const { atUsername, codesFile, heldCodes, lastPasskey, lastProvider, providerName, recoveryRedirect, takeCodes, unusedWords, usernameProblem } = words;

test('the username: the contract rule, checked as typed', () => {
    assert.equal(usernameProblem(''), '');
    assert.equal(usernameProblem('ok_name1'), '');
    assert.equal(usernameProblem('a b'), 'Use 3 to 24 letters, digits, or underscores.');
    assert.equal(usernameProblem('dash-name'), 'Use 3 to 24 letters, digits, or underscores.');
    assert.equal(usernameProblem('x'.repeat(25)), 'Use 3 to 24 letters, digits, or underscores.');
    assert.equal(usernameProblem('x'.repeat(24)), '');
    // Too short is not refused while the person is still typing.
    assert.equal(usernameProblem('ab', true), '');
    assert.equal(usernameProblem('ab'), 'Use 3 to 24 letters, digits, or underscores.');
    for (const name of ['admin', 'API', 'Support', 'user']) assert.equal(usernameProblem(name), 'That username is reserved.');
    assert.equal(usernameProblem('users'), '');
});

test('the server refusals that belong at the username field', () => {
    assert.ok(atUsername('username_taken'));
    assert.ok(atUsername('username_reserved'));
    assert.ok(atUsername('username_invalid'));
    assert.ok(!atUsername('signup_limit'));
});

test('the last way in: one passkey and no provider, or one provider and no passkey', () => {
    assert.equal(lastPasskey(1, 0), true);
    assert.equal(lastPasskey(1, 1), false);
    assert.equal(lastPasskey(2, 0), false);
    assert.equal(lastProvider(0, 1), true);
    assert.equal(lastProvider(1, 1), false);
    assert.equal(lastProvider(0, 2), false);
});

test('the codes left, as a sentence', () => {
    assert.equal(unusedWords(10), '10 of 10 recovery codes are unused.');
    assert.equal(unusedWords(1), '1 of 10 recovery codes is unused.');
    assert.match(unusedWords(0), /^You have no unused recovery codes\./);
});

test('the codes file: the username, the codes, what they are for, the lost-means-lost sentence', () => {
    const codes = Array.from({ length: 10 }, (_, i) => 'AAAA-BBBB-CC' + String(i).padStart(2, '0'));
    const text = codesFile('ranger', codes, new Date('2026-10-12T12:00:00Z'));
    assert.match(text, /^Traveller\.voyage recovery codes\nUsername: ranger\nMade: 12 October 2026\n\n/);
    for (const code of codes) assert.ok(text.includes(code + '\n'));
    assert.ok(text.includes(words.LOST_MEANS_LOST));
    assert.ok(!/@|email|e-mail/i.test(text));
    assert.ok(!codesFile('', codes).includes('Username:'));
});

test('the codes go from the card to the page in memory, once', () => {
    heldCodes.value = { username: 'ranger', codes: ['A'] };
    assert.deepEqual(takeCodes(), { username: 'ranger', codes: ['A'] });
    assert.equal(takeCodes(), null);
    assert.equal(heldCodes.value, null);
});

test('a recovery session: every other route goes to /account, and the open route leaves at once', async () => {
    const guards = [];
    const replaced = [];
    const router = { beforeEach: (fn) => { guards.push(fn); }, replace: (p) => { replaced.push(p); return Promise.resolve(); }, currentRoute: { value: { path: '/packages' } } };
    session.gate = 'open';
    assert.equal(recoveryRedirect('/'), null);
    words.guardRecovery(router);
    words.guardRecovery(router);
    assert.equal(guards.length, 1, 'one guard a router');
    assert.deepEqual(replaced, []);
    // The gate goes up (a redeem, or GET /api/me answering passkey_required after a reload).
    session.gate = 'recovery';
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(replaced, ['/account'], 'the open route is left');
    assert.equal(guards[0]({ path: '/s/spin/1910' }), '/account');
    assert.equal(guards[0]({ path: '/account' }), undefined);
    session.gate = 'open';
    assert.equal(guards[0]({ path: '/s/spin/1910' }), undefined);
    session.gate = 'signed-out';
});

test('a closed prompt and no WebAuthn have their own words, with no alarm', () => {
    assert.equal(words.PASSKEY_CLOSED, 'You closed the passkey prompt.');
    assert.equal(words.NO_WEBAUTHN_PROVIDERS, 'This browser cannot use passkeys. Sign in with another account instead.');
    assert.equal(words.NO_WEBAUTHN_ALONE, 'This browser cannot use passkeys. Open this page in a browser that can.');
});

test('when a passkey was added, in the house form for a real date; unreadable says nothing', () => {
    // Local midday, so the day is the same in every time zone the test runs in.
    const noon = new Date(2026, 9, 12, 12, 0, 0).toISOString();
    assert.equal(words.addedOn(noon), 'Added 2026-10-12');
    assert.equal(words.addedOn(new Date(2026, 0, 5, 12).toISOString()), 'Added 2026-01-05');
    assert.equal(words.addedOn('not a date'), '');
    assert.equal(words.addedOn(null), '');
});

test('linking a provider is linkProvider from Lane A, returning to /account; the stand-in is gone', () => {
    const page = readFileSync(new URL('../../apps/web/src/workspace/passkey/AccountPage.vue', import.meta.url), 'utf8');
    assert.match(page, /await linkProvider\(id, '\/account'\)/);
    assert.ok(!page.includes('link.ts') && !page.includes('linkSocial'));
    assert.ok(!existsSync(new URL('../../apps/web/src/workspace/passkey/link.ts', import.meta.url)));
});

test('the return address: where sign-in was opened, never /account itself, else the home view', async () => {
    const { noteReturn, returnPath } = await import('../../apps/web/src/workspace/passkey/recovery.ts');
    assert.equal(returnPath(), '/', 'unknown is the home view');
    noteReturn('/account');
    assert.equal(returnPath(), '/', '/account is not a place to return to');
    noteReturn('/s/Spinward_Marches/1910?panel=dossier');
    assert.equal(returnPath(), '/s/Spinward_Marches/1910?panel=dossier');
    noteReturn('/account?x=1');
    assert.equal(returnPath(), '/s/Spinward_Marches/1910?panel=dossier', 'opening the account page again keeps the address');
});

test('the providers by their own names; twitter is X', () => {
    assert.equal(providerName('twitter'), 'X');
    assert.equal(providerName('discord'), 'Discord');
    assert.equal(providerName('google'), 'Google');
});

test('no screen names an email address; the explainer is said as Johnny asked', () => {
    const files = [
        'apps/web/src/workspace/passkey/SignInBody.vue',
        'apps/web/src/workspace/passkey/AccountPage.vue',
        'apps/web/src/workspace/passkey/RecoveryScreen.vue',
        'apps/web/src/workspace/passkey/CodesBlock.vue',
        'apps/web/src/workspace/passkey/PasskeyAdd.vue',
    ];
    for (const file of files) {
        const template = readFileSync(new URL('../../' + file, import.meta.url), 'utf8').split('<template>')[1] || '';
        assert.ok(!/email|e-mail/i.test(template), file + ' shows no email');
    }
    assert.equal(words.PASSKEY_EXPLAIN, 'A passkey signs you in with your fingerprint, face, or device PIN. There is no password.');
});

test('the sign-in card: Create an account on top and filled, the providers, then the passkey Sign in and the lost link', () => {
    const file = readFileSync(new URL('../../apps/web/src/workspace/passkey/SignInBody.vue', import.meta.url), 'utf8');
    const template = file.split('<template>')[1] || '';
    assert.equal(words.CREATE_ACCOUNT, 'Create an account');
    assert.equal(words.SIGN_IN_PASSKEY, 'Sign in');
    const at = (text) => {
        const i = template.indexOf(text);
        assert.ok(i >= 0, text + ' is on the card');
        return i;
    };
    // The order on the page is the Tab order: nothing on the card sets a tabindex.
    const order = [at('data-signin="create"'), at('OTHER_ACCOUNTS'), at('v-for="(provider, index) in offered"'), at('data-signin="passkey"'), at('data-signin="lost"')];
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'create, the providers, the passkey, the lost link');
    assert.ok(!/tabindex/.test(template));
    const button = (mark) => {
        const i = template.indexOf(mark);
        return template.slice(template.lastIndexOf('<button', i), template.indexOf('>', i));
    };
    assert.match(button('data-signin="create"'), /is-primary/, 'Create an account is the filled button');
    assert.doesNotMatch(button('data-signin="passkey"'), /is-primary/, 'the passkey Sign in is a plain button');
    // Nothing stands between the passkey button and "I lost my passkey".
    const between = template.slice(template.indexOf('</button>', at('data-signin="passkey"')) + 9, template.lastIndexOf('<button', at('data-signin="lost"')));
    assert.equal(between.trim(), '');
    // The fingerprint sentence is off the card; the account page still says it.
    assert.ok(!file.includes('PASSKEY_EXPLAIN'));
    // Focus on opening lands on the top button; without passkeys that is the first provider, still the filled one.
    assert.match(file, /focus: \(\) => \{ const top = createEl\.value \|\| first\.value;/);
    assert.match(template, /'is-primary': index === 0 && !canPasskey/);
    assert.match(template, /<p v-else class="signin-note" role="status">\{\{ noPasskeySay \}\}<\/p>/);
});
