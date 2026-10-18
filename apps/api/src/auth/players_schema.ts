/** A yes is kept for the isolate. A no is asked again, so applying 0021 needs no restart. */
let membersReady = false;

/** Both 0021 tables. One without the other is treated as not applied. */
export async function detectPlayers(db: D1Database): Promise<boolean> {
    if (membersReady) return true;
    const members = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'universe_members'`,
    ).first<{ name: string }>();
    const invites = await db.prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'universe_invites'`,
    ).first<{ name: string }>();
    membersReady = members?.name === 'universe_members' && invites?.name === 'universe_invites';
    return membersReady;
}
