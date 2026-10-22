/**
 * AQ1 round 1. Hex addresses and the twelve corner numbers of a flat-top hex.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEX_SIZE } from '@voyage/shared';
import { formatHex, hexCorners } from '../../apps/web/src/map/geometry.ts';

test('a column and a row become four digits, padded', () => {
    assert.equal(formatHex(1, 10), '0110');
    assert.equal(formatHex(19, 10), '1910');
    assert.equal(formatHex(0, 0), '0000');
    assert.equal(formatHex(32, 40), '3240');
});

test('a hex has twelve corner numbers, the first point to the right', () => {
    const corners = hexCorners(3, 5);
    assert.equal(corners.length, 12);
    assert.ok(Math.abs(corners[0] - (3 + HEX_SIZE)) < 1e-12);
    assert.ok(Math.abs(corners[1] - 5) < 1e-12);
    assert.ok(Math.abs(corners[2] - (3 + HEX_SIZE * Math.cos(Math.PI / 3))) < 1e-12);
    assert.ok(Math.abs(corners[3] - (5 + HEX_SIZE * Math.sin(Math.PI / 3))) < 1e-12);
    const again = hexCorners(0, 0);
    assert.equal(again.length, 12);
    assert.ok(Math.abs(again[0] - HEX_SIZE) < 1e-12);
});
