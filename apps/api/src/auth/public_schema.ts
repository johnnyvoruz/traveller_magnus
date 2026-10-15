let ready: boolean | null = null;
let shipsReady: boolean | null = null;
let cardsReady: boolean | null = null;
let logged = false;

export function publicGamesReady(): boolean {
    return ready === true;
}

/** One probe per isolate. A missing column means public games are off and the old queries stay. */
export async function detectPublicGames(db: D1Database): Promise<boolean> {
    if (ready !== null) return ready;
    const row = await db.prepare(
        `SELECT name FROM pragma_table_info('universes') WHERE name = 'public_games'`,
    ).first<{ name: string }>();
    ready = row?.name === 'public_games';
    if (!ready && !logged) {
        logged = true;
        console.log(JSON.stringify({
            event: 'public_games_schema_missing',
            message: 'Migration 0013 is not applied. Public games stay off.',
        }));
    }
    return ready;
}

export function publicShipsReady(): boolean {
    return shipsReady === true;
}

/** One probe per isolate. A missing table means the Worker still writes the single `public_marks` row. */
export async function detectPublicShips(db: D1Database): Promise<boolean> {
    if (shipsReady !== null) return shipsReady;
    const row = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'public_ships'`,
    ).first<{ name: string }>();
    shipsReady = row?.name === 'public_ships';
    return shipsReady;
}

export function publicCardsReady(): boolean {
    return cardsReady === true;
}

/** One probe per isolate. A missing table means the card route answers 503 and the feed stays as after 0017. */
export async function detectPublicCards(db: D1Database): Promise<boolean> {
    if (cardsReady !== null) return cardsReady;
    const row = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'public_cards'`,
    ).first<{ name: string }>();
    cardsReady = row?.name === 'public_cards';
    return cardsReady;
}

/** 1 or 0 when 0013 is applied and the row exists. Null when the column is absent or the row is gone. */
export async function readPublicGames(db: D1Database, universeId: string): Promise<0 | 1 | null> {
    if (!publicGamesReady()) return null;
    const row = await db.prepare(
        `SELECT public_games AS publicGames FROM universes WHERE id = ?`,
    ).bind(universeId).first<{ publicGames: number }>();
    if (!row) return null;
    return Number(row.publicGames) === 1 ? 1 : 0;
}
