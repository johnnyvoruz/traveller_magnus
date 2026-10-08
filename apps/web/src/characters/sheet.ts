/**
 * The one adapter Agent D's sheet takes. The component does not know the values
 * live in a character room: it receives a document, whether it may be edited, and
 * who is in which box. Its events are this handle's set and focus.
 */
import type { SheetDoc } from '../workspace/sheet_fields.ts';
import { CHARACTER_SCHEMA, toneFor, type CharacterHandle, type Presence } from './types.ts';

export type SheetPresence = { name: string; tone: string };

export type SheetBinding = {
    /** schema plus the live boxes. The same fields object the handle mutates. */
    readonly doc: SheetDoc;
    /** True for an owner or an editor while the sheet is not gone. This is mayEdit. */
    readonly editable: boolean;
    /** Box name to the other person in it. Colour is a token name, 0 to 7. */
    readonly presence: Record<string, SheetPresence>;
    change(name: string, value: string | boolean): void;
    enter(name: string): void;
    leave(name: string): void;
};

/** One person per box. A person who is not in a box is left out. The last one wins. */
export function presenceMap(who: readonly Presence[]): Record<string, SheetPresence> {
    const map: Record<string, SheetPresence> = {};
    for (const person of who) {
        if (!person.field) continue;
        map[person.field] = { name: person.name, tone: toneFor(person.colour) };
    }
    return map;
}

export function bindSheet(handle: CharacterHandle): SheetBinding {
    return {
        get doc() {
            return { schema: CHARACTER_SCHEMA, fields: handle.fields };
        },
        get editable() {
            return (handle.role === 'owner' || handle.role === 'editor') && handle.status !== 'gone';
        },
        get presence() {
            return presenceMap(handle.who);
        },
        change(name, value) {
            handle.setField(name, value);
        },
        enter(name) {
            handle.focusField(name);
        },
        leave(name) {
            void name;
            handle.focusField(null);
        },
    };
}
