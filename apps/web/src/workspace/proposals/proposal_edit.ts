/**
 * Edit before Accept (spec §1.4): the proposal's own words open in boxes, and Accept sends the
 * edited proposal as the decision's `change`. Only words are edited here (names, summaries,
 * details, titles, roles, notes, tags); a date, a place, the clock or a ship's lists are accepted
 * or dropped as sent. Pure.
 */
import { Proposal, type ProposalBatch } from '@voyage/shared';
import { cleanDetails, cleanName, cleanSummary, cleanTag } from '../records.ts';

type ProposalValue = NonNullable<ProposalBatch['proposals']>[number]['proposal'];

export type EditField = { key: string; label: string; value: string; long: boolean };

function tagsText(tags: readonly string[] | undefined): string {
    return (tags ?? []).join(', ');
}

function tagsOf(text: string): string[] {
    const out: string[] = [];
    for (const part of text.split(',')) {
        const tag = cleanTag(part);
        if (tag && !out.includes(tag)) out.push(tag);
    }
    return out;
}

/** The boxes Edit opens. None for a proposal with no words to edit. */
export function editFields(proposal: ProposalValue): EditField[] {
    if (proposal.op === 'record.create') {
        const r = proposal.record;
        return [
            { key: 'name', label: 'Name', value: r.name, long: false },
            { key: 'summary', label: 'Summary', value: r.summary, long: false },
            { key: 'details', label: 'Details', value: r.details, long: true },
            { key: 'tags', label: 'Tags, separated by commas', value: tagsText(r.tags), long: false },
        ];
    }
    if (proposal.op === 'record.update') {
        const out: EditField[] = [];
        const set = proposal.set ?? {};
        if (set.name !== undefined) out.push({ key: 'set.name', label: 'Name', value: set.name, long: false });
        if (set.summary !== undefined) out.push({ key: 'set.summary', label: 'Summary', value: set.summary, long: false });
        if (set.details !== undefined) out.push({ key: 'set.details', label: 'Details', value: set.details, long: true });
        if (set.tags !== undefined) out.push({ key: 'set.tags', label: 'Tags, separated by commas', value: tagsText(set.tags), long: false });
        if (proposal.append?.details) out.push({ key: 'append.details', label: 'Details to add', value: proposal.append.details, long: true });
        if (proposal.append?.tags) out.push({ key: 'append.tags', label: 'Tags to add, separated by commas', value: tagsText(proposal.append.tags), long: false });
        return out;
    }
    if (proposal.op === 'journal.create') {
        return [
            { key: 'title', label: 'Title', value: proposal.entry.title, long: false },
            { key: 'body', label: 'Text', value: proposal.entry.body, long: true },
        ];
    }
    if (proposal.op === 'link.create') {
        return [
            { key: 'role', label: 'Role', value: proposal.link.role, long: false },
            { key: 'notes', label: 'Notes', value: proposal.link.notes ?? '', long: true },
        ];
    }
    return [];
}

/**
 * The proposal with the boxes' words. Null when the result is not a proposal the server takes
 * (an empty name, an update left with nothing to change), with the sentence to show.
 */
export function withEdits(proposal: ProposalValue, values: Readonly<Record<string, string>>): { proposal: ProposalValue } | { error: string } {
    const get = (key: string) => values[key] ?? '';
    let next: unknown = proposal;
    if (proposal.op === 'record.create') {
        next = { ...proposal, record: { ...proposal.record, name: cleanName(get('name')), summary: cleanSummary(get('summary')), details: cleanDetails(get('details')), tags: tagsOf(get('tags')) } };
    } else if (proposal.op === 'record.update') {
        const set = { ...(proposal.set ?? {}) };
        if ('set.name' in values) set.name = cleanName(get('set.name'));
        if ('set.summary' in values) set.summary = cleanSummary(get('set.summary'));
        if ('set.details' in values) set.details = cleanDetails(get('set.details'));
        if ('set.tags' in values) set.tags = tagsOf(get('set.tags'));
        const append: { details?: string; tags?: string[] } = { ...(proposal.append ?? {}) };
        if ('append.details' in values) {
            const details = cleanDetails(get('append.details'));
            if (details) append.details = details;
            else delete append.details;
        }
        if ('append.tags' in values) {
            const tags = tagsOf(get('append.tags'));
            if (tags.length) append.tags = tags;
            else delete append.tags;
        }
        const out: Record<string, unknown> = { ...proposal };
        delete out.set;
        delete out.append;
        if (Object.keys(set).length) out.set = set;
        if (Object.keys(append).length) out.append = append;
        next = out;
    } else if (proposal.op === 'journal.create') {
        next = { ...proposal, entry: { ...proposal.entry, title: get('title').trim(), body: get('body').trim() } };
    } else if (proposal.op === 'link.create') {
        const notes = get('notes').trim();
        const link: Record<string, unknown> = { ...proposal.link, role: get('role').trim() };
        if (notes) link.notes = notes;
        else delete link.notes;
        next = { ...proposal, link };
    }
    const parsed = Proposal.safeParse(next);
    if (parsed.success) return { proposal: parsed.data };
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.filter((part) => typeof part === 'string').pop() : undefined;
    if (where === 'name') return { error: 'Enter a name.' };
    if (where === 'set') return { error: 'Nothing is left to change. Drop the proposal instead.' };
    return { error: "That can't be saved." };
}
