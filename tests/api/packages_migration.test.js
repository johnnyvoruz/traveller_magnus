import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runWrangler } from './session.js';
import { wranglerBin } from './server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrations = path.join(root, 'apps/api/src/db/migrations');

function jsonFrom(text) {
    const start = text.indexOf('[');
    const objectStart = text.indexOf('{');
    const at = start === -1 ? objectStart : objectStart === -1 ? start : Math.min(start, objectStart);
    if (at === -1) throw new Error(text);
    return JSON.parse(text.slice(at));
}

function rows(persistTo, sql) {
    const text = runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--command', sql]);
    const parsed = jsonFrom(text);
    const table = Array.isArray(parsed) ? parsed[0] : parsed;
    return table.results ?? table;
}

function names(persistTo) {
    return rows(persistTo, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).map((row) => row.name);
}

if (!existsSync(wranglerBin)) {
    test('package migration', { skip: 'wrangler is absent' }, () => {});
} else {
    test('package tables apply on a fresh local D1 and on today\'s schema', { timeout: 180000 }, () => {
        const fresh = mkdtempSync(path.join(tmpdir(), 'voyage-pkg-fresh-'));
        const upgrade = mkdtempSync(path.join(tmpdir(), 'voyage-pkg-upgrade-'));
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', fresh]);
            const freshNames = names(fresh);
            assert.ok(freshNames.includes('packages'), freshNames.join(','));
            assert.ok(freshNames.includes('package_versions'));
            for (const banned of ['package_installs', 'proposals', 'reports']) {
                assert.equal(freshNames.includes(banned), false, banned);
            }
            const freshColumns = rows(fresh, `PRAGMA table_info(package_versions)`).map((row) => row.name);
            assert.ok(freshColumns.includes('hex_keys'), freshColumns.join(','));
            assert.ok(freshColumns.includes('record_ids'));
            assert.ok(freshColumns.includes('state'));

            const files = readdirSync(migrations).filter((name) => name.endsWith('.sql') && name !== '0010_packages.sql').sort();
            const statements = [];
            for (const name of files) {
                const text = readFileSync(path.join(migrations, name), 'utf8');
                for (const part of text.split('--> statement-breakpoint')) {
                    const statement = part.trim();
                    if (statement) statements.push(statement);
                }
            }
            const prior = path.join(upgrade, 'prior.sql');
            writeFileSync(prior, `${statements.join(';\n')};\n`);
            runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', upgrade, '--file', prior]);
            const before = names(upgrade);
            assert.equal(before.includes('packages'), false);
            assert.ok(before.includes('universes'));
            const booked = files.map((name) => `('${name}')`).join(', ');
            runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', upgrade, '--command',
                `CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT INTO d1_migrations (name) VALUES ${booked};`]);
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', upgrade]);
            const upgraded = rows(upgrade, `PRAGMA table_info(package_versions)`).map((row) => row.name);
            assert.ok(upgraded.includes('hex_keys'), upgraded.join(','));
            assert.ok(upgraded.includes('record_ids'));
            assert.equal(names(upgrade).includes('package_installs'), false);
        } finally {
            rmSync(fresh, { recursive: true, force: true });
            rmSync(upgrade, { recursive: true, force: true });
        }
    });
}
