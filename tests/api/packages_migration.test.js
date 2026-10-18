import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { removeTree, runWrangler } from './session.js';
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

function freePort() {
    const server = createServer();
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = address && typeof address === 'object' ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
}

// d1 execute has no --port flag. A private config still names a free dev port and inspector
// port, and --cwd keeps wrangler's own files out of apps/api while other lanes run.
function localConfig(dir, port, inspector) {
    const file = path.join(dir, 'wrangler.toml');
    const migrationsDir = migrations.replace(/\\/g, '/');
    writeFileSync(file, `name = "voyage"
main = "src/index.ts"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

[dev]
port = ${port}
inspector_port = ${inspector}

[[d1_databases]]
binding = "DB"
database_name = "voyage"
database_id = "dce853bf-fd23-4073-99b6-1f8e1d2f569a"
migrations_dir = "${migrationsDir}"
`);
    return file;
}

function wrangler(dir, config, args) {
    return runWrangler(['--config', config, '--cwd', dir, ...args]);
}

function rows(dir, config, persistTo, sql) {
    const text = wrangler(dir, config, ['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--command', sql]);
    const parsed = jsonFrom(text);
    const table = Array.isArray(parsed) ? parsed[0] : parsed;
    return table.results ?? table;
}

function names(dir, config, persistTo) {
    return rows(dir, config, persistTo, `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).map((row) => row.name);
}

if (!existsSync(wranglerBin)) {
    test('package migration', { skip: 'wrangler is absent' }, () => {});
} else {
    test('package tables apply on a fresh local D1 and on today\'s schema', { timeout: 180000 }, async () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'voyage-pkg-'));
        const fresh = path.join(dir, 'fresh');
        const upgrade = path.join(dir, 'upgrade');
        mkdirSync(fresh);
        mkdirSync(upgrade);
        const port = await freePort();
        const inspector = await freePort();
        const config = localConfig(dir, port, inspector);
        try {
            wrangler(dir, config, ['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', fresh]);
            const freshNames = names(dir, config, fresh);
            assert.ok(freshNames.includes('packages'), freshNames.join(','));
            assert.ok(freshNames.includes('package_versions'));
            for (const banned of ['proposals', 'reports']) {
                assert.equal(freshNames.includes(banned), false, banned);
            }
            // 0015: installs and reports exist; packages.truth_version keeps NOT NULL (own maps store '').
            assert.ok(freshNames.includes('package_installs'));
            assert.ok(freshNames.includes('package_reports'));
            const installColumns = rows(dir, config, fresh, `PRAGMA table_info(package_installs)`).map((row) => row.name);
            for (const column of ['id', 'universe_id', 'package_id', 'version', 'placement', 'hex_count', 'record_count', 'created_at', 'updated_at']) {
                assert.ok(installColumns.includes(column), column);
            }
            // Re-running 0015 on a database that has it changes nothing (IF NOT EXISTS throughout).
            const again = path.join(fresh, 'again.sql');
            writeFileSync(again, readFileSync(path.join(migrations, '0015_marketplace.sql'), 'utf8').split('--> statement-breakpoint').join('\n'));
            wrangler(dir, config, ['d1', 'execute', 'voyage', '--local', '--persist-to', fresh, '--file', again]);
            const freshColumns = rows(dir, config, fresh, `PRAGMA table_info(package_versions)`).map((row) => row.name);
            assert.ok(freshColumns.includes('hex_keys'), freshColumns.join(','));
            assert.ok(freshColumns.includes('record_ids'));
            assert.ok(freshColumns.includes('state'));

            // 0019 alters packages, so it waits with 0010 and both apply on the upgrade.
            const files = readdirSync(migrations).filter((name) => name.endsWith('.sql') && !['0010_packages.sql', '0019_package_covers.sql'].includes(name)).sort();
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
            wrangler(dir, config, ['d1', 'execute', 'voyage', '--local', '--persist-to', upgrade, '--file', prior]);
            const before = names(dir, config, upgrade);
            assert.equal(before.includes('packages'), false);
            assert.ok(before.includes('universes'));
            const booked = files.map((name) => `('${name}')`).join(', ');
            wrangler(dir, config, ['d1', 'execute', 'voyage', '--local', '--persist-to', upgrade, '--command',
                `CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL); INSERT INTO d1_migrations (name) VALUES ${booked};`]);
            wrangler(dir, config, ['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', upgrade]);
            const upgraded = rows(dir, config, upgrade, `PRAGMA table_info(package_versions)`).map((row) => row.name);
            assert.ok(upgraded.includes('hex_keys'), upgraded.join(','));
            assert.ok(upgraded.includes('record_ids'));
            assert.equal(names(dir, config, upgrade).includes('package_installs'), true);
            assert.ok(upgraded.includes('art_filled'), 'F17: 0019 applies after 0010');
            assert.ok(rows(dir, config, upgrade, `PRAGMA table_info(packages)`).map((row) => row.name).includes('cover_hash'));
        } finally {
            removeTree(dir);
        }
    });
}
