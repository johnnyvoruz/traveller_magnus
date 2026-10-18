import assert from 'node:assert/strict';
import test from 'node:test';
import { headersForSocket } from '../../apps/api/src/character/rooms.ts';

test('a character socket drops client x-voyage headers', () => {
    const client = new Headers({
        'x-voyage-user-id': 'forged-user',
        'x-voyage-member': 'forged-member',
        'x-voyage-worker': 'generate',
        'x-voyage-journal': 'public',
        'content-type': 'application/json',
    });
    const headers = headersForSocket(client, 'editor-1', 'Ada', 'editor');
    assert.equal(headers.get('x-voyage-user-id'), 'editor-1');
    assert.equal(headers.get('x-voyage-user-name'), 'Ada');
    assert.equal(headers.get('x-voyage-role'), 'editor');
    assert.equal(headers.get('x-voyage-member'), null);
    assert.equal(headers.get('x-voyage-worker'), null);
    assert.equal(headers.get('x-voyage-journal'), null);
    assert.equal(headers.get('content-type'), 'application/json');
});
