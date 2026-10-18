/**
 * The Campaign timeline as a list (campaign_manager_plan.md §7.3; UX backlog U6).
 * A reading of dated journal entries, dated records, and, on the campaign timeline,
 * vessel legs and where the party is today. Nothing here is stored, and nothing is written.
 * Link since/until stay off. The record page's own list does not ask for legs (N0).
 * The campaign list does (U6; that reversal is this list only). D mounts the screen.
 */
import { Track, type CampaignAnchor, type CampaignEntry, type CampaignRecord, type CampaignRecordType, type TrackLeg } from '@voyage/shared';
import type { FaIconName } from '../design/icons.ts';
import { entryIcon, entryName, entryPlace, kindWord, whenText } from './journal/list.ts';
import { resolveAnchor, type Party } from './party.ts';
import { partyWhere } from './party_where.ts';
import { liveById, placeWords, resolvePlace } from './places.ts';
import { placeLine, typeInfo } from './records.ts';
import { stardate, weekdayName } from './stardate.ts';

export type TimelineRow = {
    id: string;
    source: 'entry' | 'record' | 'leg' | 'party';
    /** The vessel a leg or the party row belongs to. Null on a journal entry or another record. */
    shipId: string | null;
    year: number;
    day: number;
    /** DDD-YYYY of the row's own date (a record's start). */
    date: string;
    /** DDD-YYYY of a record whose end falls on another day. */
    until: string | null;
    title: string;
    kind: string;
    /** Empty when the row has no place. */
    place: string;
    hexKey: string | null;
    visibility: 'referee' | 'players' | 'public';
    avatar: { name: string; type: CampaignRecordType; images: CampaignRecord['images'] };
    /** Set for a journal entry, whose avatar is not a record type. */
    icon: FaIconName | null;
};

export type TimelineDay = {
    year: number;
    day: number;
    date: string;
    weekday: string;
    today: boolean;
    rows: TimelineRow[];
};

export type TimelineYear = {
    year: number;
    days: TimelineDay[];
};

export type TimelineModel = {
    years: TimelineYear[];
    /** Dated rows. An empty Today heading is not a row. */
    count: number;
};

function newer(a: { year: number; day: number }, b: { year: number; day: number }): number {
    if (a.year !== b.year) return b.year - a.year;
    return b.day - a.day;
}

function byCreated(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

function sameWhen(a: { year: number; day: number }, b: { year: number; day: number }): boolean {
    return a.year === b.year && a.day === b.day;
}

/**
 * Dated journal entries and dated records, grouped by year then day, newest first.
 * `entries` is the journal's date order (`entriesByDate`). Undated rows are left out.
 * A record uses `when.start`. A different `when.end` is named on that same row.
 * `clockDays` marks Today. Null when the campaign has no date.
 */
export function buildTimeline(input: {
    entries: readonly CampaignEntry[];
    records: Readonly<Record<string, CampaignRecord>>;
    clockDays: number | null;
    /** Campaign timeline only. The record page leaves this off, so its list stays entries and records. */
    includeLegs?: boolean;
    /** Where the party is on the campaign date. Drawn only with a clock. */
    party?: Party | null;
}): TimelineModel {
    const live = liveById(input.records);
    const rows: TimelineRow[] = [];

    for (const entry of input.entries) {
        if (entry.deleted || !entry.when) continue;
        const anchor = entry.anchor;
        const resolved = anchor ? resolveAnchor(anchor, input.records) : null;
        rows.push({
            id: entry.id,
            source: 'entry',
            shipId: null,
            year: entry.when.year,
            day: entry.when.day,
            date: whenText(entry.when),
            until: null,
            title: entryName(entry),
            kind: kindWord(entry.kind),
            place: anchor ? entryPlace(anchor, input.records) : '',
            hexKey: resolved ? resolved.hexKey : null,
            visibility: entry.visibility,
            avatar: { name: entryName(entry), type: 'note', images: entry.images ?? null },
            icon: entryIcon(entry.kind),
            createdAt: entry.createdAt,
        } as TimelineRow & { createdAt: string });
    }

    for (const record of Object.values(input.records)) {
        if (record.deleted || !record.when) continue;
        const start = record.when.start;
        const end = record.when.end;
        const resolved = resolvePlace(record.id, live);
        const until = end && !sameWhen(start, end) ? whenText(end) : null;
        rows.push({
            id: record.id,
            source: 'record',
            shipId: null,
            year: start.year,
            day: start.day,
            date: whenText(start),
            until,
            title: record.name,
            kind: typeInfo(record.type).one,
            place: record.anchor ? placeLine(record, input.records) : '',
            hexKey: resolved ? resolved.hexKey : null,
            visibility: record.visibility,
            avatar: { name: record.name, type: record.type, images: record.images },
            icon: null,
            createdAt: record.createdAt,
        } as TimelineRow & { createdAt: string });
    }

    if (input.includeLegs) {
        for (const record of Object.values(input.records)) {
            const legs = legsOf(record);
            if (!legs) continue;
            legs.forEach((leg, index) => {
                for (const event of legEvents(leg)) {
                    const when = stardate(event.days);
                    const said = sayAnchor(event.anchor, input.records);
                    rows.push({
                        id: record.id + ':leg:' + index + ':' + event.end,
                        source: 'leg',
                        shipId: record.id,
                        year: when.year,
                        day: when.day,
                        date: when.date,
                        until: null,
                        title: record.name,
                        kind: event.kind,
                        place: said.place,
                        hexKey: said.hexKey,
                        visibility: record.visibility,
                        avatar: { name: record.name, type: 'vessel', images: record.images },
                        icon: null,
                        createdAt: record.createdAt,
                        rank: 1,
                    } as TimelineRow & { createdAt: string; rank: number });
                }
            });
        }
    }

    if (input.party && input.clockDays !== null && Number.isFinite(input.clockDays)) {
        const standing = partyRow(input.party, input.records, input.clockDays);
        if (standing) rows.push(standing);
    }

    const stamped = rows as (TimelineRow & { createdAt: string; rank?: number })[];
    stamped.sort((a, b) => newer(a, b) || (a.rank ?? 1) - (b.rank ?? 1) || byCreated(a, b));

    const days: TimelineDay[] = [];
    for (const row of stamped) {
        const last = days[days.length - 1];
        if (last && last.year === row.year && last.day === row.day) last.rows.push(row);
        else {
            days.push({
                year: row.year,
                day: row.day,
                date: row.date,
                weekday: weekdayName(row.day),
                today: false,
                rows: [row],
            });
        }
    }

    if (input.clockDays !== null && Number.isFinite(input.clockDays)) {
        const now = stardate(input.clockDays);
        const mark = { year: now.year, day: now.day };
        const found = days.find((day) => sameWhen(day, mark));
        if (found) found.today = true;
        else {
            const heading: TimelineDay = {
                year: now.year,
                day: now.day,
                date: now.date,
                weekday: now.weekday,
                today: true,
                rows: [],
            };
            const at = days.findIndex((day) => newer(day, mark) > 0);
            if (at < 0) days.push(heading);
            else days.splice(at, 0, heading);
        }
    }

    const years: TimelineYear[] = [];
    for (const day of days) {
        const last = years[years.length - 1];
        if (last && last.year === day.year) last.days.push(day);
        else years.push({ year: day.year, days: [day] });
    }
    return { years, count: stamped.length };
}

/** The campaign timeline: dated entries, dated records, each vessel's legs, and the party today. */
export function campaignTimeline(input: {
    entries: readonly CampaignEntry[];
    records: Readonly<Record<string, CampaignRecord>>;
    clockDays: number | null;
    party: Party | null;
}): TimelineModel {
    return buildTimeline({ ...input, includeLegs: true });
}

function legsOf(record: CampaignRecord): TrackLeg[] | null {
    if (record.deleted || record.type !== 'vessel') return null;
    const status = record.status;
    if (!status || typeof status !== 'object' || Array.isArray(status) || !Object.prototype.hasOwnProperty.call(status, 'track')) return null;
    const parsed = Track.safeParse((status as { track: unknown }).track);
    if (!parsed.success || parsed.data.length === 0) return null;
    return parsed.data;
}

function sayAnchor(anchor: CampaignAnchor, records: Readonly<Record<string, CampaignRecord>>): { place: string; hexKey: string | null } {
    const resolved = resolveAnchor(anchor, records);
    if (!resolved) return { place: '', hexKey: null };
    return { place: placeWords(resolved)[0], hexKey: resolved.hexKey };
}

/** One end of a leg. A jump is entry and exit. Any other leg departs, and arrives when that is a later day count. A stay is one arrival. */
function legEvents(leg: TrackLeg): { days: number; anchor: CampaignAnchor; kind: string; end: 'out' | 'in' }[] {
    if (leg.mode === 'jump') {
        return [
            { days: leg.departs, anchor: leg.from, kind: 'Jump entry', end: 'out' },
            { days: leg.arrives, anchor: leg.to, kind: 'Jump exit', end: 'in' },
        ];
    }
    if (leg.arrives === leg.departs) {
        const stay = leg.mode === 'docked' || leg.mode === 'orbit';
        return [{ days: leg.departs, anchor: stay ? leg.to : leg.from, kind: stay ? 'Arrival' : 'Departure', end: 'out' }];
    }
    return [
        { days: leg.departs, anchor: leg.from, kind: 'Departure', end: 'out' },
        { days: leg.arrives, anchor: leg.to, kind: 'Arrival', end: 'in' },
    ];
}

function partyRow(party: Party, records: Readonly<Record<string, CampaignRecord>>, days: number): (TimelineRow & { createdAt: string; rank: number }) | null {
    const where = partyWhere(party, records, days);
    if (!where.anchor && !where.underway) return null;
    const when = stardate(days);
    const said = where.anchor ? sayAnchor(where.anchor, records) : { place: '', hexKey: null };
    const leadId = party.vesselIds[0] ?? null;
    const lead = leadId ? records[leadId] : undefined;
    const name = lead && !lead.deleted ? lead.name : 'Party';
    return {
        id: 'party-today',
        source: 'party',
        shipId: lead && !lead.deleted && lead.type === 'vessel' ? lead.id : null,
        year: when.year,
        day: when.day,
        date: when.date,
        until: null,
        title: name,
        kind: 'Today',
        place: where.underway ? where.underway.text : said.place,
        hexKey: said.hexKey,
        visibility: lead && !lead.deleted ? lead.visibility : 'players',
        avatar: { name, type: lead && !lead.deleted ? lead.type : 'note', images: lead && !lead.deleted ? lead.images : null },
        icon: null,
        createdAt: '9999-01-01T00:00:00.000Z',
        rank: 0,
    };
}

/**
 * The empty timeline's one next step. With no campaign date, set that date.
 * With a date, add a session: a session takes the date when it is written.
 */
/**
 * Whether a row stays once the timeline is narrowed. A record type keeps records of that
 * type. "Only this ship" keeps the lead ship, the records aboard it, and journal entries
 * anchored to one of those records.
 */
export function timelineKeeps(
    row: TimelineRow,
    narrow: {
        type: string | null;
        shipId: string | null;
        aboard: Readonly<Record<string, string>>;
        recordType: (id: string) => string | null;
        entryAnchorId: (id: string) => string | null;
    },
): boolean {
    if (narrow.type) {
        if (row.source !== 'record' || narrow.recordType(row.id) !== narrow.type) return false;
    }
    if (!narrow.shipId) return true;
    if (row.source === 'leg' || row.source === 'party') return row.shipId === narrow.shipId;
    if (row.source === 'record') return row.id === narrow.shipId || narrow.aboard[row.id] === narrow.shipId;
    const anchor = narrow.entryAnchorId(row.id);
    return anchor === narrow.shipId || (anchor !== null && narrow.aboard[anchor] === narrow.shipId);
}

export function timelineAdvice(hasClock: boolean): { text: string; act: 'date' | 'journal'; label: string } {
    if (!hasClock) {
        return {
            text: 'Set the campaign date. Sessions take that date when you write them.',
            act: 'date',
            label: 'Set the campaign date',
        };
    }
    return {
        text: 'Add a session in the Journal. It uses the campaign date.',
        act: 'journal',
        label: 'Open the Journal',
    };
}

/** The first dated row on Today, or the next row when Today has none. */
export function todayIndex(model: TimelineModel): number {
    let seen = 0;
    for (const year of model.years) {
        for (const day of year.days) {
            if (!day.today) {
                seen += day.rows.length;
                continue;
            }
            if (day.rows.length > 0) return seen;
            return seen < model.count ? seen : Math.max(0, model.count - 1);
        }
    }
    return 0;
}
