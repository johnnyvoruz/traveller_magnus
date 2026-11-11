/**
 * DS5: one press moves credits between the party ship's Ledger and a character's credit register, two
 * books with one `linkId`. The register's half first (`POST /api/characters/:id/ledger`, kind `transfer`):
 * the server makes a referee's line pending and the character's own player's line not, as every line is.
 * Then the ship's half: the referee's record save, or a player's piece through the append door. When the
 * ship's half does not land, the register's half is turned back with a reversing line under the same link,
 * and the press says "The credits were not moved. Try again." Nothing is removed: CRUD, append-only.
 */
import type { CampaignRecord } from '@voyage/shared';
import { openRegister } from '../characters/register.ts';
import { postLedger } from '../campaign/ledger.ts';
import { transport } from '../campaign/store.ts';
import { apiFetch } from '../platform/http.ts';
import { sendTrade, type Who } from './trade_send.ts';
import { NOT_MOVED, reversingLine, transferLines, type TransferDraft, type TransferLines } from './transfer.ts';
import { ledgerOf, statusWithTrade } from './vessel_trade.ts';

async function postRegister(characterId: string, line: TransferLines['register']): Promise<boolean> {
    try {
        const res = await apiFetch(transport.fetch, '/api/characters/' + encodeURIComponent(characterId) + '/ledger', {
            method: 'POST',
            body: JSON.stringify(line),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** The register on screen, if one is open for this character, reads its lines again. */
function refresh(characterId: string): void {
    const register = openRegister(characterId);
    if (register.status !== 'loading') void register.load();
}

/** Answers '' when both books hold the transfer, else the one sentence. */
export async function moveCredits(who: Who, record: CampaignRecord, characterId: string, draft: TransferDraft): Promise<string> {
    const lines = transferLines(draft);
    if (!(await postRegister(characterId, lines.register))) return NOT_MOVED;
    const said = await sendTrade(who, record, { status: statusWithTrade(record, { ledger: postLedger(ledgerOf(record), lines.ship) }) });
    if (said) {
        await postRegister(characterId, reversingLine(lines.register));
        refresh(characterId);
        return NOT_MOVED;
    }
    refresh(characterId);
    return '';
}
