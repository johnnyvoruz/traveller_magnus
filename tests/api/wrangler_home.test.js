import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dropIsolatedConfig, dropRecordedHomes, homeRecord, isolatedConfig, noteHome } from './server.js';

test('a killed run still drops the wrangler config directory recorded for its persist folder', () => {
    const persist = mkdtempSync(path.join(tmpdir(), 'voyage-persist-'));
    let home = '';
    try {
        home = isolatedConfig();
        assert.equal(existsSync(home), true);
        assert.equal(home.toLowerCase().includes('traveller_magnus'), false);
        assert.equal(homeRecord(persist).startsWith(persist), false);
        noteHome(persist, home);
        assert.equal(existsSync(homeRecord(persist)), true);
        dropRecordedHomes(persist);
        assert.equal(existsSync(home), false);
        assert.equal(existsSync(homeRecord(persist)), false);
        home = '';
        const gone = isolatedConfig();
        noteHome(persist, gone);
        dropIsolatedConfig(gone);
        assert.equal(existsSync(gone), false);
        assert.doesNotThrow(() => dropRecordedHomes(persist));
        assert.equal(existsSync(homeRecord(persist)), false);
        assert.doesNotThrow(() => dropRecordedHomes(persist));
    } finally {
        if (home) dropIsolatedConfig(home);
        rmSync(homeRecord(persist), { force: true });
        rmSync(persist, { recursive: true, force: true });
    }
});
