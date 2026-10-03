import test from 'node:test';
import assert from 'node:assert/strict';
import { stable } from '@voyage/shared';

test('stable() is compact, sorted, and explicit about non-finite numbers', () => {
    const out = stable({ b: 1, a: { d: 'two  spaces', c: [1, 2] }, n: Infinity });
    assert.equal(out.includes('\n'), false);
    assert.equal(out, '{"a":{"c":[1,2],"d":"two  spaces"},"b":1,"n":{"$num":"Infinity"}}');
    const outside = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
    assert.equal(outside.includes('  '), false);
});
