/**
 * Where campaign records are (findings/campaign_workspace_design.md §3 and §4;
 * slice_2_campaign.md §0.4): the anchor a screen stores, the place a record resolves to
 * through "aboard" anchors, and the records at a system or on one of its bodies. Pure: it
 * runs under Node. The body key is the dossier's (s0, w3, w3m1) and the body's name is kept
 * beside it as `locationLabel`, so a key that no longer matches can be said in words.
 */
import { locate, type CampaignAnchor, type CampaignRecord } from '@voyage/shared';

export type SystemPlace = { slug: string; hex: string };

/** A world, moon or star of a system, as the dossier names it. */
export type BodyChoice = { key: string; name: string };

/** Where a record is once "aboard" anchors are followed to a system. */
export type Resolved = { hexKey: string; bodyKey: string | null; label: string };

const LABEL_MAX = 120;

export function hexKeyOf(slug: string, hex: string): string {
    return slug + '/' + hex;
}

export function parseHexKey(hexKey: string): SystemPlace | null {
    const cut = hexKey.lastIndexOf('/');
    if (cut <= 0) return null;
    const hex = hexKey.slice(cut + 1);
    return /^\d{4}$/.test(hex) ? { slug: hexKey.slice(0, cut), hex } : null;
}

/** "Spinward_Marches/1910" as it is read: "Spinward Marches 1910". */
export function hexWords(hexKey: string): string {
    const place = parseHexKey(hexKey);
    return place ? place.slug.replace(/_/g, ' ') + ' ' + place.hex : hexKey;
}

function label(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);
}

/**
 * The anchor for a system, or for one body of it. With a body, the label is the body's name
 * (the ruling on body anchors). Without one, the label is the system's name, so the place
 * can be said without the sector index.
 */
export function systemAnchor(hexKey: string, systemName: string, body: BodyChoice | null): CampaignAnchor {
    if (body) {
        const name = label(body.name);
        return name ? { kind: 'system', hexKey, bodyKey: body.key, locationLabel: name } : { kind: 'system', hexKey, bodyKey: body.key };
    }
    const name = label(systemName);
    return name ? { kind: 'system', hexKey, locationLabel: name } : { kind: 'system', hexKey };
}

export function sameAnchor(a: CampaignAnchor, b: CampaignAnchor): boolean {
    if (a === null || b === null) return a === b;
    if (a.kind === 'record' || b.kind === 'record') return a.kind === 'record' && b.kind === 'record' && a.id === b.id;
    return a.hexKey === b.hexKey && (a.bodyKey ?? '') === (b.bodyKey ?? '') && (a.locationLabel ?? '') === (b.locationLabel ?? '');
}

/** The live records by id: a deleted record anchors nothing. */
export function liveById(records: Readonly<Record<string, CampaignRecord>>): Record<string, CampaignRecord> {
    const live: Record<string, CampaignRecord> = {};
    for (const record of Object.values(records)) if (!record.deleted) live[record.id] = record;
    return live;
}

/** Where the record is, following "aboard" anchors to a system. Null for nowhere, a loop or a missing record. */
export function resolvePlace(id: string, live: Readonly<Record<string, CampaignRecord>>): Resolved | null {
    const found = locate(id, live);
    if (!found) return null;
    return { hexKey: found.hexKey, bodyKey: found.bodyKey ?? null, label: found.locationLabel ?? '' };
}

/**
 * The place in words, the most particular first: ["Regina A-IV", "Spinward Marches 1910"] for a
 * world, ["Regina system", "Spinward Marches 1910"] for a system as a whole (a mainworld often
 * has its system's name, and the two must not read alike).
 */
export function placeWords(place: Resolved): string[] {
    const hex = hexWords(place.hexKey);
    if (!place.label) return [hex];
    return [place.bodyKey === null ? place.label + ' system' : place.label, hex];
}

function byName(a: CampaignRecord, b: CampaignRecord): number {
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The live records at a system, by name: everything that resolves to the hex, or with a body
 * key only what resolves to that body. Someone aboard a vessel that is there is there.
 */
export function recordsHere(records: Readonly<Record<string, CampaignRecord>>, hexKey: string, bodyKey: string | null): CampaignRecord[] {
    const live = liveById(records);
    const out: CampaignRecord[] = [];
    for (const record of Object.values(live)) {
        const place = resolvePlace(record.id, live);
        if (!place || place.hexKey !== hexKey) continue;
        if (bodyKey !== null && place.bodyKey !== bodyKey) continue;
        out.push(record);
    }
    return out.sort(byName);
}

/** How many live records each body of a system holds, by body key. Bodies with none are absent. */
export function bodyCounts(records: Readonly<Record<string, CampaignRecord>>, hexKey: string): Record<string, number> {
    const live = liveById(records);
    const counts: Record<string, number> = {};
    for (const record of Object.values(live)) {
        const place = resolvePlace(record.id, live);
        if (!place || place.hexKey !== hexKey || place.bodyKey === null) continue;
        counts[place.bodyKey] = (counts[place.bodyKey] ?? 0) + 1;
    }
    return counts;
}

/**
 * Whether a body anchor still names a body of its system. `keys` is the system's body keys, or
 * null while they are not known (then nothing is said against the anchor).
 */
export function bodyMatched(place: Resolved, keys: readonly string[] | null): boolean {
    return place.bodyKey === null || keys === null || keys.includes(place.bodyKey);
}

/** The row's line in a dossier's list: the type's word is the caller's; this is the place within the system. */
export function withinSystem(place: Resolved, systemName: string): string {
    if (place.bodyKey === null) return 'In this system';
    if (!place.label) return 'On a world here';
    // "Regina A-IV" in the Regina system is "A-IV", as the orbit view's labels have it.
    return systemName && place.label.startsWith(systemName + ' ') ? place.label.slice(systemName.length + 1) : place.label;
}
