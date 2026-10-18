import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
    defaultExpiryDays,
    expiryIso,
    hashToken,
    liveTokenLimit,
    mintToken,
    resetTokenLimits,
    scopesOf,
    tokenReadLimited,
    tokenSubmitLimited,
    tokenUsable,
} from '../../apps/api/src/auth/token_codec.ts';

test('a minted token is tv_pat_ plus 43 characters, and the prefix is the first 12', () => {
    const minted = mintToken();
    assert.match(minted.token, /^tv_pat_[A-Za-z0-9_-]{43}$/);
    assert.equal(minted.prefix, minted.token.slice(0, 12));
    assert.equal(minted.prefix.length, 12);
});

test('the hash is SHA-256 hex and an expired or revoked row is not usable', async () => {
    const token = 'tv_pat_example';
    const expected = createHash('sha256').update(token).digest('hex');
    assert.equal(await hashToken(token), expected);
    const now = Date.parse('2026-10-17T00:00:00.000Z');
    assert.equal(tokenUsable({ expires_at: '2026-12-01T00:00:00.000Z', revoked_at: null }, now), true);
    assert.equal(tokenUsable({ expires_at: '2020-01-01T00:00:00.000Z', revoked_at: null }, now), false);
    assert.equal(tokenUsable({ expires_at: '2026-12-01T00:00:00.000Z', revoked_at: '2026-10-01T00:00:00.000Z' }, now), false);
    assert.equal(defaultExpiryDays(), 90);
    assert.equal(liveTokenLimit(), 10);
    assert.equal(expiryIso(90, now), new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString());
});

test('scopes keep only the two phase-1 names', () => {
    assert.deepEqual(scopesOf('["campaign:read","proposals:write","characters:read"]'), ['campaign:read', 'proposals:write']);
    assert.deepEqual(scopesOf('nope'), []);
});

test('a token spends 120 reads and 10 submits a minute, then stops', () => {
    resetTokenLimits();
    const id = 'at_limit';
    for (let i = 0; i < 120; i += 1) assert.equal(tokenReadLimited(id), false);
    assert.equal(tokenReadLimited(id), true);
    for (let i = 0; i < 10; i += 1) assert.equal(tokenSubmitLimited(id), false);
    assert.equal(tokenSubmitLimited(id), true);
    resetTokenLimits();
});
