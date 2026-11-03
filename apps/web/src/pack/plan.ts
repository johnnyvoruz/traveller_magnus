/**
 * What the Player Pack keeps. Pure: it reads a campaign snapshot and writes
 * nothing. A row is included only when its visibility is exactly `players`.
 * A kind with no visibility of its own stays out, except where Johnny's
 * answers name the way in (the clock day, a player record's place, the party
 * through those records).
 */
import {
    CAMPAIGN_LINK_KINDS,
    playersView,
    type CampaignAnchor,
    type CampaignEntry,
    type CampaignLink,
    type CampaignRecord,
    type CampaignSettings,
} from '@voyage/shared';
import { totalDays } from '../orbit/clock.ts';
import { capacityTons, tonsUsed } from '../campaign/cargo.ts';
import { ledgerBalance, ledgerByPeriod } from '../campaign/ledger.ts';
import { formatCredits } from '../campaign/money.ts';
import { fuelCapacityTons, fuelTonsOf } from '../campaign/refuel.ts';
import { CHARACTER_RULES, CHARACTER_SCHEMA } from '../workspace/character_sheet.ts';
import { kindWord, whenText } from '../workspace/journal/list.ts';
import { fareOfPassageField, isBoarded } from '../workspace/passenger_fare.ts';
import { deckPlanOf, fuelWords, holdWords, isPartyShip, LEDGER_KIND_WORDS, tonsWords } from '../workspace/players/player_ship.ts';
import { typeInfo } from '../workspace/records.ts';
import { fieldsOf } from '../workspace/sheet_fields.ts';
import { peopleOfKind, personOf, SECTION_KIND } from '../workspace/sheet_people.ts';
import { SHEET_RULES as SHIP_RULES, sheetSections, valueOf, type Section, type SheetField } from '../workspace/ship_sheet.ts';
import { stardate } from '../workspace/stardate.ts';
import { dayWords, isManifestField, ledgerOf, lotMeta, manifestOf, sheetView } from '../workspace/vessel_trade.ts';
import { redactText } from './text.ts';

/** The schema `ship_sheet.ts` writes. A vessel's boxes follow that file. */
const SHIP_SCHEMA = 'mgt2e_ship_sheet@1';

export type PackInput = {
    name: string;
    /** The orbit clock's day count. Null when the campaign has no date. */
    clockDays: number | null;
    records: Readonly<Record<string, CampaignRecord>>;
    links: Readonly<Record<string, CampaignLink>>;
    journal: Readonly<Record<string, CampaignEntry>>;
    settings: CampaignSettings | null;
};

export type PackCounts = {
    recordsLeftOut: number;
    entriesLeftOut: number;
    linksLeftOut: number;
    linkTextLeftOff: number;
    mentions: number;
    places: number;
    partyMembers: number;
    ship: number;
    timeline: number;
};

export type PackRecord = {
    id: string;
    type: string;
    typeName: string;
    kind: string;
    name: string;
    summary: string;
    details: string;
    tags: string[];
    when: string | null;
    place: string | null;
    playerNotes: string | null;
    /** A person's or a vessel's sheet as lines. A party ship follows the player's page. */
    sheet: string | null;
    status: string | null;
    /** A party ship's sections, in the player's words. Null on every other record. */
    cargo: string | null;
    passengers: string | null;
    fuel: string | null;
    ledger: string | null;
};

export type PackEntry = {
    id: string;
    kind: string;
    kindName: string;
    title: string;
    body: string;
    when: string | null;
    played: string | null;
    author: string;
    place: string | null;
};

export type PackLink = {
    fromId: string;
    toId: string;
    fromName: string;
    toName: string;
    kind: string;
};

export type PackTimelineRow = {
    id: string;
    date: string;
    weekday: string;
    title: string;
    kind: string;
    place: string | null;
};

export type PackPlan = {
    name: string;
    /** "no date", or the clock day as DDD-YYYY. */
    clockLabel: string;
    noDate: boolean;
    counts: PackCounts;
    /** Live records and entries whose visibility is not `players`. */
    leftOut: number;
    includedRecords: number;
    includedEntries: number;
    records: PackRecord[];
    entries: PackEntry[];
    links: PackLink[];
    party: {
        members: { id: string; name: string }[];
        /** The first players ship, kept for a one-ship reader. */
        ship: { id: string; name: string } | null;
        /** Every players ship, in party order, with the players members aboard it. */
        ships: { id: string; name: string; aboard: { id: string; name: string }[] }[];
        /** Players members who are aboard no ship. */
        ashore: { id: string; name: string }[];
    };
    timeline: PackTimelineRow[];
};

function playersRecord(record: CampaignRecord | undefined): CampaignRecord | null {
    if (!record || record.deleted || record.visibility !== 'players') return null;
    return record;
}

function clockDay(days: number | null): { year: number; day: number } | null {
    if (days === null || !Number.isFinite(days)) return null;
    const date = stardate(days);
    return { year: date.year, day: date.day };
}

function afterClock(when: { year: number; day: number }, clock: { year: number; day: number } | null): boolean {
    if (!clock) return false;
    if (when.year !== clock.year) return when.year > clock.year;
    return when.day > clock.day;
}

/** A name the file shows. The same redaction as every other pack string. */
function shownName(
    name: string,
    records: Readonly<Record<string, CampaignRecord>>,
    counts: PackCounts,
): string {
    return redactText(name, records, counts);
}

function placeOf(
    anchor: CampaignAnchor,
    records: Readonly<Record<string, CampaignRecord>>,
    counts: PackCounts,
): string | null {
    if (!anchor) return null;
    if (anchor.kind === 'system') {
        const bits = [anchor.hexKey];
        const label = anchor.locationLabel ? anchor.locationLabel.trim() : '';
        if (label) bits.push(redactText(label, records, counts));
        if (anchor.bodyKey) bits.push(anchor.bodyKey);
        return bits.join(' · ');
    }
    const host = playersRecord(records[anchor.id]);
    if (host) return shownName(host.name, records, counts);
    counts.places += 1;
    return null;
}

/**
 * The status object is not a pack section. A party ship's cargo, passengers, fuel, ledger
 * and sheet are their own lines. The track, the owners, the payment and the naval or scout
 * mark (AF2) stay off the file, so the Status heading stays out.
 */
function statusText(): null {
    return null;
}

const SHEET_SKIP = new Set(['schema', 'fields', 'characterId', 'homeworld']);

function sheetFieldNames(record: CampaignRecord, sheet: unknown): readonly string[] {
    const schema = sheet && typeof sheet === 'object' && !Array.isArray(sheet)
        ? (sheet as { schema?: unknown }).schema
        : undefined;
    const ship = schema === SHIP_SCHEMA || (schema !== CHARACTER_SCHEMA && record.type === 'vessel');
    const fields = ship ? SHIP_RULES.fields : CHARACTER_RULES.fields;
    return fields.map((field) => field.name);
}

/** Strings and ticks a sheet holds. Companion record ids stay beside the name and are not a box. */
function sheetValues(sheet: object): Record<string, string | boolean> {
    const held = sheet as Record<string, unknown>;
    const nested = held.fields;
    const source = nested && typeof nested === 'object' && !Array.isArray(nested)
        ? nested as Record<string, unknown>
        : held;
    const out: Record<string, string | boolean> = {};
    const take = (from: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(from)) {
            if (SHEET_SKIP.has(key) || key.endsWith(' record') || Object.hasOwn(out, key)) continue;
            if (typeof value === 'string' || typeof value === 'boolean') out[key] = value;
        }
    };
    take(source);
    if (source !== held) take(held);
    return out;
}

function sheetLine(
    label: string,
    value: string | boolean,
    records: Readonly<Record<string, CampaignRecord>>,
    counts: PackCounts,
): string | null {
    if (value === false) return null;
    const raw = value === true ? 'yes' : value;
    if (raw.trim() === '') return null;
    const shown = redactText(raw, records, counts).trim();
    const name = redactText(label, records, counts).trim();
    if (!shown || !name) return null;
    return name + ': ' + shown;
}

/** A person's or a ship's sheet as "Label: value" lines, in the sheet file's order. An empty box is left out. */
function sheetText(record: CampaignRecord, records: Readonly<Record<string, CampaignRecord>>, counts: PackCounts): string | null {
    if ((record.type !== 'person' && record.type !== 'vessel') || record.sheet == null) return null;
    if (typeof record.sheet === 'string') {
        const text = redactText(record.sheet, records, counts).trim();
        return text || null;
    }
    if (typeof record.sheet !== 'object' || Array.isArray(record.sheet)) return null;
    const values = sheetValues(record.sheet);
    const used = new Set<string>();
    const lines: string[] = [];
    for (const name of sheetFieldNames(record, record.sheet)) {
        if (!Object.hasOwn(values, name)) continue;
        used.add(name);
        const line = sheetLine(name, values[name], records, counts);
        if (line) lines.push(line);
    }
    for (const [name, value] of Object.entries(values)) {
        if (used.has(name)) continue;
        const line = sheetLine(name, value, records, counts);
        if (line) lines.push(line);
    }
    return lines.length ? lines.join('\n') : null;
}

function fieldsOfBlock(block: Section['blocks'][number]): SheetField[] {
    if (block.kind === 'row') return block.cells.map((cell) => cell.field);
    const fields: SheetField[] = [];
    for (const row of block.cells) {
        for (const field of row) if (field) fields.push(field);
    }
    return fields;
}

function keptPersonName(id: string | undefined, records: Readonly<Record<string, CampaignRecord>>): string | null {
    if (!id) return null;
    const found = records[id];
    if (!found || found.deleted || found.type !== 'person') return null;
    const name = found.name.trim();
    return name || null;
}

/** One box on the player's sheet: the page's "Yes", a kept person's name, and a boarded fare on its Passage line. */
function fieldLine(
    field: SheetField,
    values: ReturnType<typeof sheetView>,
    passengers: ReturnType<typeof manifestOf>['passengers'],
    viewRecords: Readonly<Record<string, CampaignRecord>>,
): string | null {
    if (field.type === 'checkbox') return valueOf(values, field) === true ? field.name + ': Yes' : null;
    const person = personOf(values, field, viewRecords);
    const held = valueOf(values, field);
    const written = person ? person.name.trim() : (typeof held === 'string' ? held.trim() : '');
    const fare = fareOfPassageField(passengers, field.name);
    const fareText = fare === null ? '' : formatCredits(fare);
    const shown = written && fareText ? written + ' · ' + fareText : (written || fareText);
    if (!shown) return null;
    return field.name + ': ' + shown;
}

function plainLine(name: string, value: string | true): string | null {
    const raw = value === true ? 'Yes' : value.trim();
    if (!raw || !name.trim()) return null;
    return name + ': ' + raw;
}

/**
 * The party ship's sheet as the player's page reads it: the PDF's sections in page order,
 * empty sections left out, crew that the projection kept, and one "Deck plan" line when
 * the sheet holds a plan. No coordinates and no JSON.
 */
function partySheetText(
    record: CampaignRecord,
    viewRecords: Readonly<Record<string, CampaignRecord>>,
    viewLinks: Readonly<Record<string, CampaignLink>>,
    records: Readonly<Record<string, CampaignRecord>>,
    counts: PackCounts,
): string | null {
    if (typeof record.sheet === 'string') return sheetText(record, records, counts);
    const values = sheetView(record);
    const passengers = manifestOf(record).passengers;
    const crew = peopleOfKind(viewLinks, viewRecords, record.id, SECTION_KIND.Crew);
    const used = new Set<string>();
    const lines: string[] = [];
    for (const section of sheetSections()) {
        const block: string[] = [];
        if (section.name === 'Crew' && crew.length) {
            block.push('People: ' + crew.map((item) => item.person.name).join(', '));
        }
        for (const piece of section.blocks) {
            for (const field of fieldsOfBlock(piece)) {
                used.add(field.name);
                const line = fieldLine(field, values, passengers, viewRecords);
                if (line) block.push(line);
            }
        }
        if (block.length) {
            lines.push(section.name);
            for (const line of block) lines.push(line);
        }
    }
    for (const [name, value] of Object.entries(values)) {
        if (used.has(name) || isManifestField(name) || name.endsWith(' record')) continue;
        if (value !== true && typeof value !== 'string') continue;
        const line = plainLine(name, value);
        if (line) lines.push(line);
    }
    if (deckPlanOf(record.sheet)) lines.push('Deck plan');
    if (!lines.length) return null;
    return redactText(lines.join('\n'), records, counts);
}

function cargoText(record: CampaignRecord): string {
    const manifest = manifestOf(record);
    const capacity = capacityTons(fieldsOf(record.sheet));
    const used = tonsUsed(manifest.cargo);
    const lines = [holdWords(used, capacity)];
    if (capacity !== null && used > capacity) {
        lines.push('The hold is over capacity by ' + tonsWords(used - capacity) + '.');
    }
    if (!manifest.cargo.length) {
        lines.push('The hold is empty.');
        return lines.join('\n');
    }
    for (const lot of manifest.cargo) {
        const label = lot.label.trim() || 'Unnamed lot';
        lines.push(label + ' ' + tonsWords(lot.tons));
        const meta = lotMeta(lot);
        if (meta) lines.push(meta);
    }
    return lines.join('\n');
}

function passengersText(record: CampaignRecord, viewRecords: Readonly<Record<string, CampaignRecord>>): string {
    const lots = manifestOf(record).passengers;
    if (!lots.length) return 'No passengers.';
    return lots.map((lot) => {
        const name = keptPersonName(lot.personId, viewRecords) ?? (lot.label.trim() || 'Unnamed passenger');
        const parts = [name];
        if (lot.class.trim()) parts.push(lot.class.trim());
        if (isBoarded(lot)) parts.push('Boarded, ' + formatCredits(lot.fareCr ?? 0));
        return parts.join(' · ');
    }).join('\n');
}

function ledgerText(record: CampaignRecord): string {
    const lines = ledgerOf(record);
    const out = [formatCredits(ledgerBalance(lines))];
    if (!lines.length) {
        out.push('Nothing on the ledger yet.');
        return out.join('\n');
    }
    for (const period of ledgerByPeriod(lines).reverse()) {
        out.push(dayWords({ year: period.year, day: period.day }) + ' ' + formatCredits(period.balance));
        for (const item of period.lines) {
            out.push(item.memo + ' ' + LEDGER_KIND_WORDS[item.kind] + ' ' + formatCredits(item.amount));
        }
    }
    return out.join('\n');
}

function entryTitle(entry: CampaignEntry, body: string): string {
    const title = entry.title.trim();
    if (title) return title;
    if (entry.kind === 'session') return entry.sequence != null ? 'Session ' + entry.sequence : 'Session';
    const line = body.split('\n').map((item) => item.trim()).find(Boolean);
    if (line) return line;
    return 'Untitled ' + kindWord(entry.kind).toLowerCase();
}

function linkKind(kind: CampaignLink['kind']): string {
    const found = CAMPAIGN_LINK_KINDS.find((row) => row.kind === kind);
    return found ? found.labelFrom : kind;
}

/** The selection, the redaction, and the counts. The HTML is built from this. */
export function planPack(input: PackInput): PackPlan {
    // The same read the server will hand a player (Epic P, decision 3).
    const view = playersView({
        records: Object.values(input.records),
        links: Object.values(input.links),
        journal: Object.values(input.journal),
        settings: input.settings,
        clock: input.clockDays == null || !Number.isFinite(input.clockDays) ? null : { days: input.clockDays, rev: 0 },
    });
    const inRecord = new Set(view.records.map((row) => row.id));
    const inEntry = new Set(view.journal.map((row) => row.id));
    const inLink = new Set(view.links.map((row) => row.id));
    const counts: PackCounts = {
        recordsLeftOut: 0,
        entriesLeftOut: 0,
        linksLeftOut: 0,
        linkTextLeftOff: 0,
        mentions: 0,
        places: 0,
        partyMembers: 0,
        ship: 0,
        timeline: 0,
    };
    const clock = clockDay(input.clockDays);
    const records: PackRecord[] = [];
    const viewRecords: Record<string, CampaignRecord> = {};
    for (const row of view.records) viewRecords[row.id] = row as CampaignRecord;
    const viewLinks: Record<string, CampaignLink> = {};
    for (const row of view.links) viewLinks[row.id] = row as CampaignLink;
    const namedParty = input.settings ? input.settings.party : null;

    for (const record of Object.values(input.records)) {
        if (record.deleted) continue;
        if (!inRecord.has(record.id)) {
            counts.recordsLeftOut += 1;
            continue;
        }
        const summary = redactText(record.summary, input.records, counts);
        const details = redactText(record.details, input.records, counts);
        const notes = record.playerNotes == null ? null : redactText(record.playerNotes, input.records, counts);
        const ship = isPartyShip(record, namedParty) ? viewRecords[record.id] : undefined;
        records.push({
            id: record.id,
            type: record.type,
            typeName: typeInfo(record.type).one,
            kind: redactText(record.kind, input.records, counts),
            name: shownName(record.name, input.records, counts),
            summary,
            details,
            tags: record.tags.map((tag) => redactText(tag, input.records, counts)),
            when: record.when ? whenText(record.when.start) + (record.when.end ? ' to ' + whenText(record.when.end) : '') : null,
            place: placeOf(record.anchor, input.records, counts),
            playerNotes: notes,
            sheet: ship ? partySheetText(ship, viewRecords, viewLinks, input.records, counts) : sheetText(record, input.records, counts),
            status: statusText(),
            cargo: ship ? redactText(cargoText(ship), input.records, counts) : null,
            passengers: ship ? redactText(passengersText(ship, viewRecords), input.records, counts) : null,
            fuel: ship ? redactText(fuelWords(fuelTonsOf(ship.status), fuelCapacityTons(fieldsOf(ship.sheet))), input.records, counts) : null,
            ledger: ship ? redactText(ledgerText(ship), input.records, counts) : null,
        });
    }
    records.sort((a, b) => a.typeName.localeCompare(b.typeName) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));

    const entries: PackEntry[] = [];
    for (const entry of Object.values(input.journal)) {
        if (entry.deleted) continue;
        if (!inEntry.has(entry.id)) {
            counts.entriesLeftOut += 1;
            continue;
        }
        const body = redactText(entry.body, input.records, counts);
        const title = redactText(entryTitle(entry, body), input.records, counts);
        entries.push({
            id: entry.id,
            kind: entry.kind,
            kindName: kindWord(entry.kind),
            title,
            body,
            when: entry.when ? whenText(entry.when) : null,
            played: entry.realDate,
            author: entry.author === 'players' ? 'Written by players' : 'Written by the referee',
            place: placeOf(entry.anchor, input.records, counts),
        });
    }
    entries.sort((a, b) => (a.id < b.id ? -1 : 1));

    const links: PackLink[] = [];
    for (const link of Object.values(input.links)) {
        if (link.deleted) continue;
        const from = input.records[link.from];
        const to = input.records[link.to];
        const shownFrom = playersRecord(from);
        const shownTo = playersRecord(to);
        if (!inLink.has(link.id) || !shownFrom || !shownTo) {
            counts.linksLeftOut += 1;
            continue;
        }
        if (link.role.trim() || link.notes.trim()) counts.linkTextLeftOff += 1;
        links.push({
            fromId: shownFrom.id,
            toId: shownTo.id,
            fromName: shownName(shownFrom.name, input.records, counts),
            toName: shownName(shownTo.name, input.records, counts),
            kind: linkKind(link.kind),
        });
    }

    const party: PackPlan['party'] = { members: [], ship: null, ships: [], ashore: [] };
    const settingsParty = input.settings ? input.settings.party : null;
    if (settingsParty) {
        const playersMembers: { id: string; name: string }[] = [];
        for (const id of settingsParty.memberIds) {
            const record = input.records[id];
            if (!record || record.deleted) continue;
            if (!playersRecord(record)) {
                counts.partyMembers += 1;
                continue;
            }
            const listed = { id: record.id, name: shownName(record.name, input.records, counts) };
            party.members.push(listed);
            playersMembers.push(listed);
        }
        const vesselIds = Array.isArray(settingsParty.vesselIds) ? settingsParty.vesselIds : [];
        const aboard = settingsParty.aboard && typeof settingsParty.aboard === 'object' ? settingsParty.aboard : {};
        for (const vesselId of vesselIds) {
            const vessel = input.records[vesselId];
            if (!vessel || vessel.deleted || vessel.type !== 'vessel') continue;
            if (!playersRecord(vessel)) {
                counts.ship += 1;
                continue;
            }
            const onBoard = playersMembers.filter((member) => aboard[member.id] === vesselId);
            party.ships.push({ id: vessel.id, name: shownName(vessel.name, input.records, counts), aboard: onBoard });
        }
        party.ship = party.ships[0] ? { id: party.ships[0].id, name: party.ships[0].name } : null;
        const listedIds = new Set(party.ships.flatMap((ship) => ship.aboard.map((member) => member.id)));
        for (const member of playersMembers) {
            const shipId = aboard[member.id];
            if (shipId && vesselIds.includes(shipId)) continue;
            if (listedIds.has(member.id)) continue;
            party.ashore.push(member);
        }
    }

    const timeline: PackTimelineRow[] = [];
    for (const record of Object.values(input.records)) {
        if (!playersRecord(record) || !record.when) continue;
        if (afterClock(record.when.start, clock)) {
            counts.timeline += 1;
            continue;
        }
        const shown = records.find((row) => row.id === record.id);
        timeline.push({
            id: record.id,
            date: whenText(record.when.start),
            weekday: stardate(totalDays(record.when.start.year, record.when.start.day)).weekday,
            title: shownName(record.name, input.records, counts),
            kind: typeInfo(record.type).one,
            place: shown ? shown.place : null,
        });
    }
    for (const entry of Object.values(input.journal)) {
        if (entry.deleted || !inEntry.has(entry.id) || !entry.when) continue;
        if (afterClock(entry.when, clock)) {
            counts.timeline += 1;
            continue;
        }
        const shown = entries.find((row) => row.id === entry.id);
        timeline.push({
            id: entry.id,
            date: whenText(entry.when),
            weekday: stardate(totalDays(entry.when.year, entry.when.day)).weekday,
            title: shown ? shown.title : entryTitle(entry, entry.body),
            kind: kindWord(entry.kind),
            place: shown ? shown.place : null,
        });
    }
    timeline.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? -1 : 1)));

    const clockLabel = clock ? stardate(input.clockDays as number).date : 'no date';
    return {
        name: input.name.trim() || 'Campaign',
        clockLabel,
        noDate: clock === null,
        counts,
        leftOut: counts.recordsLeftOut + counts.entriesLeftOut,
        includedRecords: records.length,
        includedEntries: entries.length,
        records,
        entries,
        links,
        party,
        timeline,
    };
}

/** The sentence the journal shows before the file is saved. */
export function packConfirm(plan: PackPlan): string {
    return plan.includedRecords + ' records, ' + plan.includedEntries + ' entries. '
        + plan.leftOut + ' items are left out because they are not marked for players.';
}
