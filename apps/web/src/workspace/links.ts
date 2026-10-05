/**
 * Connections between records (findings/campaign_workspace_design.md §3, "Connections";
 * slice_2_campaign.md §0.5 and K5d). A link is stored once and worded twice, from the shared
 * vocabulary (CAMPAIGN_LINK_KINDS: labelFrom on the from side, labelTo on the to side). These
 * are labels, not rules: the vocabulary says which pairs of types a kind joins. Pure: it runs
 * under Node. The store's own index answers which links touch a record.
 */
import {
    CAMPAIGN_LINK_KINDS, linkAllowed, type CampaignLink, type CampaignLinkKindName, type CampaignRecord, type LinkChange,
} from '@voyage/shared';
import { linkIdsFrom, linkIdsTo } from '../campaign/index.ts';

export const ROLE_MAX = 80;

/** One connection as a record page shows it: the other end, and the kind worded from this side. */
export type Connection = {
    link: CampaignLink;
    other: CampaignRecord;
    /** This record is the link's `from` end. */
    outward: boolean;
    label: string;
};

/** A kind of connection that could be made between two records, worded from this record's side. */
export type KindChoice = {
    kind: CampaignLinkKindName;
    /** This record would be the link's `from` end. */
    outward: boolean;
    label: string;
};

export function kindRow(kind: string) {
    return CAMPAIGN_LINK_KINDS.find((row) => row.kind === kind) ?? null;
}

/** The label a link shows on one of its ends. */
export function labelFor(kind: string, outward: boolean): string {
    const row = kindRow(kind);
    if (!row) return kind;
    return outward ? row.labelFrom : row.labelTo;
}

function liveRecord(records: Readonly<Record<string, CampaignRecord>>, id: string): CampaignRecord | null {
    const found = records[id];
    return found && !found.deleted ? found : null;
}

/**
 * The live connections of a record, from the store's index: links that are not deleted and
 * whose other end still exists. In the vocabulary's order of kinds, then by `order`, then by
 * the other record's name.
 */
export function connectionsOf(
    id: string,
    records: Readonly<Record<string, CampaignRecord>>,
    links: Readonly<Record<string, CampaignLink>>,
): Connection[] {
    const out: Connection[] = [];
    if (!liveRecord(records, id)) return out;
    const seen = new Set<string>();
    const take = (linkId: string, outward: boolean): void => {
        if (seen.has(linkId)) return;
        seen.add(linkId);
        const link = links[linkId];
        if (!link || link.deleted) return;
        const other = liveRecord(records, outward ? link.to : link.from);
        if (!other) return;
        out.push({ link, other, outward, label: labelFor(link.kind, outward) });
    };
    for (const linkId of linkIdsFrom(id)) take(linkId, true);
    for (const linkId of linkIdsTo(id)) take(linkId, false);
    const rank = new Map(CAMPAIGN_LINK_KINDS.map((row, at) => [row.kind, at]));
    return out.sort((a, b) => (rank.get(a.link.kind) ?? 99) - (rank.get(b.link.kind) ?? 99)
        || a.label.localeCompare(b.label)
        || a.link.order - b.link.order
        || a.other.name.localeCompare(b.other.name, undefined, { sensitivity: 'base', numeric: true }));
}

/** The connections grouped under their label, in the order connectionsOf gives. */
export function groupConnections(list: readonly Connection[]): { label: string; items: Connection[] }[] {
    const groups: { label: string; items: Connection[] }[] = [];
    for (const item of list) {
        const last = groups[groups.length - 1];
        if (last && last.label === item.label) last.items.push(item);
        else groups.push({ label: item.label, items: [item] });
    }
    return groups;
}

/**
 * The kinds that can join this record to another, each worded from this side. A kind the
 * vocabulary allows both ways (an ally of an ally) is offered once, outward.
 */
export function kindChoices(thisType: string, otherType: string): KindChoice[] {
    const out: KindChoice[] = [];
    for (const row of CAMPAIGN_LINK_KINDS) {
        if (linkAllowed(row.kind, thisType, otherType)) out.push({ kind: row.kind, outward: true, label: row.labelFrom });
        else if (linkAllowed(row.kind, otherType, thisType)) out.push({ kind: row.kind, outward: false, label: row.labelTo });
    }
    return out;
}

/** A role as it may be stored: one line, trimmed, cut to the limit. */
export function cleanRole(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, ROLE_MAX);
}

/** A new link between two records, this one at the end the choice says. */
export function newLink(id: string, thisId: string, otherId: string, choice: KindChoice, role: string, now: string): CampaignLink {
    return {
        id,
        from: choice.outward ? thisId : otherId,
        to: choice.outward ? otherId : thisId,
        kind: choice.kind,
        role: cleanRole(role),
        order: 0,
        since: null,
        until: null,
        notes: '',
        visibility: 'referee',
        provenance: null,
        rev: 0,
        createdAt: now,
        updatedAt: now,
        deleted: false,
    };
}

/** True when the same two records are already joined this way (either direction for a symmetric kind). */
export function alreadyLinked(list: readonly Connection[], otherId: string, kind: string): boolean {
    return list.some((item) => item.other.id === otherId && item.link.kind === kind);
}

export function createdLink(link: CampaignLink): LinkChange {
    return { ...link, baseRev: 0 };
}

export function editedLink(link: CampaignLink, patch: { role: string }, now: string): LinkChange {
    return { ...link, role: cleanRole(patch.role), updatedAt: now, deleted: false, baseRev: link.rev };
}

export function removedLink(link: CampaignLink): LinkChange {
    return { id: link.id, baseRev: link.rev, deleted: true };
}

export function restoredLink(link: CampaignLink, now: string): LinkChange {
    return { ...link, updatedAt: now, deleted: false, baseRev: link.rev };
}

/** The live links that touch a record, deleted or not themselves: what a delete takes with it and an undo brings back. */
export function linksTouching(id: string, links: Readonly<Record<string, CampaignLink>>): CampaignLink[] {
    const out: CampaignLink[] = [];
    const seen = new Set<string>();
    for (const linkId of [...linkIdsFrom(id), ...linkIdsTo(id)]) {
        if (seen.has(linkId)) continue;
        seen.add(linkId);
        const link = links[linkId];
        if (link) out.push(link);
    }
    return out;
}

/** The live records anchored aboard (or inside) this record. */
export function recordsAboard(id: string, records: Readonly<Record<string, CampaignRecord>>): CampaignRecord[] {
    const out: CampaignRecord[] = [];
    for (const record of Object.values(records)) {
        if (record.deleted || !record.anchor || record.anchor.kind !== 'record' || record.anchor.id !== id) continue;
        out.push(record);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

/** Records a picker offers: live, not the one excluded, of the types given (any when none), matching the words typed, by name, at most `cap`. */
export function pickRecords(
    records: Readonly<Record<string, CampaignRecord>>,
    query: string,
    options: { exclude?: string; types?: readonly string[]; cap?: number } = {},
): CampaignRecord[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const out: CampaignRecord[] = [];
    for (const record of Object.values(records)) {
        if (record.deleted || record.id === options.exclude) continue;
        if (options.types && !options.types.includes(record.type)) continue;
        const hay = (record.name + '\n' + record.summary + '\n' + record.tags.join('\n')).toLowerCase();
        if (!words.every((word) => hay.includes(word))) continue;
        out.push(record);
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || (a.id < b.id ? -1 : 1));
    return out.slice(0, options.cap ?? 30);
}
