/**
 * The campaign values that need no zod: limits, record and link kinds, the mention reader,
 * `locate`, and `linkAllowed`. The schemas in `schemas/campaign.ts` import from here and
 * re-export these names, so `@voyage/shared` still answers every one of them.
 * The map imports this file through `@voyage/shared/campaign_core` so a first-paint
 * module that only needs a limit or a kind does not pull the schema library in.
 * Keep zod, and any import that reaches zod at runtime, out of this file.
 * tests/shared/zod_free.test.js reads this file and the other `*_core` modules for that.
 */
import type { CampaignAnchor, SystemAnchor } from './schemas/campaign.ts';

/** §0.10. A breach is `validation` or `too_large` at the server; the schema refuses the value. */
export const CAMPAIGN_LIMITS = {
    records: 20_000,
    links: 60_000,
    patchRows: 200,
    patchBytes: 1_000_000,
    name: 200,
    summary: 500,
    details: 20_000,
    tags: 32,
    tag: 40,
    universes: 10,
    images: 12,
    caption: 200,
    track: 500,
    trackNote: 200,
    journal: 20_000,
    entryTitle: 200,
    entryBody: 100_000,
    mentions: 200,
    /** Party ships. A table of spare hulls fits; the public feed lists the same number on one hex. */
    partyShips: 20,
} as const;

/**
 * Sanity limit on a system point, in AU from the primary.
 * A million AU is about sixteen light-years: past any orbit this picture places,
 * and short of a jump. A runaway number is refused. A real in-system point is not.
 */
export const POINT_AU_LIMIT = 1_000_000;

/** A record id as the server mints it: `cr_` and a UUID. Not part of the public barrel. */
export const RECORD_ID = /^cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CAMPAIGN_RECORD_TYPES = [
    'person', 'place', 'business', 'organization', 'job', 'event', 'item', 'note', 'vessel',
] as const;
export type CampaignRecordType = typeof CAMPAIGN_RECORD_TYPES[number];

export const CAMPAIGN_ENTRY_KINDS = ['session', 'note', 'handout', 'rumor'] as const;
export type CampaignEntryKind = typeof CAMPAIGN_ENTRY_KINDS[number];

export const LINK_KIND_NAMES = [
    'member', 'owns', 'crew', 'passenger', 'commands', 'ally', 'rival', 'enemy', 'contact', 'patron', 'client', 'target', 'involved',
] as const;
export type CampaignLinkKindName = typeof LINK_KIND_NAMES[number];

export type CampaignLinkKind = {
    kind: CampaignLinkKindName;
    fromTypes: readonly CampaignRecordType[];
    toTypes: readonly CampaignRecordType[];
    labelFrom: string;
    labelTo: string;
    symmetric: boolean;
};

const ALL_TYPES = CAMPAIGN_RECORD_TYPES;

/** First-pass rows of campaign_manager_plan.md §2.3. Labels only. */
export const CAMPAIGN_LINK_KINDS: readonly CampaignLinkKind[] = [
    { kind: 'member', fromTypes: ['person', 'organization', 'vessel'], toTypes: ['organization'], labelFrom: 'Member of', labelTo: 'Members', symmetric: false },
    { kind: 'owns', fromTypes: ['person', 'organization'], toTypes: ['vessel', 'item', 'place', 'business'], labelFrom: 'Owns', labelTo: 'Owned by', symmetric: false },
    { kind: 'crew', fromTypes: ['person'], toTypes: ['vessel'], labelFrom: 'Crew of', labelTo: 'Crew', symmetric: false },
    // Slice 2 follow-up 9 (2026-10-05): the ship sheet's passengers as people. Labels only.
    { kind: 'passenger', fromTypes: ['person'], toTypes: ['vessel'], labelFrom: 'Passenger on', labelTo: 'Passengers', symmetric: false },
    { kind: 'commands', fromTypes: ['person'], toTypes: ['vessel', 'organization'], labelFrom: 'Commands', labelTo: 'Commanded by', symmetric: false },
    { kind: 'ally', fromTypes: ['person', 'organization'], toTypes: ['person', 'organization'], labelFrom: 'Ally', labelTo: 'Ally', symmetric: true },
    { kind: 'rival', fromTypes: ['person', 'organization'], toTypes: ['person', 'organization'], labelFrom: 'Rival', labelTo: 'Rival', symmetric: true },
    { kind: 'enemy', fromTypes: ['person', 'organization'], toTypes: ['person', 'organization'], labelFrom: 'Enemy', labelTo: 'Enemy', symmetric: true },
    { kind: 'contact', fromTypes: ['person', 'organization'], toTypes: ['person', 'organization'], labelFrom: 'Contact', labelTo: 'Contact', symmetric: true },
    { kind: 'patron', fromTypes: ['person', 'organization'], toTypes: ['job'], labelFrom: 'Patron of', labelTo: 'Patron', symmetric: false },
    { kind: 'client', fromTypes: ['person', 'organization'], toTypes: ['job'], labelFrom: 'Client of', labelTo: 'Client', symmetric: false },
    { kind: 'target', fromTypes: ['job'], toTypes: ALL_TYPES, labelFrom: 'Concerns', labelTo: 'Subject of', symmetric: false },
    { kind: 'involved', fromTypes: ALL_TYPES, toTypes: ['event'], labelFrom: 'Involved in', labelTo: 'Involved', symmetric: false },
];

/** A mention target written as a hex: `hex:<slug>/<hhhh>`. Not part of the public barrel. */
export const MENTION_HEX = /^hex:[^/]+\/\d{4}$/;

const MENTION_TOKEN = /\[\[(cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|hex:[^/\]|]+\/\d{4})(?:\|[^\]]*)?\]\]/;

/**
 * The distinct record ids and hex targets in `text`, in the order first seen.
 * A token is `[[cr_<uuid>|Captain Voss]]` or `[[hex:Spinward_Marches/1910|Regina]]`. The label may be left off.
 * Anything else between double brackets is left alone.
 */
export function mentionsOf(text: string): string[] {
    const found: string[] = [];
    const seen = new Set<string>();
    const tokens = new RegExp(MENTION_TOKEN.source, 'gi');
    for (const match of text.matchAll(tokens)) {
        const target = match[1];
        if (!target) continue;
        const record = RECORD_ID.test(target);
        const hex = MENTION_HEX.test(target);
        if (!record && !hex) continue;
        const key = target.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(target);
        if (found.length >= CAMPAIGN_LIMITS.mentions) break;
    }
    return found;
}

/**
 * One step of a locate walk. `follow` is the anchor to use instead of the record's own.
 * `done` ends the walk with that value. Absent means the record's own anchor.
 */
export type LocateAt<T> = (
    id: string,
    record: { anchor: CampaignAnchor },
) => { follow: CampaignAnchor } | { done: T } | undefined;

/**
 * Follows `kind: 'record'` anchors to a system anchor.
 * Eight hops land on the eighth record. A system there is returned. A further hop is not taken.
 * A cycle or a missing id returns null.
 * `at`, when passed, may replace one record's anchor or end the walk. Callers that pass none
 * keep the walk above.
 */
export function locate(
    id: string,
    recordsById: Readonly<Record<string, { anchor: CampaignAnchor } | undefined>>,
): SystemAnchor | null;
export function locate<T>(
    id: string,
    recordsById: Readonly<Record<string, { anchor: CampaignAnchor } | undefined>>,
    at: LocateAt<T>,
): SystemAnchor | T | null;
export function locate(
    id: string,
    recordsById: Readonly<Record<string, { anchor: CampaignAnchor } | undefined>>,
    at?: LocateAt<unknown>,
): SystemAnchor | unknown | null {
    const seen = new Set<string>();
    let cursor = id;
    for (let hop = 0; hop <= 8; hop += 1) {
        if (seen.has(cursor)) return null;
        seen.add(cursor);
        const record = recordsById[cursor];
        if (!record) return null;
        const directed = at?.(cursor, record);
        if (directed && 'done' in directed) return directed.done;
        const anchor = directed && 'follow' in directed ? directed.follow : record.anchor;
        if (anchor == null) return null;
        if (anchor.kind === 'system') return anchor;
        if (hop === 8) return null;
        cursor = anchor.id;
    }
    return null;
}

/** True when the §2.3 row allows this pair. Unknown kinds are false. Direction is not swapped. */
export function linkAllowed(kind: string, fromType: string, toType: string): boolean {
    const row = CAMPAIGN_LINK_KINDS.find((item) => item.kind === kind);
    if (!row) return false;
    return row.fromTypes.includes(fromType as CampaignRecordType)
        && row.toTypes.includes(toType as CampaignRecordType);
}
