import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dotMark } from '../../packages/generation/src/overview.ts';

test('dotMark is the first profile character, and a dot or an empty profile is ?', () => {
    assert.equal(dotMark('A788899-C'), 'A');
    assert.equal(dotMark('X'), 'X');
    assert.equal(dotMark('.'), '?');
    assert.equal(dotMark('.000000-0'), '?');
    assert.equal(dotMark(''), '?');
    assert.equal(dotMark(null), '?');
    assert.equal(dotMark(undefined), '?');
});
