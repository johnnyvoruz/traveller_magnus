import {
    PUBLIC_DEFAULT_DAYS,
    fitPublicCard,
    publicCardJournal,
    publicFinishedLegs,
    publicFirstHex,
    publicMarkId,
    publicShips,
    type CampaignEntry,
    type CampaignPage,
    type CampaignRecord,
} from '@voyage/shared';
import { detectPublicCards, detectPublicShips, publicCardsReady, publicShipsReady } from '../auth/public_schema';
import type { Env } from '../env';

const PLACE_TABLES = new Set(['records', 'settings', 'clock', 'journal']);

export function placeTouched(applied: { table: string }[]): boolean {
    return applied.some((row) => PLACE_TABLES.has(row.table));
}

async function readDocument(env: Env, universeId: string): Promise<{
    records: CampaignRecord[];
    journal: CampaignEntry[];
    settings: CampaignPage['settings'];
    clock: CampaignPage['clock'];
}> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const records = new Map<string, CampaignRecord>();
    const journal = new Map<string, CampaignEntry>();
    let settings: CampaignPage['settings'] | null = null;
    let clock: CampaignPage['clock'] = null;
    let after = 0;
    for (let page = 0; page < 40; page += 1) {
        const response = await stub.fetch(new Request(`https://universe.internal/campaign?after=${after}&limit=1000`));
        const body = await response.json() as { ok?: boolean; data?: CampaignPage };
        if (!response.ok || !body.ok || !body.data) break;
        for (const record of body.data.records) records.set(record.id, record);
        for (const entry of body.data.journal ?? []) journal.set(entry.id, entry);
        settings = body.data.settings;
        clock = body.data.clock;
        if (body.data.done) break;
        if (body.data.seq <= after) break;
        after = body.data.seq;
    }
    return {
        records: [...records.values()],
        journal: [...journal.values()],
        settings: settings ?? {
            party: { vesselIds: [], aboard: {}, memberIds: [], anchor: null },
            kinds: {},
            calendar: { dateFormat: 'imperial' },
            rev: 0,
        },
        clock,
    };
}

type CardMeta = { game: string; example: number; referee: string | null };

async function readCardMeta(env: Env, universeId: string): Promise<CardMeta | null> {
    return env.DB.prepare(
        `SELECT u.name AS game, u.example AS example,
                CASE WHEN u.show_referee = 1 THEN (SELECT handle FROM profile WHERE user_id = u.owner_id) ELSE NULL END AS referee
         FROM universes u WHERE u.id = ? AND u.deleted_at IS NULL`,
    ).bind(universeId).first<CardMeta>();
}

/** Replaces this universe's public rows. One D1 batch when 0017 is present. */
export async function writePublicMark(env: Env, universeId: string, truthVersion: string | null): Promise<void> {
    await detectPublicShips(env.DB);
    await detectPublicCards(env.DB);
    const document = await readDocument(env, universeId);
    const now = new Date().toISOString();
    if (publicShipsReady()) {
        const ships = truthVersion ? publicShips({
            settings: document.settings,
            records: document.records,
            clock: document.clock,
        }) : [];
        const statements = [];
        if (publicCardsReady()) statements.push(env.DB.prepare(`DELETE FROM public_cards WHERE universe_id = ?`).bind(universeId));
        statements.push(
            env.DB.prepare(`DELETE FROM public_ships WHERE universe_id = ?`).bind(universeId),
            env.DB.prepare(`DELETE FROM public_marks WHERE universe_id = ?`).bind(universeId),
        );
        const recordMap: Record<string, CampaignRecord> = {};
        for (const record of document.records) recordMap[record.id] = record;
        const days = document.clock ? document.clock.days : PUBLIC_DEFAULT_DAYS;
        const meta = publicCardsReady() ? await readCardMeta(env, universeId) : null;
        const journal = meta ? publicCardJournal(document.journal) : [];
        for (const ship of ships) {
            const mark = await publicMarkId(universeId, ship.vesselId);
            statements.push(env.DB.prepare(
                `INSERT INTO public_ships (mark_id, universe_id, truth_version, sector_slug, local_hex, ship_name, aboard_names, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(mark, universeId, truthVersion, ship.hex.sector, ship.hex.localHex, ship.name, JSON.stringify(ship.aboard), now));
            if (meta) {
                const vessel = recordMap[ship.vesselId];
                const legs = vessel ? publicFinishedLegs(vessel, recordMap, days) : [];
                const fitted = fitPublicCard(legs, journal);
                statements.push(env.DB.prepare(
                    `INSERT INTO public_cards (mark_id, universe_id, legs, journal, updated_at) VALUES (?, ?, ?, ?, ?)`,
                ).bind(mark, universeId, JSON.stringify(fitted.legs), JSON.stringify(fitted.journal), now));
            }
        }
        await env.DB.batch(statements);
        return;
    }
    const hex = truthVersion ? publicFirstHex({
        settings: document.settings,
        records: document.records,
        clock: document.clock,
    }) : null;
    if (!hex || !truthVersion) {
        await env.DB.prepare(`DELETE FROM public_marks WHERE universe_id = ?`).bind(universeId).run();
        return;
    }
    await env.DB.prepare(
        `INSERT INTO public_marks (universe_id, truth_version, sector_slug, local_hex, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(universe_id) DO UPDATE SET
            truth_version = excluded.truth_version,
            sector_slug = excluded.sector_slug,
            local_hex = excluded.local_hex,
            updated_at = excluded.updated_at`,
    ).bind(universeId, truthVersion, hex.sector, hex.localHex, now).run();
}

export async function deletePublicMark(env: Env, universeId: string): Promise<void> {
    await detectPublicShips(env.DB);
    await detectPublicCards(env.DB);
    const statements = [];
    if (publicCardsReady()) statements.push(env.DB.prepare(`DELETE FROM public_cards WHERE universe_id = ?`).bind(universeId));
    if (publicShipsReady()) statements.push(env.DB.prepare(`DELETE FROM public_ships WHERE universe_id = ?`).bind(universeId));
    statements.push(env.DB.prepare(`DELETE FROM public_marks WHERE universe_id = ?`).bind(universeId));
    if (statements.length === 1) {
        await statements[0]!.run();
        return;
    }
    await env.DB.batch(statements);
}
