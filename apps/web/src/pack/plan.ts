/**
 * What the Player Pack keeps. Pure: it reads a campaign snapshot and writes
 * nothing. A row is included only when its visibility is exactly `players`.
 * A kind with no visibility of its own stays out, except where Johnny's
 * answers name the way in (the clock day, a player record's place, the party
 * through those records).
 */
import {
    CAMPAIGN_LINK_KINDS,
    type CampaignAnchor,
    type CampaignEntry,
    type CampaignLink,
    type CampaignRecord,
    type CampaignSettings,
} from '@voyage/shared';
import { totalDays } from '../orbit/clock.ts';
import { kindWord, whenText } from '../workspace/journal/list.ts';
import { typeInfo } from '../workspace/records.ts';
import { stardate } from '../workspace/stardate.ts';
import { redactText } from './text.ts';

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
    /** A person's sheet, already turned into text. Other types carry none. */
    sheet: string | null;
    status: string | null;
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
    if (host) return host.name;
    counts.places += 1;
    return null;
}

function hiddenIds(records: Readonly<Record<string, CampaignRecord>>): string[] {
    const ids: string[] = [];
    for (const record of Object.values(records)) {
        if (!playersRecord(record)) ids.push(record.id);
    }
    return ids;
}

/** A status object with hidden record ids replaced, then read as text. */
function statusText(
    status: CampaignRecord['status'],
    records: Readonly<Record<string, CampaignRecord>>,
    counts: PackCounts,
    hidden: readonly string[],
): string | null {
    if (!status) return null;
    let raw = '';
    try {
        raw = JSON.stringify(status);
    } catch {
        return null;
    }
    if (!raw || raw === '{}') return null;
    for (const id of hidden) raw = raw.split(id).join('a record');
    return redactText(raw, records, counts);
}

function sheetText(record: CampaignRecord, records: Readonly<Record<string, CampaignRecord>>, counts: PackCounts, hidden: readonly string[]): string | null {
    if (record.type !== 'person' || record.sheet == null) return null;
    let raw = '';
    try {
        raw = typeof record.sheet === 'string' ? record.sheet : JSON.stringify(record.sheet);
    } catch {
        return null;
    }
    if (!raw) return null;
    for (const id of hidden) raw = raw.split(id).join('a record');
    return redactText(raw, records, counts);
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
    const hidden = hiddenIds(input.records);
    const clock = clockDay(input.clockDays);
    const records: PackRecord[] = [];

    for (const record of Object.values(input.records)) {
        if (record.deleted) continue;
        if (record.visibility !== 'players') {
            counts.recordsLeftOut += 1;
            continue;
        }
        const summary = redactText(record.summary, input.records, counts);
        const details = redactText(record.details, input.records, counts);
        const notes = record.playerNotes == null ? null : redactText(record.playerNotes, input.records, counts);
        records.push({
            id: record.id,
            type: record.type,
            typeName: typeInfo(record.type).one,
            kind: redactText(record.kind, input.records, counts),
            name: record.name,
            summary,
            details,
            tags: record.tags.map((tag) => redactText(tag, input.records, counts)),
            when: record.when ? whenText(record.when.start) + (record.when.end ? ' to ' + whenText(record.when.end) : '') : null,
            place: placeOf(record.anchor, input.records, counts),
            playerNotes: notes,
            sheet: sheetText(record, input.records, counts, hidden),
            status: statusText(record.status, input.records, counts, hidden),
        });
    }
    records.sort((a, b) => a.typeName.localeCompare(b.typeName) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));

    const entries: PackEntry[] = [];
    for (const entry of Object.values(input.journal)) {
        if (entry.deleted) continue;
        if (entry.visibility !== 'players') {
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
        if (!shownFrom || !shownTo) {
            counts.linksLeftOut += 1;
            continue;
        }
        if (link.role.trim() || link.notes.trim()) counts.linkTextLeftOff += 1;
        links.push({
            fromId: shownFrom.id,
            toId: shownTo.id,
            fromName: shownFrom.name,
            toName: shownTo.name,
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
            const listed = { id: record.id, name: record.name };
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
            party.ships.push({ id: vessel.id, name: vessel.name, aboard: onBoard });
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
            title: record.name,
            kind: typeInfo(record.type).one,
            place: shown ? shown.place : null,
        });
    }
    for (const entry of Object.values(input.journal)) {
        if (entry.deleted || entry.visibility !== 'players' || !entry.when) continue;
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
