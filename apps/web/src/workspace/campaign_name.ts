/**
 * The campaign's name on Start here and beside the invite link (Lane D's DU44, DW3 round 6 stop 2).
 * The first campaign is made as "My map" without asking (campaign/store.ts); these rules say when
 * that name still stands and what a typed name saves as. Pure.
 */
import { cleanCampaignName } from './campaigns.ts';

/** The name the store gives a first campaign when nobody has typed one. */
export const DEFAULT_CAMPAIGN_NAME = 'My map';

/** True while the campaign still carries the store's own name. */
export function isDefaultName(name: string): boolean {
    return cleanCampaignName(name) === DEFAULT_CAMPAIGN_NAME;
}

/** The open campaign's name, or '' when none is open. */
export function openCampaignName(universes: readonly { id: string; name: string }[], id: string | null): string {
    if (!id) return '';
    const found = universes.find((item) => item.id === id);
    return found ? found.name : '';
}

/** What a typed name saves as: cleaned; null when blank or unchanged. */
export function nameToSave(draft: string, current: string): string | null {
    const name = cleanCampaignName(draft);
    if (!name || name === cleanCampaignName(current)) return null;
    return name;
}

/** "Your campaign is still called My map." */
export function stillCalledWords(name: string): string {
    return 'Your campaign is still called ' + cleanCampaignName(name) + '.';
}
