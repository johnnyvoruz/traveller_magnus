/**
 * AQ1. roleWord is the hover label. A trader is one of the two trader words.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roleWord } from '../../apps/web/src/living/roles.ts';

test('each role has its word, and a trader is far or free', () => {
    assert.equal(roleWord('trader', true), 'far trader');
    assert.equal(roleWord('trader', false), 'free trader');
    assert.equal(roleWord('liner', false), 'liner');
    assert.equal(roleWord('patrol', true), 'patrol');
    assert.equal(roleWord('scout', false), 'scout');
    assert.equal(roleWord('xboat', false), 'courier');
    assert.equal(roleWord('shuttle', true), 'shuttle');
});
