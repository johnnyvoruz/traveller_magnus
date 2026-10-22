/**
 * Proposals: what a referee's AI agent may send about a session, and what the review answers.
 * Drafted in directives/reports/x_session_ingest.md appendix A; guards and routes in
 * directives/contracts/b_session_ingest.md. Nothing here applies a change: a proposal waits
 * for the referee in the campaign's Proposals list.
 */
import { z } from 'zod';
import {
    CAMPAIGN_LIMITS, CAMPAIGN_RECORD_TYPES, CAMPAIGN_ENTRY_KINDS, CampaignAnchor, CampaignLinkKindName,
    CargoLot, LedgerLine, PassengerLot, TrackLeg,
} from './campaign.ts';

/** Guards, not design limits. Each has a sentence in the contract. */
export const PROPOSAL_LIMITS = {
    perBatch: 200,
    batchBytes: 256_000,
    evidence: 3,
    quote: 300,
    at: 32,
    speaker: 40,
    question: 1_000,
    openBatches: 20,
    pendingPerUniverse: 2_000,
    decisions: 50,
    label: 120,
    ref: 40,
    lots: 16,
    ledgerLines: 32,
    key: 64,
} as const;

const RECORD_ID = /^cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_ID = /^pb_[0-9A-HJKMNP-TV-Z]{26}$/;
const PROPOSAL_ID = /^pp_[0-9A-HJKMNP-TV-Z]{26}$/;
const REAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[a-z0-9][a-z0-9-]{0,39}$/;

const RecordId = z.string().regex(RECORD_ID);
const Rev = z.number().int().nonnegative();
const Ref = z.string().regex(REF);
const Day = z.object({ year: z.number().int(), day: z.number().int().min(1).max(365) }).strict();

export const Evidence = z.object({
    at: z.string().min(1).max(PROPOSAL_LIMITS.at),
    quote: z.string().min(1).max(PROPOSAL_LIMITS.quote),
    speaker: z.string().max(PROPOSAL_LIMITS.speaker).optional(),
}).strict();
const EvidenceList = z.array(Evidence).min(1).max(PROPOSAL_LIMITS.evidence);

/** A new record as an agent may describe it. No id, no visibility, no images, no sheet, no stamps. */
export const RecordDraft = z.object({
    type: z.enum(CAMPAIGN_RECORD_TYPES),
    kind: z.string().max(CAMPAIGN_LIMITS.tag),
    name: z.string().min(1).max(CAMPAIGN_LIMITS.name),
    summary: z.string().max(CAMPAIGN_LIMITS.summary),
    details: z.string().max(CAMPAIGN_LIMITS.details),
    tags: z.array(z.string().max(CAMPAIGN_LIMITS.tag)).max(CAMPAIGN_LIMITS.tags),
    anchor: CampaignAnchor,
    when: z.object({ start: Day, end: Day.optional() }).strict().nullable().optional(),
    status: z.object({
        cargo: z.array(CargoLot).max(PROPOSAL_LIMITS.lots).optional(),
        passengers: z.array(PassengerLot).max(PROPOSAL_LIMITS.lots).optional(),
        ledger: z.array(LedgerLine).max(PROPOSAL_LIMITS.ledgerLines).optional(),
    }).strict().optional(),
}).strict();

export const RecordPatch = z.object({
    name: z.string().min(1).max(CAMPAIGN_LIMITS.name).optional(),
    kind: z.string().max(CAMPAIGN_LIMITS.tag).optional(),
    summary: z.string().max(CAMPAIGN_LIMITS.summary).optional(),
    details: z.string().max(CAMPAIGN_LIMITS.details).optional(),
    tags: z.array(z.string().max(CAMPAIGN_LIMITS.tag)).max(CAMPAIGN_LIMITS.tags).optional(),
    anchor: CampaignAnchor.optional(),
    when: z.object({ start: Day, end: Day.optional() }).strict().nullable().optional(),
}).strict();

export const RecordAppend = z.object({
    details: z.string().min(1).max(CAMPAIGN_LIMITS.details).optional(),
    tags: z.array(z.string().max(CAMPAIGN_LIMITS.tag)).max(CAMPAIGN_LIMITS.tags).optional(),
}).strict();

/** A journal entry as an agent may describe it. Author and visibility are the server's. */
export const EntryDraft = z.object({
    kind: z.enum(CAMPAIGN_ENTRY_KINDS),
    title: z.string().max(CAMPAIGN_LIMITS.entryTitle),
    body: z.string().max(CAMPAIGN_LIMITS.entryBody),
    when: Day.nullable(),
    realDate: z.string().regex(REAL_DATE).nullable(),
    sequence: z.number().int().min(1).nullable(),
    anchor: CampaignAnchor,
}).strict().superRefine((entry, ctx) => {
    if (entry.kind === 'session' && entry.sequence == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a session has a sequence', path: ['sequence'] });
    }
    if (entry.kind !== 'session' && entry.sequence != null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'only a session has a sequence', path: ['sequence'] });
    }
});

const Target = z.union([z.object({ id: RecordId }).strict(), z.object({ ref: Ref }).strict()]);

const base = { ref: Ref.optional(), evidence: EvidenceList };

export const Proposal = z.discriminatedUnion('op', [
    z.object({ op: z.literal('record.create'), ref: Ref, record: RecordDraft, evidence: EvidenceList }).strict(),
    z.object({ op: z.literal('record.update'), ...base, id: RecordId, baseRev: Rev, set: RecordPatch.optional(), append: RecordAppend.optional() }).strict(),
    z.object({ op: z.literal('link.create'), ...base, link: z.object({
        from: Target, to: Target, kind: CampaignLinkKindName,
        role: z.string().max(80), notes: z.string().max(500).optional(),
        since: Day.nullable().optional(), until: Day.nullable().optional(),
    }).strict() }).strict(),
    z.object({ op: z.literal('journal.create'), ...base, entry: EntryDraft }).strict(),
    z.object({ op: z.literal('clock.set'), ...base, days: z.number().finite().nonnegative(), baseRev: Rev }).strict(),
    z.object({ op: z.literal('track.append'), ...base, id: RecordId, baseRev: Rev, leg: TrackLeg }).strict(),
    z.object({ op: z.literal('cargo.append'), ...base, id: RecordId, baseRev: Rev, lots: z.array(CargoLot).min(1).max(PROPOSAL_LIMITS.lots) }).strict(),
    z.object({ op: z.literal('passengers.append'), ...base, id: RecordId, baseRev: Rev, passengers: z.array(PassengerLot).min(1).max(PROPOSAL_LIMITS.lots) }).strict(),
    z.object({ op: z.literal('ledger.append'), ...base, id: RecordId, baseRev: Rev, lines: z.array(LedgerLine).min(1).max(PROPOSAL_LIMITS.ledgerLines) }).strict(),
    z.object({ op: z.literal('question'), ...base, text: z.string().min(1).max(PROPOSAL_LIMITS.question) }).strict(),
]).superRefine((p, ctx) => {
    // An update names something to change. Kept here, not on the option: a discriminated
    // union takes plain objects only.
    if (p.op === 'record.update' && p.set === undefined && p.append === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'nothing to change', path: ['set'] });
    }
});
export type Proposal = z.infer<typeof Proposal>;

export const ProposalSource = z.object({
    kind: z.enum(['transcript', 'notes', 'other']),
    label: z.string().min(1).max(PROPOSAL_LIMITS.label),
    realDate: z.string().regex(REAL_DATE).nullable(),
    durationSeconds: z.number().int().nonnegative().optional(),
    tool: z.string().max(60).optional(),
}).strict();

export const ProposalBatchSubmit = z.object({
    format: z.literal('voyage-proposals'),
    schemaVersion: z.literal(1),
    idempotencyKey: z.string().min(8).max(PROPOSAL_LIMITS.key),
    source: ProposalSource,
    proposals: z.array(Proposal).min(1).max(PROPOSAL_LIMITS.perBatch),
}).strict().superRefine((batch, ctx) => {
    const seen = new Set<string>();
    const created = new Set<string>();
    batch.proposals.forEach((p, i) => {
        if (p.ref !== undefined) {
            if (seen.has(p.ref)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ref used twice', path: ['proposals', i, 'ref'] });
            seen.add(p.ref);
        }
        if (p.op === 'link.create') {
            for (const end of ['from', 'to'] as const) {
                const t = p.link[end];
                if ('ref' in t && !created.has(t.ref)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ref names no earlier record.create', path: ['proposals', i, 'link', end] });
                }
            }
        }
        if (p.op === 'record.create') created.add(p.ref);
    });
    if (new TextEncoder().encode(JSON.stringify(batch)).length > PROPOSAL_LIMITS.batchBytes) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'too_large', path: [] });
    }
});
export type ProposalBatchSubmit = z.infer<typeof ProposalBatchSubmit>;

export const ProposalState = z.enum(['pending', 'accepted', 'dropped', 'conflict']);
export type ProposalState = z.infer<typeof ProposalState>;

/** A stored proposal: the submitted shape plus what the server added. */
export const StoredProposal = z.object({
    id: z.string().regex(PROPOSAL_ID),
    ordinal: z.number().int().nonnegative(),
    proposal: Proposal,
    /** The stored id for updates and appends; the minted id for creates (cr_, cl_, cj_). */
    targetId: z.string().nullable(),
    state: ProposalState,
    appliedRev: Rev.nullable(),
    decidedAt: z.string().nullable(),
    note: z.string().nullable(),
}).strict();

export const ProposalBatch = z.object({
    id: z.string().regex(BATCH_ID),
    source: ProposalSource,
    state: z.enum(['open', 'reviewed', 'expired']),
    counts: z.object({ pending: z.number().int(), accepted: z.number().int(), dropped: z.number().int() }).strict(),
    createdAt: z.string(),
    reviewedAt: z.string().nullable(),
    expiresAt: z.string(),
    reviewUrl: z.string(),
    /** True when the referee pasted the batch. A token submit is false. Not part of `source`. */
    pasted: z.boolean(),
    proposals: z.array(StoredProposal).optional(),
}).strict();
export type ProposalBatch = z.infer<typeof ProposalBatch>;

export const ProposalBatchList = z.object({ items: z.array(ProposalBatch), nextCursor: z.string().nullable() }).strict();

export const ProposalDecision = z.object({
    proposalId: z.string().regex(PROPOSAL_ID),
    action: z.enum(['accept', 'drop']),
    /** The referee's edit, in the proposal's own shape. Absent means as proposed. */
    change: Proposal.optional(),
    /** The rev the screen holds for the target. Required on accept of an update or append. */
    baseRev: Rev.optional(),
}).strict();

export const ProposalResolve = z.object({
    decisions: z.array(ProposalDecision).min(1).max(PROPOSAL_LIMITS.decisions),
}).strict();

export const ProposalResolveResult = z.object({
    batch: ProposalBatch,
    applied: z.array(z.object({ proposalId: z.string(), table: z.enum(['records', 'links', 'journal', 'clock']), id: z.string(), rev: Rev, seq: Rev }).strict()),
    conflicts: z.array(z.object({ proposalId: z.string(), table: z.enum(['records', 'links', 'journal', 'clock']), id: z.string(), current: z.unknown() }).strict()),
}).strict();

/** The compact read an agent starts from. */
export const CampaignIndex = z.object({
    clock: z.object({ days: z.number(), rev: Rev }).nullable(),
    settings: z.object({ party: z.unknown(), calendar: z.unknown(), kinds: z.record(z.string(), z.array(z.string())), rev: Rev }).strict(),
    records: z.array(z.object({
        id: RecordId, type: z.enum(CAMPAIGN_RECORD_TYPES), kind: z.string(), name: z.string(),
        tags: z.array(z.string()), anchor: CampaignAnchor, visibility: z.enum(['referee', 'players']),
        rev: Rev, updatedAt: z.string(),
    }).strict()),
    journal: z.array(z.object({ id: z.string(), kind: z.enum(CAMPAIGN_ENTRY_KINDS), title: z.string(), when: Day.nullable(), sequence: z.number().int().nullable(), rev: Rev }).strict()),
    counts: z.object({ records: z.number().int(), links: z.number().int(), journal: z.number().int(), pendingProposals: z.number().int() }).strict(),
}).strict();

export const CampaignSearchPage = z.object({
    items: z.array(z.object({ id: RecordId, type: z.enum(CAMPAIGN_RECORD_TYPES), kind: z.string(), name: z.string(), summary: z.string(), anchor: CampaignAnchor, rev: Rev }).strict()).max(20),
}).strict();

export const AgentCampaignList = z.object({
    items: z.array(z.object({
        id: z.string(), name: z.string(), truthVersion: z.string().nullable(),
        clock: z.object({ days: z.number(), rev: Rev }).nullable(),
        counts: z.object({ records: z.number().int(), links: z.number().int(), journal: z.number().int() }).strict(),
        pendingProposals: z.number().int(),
    }).strict()),
}).strict();

export const ACCESS_SCOPES = ['campaign:read', 'proposals:write'] as const;
export const AccessScope = z.enum(ACCESS_SCOPES);
export type AccessScope = z.infer<typeof AccessScope>;

export const AccessTokenCreate = z.object({
    name: z.string().min(1).max(60),
    scopes: z.array(AccessScope).min(1),
    universeId: z.string().nullable(),
    expiresInDays: z.number().int().min(1).max(365).optional(),
}).strict();

export const AccessTokenRow = z.object({
    id: z.string(), name: z.string(), prefix: z.string(), scopes: z.array(AccessScope),
    universeId: z.string().nullable(), createdAt: z.string(), expiresAt: z.string(),
    lastUsedAt: z.string().nullable(), revokedAt: z.string().nullable(),
}).strict();
export const AccessTokenCreated = z.object({ token: z.string(), row: AccessTokenRow }).strict();
export const AccessTokenList = z.object({ items: z.array(AccessTokenRow) }).strict();

export const PlatformFlagSet = z.object({ key: z.enum(['agent_access']), value: z.enum(['on', 'off']) }).strict();
