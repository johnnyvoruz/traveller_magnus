import { z } from 'zod';

/**
 * Character MVP. directives/character_mvp.md.
 * Every box is one flat field, keyed by the PDF widget name.
 * A text box is a string. A checkbox is a boolean.
 * An empty string or false is a clear: the stored row goes away.
 * Limits are UTF-16 code units (String length).
 */

export const CHARACTER_SCHEMA = 'mgt2e_character@1' as const;

export const HISTORY_FIELD = 'History & Background';

export const CHARACTER_LIMITS = {
    name: 200,
    summary: 500,
    box: 2_000,
    history: 20_000,
    sets: 64,
    clientId: 64,
} as const;

const CHARACTER_ID = /^ch_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVITE_ID = /^ci_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function characterBoxLimit(field: string): number {
    return field === HISTORY_FIELD ? CHARACTER_LIMITS.history : CHARACTER_LIMITS.box;
}

export const CharacterId = z.string().regex(CHARACTER_ID);
export const CharacterInviteId = z.string().regex(INVITE_ID);
export const CharacterRole = z.enum(['owner', 'editor']);
export const CharacterColour = z.number().int().min(0).max(7);
export const CharacterFieldValue = z.union([z.string(), z.boolean()]);

export const Character = z.object({
    id: CharacterId,
    ownerId: z.string().min(1),
    name: z.string().min(1).max(CHARACTER_LIMITS.name),
    summary: z.string().max(CHARACTER_LIMITS.summary),
    schema: z.literal(CHARACTER_SCHEMA),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    deletedAt: z.string().min(1).nullable(),
}).strict();

export const CharacterListItem = z.object({
    character: Character,
    role: CharacterRole,
    ownerName: z.string(),
}).strict();

export const CharacterDoc = z.object({
    fields: z.record(CharacterFieldValue),
    revs: z.record(z.number().int().positive()),
    seq: z.number().int().nonnegative(),
}).strict();

export const CharacterHeld = z.object({
    character: Character,
    role: CharacterRole,
}).strict();

export const CharacterOpen = CharacterHeld.extend({
    doc: CharacterDoc,
}).strict();

export const CharacterAccessRow = z.object({
    characterId: CharacterId,
    userId: z.string().min(1),
    role: CharacterRole,
    grantedBy: z.string().min(1),
    name: z.string(),
    createdAt: z.string().min(1),
}).strict();

/** What the owner sees. The token is never on this object. */
export const CharacterInvite = z.object({
    id: CharacterInviteId,
    characterId: CharacterId,
    role: z.literal('editor'),
    createdBy: z.string().min(1),
    expiresAt: z.string().min(1),
    claimedBy: z.string().min(1).nullable(),
    claimedAt: z.string().min(1).nullable(),
    revokedAt: z.string().min(1).nullable(),
}).strict();

export const CharacterCreate = z.object({
    name: z.string().min(1).max(CHARACTER_LIMITS.name).optional(),
    from: CharacterId.optional(),
}).strict().superRefine((value, ctx) => {
    if (!value.from && !value.name) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'name is required' });
    }
});

export const CharacterPatch = z.object({
    name: z.string().min(1).max(CHARACTER_LIMITS.name).optional(),
    summary: z.string().max(CHARACTER_LIMITS.summary).optional(),
}).strict().refine((value) => value.name !== undefined || value.summary !== undefined, {
    message: 'nothing to change',
});

function refineBox(value: { field: string; value: string | boolean }, ctx: z.RefinementCtx): void {
    if (typeof value.value === 'string' && value.value.length > characterBoxLimit(value.field)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'too long' });
    }
}

export const CharacterFieldSet = z.object({
    field: z.string().min(1),
    value: CharacterFieldValue,
}).strict().superRefine(refineBox);

export const CharacterFieldsWrite = z.object({
    sets: z.array(CharacterFieldSet).min(1).max(CHARACTER_LIMITS.sets),
}).strict();

export const CharacterFieldsResult = z.object({
    doc: CharacterDoc,
    applied: z.array(z.object({
        field: z.string().min(1),
        rev: z.number().int().positive(),
        value: CharacterFieldValue,
    }).strict()),
}).strict();

export const CharacterInviteCreate = z.object({
    id: CharacterInviteId,
    url: z.string().url(),
    expiresAt: z.string().min(1),
}).strict();

export const CharacterClaim = z.object({
    token: z.string().min(1).max(200),
}).strict();

export const CharacterClaimResult = z.object({
    characterId: CharacterId,
}).strict();

export const CharacterOwnerChange = z.object({
    userId: z.string().min(1),
}).strict();

export const CharacterAccessRemoved = z.object({
    userId: z.string().min(1),
}).strict();

export const CharacterPresence = z.object({
    id: z.string().min(1),
    name: z.string(),
    colour: CharacterColour,
    field: z.string().nullable(),
}).strict();

/** `role` is on `you` so a fresh hello can carry a handover. */
export const CharacterYou = z.object({
    id: z.string().min(1),
    name: z.string(),
    colour: CharacterColour,
    role: CharacterRole,
}).strict();

const LiveHello = z.object({
    t: z.literal('hello'),
    you: CharacterYou,
    doc: CharacterDoc,
    who: z.array(CharacterPresence),
}).strict();

const LiveSetClient = z.object({
    t: z.literal('set'),
    id: z.string().min(1).max(CHARACTER_LIMITS.clientId),
    field: z.string().min(1),
    value: CharacterFieldValue,
}).strict();

const LiveSetServer = z.object({
    t: z.literal('set'),
    field: z.string().min(1),
    value: CharacterFieldValue,
    rev: z.number().int().positive(),
    seq: z.number().int().positive(),
    by: z.string().min(1),
}).strict();

const LiveAck = z.object({
    t: z.literal('ack'),
    id: z.string().min(1).max(CHARACTER_LIMITS.clientId),
    rev: z.number().int().positive(),
}).strict();

const LiveNo = z.object({
    t: z.literal('no'),
    id: z.string().min(1).max(CHARACTER_LIMITS.clientId),
    why: z.string().min(1),
}).strict();

const LiveFocus = z.object({
    t: z.literal('focus'),
    field: z.string().min(1).nullable(),
}).strict();

const LiveWho = z.object({
    t: z.literal('who'),
    who: z.array(CharacterPresence),
}).strict();

const LiveMeta = z.object({
    t: z.literal('meta'),
    name: z.string().min(1).max(CHARACTER_LIMITS.name),
    summary: z.string().max(CHARACTER_LIMITS.summary),
}).strict();

const LiveGone = z.object({
    t: z.literal('gone'),
    why: z.enum(['deleted', 'removed']),
}).strict();

/** Client frames. `set` here is the client's set, which carries `id`. */
export const CharacterClientMessage = z.discriminatedUnion('t', [LiveSetClient, LiveFocus]).superRefine((value, ctx) => {
    if (value.t === 'set') refineBox(value, ctx);
});

/** Server frames. `set` here is the broadcast, which carries `rev`, `seq`, and `by`. */
export const CharacterServerMessage = z.discriminatedUnion('t', [
    LiveHello,
    LiveSetServer,
    LiveAck,
    LiveNo,
    LiveWho,
    LiveMeta,
    LiveGone,
]);
