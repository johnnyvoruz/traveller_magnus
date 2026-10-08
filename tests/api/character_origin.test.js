import assert from 'node:assert/strict';
import test from 'node:test';
import { requestOrigin } from '../../apps/api/src/character/origin.ts';

test('an invite origin is https on the public host and the local host the request came from', () => {
    const production = new Request('http://traveller.voyage/api/characters/ch_1/invites', {
        headers: { host: 'traveller.voyage' },
    });
    assert.equal(requestOrigin(production), 'https://traveller.voyage');

    const local = new Request('http://traveller.voyage/api/characters/ch_1/invites', {
        headers: { host: 'traveller.voyage', 'mf-original-hostname': '127.0.0.1:8807' },
    });
    assert.equal(requestOrigin(local), 'http://127.0.0.1:8807');

    const page = new Request('http://traveller.voyage/api/characters/ch_1/invites', {
        headers: {
            host: 'traveller.voyage',
            'mf-original-hostname': '127.0.0.1:8807',
            'x-forwarded-host': '127.0.0.1:5231',
        },
    });
    assert.equal(requestOrigin(page), 'http://127.0.0.1:5231');
});
