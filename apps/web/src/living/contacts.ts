/**
 * Sensor contacts (Johnny, 2026-11-14): the background ships of a system (traffic.ts) are scenery until the
 * referee promotes one. Here: what a contact's card says to a referee and to a player, the promotion
 * itself, and which contacts this device has promoted (so the scenery copy is not drawn beside the
 * record). Decided the same day, for a referee's table and for solo play alike:
 *   - a promoted contact becomes a vessel record, visible to the referee only, and not a party ship:
 *     it is someone else's ship, to be shared when the story wants it;
 *   - it keeps its name and its role in words; it gets no class and no numbers (none are in rules/);
 *   - promoting is the referee's act; a player sees the role but not the name.
 * A promoted ship is placed in the system, not at the point it was flying through: a record's place is a
 * system or a body. The referee moves it from there.
 */
import { storageGet, storageSet } from '../platform/browser.ts';
import { createRecord, saveRecord } from '../workspace/actions.ts';
import { systemAnchor } from '../workspace/places.ts';

export const UNIDENTIFIED = 'Unidentified contact';
export const PROMOTED_KEY = 'voyage.contacts.promoted';
/** Ids kept: a contact's id carries its day, so old ones never come back and the list need not grow. */
export const PROMOTED_KEPT = 200;

export type Contact = { id: string; name: string; roleWord?: string; line?: string };

const sentence = (text: string): string => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** The card's words: the referee reads the ship's name; a player reads that something is there, and what kind. */
export function contactWords(contact: Contact, referee: boolean): { name: string; role: string; line: string } {
    return {
        name: referee ? contact.name : UNIDENTIFIED,
        role: sentence(contact.roleWord ?? 'ship'),
        line: referee ? (contact.line ?? '') : '',
    };
}

/** The record's summary: what it is and where and when it was first seen. */
export function promotedSummary(contact: Contact, systemName: string, date: string): string {
    const where = systemName ? 'the ' + systemName + ' system' : 'this system';
    return sentence(contact.roleWord ?? 'ship') + '. First seen in ' + where + (date ? ' on ' + date : '') + ', as a sensor contact.';
}

function readPromoted(): string[] {
    const raw = storageGet(PROMOTED_KEY);
    if (!raw) return [];
    try {
        const list = JSON.parse(raw) as unknown;
        return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

let promoted: Set<string> | null = null;

export function isPromoted(id: string): boolean {
    if (!promoted) promoted = new Set(readPromoted());
    return promoted.has(id);
}

function markPromoted(id: string): void {
    if (!promoted) promoted = new Set(readPromoted());
    promoted.add(id);
    const list = [...promoted].slice(-PROMOTED_KEPT);
    promoted = new Set(list);
    storageSet(PROMOTED_KEY, JSON.stringify(list));
}

/** Forgets what this device has promoted (tests). */
export function resetPromoted(): void {
    promoted = null;
}

/**
 * Promotes a contact: one new vessel record in this system with the contact's name and a summary, as the
 * referee's own (new records are referee-only). The scenery copy stops being drawn on this device. Returns
 * the record's id.
 */
export function promoteContact(contact: Contact, hexKey: string, systemName: string, date: string): string {
    const id = createRecord('vessel', systemAnchor(hexKey, systemName, null));
    saveRecord(id, { name: contact.name, summary: promotedSummary(contact, systemName, date) });
    markPromoted(contact.id);
    return id;
}
