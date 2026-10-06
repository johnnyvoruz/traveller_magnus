import assert from 'node:assert/strict';
import test from 'node:test';
import sheet from '../../packages/engines/src/generated/rules/mgt2e_ship_sheet_fields.js';

test('the ship sheet wrapper exports 312 fields', () => {
    assert.equal(sheet.fields.length, 312);
    for (const field of sheet.fields) {
        assert.equal(typeof field.name, 'string');
        assert.equal(typeof field.page, 'number');
        assert.equal(typeof field.type, 'string');
        assert.equal(typeof field.box, 'object');
        assert.ok(field.box);
        assert.equal(typeof field.section, 'string');
    }
});
