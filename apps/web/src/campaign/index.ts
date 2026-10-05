import { locate, type CampaignAnchor, type CampaignLink, type CampaignRecord } from '@voyage/shared';

const byType = new Map<string, string[]>();
const byTag = new Map<string, string[]>();
const byHex = new Map<string, string[]>();
const byBody = new Map<string, string[]>();
const fromId = new Map<string, string[]>();
const toId = new Map<string, string[]>();
const words = new Map<string, string[]>();

function fill(map: Map<string, string[]>, key: string, id: string): void {
    const list = map.get(key);
    if (list) list.push(id);
    else map.set(key, [id]);
}

function sorted(map: Map<string, string[]>): void {
    for (const list of map.values()) list.sort();
}

function tokens(record: CampaignRecord): string[] {
    const found = new Set<string>();
    const source = [record.name, record.summary, ...record.tags].join(' ');
    for (const word of source.toLowerCase().split(/[^0-9a-z]+/)) {
        if (word) found.add(word);
    }
    return [...found];
}

/** Rebuilds every bag from the live rows. Tombstones stay in the store and drop out of the bags. */
export function rebuildCampaignIndex(
    records: Readonly<Record<string, CampaignRecord>>,
    links: Readonly<Record<string, CampaignLink>>,
): void {
    byType.clear();
    byTag.clear();
    byHex.clear();
    byBody.clear();
    fromId.clear();
    toId.clear();
    words.clear();
    const live: Record<string, { anchor: CampaignAnchor }> = {};
    for (const record of Object.values(records)) {
        if (record.deleted) continue;
        live[record.id] = record;
    }
    for (const record of Object.values(records)) {
        if (record.deleted) continue;
        fill(byType, record.type, record.id);
        for (const tag of record.tags) fill(byTag, tag.toLowerCase(), record.id);
        for (const word of tokens(record)) fill(words, word, record.id);
        const place = locate(record.id, live);
        if (!place) continue;
        fill(byHex, place.hexKey, record.id);
        if (place.bodyKey) fill(byBody, place.bodyKey, record.id);
    }
    for (const link of Object.values(links)) {
        if (link.deleted) continue;
        fill(fromId, link.from, link.id);
        fill(toId, link.to, link.id);
    }
    for (const map of [byType, byTag, byHex, byBody, fromId, toId, words]) sorted(map);
}

export function recordsOfType(type: string): readonly string[] {
    return byType.get(type) ?? [];
}

export function recordsWithTag(tag: string): readonly string[] {
    return byTag.get(tag.toLowerCase()) ?? [];
}

/** Live records whose anchor chain resolves to this released hex, including someone aboard a vessel there. */
export function recordsAtHex(hexKey: string): readonly string[] {
    return byHex.get(hexKey) ?? [];
}

export function recordsAtBody(bodyKey: string): readonly string[] {
    return byBody.get(bodyKey) ?? [];
}

export function linkIdsFrom(id: string): readonly string[] {
    return fromId.get(id) ?? [];
}

export function linkIdsTo(id: string): readonly string[] {
    return toId.get(id) ?? [];
}

export function recordIdsForWord(word: string): readonly string[] {
    return words.get(word.toLowerCase()) ?? [];
}
