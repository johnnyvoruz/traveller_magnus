import {
    CAMPAIGN_LIMITS,
    locate,
    type CampaignAnchor,
    type CampaignChanges,
    type CampaignLink,
    type CampaignProvenance,
    type CampaignRecord,
    type LinkChange,
    type RecordChange,
    type SystemAnchor,
} from './schemas/campaign.ts';

/**
 * Copy chosen campaign rows into another campaign. Pure: no I/O.
 * K10. The copies are new rows (rev 0). Places keep their system anchors.
 */

export type CopyAnchorChange = {
    /** New id of the copied record. */
    id: string;
    /** Source record whose record-anchor could not be kept. */
    sourceId: string;
    from: { kind: 'record'; id: string };
    /** System anchor from that chain, or null when the chain has none. */
    to: SystemAnchor | null;
};

export type CopiedRecord = {
    id: string;
    sourceId: string;
};

export type CopyRecordsResult = {
    /** Patches for the target campaign. Records are placed before links. */
    changes: CampaignChanges[];
    copied: CopiedRecord[];
    linksCopied: number;
    linksLeftBehind: number;
    anchorsChanged: CopyAnchorChange[];
};

export type CopyRecordsInput = {
    records: readonly CampaignRecord[];
    links: readonly CampaignLink[];
    ids: readonly string[];
    fromUniverseId: string;
    now: string;
    newId: () => string;
};

type LiveRecord = Extract<RecordChange, { type: string }>;
type LiveLink = Extract<LinkChange, { kind: string }>;

function copySystem(anchor: SystemAnchor): SystemAnchor {
    const copy: SystemAnchor = { kind: 'system', hexKey: anchor.hexKey };
    if (anchor.bodyKey !== undefined) copy.bodyKey = anchor.bodyKey;
    if (anchor.point !== undefined) copy.point = { x: anchor.point.x, y: anchor.point.y };
    if (anchor.locationLabel !== undefined) copy.locationLabel = anchor.locationLabel;
    return copy;
}

function copyValue<T>(value: T): T {
    if (value === null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value)) as T;
}

function patchOf(records: LiveRecord[], links: LiveLink[]): CampaignChanges {
    const patch: CampaignChanges = {};
    if (records.length > 0) patch.records = records;
    if (links.length > 0) patch.links = links;
    return patch;
}

function byteSize(patch: CampaignChanges): number {
    return new TextEncoder().encode(JSON.stringify(patch)).length;
}

/** Records fill first. A patch stays within the row cap and the byte cap. */
function pack(records: LiveRecord[], links: LiveLink[]): CampaignChanges[] {
    const changes: CampaignChanges[] = [];
    let recs: LiveRecord[] = [];
    let lnks: LiveLink[] = [];

    function flush(): void {
        if (recs.length === 0 && lnks.length === 0) return;
        changes.push(patchOf(recs, lnks));
        recs = [];
        lnks = [];
    }

    function place(row: LiveRecord | LiveLink, kind: 'record' | 'link'): void {
        const nextRecs = kind === 'record' ? recs.concat([row as LiveRecord]) : recs;
        const nextLnks = kind === 'link' ? lnks.concat([row as LiveLink]) : lnks;
        const occupied = recs.length + lnks.length;
        const tooBig = occupied > 0 && (
            occupied + 1 > CAMPAIGN_LIMITS.patchRows
            || byteSize(patchOf(nextRecs, nextLnks)) > CAMPAIGN_LIMITS.patchBytes
        );
        if (tooBig) flush();
        if (kind === 'record') recs.push(row as LiveRecord);
        else lnks.push(row as LiveLink);
    }

    for (const row of records) place(row, 'record');
    for (const row of links) place(row, 'link');
    flush();
    return changes;
}

export function copyRecords(input: CopyRecordsInput): CopyRecordsResult {
    const byId = new Map<string, CampaignRecord>();
    const locateIndex: Record<string, { anchor: CampaignAnchor }> = {};
    for (const record of input.records) {
        if (byId.has(record.id)) continue;
        byId.set(record.id, record);
        locateIndex[record.id] = { anchor: record.anchor };
    }

    const chosen: CampaignRecord[] = [];
    const seen = new Set<string>();
    for (const id of input.ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const record = byId.get(id);
        if (!record || record.deleted) continue;
        chosen.push(record);
    }

    const newBySource = new Map<string, string>();
    for (const record of chosen) newBySource.set(record.id, input.newId());

    const copied: CopiedRecord[] = [];
    const anchorsChanged: CopyAnchorChange[] = [];
    const recordRows: LiveRecord[] = [];

    for (const record of chosen) {
        const id = newBySource.get(record.id) as string;
        let anchor: CampaignAnchor;
        if (record.anchor == null) {
            anchor = null;
        } else if (record.anchor.kind === 'system') {
            anchor = copySystem(record.anchor);
        } else {
            const kept = newBySource.get(record.anchor.id);
            if (kept) {
                anchor = { kind: 'record', id: kept };
            } else {
                const resolved = locate(record.id, locateIndex);
                const to = resolved ? copySystem(resolved) : null;
                anchor = to;
                anchorsChanged.push({
                    id,
                    sourceId: record.id,
                    from: { kind: 'record', id: record.anchor.id },
                    to,
                });
            }
        }
        const provenance: CampaignProvenance = {
            mode: 'copy',
            universeId: input.fromUniverseId,
            recordId: record.id,
            rev: record.rev,
            at: input.now,
        };
        recordRows.push({
            id,
            type: record.type,
            kind: record.kind,
            name: record.name,
            summary: record.summary,
            details: record.details,
            tags: record.tags.slice(),
            anchor,
            when: copyValue(record.when),
            visibility: record.visibility,
            playerNotes: record.playerNotes,
            sheet: copyValue(record.sheet),
            status: copyValue(record.status),
            images: copyValue(record.images),
            provenance,
            rev: 0,
            createdAt: input.now,
            updatedAt: input.now,
            deleted: false,
            baseRev: 0,
        });
        copied.push({ id, sourceId: record.id });
    }

    const chosenIds = new Set(newBySource.keys());
    const linkRows: LiveLink[] = [];
    let linksLeftBehind = 0;
    for (const link of input.links) {
        if (link.deleted) continue;
        const fromKept = chosenIds.has(link.from);
        const toKept = chosenIds.has(link.to);
        if (!fromKept && !toKept) continue;
        if (!fromKept || !toKept) {
            linksLeftBehind += 1;
            continue;
        }
        linkRows.push({
            id: input.newId(),
            from: newBySource.get(link.from) as string,
            to: newBySource.get(link.to) as string,
            kind: link.kind,
            role: link.role,
            order: link.order,
            since: copyValue(link.since),
            until: copyValue(link.until),
            notes: link.notes,
            visibility: link.visibility,
            provenance: {
                mode: 'copy',
                universeId: input.fromUniverseId,
                recordId: link.id,
                rev: link.rev,
                at: input.now,
            },
            rev: 0,
            createdAt: input.now,
            updatedAt: input.now,
            deleted: false,
            baseRev: 0,
        });
    }

    return {
        changes: pack(recordRows, linkRows),
        copied,
        linksCopied: linkRows.length,
        linksLeftBehind,
        anchorsChanged,
    };
}
