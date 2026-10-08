import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('rules:gen writes the character sheet declaration', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rules-gen-'));
    try {
        const run = spawnSync(process.execPath, ['scripts/gen_rules_esm.js'], {
            cwd: root,
            env: { ...process.env, RULES_GEN_OUT: out },
            encoding: 'utf8',
        });
        assert.equal(run.status, 0, run.stderr);
        const js = path.join(out, 'mgt2e_character_sheet_fields.js');
        const decl = path.join(out, 'mgt2e_character_sheet_fields.d.ts');
        assert.equal(fs.existsSync(js), true);
        const text = fs.readFileSync(decl, 'utf8');
        assert.match(text, /GENERATED from rules\/mgt2e_character_sheet_fields\.json/);
        assert.match(text, /fields: CharacterSheetField\[\]/);
        assert.match(text, /export default sheet;/);
        assert.equal(fs.existsSync(path.join(out, 'mgt2e_ship_sheet_fields.d.ts')), false);
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});
