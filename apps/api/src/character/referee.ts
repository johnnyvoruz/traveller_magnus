import { CAMPAIGN_LIMITS } from '@voyage/shared';
import type { Env } from '../env';
import type { CatalogueDb } from './service.ts';

/**
 * A campaign owner who is not on the character may still post a pending line.
 * The character row has no universe id, so this asks each live universe that
 * account owns whether a campaign sheet names the character.
 */
export async function campaignReferee(db: CatalogueDb, env: Env, userId: string, characterId: string): Promise<boolean> {
    const rows = await db.all(
        `SELECT id FROM universes WHERE owner_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
        userId,
        CAMPAIGN_LIMITS.universes,
    );
    for (const row of rows) {
        const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(String(row.id)));
        const response = await stub.fetch(new Request(
            `https://universe.internal/campaign/holds-character?id=${encodeURIComponent(characterId)}`,
        ));
        if (!response.ok) continue;
        const body = await response.json() as { ok?: boolean; data?: { holds?: boolean } };
        if (body.ok && body.data?.holds === true) return true;
    }
    return false;
}
