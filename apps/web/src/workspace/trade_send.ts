/**
 * DS4b: the one write of the ship's trade sections. The referee's press is the record commit it always
 * was; a player's press is one piece through the append door, as the character picked on the page.
 * Answers '' when the write went (or was queued), else the one sentence to show by the button.
 */
import type { CampaignRecord, EntryChange } from '@voyage/shared';
import { appendStatus } from '../campaign/append.ts';
import { actingPerson, myPersonIds } from './players/me.ts';
import { appendOf, NOT_FROM_PLAYERS, type DoorPress, type Status } from './trade_write.ts';
import { writeTrade } from './vessel_trade.ts';

export type Who = 'referee' | 'player';

export async function sendTrade(
    who: Who,
    record: CampaignRecord,
    change: { sheet?: Record<string, unknown>; status: Status },
    journal?: EntryChange[],
    /** DT9: a player's Board or Pay now, which the door carries as B's pieces (BT2). The referee's save ignores it. */
    press?: DoorPress,
): Promise<string> {
    if (who === 'referee') {
        writeTrade(record, change, journal);
        return '';
    }
    // The door carries no sheet and no journal: a player's press touches the status alone.
    if (change.sheet) return NOT_FROM_PLAYERS;
    const append = appendOf(record.status as Status | null, change.status, press);
    if (!append) return NOT_FROM_PLAYERS;
    const person = actingPerson();
    if (!person) return NOT_FROM_PLAYERS;
    const result = await appendStatus(record.id, append, myPersonIds().length > 1 ? person : undefined);
    return result.ok ? '' : result.sentence;
}
