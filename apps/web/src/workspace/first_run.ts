/**
 * The first-run card (L4): up until a vessel has a place and the campaign date is set.
 * An open world ticks the first step for this visit only. Nothing here is stored.
 */
import type { CampaignClock, CampaignRecord } from '@voyage/shared';
import { liveById, resolvePlace } from './places.ts';

export type OpenWorld = { hex: string; missing: boolean };

export type FirstRunInput = {
    worldOpen: boolean;
    shipPlaced: boolean;
    dateSet: boolean;
};

export type FirstRunCard = {
    show: boolean;
    world: boolean;
    ship: boolean;
    date: boolean;
};

/** A four-digit hex the dossier is showing, and that is not a missing world. */
export function worldIsOpen(dossier: OpenWorld | null): boolean {
    if (!dossier || dossier.missing) return false;
    return /^\d{4}$/.test(dossier.hex);
}

/** A live vessel whose place resolves to a system. */
export function vesselHasPlace(records: Readonly<Record<string, CampaignRecord>>): boolean {
    const live = liveById(records);
    for (const record of Object.values(live)) {
        if (record.type !== 'vessel') continue;
        if (resolvePlace(record.id, live)) return true;
    }
    return false;
}

export function dateIsSet(clock: CampaignClock | null): boolean {
    return clock !== null;
}

/**
 * The card stays until a vessel has a place and the date is set.
 * An open world ticks step 1 and does not hide the card by itself.
 */
export function firstRunCard(input: FirstRunInput): FirstRunCard {
    return {
        show: !(input.shipPlaced && input.dateSet),
        world: input.worldOpen,
        ship: input.shipPlaced,
        date: input.dateSet,
    };
}

/** The first step that is not done. */
export function firstRunCurrent(card: FirstRunCard): 1 | 2 | 3 {
    if (!card.world) return 1;
    if (!card.ship) return 2;
    return 3;
}
