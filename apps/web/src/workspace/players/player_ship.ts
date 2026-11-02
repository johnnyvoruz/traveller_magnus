/**
 * The party ship as a player reads it (Lane D's DP2; Johnny's yes to question 129): which vessel gets its
 * sections on the player's record page, and the words those sections say where the referee's words were
 * about a control. The read is the players' projection as it arrives (`@voyage/shared` `playersView`:
 * `projectRecord` keeps `sheet` and `status`, `projectStatus` drops `fuelMark` and the hidden ids); nothing
 * here reads anything a player cannot. Pure.
 */
import { DeckPlan, type CampaignRecord, type LedgerLine } from '@voyage/shared';

/** A vessel marked Players that is one of the party's ships (the Party tab's "Your ship" and the rest of `vesselIds`). */
export function isPartyShip(record: Pick<CampaignRecord, 'id' | 'type' | 'visibility' | 'deleted'> | null | undefined, party: { vesselIds?: readonly string[] | null } | null | undefined): boolean {
    if (!record || record.deleted || record.type !== 'vessel' || record.visibility !== 'players') return false;
    return !!party && Array.isArray(party.vesselIds) && party.vesselIds.includes(record.id);
}

/** "12 t", "12.5 t". */
export function tonsWords(n: number): string {
    return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + ' t';
}

/** The ledger kinds' words, the referee's (VesselTrade.vue's KIND_WORDS, pinned by a test). */
export const LEDGER_KIND_WORDS: Record<LedgerLine['kind'], string> = { income: 'Income', expense: 'Expense', recurring: 'Recurring cost' };

/**
 * The Fuel line: "30 t of 41 t" when both are known; what is aboard alone when the sheet has no Fuel
 * Capacity; the capacity alone, and that nothing is written, when the referee has not typed the fuel
 * aboard; one sentence when the sheet says nothing about fuel.
 */
export function fuelWords(aboard: number | null, capacity: number | null): string {
    if (capacity !== null && aboard !== null) return tonsWords(aboard) + ' of ' + tonsWords(capacity);
    if (capacity !== null) return 'Fuel Capacity ' + tonsWords(capacity) + '. The fuel aboard is not written yet.';
    if (aboard !== null) return tonsWords(aboard) + ' aboard.';
    return 'The ship sheet says nothing about fuel yet.';
}

/** "12 t of 64 t", or what is aboard alone when the sheet has no Cargo Capacity. */
export function holdWords(used: number, capacity: number | null): string {
    return capacity === null ? tonsWords(used) + ' aboard.' : tonsWords(used) + ' of ' + tonsWords(capacity);
}

/** The plan on the sheet, when it is one the shipyard wrote (as VesselPlan.vue reads it). */
export function deckPlanOf(sheet: unknown): DeckPlan | null {
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return null;
    const parsed = DeckPlan.safeParse((sheet as Record<string, unknown>).deckPlan);
    return parsed.success ? parsed.data : null;
}
