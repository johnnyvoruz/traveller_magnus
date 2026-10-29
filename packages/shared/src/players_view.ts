/**
 * What a player is allowed to read (Epic P, decision 3). Pure: a full campaign
 * read goes in, and the players' read comes out. The Player Pack calls this
 * same function, so the file and the live view stay the same read.
 *
 * Rules, decision 3: a record is in when `visibility === 'players'`; a link
 * when both ends are in; a journal entry when `players` or `public`; mentions
 * of hidden records read "a record"; the party, clock and settings are in;
 * `provenance`, `rev` and tombstones are out.
 * `directives/contracts/b_players.md` was not in the tree when this was written.
 *
 * P1b (players_build_plan.md; Johnny 18:50: a leg to a hidden place shows the hex
 * and no name, and own notes keep `rev`): the party lists keep only visible ids;
 * a hidden track end becomes that place's system hex; a hidden cargo or passenger
 * id is dropped; object hashes come from images only; a caller's own note keeps
 * `rev` and a note with an author gains `authorName`.
 * P1c (Johnny 19:35: a track or an anchor): the party's own anchor uses that same
 * hex. A hidden record with no system is null. "Where are we" still has the hex.
 * T1c: an owner row stays only when its holder is the party or a kept record.
 */
import {
    locate,
    type CampaignAnchor,
    type CampaignClock,
    type CampaignEntry,
    type CampaignImage,
    type CampaignLink,
    type CampaignRecord,
    type CampaignSettings,
} from './schemas/campaign.ts';

/** A journal row as the read holds it. `authorId` is not a schema field; P2b adds it. */
export type CampaignReadEntry = CampaignEntry & { authorId?: string | null };

/** The assembled campaign, not one incremental page. */
export type CampaignRead = {
    records: readonly CampaignRecord[];
    links: readonly CampaignLink[];
    journal: readonly CampaignReadEntry[];
    settings: CampaignSettings | null;
    clock: CampaignClock | null;
};

/** Who is reading, for own-note `rev` and `authorName`. The owner id marks a referee's row. */
export type PlayersViewOptions = {
    userId?: string | null;
    handles?: Readonly<Record<string, string>>;
    ownerId?: string | null;
};

export type PlayersRecord = Omit<CampaignRecord, 'rev' | 'provenance'>;
export type PlayersLink = Omit<CampaignLink, 'rev' | 'provenance'>;
export type PlayersEntry = Omit<CampaignEntry, 'rev' | 'authorId'> & {
    rev?: number;
    authorName?: string;
    authorRole?: 'referee';
};
export type PlayersSettings = Omit<CampaignSettings, 'rev'>;
export type PlayersClock = Omit<CampaignClock, 'rev'>;

/** The read a player receives. `rev` and `provenance` are absent. */
export type PlayersView = {
    records: PlayersRecord[];
    links: PlayersLink[];
    journal: PlayersEntry[];
    settings: PlayersSettings | null;
    clock: PlayersClock | null;
};

const TOKEN = /\[\[(cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|hex:[^/\]|]+\/\d{4})(?:\|([^\]]*))?\]\]/gi;
const HASH = /^[0-9a-f]{64}$/;

function playersName(records: readonly CampaignRecord[], id: string): string | null {
    for (const record of records) {
        if (record.id !== id) continue;
        if (record.deleted || record.visibility !== 'players') return null;
        return record.name;
    }
    return null;
}

/**
 * The pack's redaction, kept here so the file cannot drift from it.
 * A hidden record's token becomes "a record". A players record's token becomes
 * that record's name. A hex token keeps the label the referee wrote, or the
 * hex key when that label is empty.
 */
export function redactPlayersText(text: string, records: readonly CampaignRecord[]): string {
    const labels: string[] = [];
    for (const match of text.matchAll(new RegExp(TOKEN.source, 'gi'))) {
        const target = match[1] ?? '';
        if (!target.startsWith('hex:')) continue;
        labels.push(match[2] ? match[2].trim() : '');
    }
    let out = '';
    let hexAt = 0;
    let at = 0;
    for (const match of text.matchAll(new RegExp(TOKEN.source, 'gi'))) {
        const index = match.index ?? 0;
        out += text.slice(at, index);
        const target = match[1] ?? '';
        if (target.startsWith('hex:')) {
            const written = labels[hexAt] ?? '';
            hexAt += 1;
            out += written || target.slice(4);
        } else {
            const name = playersName(records, target);
            out += name == null ? 'a record' : name;
        }
        at = index + match[0].length;
    }
    out += text.slice(at);
    return out;
}

function hideBareIds(text: string, hiddenIds: readonly string[]): string {
    let raw = text;
    for (const id of hiddenIds) {
        if (id === '') continue;
        const pattern = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        raw = raw.replace(new RegExp(pattern, 'gi'), 'a record');
    }
    return raw;
}

/** A `:::referee` line through its closer, or through the end when it never closes. */
export function stripRefereeBlocks(text: string): string {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const kept: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/\r$/, '').trim() !== ':::referee') {
            kept.push(lines[i]);
            continue;
        }
        let close = -1;
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].replace(/\r$/, '').trim() === ':::') {
                close = j;
                break;
            }
        }
        if (close < 0) return kept.join('\n');
        i = close;
    }
    return kept.join('\n');
}

function redactString(text: string, records: readonly CampaignRecord[], hiddenIds: readonly string[]): string {
    return hideBareIds(redactPlayersText(stripRefereeBlocks(text), records), hiddenIds);
}

function redactValue(value: unknown, records: readonly CampaignRecord[], hiddenIds: readonly string[]): unknown {
    if (typeof value === 'string') return redactString(value, records, hiddenIds);
    if (Array.isArray(value)) return value.map((item) => redactValue(item, records, hiddenIds));
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = redactValue(item, records, hiddenIds);
        }
        return out;
    }
    return value;
}

function playersIds(records: readonly CampaignRecord[]): Set<string> {
    const ids = new Set<string>();
    for (const record of records) {
        if (!record.deleted && record.visibility === 'players') ids.add(record.id);
    }
    return ids;
}

function redactAnchor(
    anchor: CampaignAnchor,
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
): CampaignAnchor {
    if (!anchor) return null;
    if (anchor.kind === 'record') return kept.has(anchor.id) ? anchor : null;
    if (anchor.locationLabel == null) return { ...anchor };
    return { ...anchor, locationLabel: redactString(anchor.locationLabel, records, hiddenIds) };
}

function redactImages(
    images: readonly CampaignImage[] | null | undefined,
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
): CampaignImage[] | null {
    if (images == null) return null;
    return images.map((image) => {
        const next = { ...image };
        if (image.caption != null) next.caption = redactString(image.caption, records, hiddenIds);
        return next;
    });
}

function keptMentions(mentions: readonly string[], kept: ReadonlySet<string>): string[] {
    const out: string[] = [];
    for (const mention of mentions) {
        if (mention.startsWith('hex:') || kept.has(mention)) out.push(mention);
    }
    return out;
}

function recordsById(records: readonly CampaignRecord[]): Record<string, CampaignRecord> {
    const map: Record<string, CampaignRecord> = {};
    for (const record of records) map[record.id] = record;
    return map;
}

/** The hex a hidden place sits on, with no name and no open-space point. */
function hexOnly(anchor: CampaignAnchor): CampaignAnchor {
    if (!anchor || anchor.kind !== 'system') return null;
    if (anchor.bodyKey != null) return { kind: 'system', hexKey: anchor.hexKey, bodyKey: anchor.bodyKey };
    return { kind: 'system', hexKey: anchor.hexKey };
}

function projectTrackEnd(
    anchor: CampaignAnchor,
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
    index: Readonly<Record<string, CampaignRecord>>,
): CampaignAnchor {
    if (!anchor) return null;
    if (anchor.kind === 'system') {
        if (anchor.locationLabel == null) return { ...anchor };
        return { ...anchor, locationLabel: redactString(anchor.locationLabel, records, hiddenIds) };
    }
    if (kept.has(anchor.id)) return { kind: 'record', id: anchor.id };
    return hexOnly(locate(anchor.id, index));
}

function asRow(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function projectLeg(
    leg: unknown,
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
    index: Readonly<Record<string, CampaignRecord>>,
): unknown {
    const row = asRow(leg);
    if (!row) return redactValue(leg, records, hiddenIds);
    const from = projectTrackEnd(row.from as CampaignAnchor, records, hiddenIds, kept, index);
    const to = projectTrackEnd(row.to as CampaignAnchor, records, hiddenIds, kept, index);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(row)) {
        if (key === 'from' || key === 'to') continue;
        out[key] = redactValue(item, records, hiddenIds);
    }
    out.from = from;
    out.to = to;
    return out;
}

function projectIdLot(
    lot: unknown,
    idKey: 'itemId' | 'personId',
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
): unknown {
    const row = asRow(lot);
    if (!row) return redactValue(lot, records, hiddenIds);
    const id = row[idKey];
    const keepId = typeof id === 'string' && kept.has(id);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(row)) {
        if (key === idKey) continue;
        out[key] = redactValue(item, records, hiddenIds);
    }
    if (keepId) out[idKey] = id;
    return out;
}

function projectStatus(
    status: CampaignRecord['status'],
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
    index: Readonly<Record<string, CampaignRecord>>,
): CampaignRecord['status'] {
    if (status == null) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(status)) {
        if (key === 'track' && Array.isArray(value)) {
            out.track = value.map((leg) => projectLeg(leg, records, hiddenIds, kept, index));
            continue;
        }
        if (key === 'cargo' && Array.isArray(value)) {
            out.cargo = value.map((lot) => projectIdLot(lot, 'itemId', records, hiddenIds, kept));
            continue;
        }
        if (key === 'passengers' && Array.isArray(value)) {
            out.passengers = value.map((lot) => projectIdLot(lot, 'personId', records, hiddenIds, kept));
            continue;
        }
        if (key === 'owners' && Array.isArray(value)) {
            const owners = [];
            for (const item of value) {
                const row = asRow(item);
                if (!row) continue;
                if (row.holder === 'party') {
                    owners.push(redactValue(row, records, hiddenIds));
                    continue;
                }
                const holder = asRow(row.holder);
                if (holder && holder.kind === 'record' && typeof holder.id === 'string' && kept.has(holder.id)) {
                    owners.push(redactValue(row, records, hiddenIds));
                }
            }
            out.owners = owners;
            continue;
        }
        if (key === 'fuelMark') continue;
        out[key] = redactValue(value, records, hiddenIds);
    }
    return out as CampaignRecord['status'];
}

function projectRecord(
    record: CampaignRecord,
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
    index: Readonly<Record<string, CampaignRecord>>,
): PlayersRecord {
    const { rev: _rev, provenance: _provenance, ...rest } = record;
    return {
        ...rest,
        kind: redactString(record.kind, records, hiddenIds),
        name: redactString(record.name, records, hiddenIds),
        summary: redactString(record.summary, records, hiddenIds),
        details: redactString(record.details, records, hiddenIds),
        tags: record.tags.map((tag) => redactString(tag, records, hiddenIds)),
        playerNotes: record.playerNotes == null ? null : redactString(record.playerNotes, records, hiddenIds),
        sheet: redactValue(record.sheet, records, hiddenIds),
        status: projectStatus(record.status, records, hiddenIds, kept, index),
        images: redactImages(record.images, records, hiddenIds),
        anchor: redactAnchor(record.anchor, records, hiddenIds, kept),
    };
}

function projectEntry(
    entry: CampaignReadEntry,
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
    options: PlayersViewOptions,
): PlayersEntry {
    const { rev, authorId, authorRole: _dropped, ...rest } = entry;
    void _dropped;
    const body = redactString(entry.body, records, hiddenIds);
    const next: PlayersEntry = {
        ...rest,
        title: redactString(entry.title, records, hiddenIds),
        body,
        anchor: redactAnchor(entry.anchor, records, hiddenIds, kept),
        mentions: keptMentions(entry.mentions, kept),
        images: redactImages(entry.images, records, hiddenIds),
    };
    if (typeof authorId === 'string' && authorId) {
        const handle = options.handles?.[authorId];
        next.authorName = typeof handle === 'string' ? handle : '';
        if (options.ownerId && authorId === options.ownerId) next.authorRole = 'referee';
        if (options.userId != null && authorId === options.userId) next.rev = rev;
    }
    return next;
}

function projectLink(link: CampaignLink, records: readonly CampaignRecord[], hiddenIds: readonly string[]): PlayersLink {
    const { rev: _rev, provenance: _provenance, ...rest } = link;
    return {
        ...rest,
        role: redactString(link.role, records, hiddenIds),
        notes: redactString(link.notes, records, hiddenIds),
    };
}

function projectSettings(
    settings: CampaignSettings,
    records: readonly CampaignRecord[],
    hiddenIds: readonly string[],
    kept: ReadonlySet<string>,
    index: Readonly<Record<string, CampaignRecord>>,
): PlayersSettings {
    const { rev: _rev, ...rest } = settings;
    const kinds: PlayersSettings['kinds'] = {};
    for (const [key, list] of Object.entries(settings.kinds)) {
        kinds[key] = list.map((item) => redactString(item, records, hiddenIds));
    }
    const aboard: Record<string, string> = {};
    for (const [person, ship] of Object.entries(settings.party.aboard)) {
        if (kept.has(person) && kept.has(ship)) aboard[person] = ship;
    }
    return {
        ...rest,
        party: {
            vesselIds: settings.party.vesselIds.filter((id) => kept.has(id)),
            aboard,
            memberIds: settings.party.memberIds.filter((id) => kept.has(id)),
            anchor: projectTrackEnd(settings.party.anchor, records, hiddenIds, kept, index),
        },
        kinds,
    };
}

/** The players' read of a full campaign. Tombstones and `provenance` are absent. `rev` stays only on the caller's own notes. */
export function playersView(full: CampaignRead, options: PlayersViewOptions = {}): PlayersView {
    const kept = playersIds(full.records);
    const hiddenIds: string[] = [];
    for (const record of full.records) {
        if (!kept.has(record.id)) hiddenIds.push(record.id);
    }
    const index = recordsById(full.records);
    const records = full.records
        .filter((record) => kept.has(record.id))
        .map((record) => projectRecord(record, full.records, hiddenIds, kept, index));
    const links = full.links
        .filter((link) => !link.deleted && kept.has(link.from) && kept.has(link.to))
        .map((link) => projectLink(link, full.records, hiddenIds));
    const journal = full.journal
        .filter((entry) => !entry.deleted && (entry.visibility === 'players' || entry.visibility === 'public'))
        .map((entry) => projectEntry(entry, full.records, hiddenIds, kept, options));
    return {
        records,
        links,
        journal,
        settings: full.settings ? projectSettings(full.settings, full.records, hiddenIds, kept, index) : null,
        clock: full.clock ? { days: full.clock.days } : null,
    };
}

function takeHashes(images: readonly CampaignImage[] | null | undefined, found: Set<string>): void {
    if (images == null) return;
    for (const image of images) {
        if (HASH.test(image.hash)) found.add(image.hash);
        if (HASH.test(image.thumbHash)) found.add(image.thumbHash);
    }
}

/** Object hashes a player may read: image hashes on the projected records and entries, and nothing written in text. */
export function playersObjectHashes(view: PlayersView): string[] {
    const found = new Set<string>();
    for (const record of view.records) takeHashes(record.images, found);
    for (const entry of view.journal) takeHashes(entry.images, found);
    return [...found].sort();
}
