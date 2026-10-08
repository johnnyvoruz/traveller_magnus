/**
 * A person's page and a Character (directives/character_mvp.md, "In a universe" and "D,
 * Part 2"): a person record's sheet is either its own boxes (`{ schema, fields }`, the
 * plain sheet), or a reference to a Character that lives outside the game
 * (`{ schema, characterId }`), shown live. Detaching writes the boxes as they stand into
 * the record as a frozen copy and drops the reference. This file is the shapes and the
 * seam: the page asks a `CharacterSource` for the list and for an open Character, and the
 * browser's Characters store fills that seam (workspace/character_wiring.ts) without the
 * page or the sheet knowing what is behind it. Pure, but for the one registered source.
 */
import { CHARACTER_SCHEMA } from './character_sheet.ts';
import type { SheetValues } from './sheet_fields.ts';

/** One other person on a sheet: who, their colour (an index, 0 to 7, the server's), and the box they are in. */
export type Presence = { id: string; name: string; colour: number; field: string | null };

/** One open Character, as the browser's store hands it over. Reactive: its members change under the reader. */
export type CharacterHandle = {
    readonly character: { id: string; name: string } | null;
    readonly role: 'owner' | 'editor' | null;
    readonly ownerName?: string;
    readonly fields: Readonly<Record<string, string | boolean>>;
    readonly who: readonly Presence[];
    readonly status: 'connecting' | 'live' | 'offline' | 'gone';
    setField(name: string, value: string | boolean): void;
    focusField(name: string | null): void;
    close(): void;
};

export type CharacterListed = { character: { id: string; name: string }; role: 'owner' | 'editor'; ownerName: string };

/** What the page needs of the Characters store, and nothing more. */
export type CharacterSource = {
    /** Mine and those shared with me, as they stand (reactive). */
    list(): readonly CharacterListed[];
    /** Asks the server for the list again. */
    load(): Promise<void> | void;
    /** Makes a Character owned by the signed-in account; its id, or null when it could not be made. */
    create(name: string): Promise<string | null>;
    open(id: string): CharacterHandle;
    /** The colour token for a presence colour (the server's index, 0 to 7): the store's own, so a person is one colour everywhere. */
    tone(colour: number): string;
};

let source: CharacterSource | null = null;

/** The Characters store registers itself here; with none, the page offers the plain sheet alone. */
export function setCharacterSource(next: CharacterSource | null): void {
    source = next;
}

export function characterSource(): CharacterSource | null {
    return source;
}

/** The Character a record's sheet refers to, or null: a plain sheet, a free-form one, or none. */
export function characterIdOf(sheet: unknown): string | null {
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return null;
    const held = sheet as Record<string, unknown>;
    return held.schema === CHARACTER_SCHEMA && typeof held.characterId === 'string' && held.characterId !== '' ? held.characterId : null;
}

/** A record's sheet as a reference to a Character. What else the sheet held (a free-form sheet's keys, the homeworld) stays; its own boxes do not: the Character's are the sheet now. */
export function attachedSheet(sheet: unknown, characterId: string): Record<string, unknown> {
    const base = sheet && typeof sheet === 'object' && !Array.isArray(sheet) ? { ...(sheet as Record<string, unknown>) } : {};
    delete base.fields;
    base.schema = CHARACTER_SCHEMA;
    base.characterId = characterId;
    return base;
}

/** Detached: the boxes as they stand, written into the record as its own plain sheet (the frozen copy), and the reference dropped. */
export function detachedSheet(sheet: unknown, fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const base = sheet && typeof sheet === 'object' && !Array.isArray(sheet) ? { ...(sheet as Record<string, unknown>) } : {};
    delete base.characterId;
    const kept: SheetValues = {};
    for (const [name, value] of Object.entries(fields)) {
        if ((typeof value === 'string' && value !== '') || value === true) kept[name] = value;
    }
    base.schema = CHARACTER_SCHEMA;
    base.fields = kept;
    return base;
}

/**
 * The boxes a detach freezes: the last this page saw of the Character, **whatever its
 * state** (ruled 2026-10-08: a Character that can no longer be reached still leaves the
 * last boxes seen as the frozen copy, not an empty sheet). With no handle at all (the app
 * has no Characters store, or the page never opened it) there is nothing to keep.
 */
export function lastSeenFields(handle: Pick<CharacterHandle, 'fields'> | null): Readonly<Record<string, string | boolean>> {
    return handle ? handle.fields : {};
}

/**
 * Who is in which box, for the sheet: box name to a name and a colour token. Two people in
 * one box are both named, in the first one's colour. People in no box are on the sheet but
 * mark nothing.
 */
export function presenceMap(who: readonly Presence[], tone: (colour: number) => string): Record<string, { name: string; tone: string }> {
    const out: Record<string, { name: string; tone: string }> = {};
    for (const person of who) {
        if (!person.field) continue;
        const held = out[person.field];
        out[person.field] = held ? { name: held.name + ', ' + person.name, tone: held.tone } : { name: person.name, tone: tone(person.colour) };
    }
    return out;
}

/** Who owns an attached Character, in the page's words. */
export function ownerWords(handle: Pick<CharacterHandle, 'role' | 'ownerName'>): string {
    if (handle.role === 'owner') return 'Yours';
    return handle.ownerName ? 'Owned by ' + handle.ownerName + ', shared with you' : 'Shared with you';
}

/** The connection, in a word or two; empty while it is live. */
export function statusWords(status: CharacterHandle['status']): string {
    if (status === 'connecting') return 'Connecting';
    if (status === 'offline') return 'Offline: changes are kept and sent when it is back';
    if (status === 'gone') return 'No longer available to you';
    return '';
}
