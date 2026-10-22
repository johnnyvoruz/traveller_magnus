// Seeds the example campaign: one universe, "Example campaign", owned by an account that already exists.
//   node tools/demo/seed_example.mjs --owner <email> --to-local <dir>                 (print only)
//   node tools/demo/seed_example.mjs --owner <email> --to-local <dir> --apply
//   node tools/demo/seed_example.mjs --owner <email> --remote                         (print only; Johnny)
//   node tools/demo/seed_example.mjs --owner <email> --apply --remote                 (Johnny only)
// Without --apply it only prints. The account is looked up and never created.
// A second apply writes nothing: the row stays, and the words stay.
// --remote talks to production. Loading the words there needs the owner's session in
// VOYAGE_SEED_COOKIE. Absent, the command stops before it writes.
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CampaignPage } from '@voyage/shared';
import { ZodError } from 'zod';
import { EDITION, ROOT, TRUTH_VERSION, arg, client, flag, localState, must, q, select, sqlFile, startApi, stopApi, up, wrangler } from '../examples/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'example_campaign.json');
const NAME = 'Example campaign';
const UNIVERSE_ID = 'ux_example_campaign';
const SESSION_ID = 'seed-example-session';
const SESSION_TOKEN = 'example-campaign-seed-token';
// The stand-in secret localState writes. It is not a production secret.
const LOCAL_SECRET = 'lane-z-examples-local-only-not-a-real-secret';
const WRANGLER = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');

export function sameCampaign(page, data) {
    const ids = (rows) => (rows ?? []).map((row) => row.id).sort().join('\n');
    return ids(page.records) === ids(data.records)
        && ids(page.links) === ids(data.links)
        && ids(page.journal) === ids(data.journal);
}

/** The page as one owner write. Every row is new, so baseRev is 0. */
export function changesFrom(page) {
    const changes = {
        records: page.records.map((row) => ({ ...row, baseRev: 0 })),
        links: page.links.map((row) => ({ ...row, baseRev: 0 })),
        journal: (page.journal ?? []).map((row) => ({ ...row, baseRev: 0 })),
        settings: { ...page.settings, baseRev: 0 },
    };
    if (page.clock) changes.clock = { days: page.clock.days, baseRev: 0 };
    return changes;
}

function schemaMessage(err) {
    if (err instanceof ZodError) {
        const issue = err.issues[0];
        const at = issue.path.join('.');
        return at ? `${at}: ${issue.message}` : issue.message;
    }
    return err instanceof Error ? err.message : String(err);
}

function refereeFault(page) {
    const rows = [
        ...page.records.map((row) => ['records', row]),
        ...page.links.map((row) => ['links', row]),
        ...(page.journal ?? []).map((row) => ['journal', row]),
    ];
    for (const [table, row] of rows) {
        if (row.visibility !== 'players' || row.deleted) return `${table} ${row.id}: not visible to players`;
        if (row.provenance) return `${table} ${row.id}: provenance`;
    }
    for (const row of page.records) {
        if (row.status && Object.prototype.hasOwnProperty.call(row.status, 'fuelMark')) return `records ${row.id}: fuelMark`;
    }
    if (JSON.stringify(page).includes(':::referee')) return 'The example has a referee note.';
    return null;
}

/** Reads the example and refuses a row a player would not see, or a referee field. */
export function loadExample(text, where) {
    let raw;
    try { raw = JSON.parse(text); } catch { throw new Error(`${where}: The file is not JSON.`); }
    let page;
    try { page = CampaignPage.parse(raw); } catch (err) { throw new Error(`${where}: ${schemaMessage(err)}`); }
    const fault = refereeFault(page);
    if (fault) throw new Error(`${where}: ${fault}`);
    return page;
}

export function readExample(file = FILE) {
    return loadExample(readFileSync(file, 'utf8'), path.relative(ROOT, file));
}

function enginesVersion() {
    return JSON.parse(readFileSync(path.join(ROOT, 'packages/engines/package.json'), 'utf8')).version;
}

function slugFor(name, id) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    const tail = id.slice(-8).toLowerCase();
    return base ? `${base}-${tail}` : tail;
}

function demoColumn(to) {
    try {
        return to.select(`SELECT name FROM pragma_table_info('universes') WHERE name = 'demo'`).length === 1;
    } catch {
        return false;
    }
}

function lookupOwner(to, email) {
    const rows = to.select(`SELECT id, email FROM user WHERE lower(email) = lower(${q(email)})`);
    if (!rows.length) throw new Error(`No account has the email ${email}. Nothing written.`);
    return rows[0];
}

function universeRow(to) {
    const rows = to.select(`SELECT id, owner_id AS ownerId, name, demo, created_at AS createdAt, updated_at AS updatedAt FROM universes WHERE id = ${q(UNIVERSE_ID)}`);
    return rows[0] ?? null;
}

function insertSql(ownerId, now) {
    const slug = slugFor(NAME, UNIVERSE_ID);
    return `INSERT INTO universes (id, owner_id, name, slug, truth_version, engine_version, edition_default, created_at, updated_at, demo)
VALUES (${[UNIVERSE_ID, ownerId, NAME, slug, TRUTH_VERSION, enginesVersion(), EDITION, now, now, 1].map(q).join(', ')})
ON CONFLICT(id) DO NOTHING;
UPDATE universes SET demo = 1 WHERE id = ${q(UNIVERSE_ID)} AND owner_id = ${q(ownerId)} AND demo != 1;
`;
}

function localCookie(st, userId) {
    const now = Date.now();
    sqlFile(st, `INSERT OR IGNORE INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (${q(SESSION_ID)}, ${now + 7 * 864e5}, ${q(SESSION_TOKEN)}, ${now}, ${now}, ${q(userId)});`);
    const signed = SESSION_TOKEN + '.' + createHmac('sha256', LOCAL_SECRET).update(SESSION_TOKEN).digest('base64');
    return 'better-auth.session_token=' + encodeURIComponent(signed);
}

function makeRemote() {
    const config = path.join(ROOT, 'apps/api/wrangler.toml');
    const run = (args) => {
        const r = spawnSync(process.execPath, [WRANGLER, ...args, '--remote', '--config', config], {
            cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28, env: { ...process.env, CI: '1' },
        });
        if (r.status) throw new Error(`wrangler ${args.slice(0, 3).join(' ')} failed\n${r.stdout}${r.stderr}`);
        return r.stdout;
    };
    return {
        name: 'production (remote)',
        local: false,
        api: 'https://traveller.voyage',
        select: (sql) => {
            const out = run(['d1', 'execute', 'voyage', '--json', '--command', sql]);
            return JSON.parse(out.slice(out.indexOf('[')))[0].results;
        },
        exec: (sql) => {
            const file = path.join(os.tmpdir(), 'voyage-seed-example.sql');
            writeFileSync(file, sql);
            run(['d1', 'execute', 'voyage', '--file', file]);
        },
    };
}

function makeLocal(dir, port) {
    const st = localState(path.resolve(dir), port);
    return {
        name: `local state ${path.relative(ROOT, st.dir)}`,
        local: true,
        api: st.api,
        st,
        select: (sql) => select(st, sql),
        exec: (sql) => sqlFile(st, sql),
    };
}

async function loadWords(to, page, cookie) {
    const call = client({ api: to.api }, cookie);
    const read = await call('GET', `/api/universes/${UNIVERSE_ID}/campaign?after=0&limit=1000`);
    if (read.status === 200 && sameCampaign(page, read.body.data)) return false;
    const wrote = must(await call('PATCH', `/api/universes/${UNIVERSE_ID}/campaign/changes`, changesFrom(page)), 'example campaign');
    if (wrote.conflicts?.length) throw new Error(`The example campaign conflicts on ${wrote.conflicts.map((row) => row.id).join(', ')}.`);
    return true;
}

async function main() {
    const email = arg('--owner');
    if (!email || !email.includes('@')) throw new Error('Pass --owner <email>. Nothing written.');
    if (flag('--remote') && arg('--to-local')) throw new Error('Pass --remote or --to-local, not both.');
    if (!flag('--remote') && !arg('--to-local')) throw new Error('Name the target: --to-local <dir> or --remote.');
    const page = readExample();
    const to = flag('--remote') ? makeRemote() : makeLocal(arg('--to-local'), Number(arg('--port', '18921')));
    const apply = flag('--apply');
    console.log(`Target: ${to.name}${apply ? '' : ' (print only; pass --apply to write)'}`);
    if (!demoColumn(to) && apply && to.local) wrangler(to.st, ['d1', 'migrations', 'apply', 'voyage']);
    if (!demoColumn(to)) throw new Error('The target has no migration 0025 (universes.demo). Nothing written.');
    const owner = lookupOwner(to, email);
    const existing = universeRow(to);
    if (existing && existing.ownerId !== owner.id) throw new Error(`Example campaign belongs to another account. Nothing written.`);
    console.log(`  ${existing ? 'keep' : 'insert'}  ${NAME}  ${UNIVERSE_ID}  owner ${owner.email}`);
    console.log(`      ${page.records.length} records, ${page.links.length} links, ${(page.journal ?? []).length} journal`);
    if (!apply) return;
    if (!to.local && !process.env.VOYAGE_SEED_COOKIE) throw new Error('The remote apply loads the words with the owner\'s session. Nothing written.');
    const before = existing ? `${existing.demo}|${existing.createdAt}|${existing.updatedAt}` : null;
    if (!existing || Number(existing.demo) !== 1) to.exec(insertSql(owner.id, new Date().toISOString()));
    let child = null;
    try {
        const cookie = to.local ? localCookie(to.st, owner.id) : process.env.VOYAGE_SEED_COOKIE;
        if (to.local) {
            child = startApi(to.st);
            await up(to.st);
        }
        const wrote = await loadWords(to, page, cookie);
        if (!wrote) {
            const after = universeRow(to);
            const stamp = `${after.demo}|${after.createdAt}|${after.updatedAt}`;
            if (before !== stamp) throw new Error('The second run changed the universe row.');
            console.log('Already loaded. Nothing written.');
            return;
        }
        const call = client({ api: to.api }, null);
        const demo = await call('GET', '/api/demo/campaign');
        if (demo.status !== 200) throw new Error(`GET /api/demo/campaign: ${demo.status} ${JSON.stringify(demo.body?.error ?? demo.body)}`);
        if (!sameCampaign(page, demo.body.data)) throw new Error('GET /api/demo/campaign did not return the example.');
        const ship = demo.body.data.records.find((row) => row.type === 'vessel');
        console.log(`Applied. The demo route returns ${ship?.name ?? 'the campaign'}.`);
    } finally {
        stopApi(child);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, 'seed_example.mjs')) {
    main().catch((err) => { console.error(err.message ?? err); process.exitCode = 1; });
}
