/**
 * The referee's proposal list (spec_session_ingest.md §4 SI2) and the paste door (§3.1).
 * An accept sends the rev the store holds. Applied rows land the way a campaign save does.
 * A conflict keeps the card and shows the server's row.
 */
import { reactive } from 'vue';
import {
    CampaignClock,
    CampaignEntry,
    CampaignLink,
    CampaignRecord,
    ProposalBatch,
    ProposalBatchList,
    Proposal,
    ProposalBatchSubmit,
    ProposalResolveResult,
} from '@voyage/shared';

type RecordRow = ReturnType<typeof CampaignRecord.parse>;
type ProposalValue = ReturnType<typeof Proposal.parse>;
type BatchRow = ReturnType<typeof ProposalBatch.parse>;
type BatchSubmit = ReturnType<typeof ProposalBatchSubmit.parse>;
type ResolveResult = ReturnType<typeof ProposalResolveResult.parse>;
import { apiFetch } from '../platform/http.ts';
import { showToast } from '../shell/toast.ts';
import { rebuildCampaignIndex } from './index.ts';
import { rebuildJournalIndex } from './journal.ts';
import { parseRead } from './read.ts';
import { campaign, transport } from './store.ts';

const NO_BLOCK = 'No proposals found. Your AI\'s reply should end with one ```json block holding the batch.';
const NOT_JSON = 'The ```json block is not valid JSON. Ask your AI to give the whole block again.';
const MAX_SENTENCES = 20;
const CONFLICT_TOAST = 'Saved changes conflicted with a newer copy. The server copy is now shown.';

export type PasteProblem = {
    proposal: number | null;
    op: string | null;
    ref: string | null;
    path: string;
    message: string;
};

export type PastedBatch =
    | { ok: true; from: 'block' | 'whole'; batch: BatchSubmit; counts: Record<string, number> }
    | { ok: false; code: 'no_block' | 'not_json' | 'invalid'; problems: PasteProblem[]; sentences: string[] };

export type ProposalDecisionInput = {
    proposalId: string;
    action: 'accept' | 'drop';
    change?: ProposalValue;
};

export type ProposalConflict = {
    proposalId: string;
    table: 'records' | 'links' | 'journal' | 'clock';
    id: string;
    current: unknown;
};

export const proposals = reactive({
    batches: [] as BatchRow[],
    batch: null as BatchRow | null,
    /** Open proposals still waiting. A poll page refreshes this when it carries the count. */
    pending: 0,
    conflicts: [] as ProposalConflict[],
    error: '',
});

type RawProposal = { op?: unknown; ref?: unknown; proposals?: unknown };

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The first fenced json block, or the whole text when it is only JSON. */
export function findBlock(text: string): { from: 'block' | 'whole'; json: string } | null {
    const fence = /```[ \t]*json[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/i.exec(text);
    if (fence && fence[1] !== undefined) return { from: 'block', json: fence[1] };
    const whole = text.trim();
    if (whole.startsWith('{')) return { from: 'whole', json: whole };
    return null;
}

/** A paste failure in plain words. The checker's own path and message stay off the screen. */
function plainReason(problem: PasteProblem): string {
    const message = problem.message;
    const field = problem.path || 'a field';
    if (/invalid discriminator/i.test(message)) return 'that action is not one this campaign takes';
    if (/(^|\.)type$/.test(problem.path) && /invalid enum/i.test(message)) return 'the record type is not one this campaign has';
    if (/^required\b/i.test(message)) return `${field} is missing`;
    if (/expected .+ received /i.test(message)) return `${field} has the wrong type of value`;
    if (/invalid literal/i.test(message)) return `${field} is not one this campaign reads`;
    return `${field} could not be read`;
}

export function problemSentence(problem: PasteProblem): string {
    const who = problem.proposal === null
        ? 'The batch'
        : `Proposal ${problem.proposal}${problem.op ? ` (${problem.op})` : ''}`;
    return `${who}: ${plainReason(problem)}.`;
}

/** Finds the batch in a pasted reply and checks it. Does not send it. */
export function pastedBatch(text: string): PastedBatch {
    const found = findBlock(text);
    if (!found) return { ok: false, code: 'no_block', problems: [], sentences: [NO_BLOCK] };
    let value: unknown;
    try {
        value = JSON.parse(found.json);
    } catch {
        return { ok: false, code: 'not_json', problems: [], sentences: [NOT_JSON] };
    }
    const parsed = ProposalBatchSubmit.safeParse(value);
    if (parsed.success) {
        const counts: Record<string, number> = {};
        for (const proposal of parsed.data.proposals) counts[proposal.op] = (counts[proposal.op] ?? 0) + 1;
        return { ok: true, from: found.from, batch: parsed.data, counts };
    }
    const seen = new Set<string>();
    const problems: PasteProblem[] = [];
    const raw = isObject(value) ? value as RawProposal : undefined;
    const list = Array.isArray(raw?.proposals) ? raw.proposals : undefined;
    for (const issue of parsed.error.issues) {
        const path = issue.path;
        let problem: PasteProblem;
        if (path[0] === 'proposals' && typeof path[1] === 'number') {
            const item = list ? list[path[1]] : undefined;
            const row = isObject(item) ? item : undefined;
            problem = {
                proposal: path[1] + 1,
                op: typeof row?.op === 'string' ? row.op : null,
                ref: typeof row?.ref === 'string' ? row.ref : null,
                path: path.slice(2).map(String).join('.'),
                message: issue.message,
            };
        } else {
            problem = { proposal: null, op: null, ref: null, path: path.map(String).join('.'), message: issue.message };
        }
        const key = JSON.stringify(problem);
        if (!seen.has(key)) {
            seen.add(key);
            problems.push(problem);
        }
    }
    problems.sort((a, b) => (a.proposal ?? 0) - (b.proposal ?? 0) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const sentences = problems.slice(0, MAX_SENTENCES).map(problemSentence);
    if (problems.length > MAX_SENTENCES) sentences.push(`And ${problems.length - MAX_SENTENCES} more.`);
    return { ok: false, code: 'invalid', problems, sentences };
}

export function resetProposals(): void {
    proposals.batches = [];
    proposals.batch = null;
    proposals.pending = 0;
    proposals.conflicts = [];
    proposals.error = '';
}

/** A poll page said how many proposals are still open. */
export function notePendingCount(count: number): void {
    if (!Number.isInteger(count) || count < 0) return;
    proposals.pending = count;
}

function universePath(): string | null {
    const id = campaign.universeId;
    if (!id) return null;
    return `/api/universes/${encodeURIComponent(id)}/campaign/proposals`;
}

function rememberBatch(batch: BatchRow): void {
    proposals.batch = batch;
    const index = proposals.batches.findIndex((item) => item.id === batch.id);
    if (index >= 0) proposals.batches[index] = batch;
    else proposals.batches.unshift(batch);
}

function reindex(): void {
    const days = campaign.clock ? campaign.clock.days : null;
    rebuildCampaignIndex(campaign.records, campaign.links, days);
    rebuildJournalIndex(campaign.journal, campaign.records, days);
}

function heldRev(proposal: ProposalValue): number | undefined {
    if (proposal.op === 'clock.set') return campaign.clock ? campaign.clock.rev : undefined;
    if (proposal.op === 'record.update' || proposal.op === 'track.append' || proposal.op === 'cargo.append' || proposal.op === 'passengers.append' || proposal.op === 'ledger.append') {
        return campaign.records[proposal.id]?.rev;
    }
    return undefined;
}

function proposalOf(batch: BatchRow, proposalId: string): ProposalValue | null {
    const row = batch.proposals?.find((item) => item.id === proposalId);
    return row ? row.proposal : null;
}

function createdRefs(batch: BatchRow): Map<string, string> {
    const refs = new Map<string, string>();
    for (const row of batch.proposals ?? []) {
        if (row.proposal.op === 'record.create' && row.targetId) refs.set(row.proposal.ref, row.targetId);
    }
    return refs;
}

function endId(end: { id: string } | { ref: string }, refs: Map<string, string>): string | null {
    if ('id' in end) return end.id;
    return refs.get(end.ref) ?? null;
}

function stampOf(batch: BatchRow): string {
    return batch.createdAt || new Date().toISOString();
}

function statusBag(record: RecordRow): Record<string, unknown> {
    if (!record.status || typeof record.status !== 'object') return {};
    return { ...(record.status as Record<string, unknown>) };
}

function putStatus(record: RecordRow, status: Record<string, unknown>): void {
    record.status = status as RecordRow['status'];
}

/** Writes an accepted proposal into the open campaign. Creates were not here yet. */
function landApplied(proposal: ProposalValue, id: string, rev: number, stamp: string, refs: Map<string, string>): void {
    if (proposal.op === 'record.create') {
        const draft = proposal.record;
        campaign.records[id] = {
            id,
            type: draft.type,
            kind: draft.kind,
            name: draft.name,
            summary: draft.summary,
            details: draft.details,
            tags: draft.tags,
            anchor: draft.anchor,
            when: draft.when ?? null,
            visibility: 'referee',
            playerNotes: null,
            sheet: null,
            status: draft.status ?? null,
            images: null,
            provenance: null,
            rev,
            createdAt: stamp,
            updatedAt: stamp,
            deleted: false,
        };
        return;
    }
    if (proposal.op === 'link.create') {
        const from = endId(proposal.link.from, refs);
        const to = endId(proposal.link.to, refs);
        if (!from || !to) return;
        campaign.links[id] = {
            id,
            from,
            to,
            kind: proposal.link.kind,
            role: proposal.link.role,
            order: 0,
            since: proposal.link.since ?? null,
            until: proposal.link.until ?? null,
            notes: proposal.link.notes ?? '',
            visibility: 'referee',
            provenance: null,
            rev,
            createdAt: stamp,
            updatedAt: stamp,
            deleted: false,
        };
        return;
    }
    if (proposal.op === 'journal.create') {
        const entry = proposal.entry;
        campaign.journal[id] = {
            id,
            kind: entry.kind,
            title: entry.title,
            body: entry.body,
            when: entry.when,
            realDate: entry.realDate,
            sequence: entry.sequence,
            author: 'referee',
            visibility: 'referee',
            anchor: entry.anchor,
            mentions: [],
            images: null,
            rev,
            createdAt: stamp,
            updatedAt: stamp,
            deleted: false,
        };
        return;
    }
    if (proposal.op === 'clock.set') {
        campaign.clock = { days: proposal.days, rev };
        return;
    }
    if (proposal.op === 'question') return;
    const record = campaign.records[proposal.id];
    if (!record) return;
    if (proposal.op === 'record.update') {
        if (proposal.set) Object.assign(record, proposal.set);
        if (proposal.append?.details) record.details = `${record.details}${proposal.append.details}`;
        if (proposal.append?.tags) record.tags = [...record.tags, ...proposal.append.tags];
    } else {
        const status = statusBag(record);
        if (proposal.op === 'track.append') {
            const track = Array.isArray(status.track) ? status.track : [];
            status.track = [...track, proposal.leg];
        }
        if (proposal.op === 'cargo.append') {
            const cargo = Array.isArray(status.cargo) ? status.cargo : [];
            status.cargo = [...cargo, ...proposal.lots];
        }
        if (proposal.op === 'passengers.append') {
            const passengers = Array.isArray(status.passengers) ? status.passengers : [];
            status.passengers = [...passengers, ...proposal.passengers];
        }
        if (proposal.op === 'ledger.append') {
            const ledger = Array.isArray(status.ledger) ? status.ledger : [];
            status.ledger = [...ledger, ...proposal.lines];
        }
        putStatus(record, status);
    }
    record.rev = rev;
}

function showConflict(item: ProposalConflict): void {
    if (item.table === 'records') {
        const parsed = CampaignRecord.safeParse(item.current);
        if (parsed.success) campaign.records[item.id] = parsed.data;
    } else if (item.table === 'links') {
        const parsed = CampaignLink.safeParse(item.current);
        if (parsed.success) campaign.links[item.id] = parsed.data;
    } else if (item.table === 'journal') {
        const parsed = CampaignEntry.safeParse(item.current);
        if (parsed.success) campaign.journal[item.id] = parsed.data;
    } else if (item.table === 'clock') {
        const parsed = CampaignClock.nullable().safeParse(item.current);
        if (parsed.success) campaign.clock = parsed.data;
    }
}

function applyResolve(result: ResolveResult, decisions: ProposalDecisionInput[]): void {
    const batch = result.batch;
    rememberBatch(batch);
    const stamp = stampOf(batch);
    const refs = createdRefs(batch);
    const byId = new Map((batch.proposals ?? []).map((row) => [row.id, row.proposal]));
    for (const item of result.applied) {
        if (item.seq > campaign.seq) campaign.seq = item.seq;
        const sent = decisions.find((decision) => decision.proposalId === item.proposalId);
        const proposal = sent?.change ?? byId.get(item.proposalId) ?? null;
        if (proposal) landApplied(proposal, item.id, item.rev, stamp, refs);
        else if (campaign.records[item.id] && item.table === 'records') campaign.records[item.id].rev = item.rev;
        else if (campaign.links[item.id] && item.table === 'links') campaign.links[item.id].rev = item.rev;
        else if (campaign.journal[item.id] && item.table === 'journal') campaign.journal[item.id].rev = item.rev;
        else if (item.table === 'clock' && campaign.clock) campaign.clock.rev = item.rev;
    }
    proposals.conflicts = result.conflicts.map((item) => ({
        proposalId: item.proposalId,
        table: item.table,
        id: item.id,
        current: item.current,
    }));
    if (result.conflicts.length) {
        for (const item of proposals.conflicts) showConflict(item);
        showToast(CONFLICT_TOAST);
    }
    reindex();
}

/** Open batches, or the reviewed ones. Counts only, unless the server sent proposals. */
export async function loadBatches(state: 'open' | 'reviewed' = 'open'): Promise<BatchRow[]> {
    const path = universePath();
    if (!path) return [];
    const res = await apiFetch(transport.fetch, `${path}?state=${state}`);
    if (!res.ok) {
        proposals.error = 'offline';
        return [];
    }
    const list = parseRead(ProposalBatchList, (await res.json()).data);
    proposals.batches = list.items;
    if (state === 'open') {
        proposals.pending = list.items.reduce((sum, item) => sum + item.counts.pending, 0);
    }
    proposals.error = '';
    return list.items;
}

/** One batch, including each proposal. */
export async function loadBatch(batchId: string): Promise<BatchRow | null> {
    const path = universePath();
    if (!path) return null;
    const res = await apiFetch(transport.fetch, `${path}/${encodeURIComponent(batchId)}`);
    if (!res.ok) {
        proposals.error = 'offline';
        return null;
    }
    const batch = parseRead(ProposalBatch, (await res.json()).data);
    rememberBatch(batch);
    proposals.error = '';
    return batch;
}

/**
 * Accept or drop. An accept of an update, an append, or the clock sends the rev the store holds.
 * Applied rows update the campaign. A conflict replaces that row and stays on the card.
 */
export async function resolve(batchId: string, decisions: ProposalDecisionInput[]): Promise<ResolveResult | null> {
    const path = universePath();
    if (!path) return null;
    let batch = proposals.batch && proposals.batch.id === batchId ? proposals.batch : null;
    if (!batch) batch = await loadBatch(batchId);
    if (!batch) return null;
    const body = {
        decisions: decisions.map((decision) => {
            const proposal = decision.change ?? proposalOf(batch, decision.proposalId);
            const rev = decision.action === 'accept' && proposal ? heldRev(proposal) : undefined;
            return {
                proposalId: decision.proposalId,
                action: decision.action,
                ...(decision.change ? { change: decision.change } : {}),
                ...(rev !== undefined ? { baseRev: rev } : {}),
            };
        }),
    };
    const res = await apiFetch(transport.fetch, `${path}/${encodeURIComponent(batchId)}/resolve`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        proposals.error = 'offline';
        return null;
    }
    const result = parseRead(ProposalResolveResult, (await res.json()).data);
    applyResolve(result, decisions);
    proposals.error = '';
    return result;
}

/** The server's own sentence for a refusal (a full list, the budget, agent access), when it sent one. */
async function refusalWords(res: Response): Promise<string | undefined> {
    try {
        const body = await res.json() as { error?: { message?: unknown } };
        const message = body && body.error ? body.error.message : undefined;
        return typeof message === 'string' && message.trim() ? message : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The owner's paste door. The batch goes as the reply wrote it, including its idempotency key,
 * so the same reply twice is one batch. Cookie only: no agent token.
 */
export async function submitPasted(text: string): Promise<PastedBatch & { sent?: boolean; message?: string }> {
    const found = pastedBatch(text);
    if (!found.ok) return found;
    const path = universePath();
    if (!path) return { ok: false, code: 'invalid', problems: [], sentences: ['That campaign is not open.'] };
    const res = await apiFetch(transport.fetch, path, {
        method: 'POST',
        body: JSON.stringify(found.batch),
    });
    if (!res.ok) {
        proposals.error = 'offline';
        return { ...found, sent: false, message: await refusalWords(res) };
    }
    // The submit route answers { batch } (contracts/b_session_ingest.md); a bare batch is read too.
    const sent = (await res.json()).data as { batch?: unknown } | undefined;
    const batch = parseRead(ProposalBatch, sent && typeof sent === 'object' && 'batch' in sent ? sent.batch : sent);
    rememberBatch(batch);
    if (batch.state === 'open') proposals.pending += batch.counts.pending;
    proposals.error = '';
    return { ...found, sent: true };
}
