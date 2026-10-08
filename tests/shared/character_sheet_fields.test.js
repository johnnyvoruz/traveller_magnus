import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rulesPath = path.join(root, 'rules/mgt2e_character_sheet_fields.json');
const findingsPath = path.join(root, 'findings/character_sheet_fields.json');
const sheetPath = fs.existsSync(rulesPath) ? rulesPath : findingsPath;

test('the character sheet fields have one shape', {
    skip: fs.existsSync(sheetPath) ? false : 'no character sheet fields file',
}, () => {
    const sheet = JSON.parse(fs.readFileSync(sheetPath, 'utf8'));
    const names = sheet.fields.map((field) => field.name);
    assert.equal(new Set(names).size, names.length);
    const found = new Set(sheet.fields.map((field) => field.type));
    for (const field of sheet.fields) {
        assert.equal(typeof field.page, 'number');
        assert.ok(field.box);
        for (const key of ['x', 'y', 'w', 'h']) assert.equal(typeof field.box[key], 'number');
        assert.ok(found.has(field.type));
        assert.ok(field.type === 'text' || field.type === 'checkbox');
        assert.equal(typeof field.section, 'string');
        assert.ok(field.section);
    }
});
