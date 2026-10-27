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

function migrationFiles() {
    return readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort();
}

function migrationNumber(name) {
    const match = /^(\d+)_/.exec(name);
    return match ? Number(match[1]) : -1;
}

/** SQL with line comments removed, so a mention in a note is not a drop. */
function sqlBody(text) {
    return text.split(/\r?\n/).map((line) => {
        const at = line.indexOf('--');
        return at === -1 ? line : line.slice(0, at);
    }).join('\n');
}

const DESTRUCTIVE = /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bRENAME\s+(?:TO|COLUMN)\b/i;

test('a migration after 0024 does not drop or rename without Johnny\'s line', () => {
    const later = migrationFiles().filter((name) => migrationNumber(name) > 24);
    assert.ok(later.includes('0025_demo_universe.sql'), later.join(','));
    for (const name of later) {
        const text = readFileSync(path.join(migrations, name), 'utf8');
        if (!DESTRUCTIVE.test(sqlBody(text))) continue;
        assert.match(text, /^-- Johnny:/m, `${name} drops or renames without a -- Johnny: line`);
    }
});

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

function statementsOf(names) {
    const statements = [];
    for (const name of names) {
        const text = readFileSync(path.join(migrations, name), 'utf8');
        for (const part of text.split('--> statement-breakpoint')) {
            const statement = part.trim();
            if (statement) statements.push(statement);
        }
    }
    return statements;
}

function schemaOf(dir, config, persistTo) {
    const text = runWrangler(['--config', config, '--cwd', dir, 'd1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--command',
        `SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations' ORDER BY type, name`]);
    const parsed = jsonFrom(text);
    const table = Array.isArray(parsed) ? parsed[0] : parsed;
    const rows = table.results ?? table;
    return rows.map((row) => ({
        type: row.type,
        name: row.name,
        sql: String(row.sql).replace(/\s+/g, ' ').trim(),
    }));
}

if (!existsSync(wranglerBin)) {
    test('migrations apply in order and after 0024', { skip: 'wrangler is absent' }, () => {});
} else {
    test('migrations apply in order and after 0024', { timeout: 180000 }, async () => {
        const files = migrationFiles();
        const through = files.filter((name) => migrationNumber(name) <= 24);
        const rest = files.filter((name) => migrationNumber(name) > 24);
        assert.ok(through.some((name) => name.startsWith('0000_')));
        assert.ok(through.some((name) => name.startsWith('0024_')));
        assert.deepEqual([...through, ...rest], files);

        const dir = mkdtempSync(path.join(tmpdir(), 'voyage-migrate-'));
        const fresh = path.join(dir, 'fresh');
        const staged = path.join(dir, 'staged');
        mkdirSync(fresh);
        mkdirSync(staged);
        const port = await freePort();
        const inspector = await freePort();
        const config = localConfig(dir, port, inspector);
        try {
            const all = path.join(dir, 'all.sql');
            writeFileSync(all, `${statementsOf(files).join(';\n')};\n`);
            runWrangler(['--config', config, '--cwd', dir, 'd1', 'execute', 'voyage', '--local', '--persist-to', fresh, '--file', all]);

            const first = path.join(dir, 'through.sql');
            const second = path.join(dir, 'rest.sql');
            writeFileSync(first, `${statementsOf(through).join(';\n')};\n`);
            writeFileSync(second, `${statementsOf(rest).join(';\n')};\n`);
            runWrangler(['--config', config, '--cwd', dir, 'd1', 'execute', 'voyage', '--local', '--persist-to', staged, '--file', first]);
            runWrangler(['--config', config, '--cwd', dir, 'd1', 'execute', 'voyage', '--local', '--persist-to', staged, '--file', second]);

            assert.deepEqual(schemaOf(dir, config, staged), schemaOf(dir, config, fresh));
        } finally {
            removeTree(dir);
        }
    });
}
