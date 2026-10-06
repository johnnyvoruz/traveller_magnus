/**
 * The ship sheet's passengers and crew as people (slice 2 follow-up 9). A "Passenger Name N"
 * field can hold a person from the campaign: the person's name stays in the field, under
 * the PDF's name, and the record's id goes beside it under "<field> record", so the sheet
 * reads as plain text wherever the id is not understood. The Crew section has one text box
 * on the PDF, so its people are the vessel's `crew` connections themselves; nothing more is
 * stored in the sheet for them. Pure.
 */
import type { CampaignLink, CampaignRecord } from '@voyage/shared';
import type { SheetField, SheetValues } from './ship_sheet.ts';

/** The link kind a person has to a vessel from each section. */
export const SECTION_KIND = { Passengers: 'passenger', Crew: 'crew' } as const;
export type PeopleSection = keyof typeof SECTION_KIND;

/** True for the name fields that can hold a person: "Passenger Name 1" … "Passenger Name 16". */
export function isPersonField(field: Pick<SheetField, 'name' | 'section'>): boolean {
    return field.section === 'Passengers' && /^Passenger Name \d+$/.test(field.name);
}

/** The key beside a name field that holds the person's record id. */
export function recordKey(fieldName: string): string {
    return fieldName + ' record';
}

/** The record id held beside a name field, or null. */
export function personIdOf(values: SheetValues | null | undefined, field: Pick<SheetField, 'name'>): string | null {
    const held = values ? values[recordKey(field.name)] : undefined;
    return typeof held === 'string' && held ? held : null;
}

/** The person a name field holds, when that record is live and a person. */
export function personOf(
    values: SheetValues | null | undefined,
    field: Pick<SheetField, 'name'>,
    records: Readonly<Record<string, CampaignRecord>>,
): CampaignRecord | null {
    const id = personIdOf(values, field);
    if (!id) return null;
    const found = records[id];
    return found && !found.deleted && found.type === 'person' ? found : null;
}

/** The values with a person in the field: the name in the field, the id beside it. */
export function withPerson(values: SheetValues | null | undefined, field: Pick<SheetField, 'name'>, person: Pick<CampaignRecord, 'id' | 'name'>): SheetValues {
    return { ...(values ?? {}), [field.name]: person.name, [recordKey(field.name)]: person.id };
}

/** The values with the person taken out of the field: the id goes, the name stays as plain text. */
export function withoutPerson(values: SheetValues | null | undefined, field: Pick<SheetField, 'name'>): SheetValues {
    const next = { ...(values ?? {}) };
    delete next[recordKey(field.name)];
    return next;
}

/** The record ids of every person the sheet's name fields hold. */
export function heldPersonIds(values: SheetValues | null | undefined): string[] {
    if (!values) return [];
    const out: string[] = [];
    for (const [key, held] of Object.entries(values)) {
        if (key.endsWith(' record') && isPersonField({ name: key.slice(0, -' record'.length), section: 'Passengers' }) && typeof held === 'string' && held) out.push(held);
    }
    return out;
}

/** The live link of the kind from the person to the vessel, or null. */
export function linkBetween(
    links: Readonly<Record<string, CampaignLink>>,
    personId: string,
    vesselId: string,
    kind: string,
): CampaignLink | null {
    for (const link of Object.values(links)) {
        if (!link.deleted && link.kind === kind && link.from === personId && link.to === vesselId) return link;
    }
    return null;
}

/** The vessel's live people of the kind (its crew, its passengers), by name. */
export function peopleOfKind(
    links: Readonly<Record<string, CampaignLink>>,
    records: Readonly<Record<string, CampaignRecord>>,
    vesselId: string,
    kind: string,
): { link: CampaignLink; person: CampaignRecord }[] {
    const out: { link: CampaignLink; person: CampaignRecord }[] = [];
    for (const link of Object.values(links)) {
        if (link.deleted || link.kind !== kind || link.to !== vesselId) continue;
        const person = records[link.from];
        if (!person || person.deleted || person.type !== 'person') continue;
        out.push({ link, person });
    }
    return out.sort((a, b) => a.person.name.localeCompare(b.person.name));
}

/** The name a new person made from a name field gets: the field's text, or nothing. */
export function newPersonName(values: SheetValues | null | undefined, field: Pick<SheetField, 'name'>): string {
    const held = values ? values[field.name] : undefined;
    return typeof held === 'string' ? held.replace(/\s+/g, ' ').trim() : '';
}
