import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/durable-sqlite';
import { installCampaignSchema, type SqlRow } from './campaign';

export const meta = sqliteTable('meta', {
    key: text('key').primaryKey(),
    value: text('value'),
});

export const sectors = sqliteTable('sectors', {
    sectorSlug: text('sector_slug').primaryKey(),
    displayName: text('display_name'),
    x: integer('x'),
    y: integer('y'),
    source: text('source'),
});

export const hexes = sqliteTable('hexes', {
    hexKey: text('hex_key').primaryKey(),
    sectorSlug: text('sector_slug'),
    localHex: text('local_hex'),
    rev: integer('rev'),
    updatedAt: text('updated_at'),
    deleted: integer('deleted'),
    baseHash: text('base_hash'),
    treeHash: text('tree_hash'),
    engineVersion: text('engine_version'),
    type: text('type'),
    name: text('name'),
    uwp: text('uwp'),
    allegiance: text('allegiance'),
    zone: text('zone'),
    bases: text('bases'),
    tradeCodes: text('trade_codes'),
    pbg: text('pbg'),
    ix: integer('ix'),
    summary: text('summary'),
    provenance: text('provenance'),
});

export const hexHistory = sqliteTable('hex_history', {
    hexKey: text('hex_key').notNull(),
    rev: integer('rev').notNull(),
    at: text('at'),
    action: text('action'),
    actor: text('actor'),
    treeHash: text('tree_hash'),
    summary: text('summary'),
    deleted: integer('deleted'),
}, (t) => [
    primaryKey({ columns: [t.hexKey, t.rev] }),
]);

export const lists = sqliteTable('lists', {
    kind: text('kind').primaryKey(),
    rev: integer('rev'),
    updatedAt: text('updated_at'),
    payload: text('payload'),
});

export const listHistory = sqliteTable('list_history', {
    kind: text('kind').notNull(),
    rev: integer('rev').notNull(),
    at: text('at'),
    action: text('action'),
    payloadHash: text('payload_hash'),
}, (t) => [
    primaryKey({ columns: [t.kind, t.rev] }),
]);

export const snapshots = sqliteTable('snapshots', {
    id: text('id').primaryKey(),
    at: text('at'),
    label: text('label'),
    trigger: text('trigger'),
    manifestHash: text('manifest_hash'),
    bytes: integer('bytes'),
});

export const jobs = sqliteTable('jobs', {
    id: text('id').primaryKey(),
    kind: text('kind'),
    state: text('state'),
    total: integer('total'),
    done: integer('done'),
    failed: integer('failed'),
    failures: text('failures'),
    createdAt: text('created_at'),
    finishedAt: text('finished_at'),
});

const doSchema = { meta, sectors, hexes, hexHistory, lists, listHistory, snapshots, jobs };

export async function migrate(storage: DurableObjectStorage): Promise<void> {
    const sql = storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS sectors (
        sector_slug TEXT PRIMARY KEY,
        display_name TEXT,
        x INTEGER,
        y INTEGER,
        source TEXT
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS hexes (
        hex_key TEXT PRIMARY KEY,
        sector_slug TEXT,
        local_hex TEXT,
        rev INTEGER,
        updated_at TEXT,
        deleted INTEGER,
        base_hash TEXT,
        tree_hash TEXT,
        engine_version TEXT,
        type TEXT,
        name TEXT,
        uwp TEXT,
        allegiance TEXT,
        zone TEXT,
        bases TEXT,
        trade_codes TEXT,
        pbg TEXT,
        ix INTEGER,
        summary TEXT,
        provenance TEXT
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS hexes_sector_slug ON hexes(sector_slug)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS hex_history (
        hex_key TEXT NOT NULL,
        rev INTEGER NOT NULL,
        at TEXT,
        action TEXT,
        actor TEXT,
        tree_hash TEXT,
        summary TEXT,
        deleted INTEGER,
        PRIMARY KEY (hex_key, rev)
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS hex_history_at ON hex_history(at)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS lists (
        kind TEXT PRIMARY KEY,
        rev INTEGER,
        updated_at TEXT,
        payload TEXT
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS list_history (
        kind TEXT NOT NULL,
        rev INTEGER NOT NULL,
        at TEXT,
        action TEXT,
        payload_hash TEXT,
        PRIMARY KEY (kind, rev)
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        at TEXT,
        label TEXT,
        trigger TEXT,
        manifest_hash TEXT,
        bytes INTEGER
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        kind TEXT,
        state TEXT,
        total INTEGER,
        done INTEGER,
        failed INTEGER,
        failures TEXT,
        created_at TEXT,
        finished_at TEXT
    )`);
    sql.exec(`CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state)`);
    sql.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS hexes_fts USING fts5(
        name, hex_key, uwp, content='hexes', content_rowid='rowid'
    )`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS hexes_fts_ai AFTER INSERT ON hexes BEGIN
        INSERT INTO hexes_fts(rowid, name, hex_key, uwp) VALUES (new.rowid, new.name, new.hex_key, new.uwp);
    END`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS hexes_fts_ad AFTER DELETE ON hexes BEGIN
        INSERT INTO hexes_fts(hexes_fts, rowid, name, hex_key, uwp) VALUES ('delete', old.rowid, old.name, old.hex_key, old.uwp);
    END`);
    sql.exec(`CREATE TRIGGER IF NOT EXISTS hexes_fts_au AFTER UPDATE ON hexes BEGIN
        INSERT INTO hexes_fts(hexes_fts, rowid, name, hex_key, uwp) VALUES ('delete', old.rowid, old.name, old.hex_key, old.uwp);
        INSERT INTO hexes_fts(rowid, name, hex_key, uwp) VALUES (new.rowid, new.name, new.hex_key, new.uwp);
    END`);
    installCampaignSchema({
        exec(query, ...params) {
            return storage.sql.exec(query, ...params).toArray() as SqlRow[];
        },
        transaction(fn) {
            return storage.transactionSync(fn);
        },
    });
    drizzle(storage, { schema: doSchema });
    console.log(JSON.stringify({ event: 'UniverseDO migration', schemaVersion: 3 }));
}
