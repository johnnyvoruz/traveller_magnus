/**
 * The orbit view's commands (apps/web/src/orbit/commands.ts; findings/orbit_showpiece_design.md
 * §7): every command has a key or is reached from the palette, the keys are 1/2/3 for the
 * layout and 4 to 0 for the layers, and every command is named by a control in orbit/
 * (`data-command`), so no chrome exists without its command.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DRAWERS, keyWords, LAYERS, LAYOUTS, ORBIT_COMMANDS, toggled } from '../../apps/web/src/orbit/commands.ts';
import { DEFAULT_LAYERS } from '../../apps/web/src/orbit/picture.ts';

const ORBIT_DIR = new URL('../../apps/web/src/orbit/', import.meta.url);

test('the keys: 1/2/3 the layout, 4 to 0 the layers, each key once', () => {
    assert.deepEqual(LAYOUTS.map((item) => item.key), ['1', '2', '3']);
    assert.deepEqual(LAYERS.map((item) => item.hotkey), ['4', '5', '6', '7', '8', '9', '0']);
    const keys = ORBIT_COMMANDS.flatMap((command) => command.keys);
    assert.equal(new Set(keys).size, keys.length, 'no key does two things');
    assert.equal(keyWords(' '), 'Space');
    assert.equal(keyWords('C'), 'Shift+C');
    assert.equal(keyWords('f'), 'F');
    assert.equal(keyWords('Escape'), 'Escape');
});

test('every command is named by a control in orbit/ or the view (data-command)', () => {
    // The View drawer's controls are drawn by the view itself, so it is read too.
    const files = [...fs.readdirSync(ORBIT_DIR).filter((name) => name.endsWith('.vue')).map((name) => new URL(name, ORBIT_DIR)), new URL('../../apps/web/src/views/OrbitView.vue', import.meta.url)];
    const named = new Set();
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        for (const found of text.matchAll(/data-command="([^"]+)"/g)) named.add(found[1]);
        // A control built from a table names its command through the table's id.
        if (/:data-command="item\.id"/.test(text)) for (const item of [...LAYOUTS, ...LAYERS]) named.add(item.id);
        // The drawer tabs name theirs through the drawers table.
        if (/:data-command="item\.command"/.test(text)) for (const item of DRAWERS) named.add(item.command);
    }
    const missing = ORBIT_COMMANDS.filter((command) => !named.has(command.id)).map((command) => command.id);
    assert.deepEqual(missing, [], 'commands with no control: ' + missing.join(', '));
    const extra = [...named].filter((id) => id.startsWith('orbit-') && !ORBIT_COMMANDS.some((command) => command.id === id));
    assert.deepEqual(extra, [], 'controls with no command: ' + extra.join(', '));
    void path;
});

test('a layer command flips one layer and leaves the rest', () => {
    const next = toggled(DEFAULT_LAYERS, 'scan');
    assert.equal(next.scan, !DEFAULT_LAYERS.scan);
    assert.equal(next.paths, DEFAULT_LAYERS.paths);
    assert.equal(toggled(next, 'scan').scan, DEFAULT_LAYERS.scan);
});
