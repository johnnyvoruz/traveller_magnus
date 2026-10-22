/**
 * The words on a proposal card (spec_session_ingest.md §1.4, SI3). Pure: the screen passes the
 * records it holds and the batch, and gets a heading, the rows of the diff and the batch's line.
 * Nothing here applies anything; Accept and Drop are A's `resolve`.
 */
import type { CampaignAnchor, CampaignRecord, ProposalBatch } from '@voyage/shared';
import { formatCredits } from '../../campaign/money.ts';
import { stardate } from '../stardate.ts';
import { typeInfo } from '../records.ts';

type Stored = NonNullable<ProposalBatch['proposals']>[number];
type ProposalValue = Stored['proposal'];
type Day = { year: number; day: number };
type Target = { id: string } | { ref: string };

/** One line of the diff: what is stored now beside what the proposal would make it. */
export type DiffRow = {
    label: string;
    before: string | null;
    after: string;
    /** `set` replaces, `add` appends to what is there, `new` is a field of a record not made yet. */
    how: 'set' | 'add' | 'new';
};

export type Lookup = {
    records: Readonly<Record<string, CampaignRecord>>;
    /** The batch's creates by `ref`, so a link to a record the batch makes reads by its name. */
    refs: ReadonlyMap<string, string>;
};

const OP_TITLES: Record<ProposalValue['op'], string> = {
    'record.create': 'New record',
    'record.update': 'Change',
    'link.create': 'New link',
    'journal.create': 'Journal entry',
    'clock.set': 'Campaign date',
    'track.append': 'Course leg',
    'cargo.append': 'Cargo',
    'passengers.append': 'Passengers',
    'ledger.append': 'Ledger',
    question: 'Question',
};

/** A paste's counts: "2 new records", "1 question". */
const COUNT_WORDS: Record<ProposalValue['op'], [string, string]> = {
    'record.create': ['new record', 'new records'],
    'record.update': ['change', 'changes'],
    'link.create': ['new link', 'new links'],
    'journal.create': ['journal entry', 'journal entries'],
    'clock.set': ['date change', 'date changes'],
    'track.append': ['course leg', 'course legs'],
    'cargo.append': ['cargo addition', 'cargo additions'],
    'passengers.append': ['passenger addition', 'passenger additions'],
    'ledger.append': ['ledger addition', 'ledger additions'],
    question: ['question', 'questions'],
};

const MODE_WORDS: Record<string, string> = { docked: 'Docked', orbit: 'In orbit', flight: 'In flight', jump: 'Jump' };
const ENTRY_KINDS: Record<string, string> = { session: 'Session', note: 'Note', handout: 'Handout', rumour: 'Rumour' };

export function opTitle(op: ProposalValue['op']): string {
    return OP_TITLES[op];
}

/** The batch's creates by `ref`: the name each would have. */
export function refNames(batch: ProposalBatch): Map<string, string> {
    const out = new Map<string, string>();
    for (const row of batch.proposals ?? []) {
        if (row.proposal.op === 'record.create') out.set(row.proposal.ref, row.proposal.record.name);
    }
    return out;
}

function recordName(id: string, look: Lookup): string {
    const record = look.records[id];
    return record && !record.deleted ? record.name : 'a record not in this campaign';
}

function endName(end: Target, look: Lookup): string {
    if ('id' in end) return recordName(end.id, look);
    return look.refs.get(end.ref) ?? end.ref;
}

/** "Spinward Marches 1910 · Regina", "Aboard Bright Ledger", or "Nowhere in particular". */
export function anchorWords(anchor: CampaignAnchor | undefined, look: Lookup): string {
    if (!anchor) return 'Nowhere in particular';
    if (anchor.kind === 'record') return 'Aboard ' + recordName(anchor.id, look);
    const hex = anchor.hexKey.replace(/_/g, ' ').replace('/', ' ');
    return anchor.locationLabel ? hex + ' · ' + anchor.locationLabel : hex;
}

function dayWords(day: Day | null | undefined): string {
    if (!day) return 'No date';
    return String(day.day).padStart(3, '0') + '-' + String(day.year).padStart(4, '0');
}

function whenWords(when: { start: Day; end?: Day } | null | undefined): string {
    if (!when) return 'No date';
    return when.end ? dayWords(when.start) + ' to ' + dayWords(when.end) : dayWords(when.start);
}

function tagWords(tags: readonly string[]): string {
    return tags.length ? tags.join(', ') : 'None';
}

/** "Campaign day 3.5" said as the panel says a date: "104-1105, 12:00". */
export function clockWords(days: number): string {
    const date = stardate(days);
    const minutes = Math.round((days - Math.floor(days)) * 24 * 60);
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${date.date} (${date.weekday}), ${hh}:${mm}`;
}

/** The card's heading: what kind of proposal, and what it is about. */
export function cardHeading(proposal: ProposalValue, look: Lookup): { kicker: string; title: string } {
    const kicker = opTitle(proposal.op);
    switch (proposal.op) {
        case 'record.create':
            return { kicker: 'New ' + typeInfo(proposal.record.type).one.toLowerCase(), title: proposal.record.name };
        case 'record.update':
            return { kicker, title: recordName(proposal.id, look) };
        case 'link.create':
            return { kicker, title: `${endName(proposal.link.from, look)} → ${endName(proposal.link.to, look)}` };
        case 'journal.create':
            return { kicker: (ENTRY_KINDS[proposal.entry.kind] ?? kicker) + (proposal.entry.sequence ? ' ' + proposal.entry.sequence : ''), title: proposal.entry.title || 'Untitled' };
        case 'clock.set':
            return { kicker, title: clockWords(proposal.days) };
        case 'question':
            return { kicker, title: 'Your AI asks' };
        default:
            return { kicker, title: recordName(proposal.id, look) };
    }
}

function lotWords(lot: { label: string; tons: number; value?: number; origin?: string; destination?: string; note?: string }): string {
    const parts = [`${lot.label}, ${lot.tons} t`];
    if (lot.value !== undefined) parts.push(formatCredits(lot.value));
    if (lot.origin) parts.push('from ' + lot.origin);
    if (lot.destination) parts.push('to ' + lot.destination);
    if (lot.note) parts.push(lot.note);
    return parts.join(' · ');
}

/**
 * The rows of the diff. An update shows each field it sets beside what is stored now, and what it
 * adds; a create shows its fields; an append shows what it adds after how many are there now.
 */
export function diffRows(proposal: ProposalValue, look: Lookup): DiffRow[] {
    const rows: DiffRow[] = [];
    if (proposal.op === 'record.create') {
        const r = proposal.record;
        rows.push({ label: 'Kind', before: null, after: r.kind || 'None', how: 'new' });
        if (r.summary) rows.push({ label: 'Summary', before: null, after: r.summary, how: 'new' });
        if (r.details) rows.push({ label: 'Details', before: null, after: r.details, how: 'new' });
        if (r.tags.length) rows.push({ label: 'Tags', before: null, after: tagWords(r.tags), how: 'new' });
        rows.push({ label: 'Place', before: null, after: anchorWords(r.anchor, look), how: 'new' });
        if (r.when) rows.push({ label: 'When', before: null, after: whenWords(r.when), how: 'new' });
        return rows;
    }
    if (proposal.op === 'record.update') {
        const now = look.records[proposal.id];
        const set = proposal.set ?? {};
        if (set.name !== undefined) rows.push({ label: 'Name', before: now ? now.name : null, after: set.name, how: 'set' });
        if (set.kind !== undefined) rows.push({ label: 'Kind', before: now ? now.kind || 'None' : null, after: set.kind || 'None', how: 'set' });
        if (set.summary !== undefined) rows.push({ label: 'Summary', before: now ? now.summary : null, after: set.summary, how: 'set' });
        if (set.details !== undefined) rows.push({ label: 'Details', before: now ? now.details : null, after: set.details, how: 'set' });
        if (set.tags !== undefined) rows.push({ label: 'Tags', before: now ? tagWords(now.tags) : null, after: tagWords(set.tags), how: 'set' });
        if (set.anchor !== undefined) rows.push({ label: 'Place', before: now ? anchorWords(now.anchor, look) : null, after: anchorWords(set.anchor, look), how: 'set' });
        if (set.when !== undefined) rows.push({ label: 'When', before: now ? whenWords(now.when) : null, after: whenWords(set.when), how: 'set' });
        if (proposal.append?.details) rows.push({ label: 'Details', before: now ? now.details : null, after: proposal.append.details, how: 'add' });
        if (proposal.append?.tags) rows.push({ label: 'Tags', before: now ? tagWords(now.tags) : null, after: tagWords(proposal.append.tags), how: 'add' });
        return rows;
    }
    if (proposal.op === 'link.create') {
        const link = proposal.link;
        rows.push({ label: 'Kind', before: null, after: link.kind, how: 'new' });
        if (link.role) rows.push({ label: 'Role', before: null, after: link.role, how: 'new' });
        if (link.since || link.until) rows.push({ label: 'When', before: null, after: `${dayWords(link.since)} to ${link.until ? dayWords(link.until) : 'now'}`, how: 'new' });
        if (link.notes) rows.push({ label: 'Notes', before: null, after: link.notes, how: 'new' });
        return rows;
    }
    if (proposal.op === 'journal.create') {
        const entry = proposal.entry;
        rows.push({ label: 'Date', before: null, after: dayWords(entry.when), how: 'new' });
        if (entry.realDate) rows.push({ label: 'Played on', before: null, after: entry.realDate, how: 'new' });
        rows.push({ label: 'Place', before: null, after: anchorWords(entry.anchor, look), how: 'new' });
        rows.push({ label: 'Text', before: null, after: entry.body || 'None', how: 'new' });
        return rows;
    }
    if (proposal.op === 'clock.set') return rows;
    if (proposal.op === 'question') return rows;
    const now = look.records[proposal.id];
    const status = now && now.status && typeof now.status === 'object' ? now.status as Record<string, unknown> : {};
    const count = (key: string) => (Array.isArray(status[key]) ? (status[key] as unknown[]).length : 0);
    if (proposal.op === 'track.append') {
        const leg = proposal.leg;
        const what = `${MODE_WORDS[leg.mode] ?? leg.mode}: ${anchorWords(leg.from, look)} to ${anchorWords(leg.to, look)}, ${clockWords(leg.departs)} to ${clockWords(leg.arrives)}`;
        rows.push({ label: 'Leg', before: `${count('track')} on the course`, after: leg.note ? `${what} · ${leg.note}` : what, how: 'add' });
        return rows;
    }
    if (proposal.op === 'cargo.append') {
        proposal.lots.forEach((lot, i) => rows.push({ label: 'Lot', before: i === 0 ? `${count('cargo')} in the hold` : null, after: lotWords(lot), how: 'add' }));
        return rows;
    }
    if (proposal.op === 'passengers.append') {
        proposal.passengers.forEach((p, i) => rows.push({ label: 'Passenger', before: i === 0 ? `${count('passengers')} aboard` : null, after: `${p.label}, ${p.class}${p.note ? ' · ' + p.note : ''}`, how: 'add' }));
        return rows;
    }
    proposal.lines.forEach((line, i) => rows.push({
        label: 'Line',
        before: i === 0 ? `${count('ledger')} on the ledger` : null,
        after: `${dayWords(line.when)} · ${line.memo} · ${line.amount < 0 ? '−' + formatCredits(-line.amount) : formatCredits(line.amount)} (${line.kind})`,
        how: 'add',
    }));
    return rows;
}

/** The record a proposal is about, when it is one already in the campaign. */
export function targetOf(proposal: ProposalValue): string | null {
    if (proposal.op === 'record.update' || proposal.op === 'track.append' || proposal.op === 'cargo.append' || proposal.op === 'passengers.append' || proposal.op === 'ledger.append') return proposal.id;
    return null;
}

/** "3 waiting · 2 accepted · 1 dropped" (counts of zero left out, waiting always said). */
export function countWords(counts: ProposalBatch['counts']): string {
    const parts = [`${counts.pending} waiting`];
    if (counts.accepted) parts.push(`${counts.accepted} accepted`);
    if (counts.dropped) parts.push(`${counts.dropped} dropped`);
    return parts.join(' · ');
}

/** "18 Oct 2026" from an ISO stamp, in the reader's own calendar. */
export function stampWords(iso: string): string {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return '';
    const d = new Date(time);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** How the batch arrived: pasted by the referee, or sent by their AI with a token. */
export function doorWords(batch: ProposalBatch): string {
    return batch.pasted ? 'Pasted' : 'Sent by your AI';
}

/** "4 proposals: 2 new records, 1 change, 1 question" for a paste that checked out. */
export function pastedWords(counts: Record<string, number>): string {
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const parts = Object.entries(counts).map(([op, n]) => {
        const [one, many] = COUNT_WORDS[op as ProposalValue['op']] ?? [op, op];
        return `${n} ${n === 1 ? one : many}`;
    });
    return `${total} ${total === 1 ? 'proposal' : 'proposals'}: ${parts.join(', ')}`;
}
