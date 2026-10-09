/**
 * Shapes from packages/shared/src/schemas/character.ts. The browser parses with
 * those schemas. A text box is a string, a checkbox a boolean, and an empty
 * string or false means the box is clear.
 */
import {
    CHARACTER_LIMITS,
    CHARACTER_SCHEMA,
    HISTORY_FIELD,
    Character as CharacterSchema,
    CharacterAccessRow as CharacterAccessRowSchema,
    CharacterClaimResult,
    CharacterDoc as CharacterDocSchema,
    CharacterHeld,
    CharacterInvite as CharacterInviteSchema,
    CharacterInviteCreate,
    CharacterListItem as CharacterListItemSchema,
    CharacterOpen as CharacterOpenSchema,
    CharacterRole as CharacterRoleSchema,
    CharacterServerMessage,
    characterBoxLimit as boxLimit,
} from '@voyage/shared';

export { CHARACTER_SCHEMA };

/** A text box holds at most this many characters. The history box is the exception. */
export const CHARACTER_BOX_LIMIT = CHARACTER_LIMITS.box;
export const CHARACTER_HISTORY_LIMIT = CHARACTER_LIMITS.history;
export const CHARACTER_HISTORY_FIELD = HISTORY_FIELD;

export function characterBoxLimit(field: string): number {
    return boxLimit(field);
}

export type CharacterRole = 'owner' | 'editor';
export type CharacterStatus = 'connecting' | 'live' | 'offline' | 'gone';
export type FieldValue = string | boolean;

export type Character = {
    id: string;
    ownerId: string;
    name: string;
    summary: string;
    schema: typeof CHARACTER_SCHEMA;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type CharacterListItem = {
    character: Character;
    role: CharacterRole;
    ownerName: string;
};

export type CharacterDoc = {
    fields: Record<string, FieldValue>;
    revs: Record<string, number>;
    seq: number;
};

/** One other person on the sheet. `colour` is 0 to 7; the screen maps it with toneFor. */
export type Presence = {
    id: string;
    name: string;
    colour: number;
    field: string | null;
};

/** This account, as the room introduces it. `role` is B's addition on `you`. */
export type CharacterYou = {
    id: string;
    name: string;
    colour: number;
    role: CharacterRole | null;
};

export type CharacterOpen = {
    character: Character;
    role: CharacterRole;
    doc: CharacterDoc;
};

export type CharacterInvite = {
    id: string;
    role: 'editor';
    expiresAt: string;
    createdBy: string;
    claimedBy: string | null;
    claimedAt: string | null;
    revokedAt: string | null;
};

export type IssuedInvite = {
    id: string;
    url: string;
    expiresAt: string;
};

/** B's row is CharacterAccessRow. grantedBy may be absent on the owner. */
export type CharacterAccessRow = {
    userId: string;
    role: CharacterRole;
    name: string;
    grantedBy: string | null;
};

/**
 * One open character. The same object is returned for every openCharacter of this id.
 * Each openCharacter counts; close releases one count.
 */
export type CharacterHandle = {
    readonly id: string;
    readonly character: Character | null;
    readonly role: CharacterRole | null;
    /** The owner's name when the list knew it. Empty until then. */
    readonly ownerName: string;
    readonly fields: Record<string, FieldValue>;
    /** The other people on the sheet, and the box each is in. */
    readonly who: readonly Presence[];
    readonly you: CharacterYou | null;
    readonly status: CharacterStatus;
    /** A refused box, or why the sheet closed. Empty when there is nothing to say. */
    readonly notice: string;
    setField(name: string, value: FieldValue): void;
    focusField(name: string | null): void;
    close(): void;
};

/** The reactive fields an open sheet mutates. */
export type CharacterState = {
    id: string;
    character: Character | null;
    role: CharacterRole | null;
    ownerName: string;
    fields: Record<string, FieldValue>;
    who: Presence[];
    you: CharacterYou | null;
    status: CharacterStatus;
    notice: string;
};

export type ServerMessage =
    | { t: 'hello'; you: CharacterYou; doc: CharacterDoc; who: Presence[] }
    | { t: 'set'; field: string; value: FieldValue; rev: number; seq: number; by: string }
    | { t: 'ack'; id: string; rev: number }
    | { t: 'no'; id: string; why: string }
    | { t: 'who'; who: Presence[] }
    | { t: 'meta'; name: string; summary: string }
    | { t: 'gone'; why: string };

export function parseCharacter(value: unknown): Character | null {
    const parsed = CharacterSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function parseRole(value: unknown): CharacterRole | null {
    const parsed = CharacterRoleSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function parseListItem(value: unknown): CharacterListItem | null {
    const parsed = CharacterListItemSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** POST and PATCH return the character and the caller's role, with no owner name. */
export function parseHeld(value: unknown): { character: Character; role: CharacterRole } | null {
    const parsed = CharacterHeld.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** Drops a cleared box. The stored document omits an empty string and a false checkbox. */
export function parseDoc(value: unknown): CharacterDoc | null {
    const parsed = CharacterDocSchema.safeParse(value);
    if (!parsed.success) return null;
    const fields: Record<string, FieldValue> = {};
    for (const [name, held] of Object.entries(parsed.data.fields)) {
        if (held === '' || held === false) continue;
        fields[name] = held;
    }
    return { fields, revs: parsed.data.revs, seq: parsed.data.seq };
}

export function parseOpen(value: unknown): CharacterOpen | null {
    const parsed = CharacterOpenSchema.safeParse(value);
    if (!parsed.success) return null;
    const doc = parseDoc(parsed.data.doc);
    if (!doc) return null;
    return { character: parsed.data.character, role: parsed.data.role, doc };
}

export function parseInvite(value: unknown): CharacterInvite | null {
    const parsed = CharacterInviteSchema.safeParse(value);
    if (!parsed.success) return null;
    return {
        id: parsed.data.id,
        role: parsed.data.role,
        expiresAt: parsed.data.expiresAt,
        createdBy: parsed.data.createdBy,
        claimedBy: parsed.data.claimedBy,
        claimedAt: parsed.data.claimedAt,
        revokedAt: parsed.data.revokedAt,
    };
}

export function parseIssued(value: unknown): IssuedInvite | null {
    const parsed = CharacterInviteCreate.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export function parseAccess(value: unknown): CharacterAccessRow | null {
    const parsed = CharacterAccessRowSchema.safeParse(value);
    if (!parsed.success) return null;
    return {
        userId: parsed.data.userId,
        role: parsed.data.role,
        name: parsed.data.name,
        grantedBy: parsed.data.grantedBy,
    };
}

export function parseClaim(value: unknown): { characterId: string } | null {
    const parsed = CharacterClaimResult.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** One server frame. A frame that is not the contract is ignored. */
export function parseServerMessage(value: unknown): ServerMessage | null {
    const parsed = CharacterServerMessage.safeParse(value);
    if (!parsed.success) return null;
    const message = parsed.data;
    if (message.t === 'hello') {
        const doc = parseDoc(message.doc);
        if (!doc) return null;
        return { t: 'hello', you: message.you, doc, who: message.who };
    }
    if (message.t === 'gone') return { t: 'gone', why: message.why };
    return message;
}

/** Eight existing tokens, one per presence colour. The sheet uses the name as a CSS variable. */
export const PRESENCE_TONES = [
    '--signal',
    '--attention',
    '--sheet-rust-line',
    '--zone-green',
    '--star-k',
    '--star-o',
    '--danger',
    '--text-0',
] as const;

export function toneFor(colour: number): string {
    const index = Number.isFinite(colour) ? Math.abs(Math.trunc(colour)) % PRESENCE_TONES.length : 0;
    return PRESENCE_TONES[index];
}
