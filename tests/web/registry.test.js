import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandScope, commands, handleKey, registerCommand, setCommandScope, systemPanel } from '../../apps/web/src/shell/registry.ts';

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

test('a list scope runs before a global command, and only while that list has the keyboard', () => {
    const log = [];
    const global = registerCommand({
        id: 'scope-test-global',
        name: 'Global',
        keys: ['F8'],
        run: () => { log.push('global'); },
    });
    const scoped = registerCommand({
        id: 'scope-test-list',
        name: 'Search this list (/)',
        scope: 'campaign-list',
        keys: ['F8'],
        run: () => { log.push('list'); },
    });
    const event = () => ({
        key: 'F8',
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: null,
        preventDefault() {},
    });
    try {
        assert.equal(commandScope(), null);
        assert.equal(handleKey(event()), true);
        setCommandScope('campaign-list');
        assert.equal(commandScope(), 'campaign-list');
        assert.equal(handleKey(event()), true);
        setCommandScope('journal-list');
        assert.equal(handleKey(event()), true);
        assert.deepEqual(log, ['global', 'list', 'global']);
    } finally {
        setCommandScope(null);
        global();
        scoped();
    }
});

test('a key a layer already handled does not run a command', () => {
    let ran = false;
    const remove = registerCommand({
        id: 'eu22-escape',
        name: 'Close panel',
        keys: ['Escape'],
        run: () => { ran = true; },
    });
    try {
        const event = {
            key: 'Escape',
            ctrlKey: false,
            altKey: false,
            metaKey: false,
            defaultPrevented: true,
            target: null,
            preventDefault() {},
        };
        assert.equal(handleKey(event), false);
        assert.equal(ran, false);
    } finally {
        remove();
    }
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
