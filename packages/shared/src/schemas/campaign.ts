import { z } from 'zod';

/**
 * Campaign on the truth. directives/slice_2_campaign.md §0 and K1.
 * Hex keys use the overlay document's `<slug>/<hhhh>` pattern. The legacy slot id is rejected.
 * A body key is the dossier key (`s0`, `w3`, `w3m1`) and is stable only within one truth version.
 */

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
} as const;

/**
 * Sanity limit on a system point, in AU from the primary.
 * A million AU is about sixteen light-years: past any orbit this picture places,
 * and short of a jump. A runaway number is refused. A real in-system point is not.
 */
export const POINT_AU_LIMIT = 1_000_000;

const HEX_KEY = /^[^/]+\/\d{4}$/;
const BODY_KEY = /^(?:s\d+|w\d+(?:m\d+)?)$/;
const RECORD_ID = /^cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_ID = /^cl_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CAMPAIGN_RECORD_TYPES = [
    'person', 'place', 'business', 'organization', 'job', 'event', 'item', 'note', 'vessel',
] as const;
export type CampaignRecordType = typeof CAMPAIGN_RECORD_TYPES[number];

const LINK_KIND_NAMES = [
    'member', 'owns', 'crew', 'passenger', 'commands', 'ally', 'rival', 'enemy', 'contact', 'patron', 'client', 'target', 'involved',
] as const;
export const CampaignLinkKindName = z.enum(LINK_KIND_NAMES);
export type CampaignLinkKindName = z.infer<typeof CampaignLinkKindName>;

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

const Day = z.object({
    year: z.number().int(),
    day: z.number().int().min(1).max(365),
}).strict();

const AuCoord = z.number().finite().min(-POINT_AU_LIMIT).max(POINT_AU_LIMIT);

/** AU from the primary, in the frame realPositionAu answers in. */
const SystemPoint = z.object({
    x: AuCoord,
    y: AuCoord,
}).strict();

const SystemAnchor = z.object({
    kind: z.literal('system'),
    hexKey: z.string().regex(HEX_KEY),
    bodyKey: z.string().regex(BODY_KEY).optional(),
    /** A place in open space. Not given with a bodyKey: a point is not a body. */
    point: SystemPoint.optional(),
    locationLabel: z.string().optional(),
}).strict().superRefine((anchor, ctx) => {
    if (anchor.point !== undefined && anchor.bodyKey !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a point is not a body', path: ['point'] });
    }
});

const RecordAnchor = z.object({
    kind: z.literal('record'),
    id: z.string().regex(RECORD_ID),
}).strict();

export const CampaignAnchor = z.union([z.null(), SystemAnchor, RecordAnchor]);
export type CampaignAnchor = z.infer<typeof CampaignAnchor>;

const Rev = z.number().int().nonnegative();
const Stamp = z.string().min(1);
const Visibility = z.enum(['referee', 'players']);

/** Where a copied or shared row came from. Null on a row born in this campaign. */
export const CampaignProvenance = z.object({
    mode: z.enum(['copy', 'shared']),
    universeId: z.string().min(1),
    recordId: z.string().min(1),
    rev: Rev,
    at: Stamp,
}).strict();
export type CampaignProvenance = z.infer<typeof CampaignProvenance>;

const IMAGE_HASH = /^[0-9a-f]{64}$/;

/** A WebP object and its thumbnail. The asset id is the hash. */
export const CampaignImage = z.object({
    hash: z.string().regex(IMAGE_HASH),
    thumbHash: z.string().regex(IMAGE_HASH),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().nonnegative(),
    caption: z.string().max(CAMPAIGN_LIMITS.caption).optional(),
}).strict();
export type CampaignImage = z.infer<typeof CampaignImage>;

/** One dated leg of a vessel's track. Durations are the numbers on the leg. */
export const TrackLeg = z.object({
    from: CampaignAnchor,
    to: CampaignAnchor,
    departs: z.number().finite().nonnegative(),
    arrives: z.number().finite().nonnegative(),
    mode: z.enum(['docked', 'orbit', 'flight', 'jump']),
    accelG: z.number().finite().min(1).max(6).optional(),
    note: z.string().max(CAMPAIGN_LIMITS.trackNote).optional(),
}).strict().superRefine((leg, ctx) => {
    if (leg.arrives < leg.departs) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'arrives before departs', path: ['arrives'] });
    }
});
export type TrackLeg = z.infer<typeof TrackLeg>;

/** Legs in time order. Each departs at or after the previous arrives. */
export const Track = z.array(TrackLeg).max(CAMPAIGN_LIMITS.track).superRefine((legs, ctx) => {
    for (let i = 1; i < legs.length; i += 1) {
        if (legs[i].departs < legs[i - 1].arrives) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'out of time order', path: [i, 'departs'] });
            return;
        }
    }
});
export type Track = z.infer<typeof Track>;

/** `track`, when present, is a vessel's ordered legs. Other status keys stay free. */
const RecordStatus = z.object({
    track: Track.optional(),
}).passthrough();

export const CampaignRecord = z.object({
    id: z.string().regex(RECORD_ID),
    type: z.enum(CAMPAIGN_RECORD_TYPES),
    kind: z.string(),
    name: z.string().min(1).max(CAMPAIGN_LIMITS.name),
    summary: z.string().max(CAMPAIGN_LIMITS.summary),
    details: z.string().max(CAMPAIGN_LIMITS.details),
    tags: z.array(z.string().max(CAMPAIGN_LIMITS.tag)).max(CAMPAIGN_LIMITS.tags),
    anchor: CampaignAnchor,
    when: z.object({ start: Day, end: Day.optional() }).strict().nullable(),
    visibility: Visibility,
    playerNotes: z.string().nullable(),
    sheet: z.unknown().nullable(),
    status: RecordStatus.nullable(),
    images: z.array(CampaignImage).max(CAMPAIGN_LIMITS.images).nullable(),
    provenance: CampaignProvenance.nullable(),
    rev: Rev,
    createdAt: Stamp,
    updatedAt: Stamp,
    deleted: z.boolean(),
}).strict();
export type CampaignRecord = z.infer<typeof CampaignRecord>;

export const CampaignLink = z.object({
    id: z.string().regex(LINK_ID),
    from: z.string().regex(RECORD_ID),
    to: z.string().regex(RECORD_ID),
    kind: CampaignLinkKindName,
    role: z.string(),
    order: z.number().int(),
    since: Day.nullable(),
    until: Day.nullable(),
    notes: z.string(),
    visibility: Visibility,
    provenance: CampaignProvenance.nullable(),
    rev: Rev,
    createdAt: Stamp,
    updatedAt: Stamp,
    deleted: z.boolean(),
}).strict();
export type CampaignLink = z.infer<typeof CampaignLink>;

export const CampaignSettings = z.object({
    party: z.object({
        vesselId: z.string().regex(RECORD_ID).nullable(),
        memberIds: z.array(z.string().regex(RECORD_ID)),
        anchor: CampaignAnchor,
    }).strict(),
    kinds: z.record(z.string(), z.array(z.string())),
    calendar: z.object({
        dateFormat: z.enum(['imperial', 'long']),
    }).strict(),
    rev: Rev,
}).strict();
export type CampaignSettings = z.infer<typeof CampaignSettings>;

const Name = z.string().min(1).max(CAMPAIGN_LIMITS.name);
const UniverseId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const Universe = z.object({
    id: z.string().min(1),
    ownerId: z.string().min(1),
    name: Name,
    slug: z.string().min(1),
    truthVersion: z.string().nullable(),
    engineVersion: z.string(),
    editionDefault: z.string().min(1),
    createdAt: Stamp,
    updatedAt: Stamp,
    deletedAt: z.string().nullable(),
    purgeAfter: z.string().nullable(),
    hexOverrideCount: z.number().int().nonnegative(),
    objectBytes: z.number().int().nonnegative(),
    lastSnapshotAt: z.string().nullable(),
}).strict();
export type Universe = z.infer<typeof Universe>;

export const UniverseCreate = z.object({
    id: UniverseId.optional(),
    name: Name,
    truthVersion: z.string().nullable(),
    editionDefault: z.string().min(1),
}).strict();
export type UniverseCreate = z.infer<typeof UniverseCreate>;

export const UniverseUpdate = z.object({
    name: Name,
}).strict();
export type UniverseUpdate = z.infer<typeof UniverseUpdate>;

const BaseRev = z.number().int().nonnegative();

export const RecordChange = z.union([
    CampaignRecord.extend({ baseRev: BaseRev }).strict(),
    z.object({ id: z.string().regex(RECORD_ID), baseRev: BaseRev, deleted: z.literal(true) }).strict(),
]);
export type RecordChange = z.infer<typeof RecordChange>;

export const LinkChange = z.union([
    CampaignLink.extend({ baseRev: BaseRev }).strict(),
    z.object({ id: z.string().regex(LINK_ID), baseRev: BaseRev, deleted: z.literal(true) }).strict(),
]);
export type LinkChange = z.infer<typeof LinkChange>;

export const SettingsChange = CampaignSettings.extend({ baseRev: BaseRev }).strict();
export type SettingsChange = z.infer<typeof SettingsChange>;

/** Orbit-clock day count. A fraction is the time of day. `rev` is the stored version. */
export const CampaignClock = z.object({
    days: z.number().finite().nonnegative(),
    rev: Rev,
}).strict();
export type CampaignClock = z.infer<typeof CampaignClock>;

export const ClockChange = z.object({
    days: z.number().finite().nonnegative(),
    baseRev: BaseRev,
}).strict();
export type ClockChange = z.infer<typeof ClockChange>;

export const CampaignChanges = z.object({
    records: z.array(RecordChange).optional(),
    links: z.array(LinkChange).optional(),
    settings: SettingsChange.optional(),
    clock: ClockChange.optional(),
}).strict().superRefine((value, ctx) => {
    const rows = (value.records?.length ?? 0) + (value.links?.length ?? 0) + (value.settings ? 1 : 0) + (value.clock ? 1 : 0);
    if (rows > CAMPAIGN_LIMITS.patchRows) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'too_large', path: ['records'] });
    }
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    if (bytes > CAMPAIGN_LIMITS.patchBytes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'too_large', path: [] });
    }
});
export type CampaignChanges = z.infer<typeof CampaignChanges>;

export const CampaignPage = z.object({
    records: z.array(CampaignRecord),
    links: z.array(CampaignLink),
    settings: CampaignSettings,
    clock: CampaignClock.nullable(),
    seq: Rev,
    done: z.boolean(),
}).strict();
export type CampaignPage = z.infer<typeof CampaignPage>;

const ChangeId = z.string().min(1);

export const CampaignChangesResult = z.object({
    applied: z.array(z.object({
        table: z.enum(['records', 'links', 'settings', 'clock']),
        id: ChangeId,
        rev: Rev,
        seq: Rev,
    }).strict()),
    conflicts: z.array(z.discriminatedUnion('table', [
        z.object({ table: z.literal('records'), id: ChangeId, current: CampaignRecord }).strict(),
        z.object({ table: z.literal('links'), id: ChangeId, current: CampaignLink }).strict(),
        z.object({ table: z.literal('settings'), id: ChangeId, current: CampaignSettings }).strict(),
        z.object({ table: z.literal('clock'), id: ChangeId, current: CampaignClock.nullable() }).strict(),
    ])),
}).strict();
export type CampaignChangesResult = z.infer<typeof CampaignChangesResult>;

export type SystemAnchor = Extract<CampaignAnchor, { kind: 'system' }>;

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
