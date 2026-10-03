import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commands, handleKey, registerCommand, systemPanel } from '../../apps/web/src/shell/registry.ts';

const world = { slug: 'Spinward_Marches', hex: '1910' };

test('system panel opens a world, closes an open panel, and is not runnable with nothing', () => {
    assert.deepEqual(systemPanel({ panelOpen: false, world: null }), { runnable: false });
    assert.deepEqual(systemPanel({ panelOpen: false, world }), {
        runnable: true,
        kind: 'open',
        slug: 'Spinward_Marches',
        hex: '1910',
    });
    assert.deepEqual(systemPanel({ panelOpen: true, world }), { runnable: true, kind: 'close' });
    assert.deepEqual(systemPanel({ panelOpen: true, world: null }), { runnable: true, kind: 'close' });
});

test('the registry leaves a command that is not runnable unrun', () => {
    let ran = false;
    const remove = registerCommand({
        id: 'system-panel',
        name: 'System panel',
        keys: ['F2'],
        runnable: () => false,
        run: () => { ran = true; },
    });
    try {
        const found = commands().find((item) => item.id === 'system-panel');
        assert.ok(found);
        assert.equal(found.runnable(), false);
        const event = {
            key: 'F2',
            ctrlKey: false,
            altKey: false,
            metaKey: false,
            target: null,
            preventDefault() { ran = true; },
        };
        assert.equal(handleKey(event), false);
        assert.equal(ran, false);
    } finally {
        remove();
    }
});
