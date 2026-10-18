import assert from 'node:assert/strict';
import test from 'node:test';
import { loggedRoute, requestLog } from '../../apps/api/src/http.ts';

test('join and claim tokens are not the logged route', () => {
    assert.equal(loggedRoute('/join/abc123secret'), '/join/<token>');
    assert.equal(loggedRoute('/claim/abc123secret'), '/claim/<token>');
    assert.equal(loggedRoute('/join'), '/join/<token>');
    assert.equal(loggedRoute('/claim'), '/claim/<token>');
    assert.equal(loggedRoute('/api/universes/uni_1/campaign'), '/api/universes/uni_1/campaign');
});

test('a token request log names via and tokenId and not the secret', () => {
    const secret = `tv_pat_${'a'.repeat(43)}`;
    const line = requestLog({
        requestId: 'req-1',
        route: '/api/agent/campaigns',
        userId: 'user-1',
        via: 'token',
        tokenId: 'at_1',
        status: 200,
        duration: 4,
    });
    const parsed = JSON.parse(line);
    assert.deepEqual(Object.keys(parsed), ['requestId', 'route', 'userId', 'universeId', 'via', 'tokenId', 'status', 'duration']);
    assert.equal(parsed.via, 'token');
    assert.equal(parsed.tokenId, 'at_1');
    assert.equal(parsed.universeId, null);
    assert.equal(line.includes(secret), false);
    assert.equal(line.includes('authorization'), false);
    assert.equal(line.includes('Bearer'), false);
});
