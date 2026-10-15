// Seeds the example games: one account, one public v10 game and its ship rows per file in tools/examples/games/.
//   node tools/examples/seed_games.mjs --to-local <stand-in state>               (print only)
//   node tools/examples/seed_games.mjs --to-local <stand-in state> --apply
//   node tools/examples/seed_games.mjs --to-local <stand-in state> --remove [--apply]
//   node tools/examples/seed_games.mjs --production [--apply | --remove --apply]   (Johnny only)
// The accounts can never sign in: no passkey, no session. Their universes' objects stay empty; the feed and the
// card read D1 only, so the rows are written here with B's own functions from packages/shared/src/public_hex.ts.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fitPublicCard, publicCardJournal, publicFinishedLegs, publicMarkId, publicShips } from '@voyage/shared';
import { HERE, ROOT, TRUTH_VERSION, EDITION, arg, flag, q } from './lib.mjs';
import { target } from './seed_production.mjs';
import { judgeUsername } from '../../apps/api/src/auth/passkey_words.ts';

const SALT = 'voyage-example-game';
const hash = (...parts) => createHash('sha256').update([SALT, ...parts].join('\0')).digest('hex');
const uuid = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
const STAMP = '2026-10-14T00:00:00.000Z';

/** Reads and checks the game files. Refuses with the file and the field. */
export function readGames(dir) {
    if (!existsSync(dir)) throw new Error(`${path.relative(ROOT, dir)}: no games folder.`);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    const games = [];
    const handles = new Set();
    for (const file of files) {
        const where = path.relative(ROOT, path.join(dir, file));
        let g;
        try { g = JSON.parse(readFileSync(path.join(dir, file), 'utf8')); } catch { throw new Error(`${where}: The file is not JSON.`); }
        const need = (ok, field) => { if (!ok) throw new Error(`${where}: ${field}: Invalid`); };
        need(typeof g.game === 'string' && g.game.trim(), 'game');
        const verdict = judgeUsername(g.referee);
        need(verdict.ok, `referee (${verdict.ok ? '' : verdict.message})`);
        need(!handles.has(g.referee.toLowerCase()), 'referee (repeats another game)');
        handles.add(g.referee.toLowerCase());
        need(typeof g.showReferee === 'boolean', 'showReferee');
        need(Number.isInteger(g.clockDays) && g.clockDays >= 0, 'clockDays');
        need(Array.isArray(g.ships) && g.ships.length > 0, 'ships');
        g.ships.forEach((s, i) => {
            need(typeof s.name === 'string' && s.name.trim(), `ships.${i}.name`);
            need(Array.isArray(s.crew) && s.crew.every((n) => typeof n === 'string' && n.trim()), `ships.${i}.crew`);
            need(Array.isArray(s.legs) && s.legs.length > 0, `ships.${i}.legs`);
            s.legs.forEach((l, j) => need(/^[^/~]+\/\d{4}$/.test(l.from) && /^[^/~]+\/\d{4}$/.test(l.to) && Number.isFinite(l.departs) && l.arrives >= l.departs, `ships.${i}.legs.${j}`));
        });
        need(Array.isArray(g.journal ?? []), 'journal');
        games.push({ slug: file.replace(/\.json$/, ''), ...g, journal: g.journal ?? [] });
    }
    return games;
}

/** The in-memory campaign one game stands for, and the D1 rows B's write would make from it. */
export async function rowsOf(game, engineVersion) {
    const userId = uuid(hash('user', game.slug));
    const universeId = 'ux_' + hash('universe', game.slug).slice(0, 24);
    const records = [];
    const memberIds = [];
    const aboard = {};
    const vesselIds = [];
    game.ships.forEach((ship, i) => {
        const vesselId = 'cr_' + uuid(hash('vessel', game.slug, String(i)));
        vesselIds.push(vesselId);
        const anchor = (hexKey) => ({ kind: 'system', hexKey });
        records.push({
            id: vesselId, type: 'vessel', kind: '', name: ship.name, summary: '', details: '', tags: ['Example'],
            anchor: anchor(ship.legs[0].from), when: null, visibility: 'players', playerNotes: null, sheet: null,
            status: { track: ship.legs.map((l) => ({ from: anchor(l.from), to: anchor(l.to), departs: l.departs, arrives: l.arrives, mode: 'jump' })) },
            images: null, provenance: null, rev: 1, createdAt: STAMP, updatedAt: STAMP, deleted: false,
        });
        ship.crew.forEach((name, j) => {
            const id = 'cr_' + uuid(hash('crew', game.slug, String(i), String(j)));
            memberIds.push(id);
            aboard[id] = vesselId;
            records.push({
                id, type: 'person', kind: '', name, summary: '', details: '', tags: ['Example'], anchor: { kind: 'record', id: vesselId },
                when: null, visibility: 'players', playerNotes: null, sheet: null, status: null, images: null, provenance: null,
                rev: 1, createdAt: STAMP, updatedAt: STAMP, deleted: false,
            });
        });
    });
    const settings = { party: { vesselIds, aboard, memberIds, anchor: null }, kinds: {}, calendar: { dateFormat: 'imperial' }, rev: 1 };
    const clock = { days: game.clockDays };
    const ordered = [...game.journal].sort((a, b) => (a.when.year * 365 + a.when.day) - (b.when.year * 365 + b.when.day));
    const entries = ordered.map((e, i) => ({
        id: 'cj_' + uuid(hash('journal', game.slug, String(i))), deleted: false, visibility: 'public', title: e.title, body: e.body,
        when: e.when ?? null, realDate: null, updatedAt: new Date(Date.parse(STAMP) + i * 1000).toISOString(),
    }));
    const map = Object.fromEntries(records.map((r) => [r.id, r]));
    const ships = publicShips({ settings, records, clock });
    const journal = publicCardJournal(entries);
    const out = [];
    for (const ship of ships) {
        const mark = await publicMarkId(universeId, ship.vesselId);
        const fitted = fitPublicCard(publicFinishedLegs(map[ship.vesselId], map, clock.days), journal);
        out.push({ mark, sector: ship.hex.sector, local: ship.hex.localHex, name: ship.name, aboard: ship.aboard, legs: fitted.legs, journal: fitted.journal });
    }
    const slug = game.game.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return { userId, universeId, slug, engineVersion, ships: out };
}

export function applySql(game, rows) {
    const now = STAMP;
    const ms = Date.parse(STAMP);
    const lines = [
        `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned) VALUES (${q(rows.userId)}, ${q(game.referee)}, ${q(game.referee.toLowerCase() + '@example.invalid')}, 0, ${ms}, ${ms}, 'user', 0)
ON CONFLICT (id) DO UPDATE SET name = excluded.name;`,
        `INSERT INTO profile (user_id, handle, display_name, avatar_url, created_at, last_seen_at) VALUES (${q(rows.userId)}, ${q(game.referee)}, ${q(game.referee)}, NULL, ${q(now)}, NULL)
ON CONFLICT (user_id) DO UPDATE SET handle = excluded.handle, display_name = excluded.display_name;`,
        `INSERT INTO universes (id, owner_id, name, slug, truth_version, engine_version, edition_default, created_at, updated_at, public_games, example, show_referee)
VALUES (${q(rows.universeId)}, ${q(rows.userId)}, ${q(game.game)}, ${q(rows.slug)}, ${q(TRUTH_VERSION)}, ${q(rows.engineVersion)}, ${q(EDITION)}, ${q(now)}, ${q(now)}, 1, 1, ${game.showReferee ? 1 : 0})
ON CONFLICT (id) DO UPDATE SET name = excluded.name, public_games = 1, example = 1, show_referee = excluded.show_referee, deleted_at = NULL;`,
        `DELETE FROM public_cards WHERE universe_id = ${q(rows.universeId)};`,
        `DELETE FROM public_ships WHERE universe_id = ${q(rows.universeId)};`,
    ];
    for (const s of rows.ships) {
        lines.push(`INSERT INTO public_ships (mark_id, universe_id, truth_version, sector_slug, local_hex, ship_name, aboard_names, updated_at) VALUES (${[s.mark, rows.universeId, TRUTH_VERSION, s.sector, s.local, s.name, JSON.stringify(s.aboard), now].map(q).join(', ')});`);
        lines.push(`INSERT INTO public_cards (mark_id, universe_id, legs, journal, updated_at) VALUES (${[s.mark, rows.universeId, JSON.stringify(s.legs), JSON.stringify(s.journal), now].map(q).join(', ')});`);
    }
    return lines.join('\n') + '\n';
}

/** B's contract, "Example games": owners first, then the universes (cascading the public rows), then accounts left with none. */
export function removeSql(owners) {
    const lines = ['DELETE FROM universes WHERE example = 1;'];
    for (const id of owners) {
        const none = `NOT EXISTS (SELECT 1 FROM universes WHERE owner_id = ${q(id)})`;
        lines.push(`DELETE FROM profile WHERE user_id = ${q(id)} AND ${none};`);
        lines.push(`DELETE FROM generation_allowance WHERE user_id = ${q(id)} AND ${none};`);
        lines.push(`DELETE FROM user WHERE id = ${q(id)} AND ${none};`);
    }
    return lines.join('\n') + '\n';
}

async function main() {
    const to = target();
    const apply = flag('--apply');
    console.log(`Target: ${to.name}${apply ? '' : ' (print only; pass --apply to write)'}`);
    const cols = to.select(`SELECT name FROM pragma_table_info('universes') WHERE name IN ('example', 'show_referee')`);
    if (cols.length !== 2) throw new Error('The target has no migration 0018 (universes.example, show_referee). Push 1.2.1 first. Nothing written.');
    if (flag('--remove')) {
        const owners = to.select(`SELECT DISTINCT owner_id AS id FROM universes WHERE example = 1`).map((r) => r.id);
        const ships = to.select(`SELECT COUNT(*) AS n FROM public_ships s JOIN universes u ON u.id = s.universe_id WHERE u.example = 1`)[0].n;
        console.log(`Remove: ${owners.length} example accounts and their universes, ${ships} ship rows.`);
        if (apply) { to.exec(removeSql(owners)); console.log('Removed.'); }
        return;
    }
    const games = readGames(path.resolve(arg('--games', path.join(HERE, 'games'))));
    const truth = to.select(`SELECT engine_version AS e FROM truth_versions WHERE version = ${q(TRUTH_VERSION)}`)[0];
    if (!truth) throw new Error(`The target has no truth version ${TRUTH_VERSION}. Nothing written.`);
    let sql = '';
    for (const game of games) {
        const rows = await rowsOf(game, truth.e);
        const taken = to.select(`SELECT user_id AS id FROM profile WHERE lower(handle) = lower(${q(game.referee)})`)[0];
        if (taken && taken.id !== rows.userId) throw new Error(`${game.slug}: handle ${game.referee} belongs to another account. Nothing written.`);
        console.log(`  ${taken ? 'update' : 'insert'}  ${game.game}  referee ${game.referee}${game.showReferee ? ' (shown)' : ''}`);
        for (const s of rows.ships) console.log(`      ${s.name} at ${s.sector}/${s.local}; aboard ${s.aboard.join(', ')}; legs ${s.legs.length}; notes ${s.journal.length}`);
        sql += applySql(game, rows);
    }
    if (!apply) return;
    to.exec(sql);
    console.log(`Applied: ${games.length} games.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, 'seed_games.mjs')) {
    main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}