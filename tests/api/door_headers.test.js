import assert from 'node:assert/strict';
import test from 'node:test';
import { headersForDoor } from '../../apps/api/src/universe/door_headers.ts';

test('a client x-voyage header is dropped and the journal header is set again', () => {
    const client = new Headers({
        'x-voyage-user-id': 'forged-user',
        'x-voyage-worker': 'generate',
        'x-voyage-member': 'forged-member',
        'x-voyage-universe-id': 'forged-universe',
        'x-voyage-journal': 'public',
        'content-type': 'application/json',
    });
    const headers = headersForDoor(client, 'owner-1', 'uni-1');
    assert.equal(headers.get('x-voyage-user-id'), 'owner-1');
    assert.equal(headers.get('x-voyage-universe-id'), 'uni-1');
    assert.equal(headers.get('x-voyage-journal'), 'public');
    assert.equal(headers.get('x-voyage-worker'), null);
    assert.equal(headers.get('x-voyage-member'), null);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headersForDoor(new Headers(), 'owner-1', 'uni-1').get('x-voyage-journal'), null);
});
