import assert from 'node:assert/strict';
import { test } from 'node:test';
import { printedDice } from '../../packages/shared/src/schemas/table_sets.ts';

test('printedDice accepts the dice strings the trade tables print', () => {
    for (const value of ['0', '1D', '2D', '9D', '1D x 5', '2D x 10', '1D days', '1D hours', '2D-2']) {
        assert.equal(printedDice(value), true, value);
    }
    for (const value of ['', '2d', '0D', '1D+4 x 10%', '2D/3', '2D x 0', '1D weeks']) {
        assert.equal(printedDice(value), false, value);
    }
});
