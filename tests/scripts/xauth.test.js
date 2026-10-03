import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeDevVars, quoteDevVar, readDevVar, unquoteDevVar } from '../../scripts/xauth.js';

const PRIOR = [
    '# Local secrets. OAuth is unset on purpose.',
    '# DISCORD_CLIENT_ID=',
    'DISCORD_CLIENT_SECRET="keep-me"',
    'SESSION_SECRET=plain',
    '# X_CONSUMER_KEY=',
    '',
].join('\n');

test('mergeDevVars replaces X keys and keeps other secrets', () => {
    const next = mergeDevVars(PRIOR, {
        X_CONSUMER_KEY: 'ck',
        X_CONSUMER_SECRET: 'sec"ret',
        X_BEARER_TOKEN: 'bearer\nline',
    });
    assert.match(next, /DISCORD_CLIENT_SECRET="keep-me"/);
    assert.match(next, /SESSION_SECRET=plain/);
    assert.equal(next.includes('# DISCORD_CLIENT_ID='), true);
    assert.equal(next.includes('# X_CONSUMER_KEY='), false);
    assert.equal(readDevVar(next, 'X_CONSUMER_KEY'), 'ck');
    assert.equal(readDevVar(next, 'X_CONSUMER_SECRET'), 'sec"ret');
    assert.equal(readDevVar(next, 'X_BEARER_TOKEN'), 'bearer\nline');
    assert.equal(readDevVar(next, 'DISCORD_CLIENT_SECRET'), 'keep-me');
    assert.equal(readDevVar(next, 'SESSION_SECRET'), 'plain');
    assert.equal(readDevVar(next, 'DISCORD_CLIENT_ID'), '');
});

test('quoteDevVar round-trips quotes and newlines', () => {
    const raw = 'a\\b"c\r\n';
    assert.equal(unquoteDevVar(quoteDevVar(raw)), raw);
});
