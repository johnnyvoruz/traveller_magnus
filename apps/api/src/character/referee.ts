import { CAMPAIGN_LIMITS } from '@voyage/shared';
import type { Env } from '../env';
import type { CatalogueDb } from './service.ts';

/**
 * A pending line is allowed only when the caller owns a live campaign whose
 * sheet names this character and whose active members include the character's
 * owner or an editor. Naming the id is not enough. An archived member does
 * not count. A missing members table is no.
 */
export async function campaignReferee(db: CatalogueDb, env: Env, userId: string, characterId: string): Promise<boolean> {
    if (!characterId) return false;
    const holders = await db.all(
        `SELECT user_id AS userId FROM character_access WHERE character_id = ? AND role IN ('owner', 'editor')`,
        characterId,
    );
    const holderIds = holders.map((row) => String(row.userId ?? '')).filter((id) => id !== '');
    if (!holderIds.length) return false;
    const members = await db.get(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'universe_members'`,
    );
    if (!members) return false;
    const universes = await db.all(
        `SELECT id FROM universes WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
        userId,
        CAMPAIGN_LIMITS.universes,
    );
    const marks = holderIds.map(() => '?').join(', ');
    for (const row of universes) {
        const universeId = String(row.id);
        const seated = await db.get(
            `SELECT user_id AS userId FROM universe_members
             WHERE universe_id = ? AND status = 'active' AND user_id IN (${marks}) LIMIT 1`,
            universeId,
            ...holderIds,
        );
        if (!seated) continue;
        const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
        const response = await stub.fetch(new Request(
            `https://universe.internal/campaign/holds-character?id=${encodeURIComponent(characterId)}`,
        ));
        if (!response.ok) continue;
        const body = await response.json() as { ok?: boolean; data?: { holds?: boolean } };
        if (body.ok && body.data?.holds === true) return true;
    }
    return false;
}
