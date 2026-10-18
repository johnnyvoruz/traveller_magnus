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

const HEX_KEY = /^[^/]+\/\d{4}$/;
const BODY_KEY = /^(?:s\d+|w\d+(?:m\d+)?)$/;
const RECORD_ID = /^cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_ID = /^cl_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOURNAL_ID = /^cj_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CAMPAIGN_RECORD_TYPES = [
    'person', 'place', 'business', 'organization', 'job', 'event', 'item', 'note', 'vessel',
] as const;
export type CampaignRecordType = typeof CAMPAIGN_RECORD_TYPES[number];

export const CAMPAIGN_ENTRY_KINDS = ['session', 'note', 'handout', 'rumor'] as const;
export type CampaignEntryKind = typeof CAMPAIGN_ENTRY_KINDS[number];

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
/** Journal only. Records and links stay on `Visibility`. */
const EntryVisibility = z.enum(['referee', 'players', 'public']);

/** Where a copied or shared row came from. Null on a row born in this campaign. */
const CopiedProvenance = z.object({
    mode: z.enum(['copy', 'shared']),
    universeId: z.string().min(1),
    recordId: z.string().min(1),
    rev: Rev,
    at: Stamp,
}).strict();

/** A row an import of a package wrote (contracts/b_marketplace.md F13). */
const PackageProvenance = z.object({
    mode: z.literal('package'),
    packageId: z.string().min(1),
    version: z.number().int().positive(),
    installId: z.string().min(1),
    at: Stamp,
}).strict();

export const CampaignProvenance = z.union([CopiedProvenance, PackageProvenance]);
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
    /** Present only when the referee typed the hours. Absent means the console estimated them. */
    hoursTyped: z.literal(true).optional(),
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

/**
 * One lot in a vessel's hold (campaign_manager_plan.md §5.3).
 * `itemId` points at an item record when the lot has one. The sheet's sixteen
 * Cargo rows are a view of the first sixteen lots (`campaign/cargo.ts`).
 */
export const CargoLot = z.object({
    itemId: z.string().regex(RECORD_ID).optional(),
    label: z.string(),
    tons: z.number().finite().nonnegative(),
    value: z.number().finite().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    note: z.string().optional(),
}).strict();
export type CargoLot = z.infer<typeof CargoLot>;

/**
 * One passenger (§5.3), plus the sheet's Notes box.
 * `class` is the Passage box. `personId` points at a person record when set.
 */
export const PassengerLot = z.object({
    personId: z.string().regex(RECORD_ID).optional(),
    label: z.string(),
    class: z.string(),
    note: z.string().optional(),
}).strict();
export type PassengerLot = z.infer<typeof PassengerLot>;

/** One posted line (§5.3). `amount` is the credit change as stored. `when` is a campaign day. */
export const LedgerLine = z.object({
    when: Day,
    amount: z.number().finite(),
    memo: z.string(),
    kind: z.enum(['income', 'expense', 'recurring']),
}).strict();
export type LedgerLine = z.infer<typeof LedgerLine>;

/**
 * One holder's shares (T1c). The holder is a person or organization record, or the party.
 * `shares` is the count the referee typed. Nothing here prices a share.
 */
export const OwnerShare = z.object({
    holder: z.union([
        z.object({
            kind: z.literal('record'),
            id: z.string().regex(RECORD_ID),
        }).strict(),
        z.literal('party'),
    ]),
    shares: z.number().finite(),
}).strict();
export type OwnerShare = z.infer<typeof OwnerShare>;

/**
 * A ship payment the referee typed (T1c). `everyDays` is whole campaign days.
 * No period is filled in when this object is absent.
 */
export const ShipPayment = z.object({
    amountCr: z.number().finite(),
    everyDays: z.number().int().positive(),
    nextDueDay: Day,
    payee: z.string().optional(),
}).strict();
export type ShipPayment = z.infer<typeof ShipPayment>;

/** `track`, when present, is a vessel's ordered legs. Cargo, passengers, the ledger, owners, payment and fuel are optional. Other status keys stay free. */
const RecordStatus = z.object({
    track: Track.optional(),
    cargo: z.array(CargoLot).optional(),
    passengers: z.array(PassengerLot).optional(),
    ledger: z.array(LedgerLine).optional(),
    owners: z.array(OwnerShare).optional(),
    payment: ShipPayment.optional(),
    fuelTons: z.number().finite().optional(),
    /** Naval or scout base fuel. Players never see this key (AF2). */
    fuelMark: z.enum(['naval', 'scout']).optional(),
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

const RecordId = z.string().regex(RECORD_ID);

/**
 * A stored party from before vessel lists: one ship, and every member aboard it.
 * `vesselId` null is no ship. The new shape is what callers read.
 */
function liftParty(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const party = value as Record<string, unknown>;
    if ('vesselIds' in party) return value;
    if (!('vesselId' in party)) return value;
    const vesselId = party.vesselId;
    const memberIds = Array.isArray(party.memberIds) ? party.memberIds : [];
    const aboard: Record<string, unknown> = {};
    if (typeof vesselId === 'string') {
        for (const id of memberIds) {
            if (typeof id === 'string') aboard[id] = vesselId;
        }
    }
    return {
        vesselIds: vesselId == null ? [] : [vesselId],
        aboard,
        memberIds: party.memberIds,
        anchor: party.anchor,
    };
}

const PartyObject = z.object({
    vesselIds: z.array(RecordId).max(CAMPAIGN_LIMITS.partyShips),
    aboard: z.record(RecordId, RecordId),
    memberIds: z.array(RecordId),
    anchor: CampaignAnchor,
}).strict().superRefine((party, ctx) => {
    if (new Set(party.vesselIds).size !== party.vesselIds.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a ship is listed twice', path: ['vesselIds'] });
    }
    if (Object.keys(party.aboard).length > CAMPAIGN_LIMITS.records) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'too many people aboard', path: ['aboard'] });
    }
});

export const Party = z.preprocess(liftParty, PartyObject);
export type Party = z.infer<typeof PartyObject>;

export const CampaignSettings = z.object({
    party: Party,
    kinds: z.record(z.string(), z.array(z.string())),
    calendar: z.object({
        dateFormat: z.enum(['imperial', 'long']),
    }).strict(),
    /**
     * Systems that feel alive (spec_living_systems.md §4, LS3): the referee's two switches. Absent
     * means both off; players get the referee's choice in their view and cannot change it.
     */
    living: z.object({ chatter: z.boolean(), traffic: z.boolean() }).strict().optional(),
    /**
     * The campaign's chosen table for a kind (findings/trade_tables_design.md §9.6, TS2b):
     * kind to set id. A kind left out means the official set. Players receive this map.
     * The trade-code name check waits for a name-to-code table in rules/.
     */
    tableSets: z.record(z.string()).optional(),
    rev: Rev,
}).strict();
export type CampaignSettings = z.infer<typeof CampaignSettings>;

const REAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MENTION_HEX = /^hex:[^/]+\/\d{4}$/;

/**
 * A journal row (campaign_manager_plan.md §2.4).
 * A handout is not forced to be player-visible: the screen defaults it, and a referee may draft one first.
 */
const CampaignEntryObject = z.object({
    id: z.string().regex(JOURNAL_ID),
    kind: z.enum(CAMPAIGN_ENTRY_KINDS),
    title: z.string().max(CAMPAIGN_LIMITS.entryTitle),
    body: z.string().max(CAMPAIGN_LIMITS.entryBody),
    when: Day.nullable(),
    realDate: z.string().regex(REAL_DATE).nullable(),
    sequence: z.number().int().min(1).nullable(),
    author: z.enum(['referee', 'players']),
    visibility: EntryVisibility,
    anchor: CampaignAnchor,
    mentions: z.array(z.union([z.string().regex(RECORD_ID), z.string().regex(MENTION_HEX)])).max(CAMPAIGN_LIMITS.mentions),
    /**
     * The same list a record stores. Absent on an entry written before the column existed,
     * and on a patch that is not changing the list. A read fills that absence with null.
     * A patch that sends null clears the list.
     */
    images: z.array(CampaignImage).max(CAMPAIGN_LIMITS.images).nullable().optional(),
    rev: Rev,
    createdAt: Stamp,
    updatedAt: Stamp,
    deleted: z.boolean(),
}).strict();

/** A session carries a sequence. Every other kind leaves it null. */
function entrySequence(entry: { kind: string; sequence: number | null }, ctx: z.RefinementCtx): void {
    if (entry.kind === 'session') {
        if (entry.sequence == null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a session has a sequence', path: ['sequence'] });
        }
        return;
    }
    if (entry.sequence != null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'only a session has a sequence', path: ['sequence'] });
    }
}

/** A stored entry. An older row with no `images` field reads as null. */
export const CampaignEntry = CampaignEntryObject.superRefine(entrySequence).transform((entry) => ({
    ...entry,
    images: entry.images ?? null,
}));
type CampaignEntryRead = z.infer<typeof CampaignEntry>;
/**
 * The read value has `images`. A value the screen builds may still omit it;
 * a parse of that value fills null. The screen type stays optional so an
 * entry written before the field assigns.
 */
export type CampaignEntry = Omit<CampaignEntryRead, 'images'> & { images?: CampaignEntryRead['images'] };

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
    /** Present only when migration 0013 is applied. Omitted on an older database. */
    publicGames: z.boolean().optional(),
    /** Present only when migration 0018 is applied. Omitted on an older database. */
    showReferee: z.boolean().optional(),
    /** Present only when migration 0020 is applied. Omitted on an older database. Default on. */
    showCourse: z.boolean().optional(),
    /**
     * Present only when migration 0022 is applied. Omitted on an older database.
     * Null until a campaign write has stored a summary row. The card builds the
     * party line and the date. This object does not carry those sentences.
     */
    summary: z.object({
        vessels: z.array(z.string()),
        aboard: z.number().int().nonnegative(),
        clockDays: z.number().finite().nullable(),
        records: z.number().int().nonnegative(),
        changedAt: Stamp,
    }).strict().nullable().optional(),
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

export const EntryChange = z.union([
    CampaignEntryObject.extend({ baseRev: BaseRev }).strict().superRefine(entrySequence),
    z.object({ id: z.string().regex(JOURNAL_ID), baseRev: BaseRev, deleted: z.literal(true) }).strict(),
]);
export type EntryChange = z.infer<typeof EntryChange>;

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
    journal: z.array(EntryChange).optional(),
    settings: SettingsChange.optional(),
    clock: ClockChange.optional(),
}).strict().superRefine((value, ctx) => {
    const rows = (value.records?.length ?? 0) + (value.links?.length ?? 0) + (value.journal?.length ?? 0) + (value.settings ? 1 : 0) + (value.clock ? 1 : 0);
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
    journal: z.array(CampaignEntry).optional(),
    seq: Rev,
    done: z.boolean(),
}).strict();
export type CampaignPage = z.infer<typeof CampaignPage>;

const ChangeId = z.string().min(1);

export const CampaignChangesResult = z.object({
    applied: z.array(z.object({
        table: z.enum(['records', 'links', 'settings', 'clock', 'journal']),
        id: ChangeId,
        rev: Rev,
        seq: Rev,
    }).strict()),
    conflicts: z.array(z.discriminatedUnion('table', [
        z.object({ table: z.literal('records'), id: ChangeId, current: CampaignRecord }).strict(),
        z.object({ table: z.literal('links'), id: ChangeId, current: CampaignLink }).strict(),
        z.object({ table: z.literal('settings'), id: ChangeId, current: CampaignSettings }).strict(),
        z.object({ table: z.literal('clock'), id: ChangeId, current: CampaignClock.nullable() }).strict(),
        z.object({ table: z.literal('journal'), id: ChangeId, current: CampaignEntry }).strict(),
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
