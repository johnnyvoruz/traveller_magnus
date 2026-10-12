import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDotRows, dotIndex } from '@voyage/generation';

test('dot index is the overview cell order', () => {
    assert.equal(dotIndex('0101'), 0);
    assert.equal(dotIndex('0140'), 39);
    assert.equal(dotIndex('0201'), 40);
    assert.equal(dotIndex('3240'), 1279);
    assert.equal(dotIndex('3301'), null);
    assert.equal(dotIndex('0100'), null);
    assert.equal(dotIndex('1910'), (19 - 1) * 40 + (10 - 1));
});

test('a held row sets the cell and a removed row clears it', () => {
    const chart = '.'.repeat(1280).split('');
    chart[dotIndex('1910')] = 'A';
    chart[dotIndex('0102')] = 'C';
    const cells = applyDotRows(chart.join(''), [
        { local: '1910', holds: false, uwp: 'A788899-C' },
        { local: '0101', holds: true, uwp: 'B123456-7' },
        { local: '0103', holds: true, uwp: '' },
        { local: '9999', holds: true, uwp: 'X' },
    ]);
    assert.equal(cells.length, 1280);
    assert.equal(cells[dotIndex('1910')], '.');
    assert.equal(cells[dotIndex('0102')], 'C');
    assert.equal(cells[dotIndex('0101')], 'B');
    assert.equal(cells[dotIndex('0103')], '?');
    const own = applyDotRows(null, [{ local: '0101', holds: true, uwp: 'A000000-0' }]);
    assert.equal(own[0], 'A');
    assert.equal(own.slice(1), '.'.repeat(1279));
});
