import assert from 'node:assert/strict';
import test from 'node:test';
import sheet from '../../packages/engines/src/generated/rules/mgt2e_ship_sheet_fields.js';

test('the ship sheet wrapper exports 314 fields', () => {
    assert.equal(sheet.fields.length, 314);
    const rooms = sheet.fields.find((field) => field.name === 'Staterooms');
    const berths = sheet.fields.find((field) => field.name === 'Low Berths');
    assert.equal(rooms.section, 'Passengers');
    assert.equal(rooms.page, 2);
    assert.equal(rooms.type, 'text');
    assert.deepEqual(rooms.box, { x: 516.657, y: 306.455, w: 127.471, h: 10.293 });
    assert.equal(berths.section, 'Passengers');
    assert.equal(berths.page, 2);
    assert.equal(berths.type, 'text');
    assert.deepEqual(berths.box, { x: 644.128, y: 306.455, w: 132.471, h: 10.293 });
    assert.equal(sheet.fields.filter((field) => field.name === 'Passenger Capactiy').length, 1);
    for (const field of sheet.fields) {
        assert.equal(typeof field.name, 'string');
        assert.equal(typeof field.page, 'number');
        assert.equal(typeof field.type, 'string');
        assert.equal(typeof field.box, 'object');
        assert.ok(field.box);
        assert.equal(typeof field.section, 'string');
    }
});
