/**
 * The Campaign timeline as a list (campaign_manager_plan.md §7.3). A reading of dated
 * journal entries and dated records. Nothing here is stored, and nothing is written.
 * Link since/until and vessel track legs stay off this list: they are not a journal
 * entry and they are not a record's when.
 */
import type { CampaignEntry, CampaignRecord, CampaignRecordType } from '@voyage/shared';
import type { FaIconName } from '../design/icons.ts';
import { entryIcon, entryName, entryPlace, kindWord, whenText } from './journal/list.ts';
import { resolveAnchor } from './party.ts';
import { liveById, resolvePlace } from './places.ts';
import { placeLine, typeInfo } from './records.ts';
import { stardate, weekdayName } from './stardate.ts';

export type TimelineRow = {
    id: string;
    source: 'entry' | 'record';
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
    visibility: 'referee' | 'players';
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
            year: entry.when.year,
            day: entry.when.day,
            date: whenText(entry.when),
            until: null,
            title: entryName(entry),
            kind: kindWord(entry.kind),
            place: anchor ? entryPlace(anchor, input.records) : '',
            hexKey: resolved ? resolved.hexKey : null,
            visibility: entry.visibility,
            avatar: { name: entryName(entry), type: 'note', images: null },
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

    const stamped = rows as (TimelineRow & { createdAt: string })[];
    stamped.sort((a, b) => newer(a, b) || byCreated(a, b));

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
