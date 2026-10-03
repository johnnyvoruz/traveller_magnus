import assert from 'node:assert/strict';
import test from 'node:test';
import { roleSatisfies } from '../../apps/api/src/auth/roles.ts';

if (process.env.RUN_API_TESTS !== '1') {
    test('role order', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else {
    test('admin passes a reviewer check and a user fails it', () => {
        assert.equal(roleSatisfies('admin', 'reviewer'), true);
        assert.equal(roleSatisfies('user', 'reviewer'), false);
    });
}
