import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptySubsectors, SubsectorNames } from '@voyage/shared';

test('emptySubsectors is sixteen blank names, and a later call is a new list', () => {
    const names = emptySubsectors();
    assert.equal(names.length, 16);
    assert.equal(names.every((name) => name === ''), true);
    assert.deepEqual(SubsectorNames.parse(names), names);
    names[0] = 'Regina';
    assert.equal(emptySubsectors()[0], '');
});
