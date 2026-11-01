/**
 * Seeded campaigns for the AQ4 round trips.
 * The shape is the shared campaign schema. Nothing here is a Traveller rule.
 */
import {
    CAMPAIGN_ENTRY_KINDS,
    CAMPAIGN_LINK_KINDS,
    CAMPAIGN_RECORD_TYPES,
    CampaignClock,
    CampaignEntry,
    CampaignLink,
    CampaignRecord,
    CampaignSettings,
} from '@voyage/shared';
import { hashString, mulberry32 } from '../../packages/engines/src/core/rng.js';

const STAMP = '2026-10-31T08:00:00.000Z';
const SECTOR = 'Spinward_Marches';

function int(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
}

function hexDigits(rng, count) {
    let out = '';
    for (let i = 0; i < count; i += 1) out += Math.floor(rng() * 16).toString(16);
    return out;
}

function rowId(prefix, rng) {
    return `${prefix}_${hexDigits(rng, 8)}-${hexDigits(rng, 4)}-4${hexDigits(rng, 3)}-a${hexDigits(rng, 3)}-${hexDigits(rng, 12)}`;
}

function imageHash(rng) {
    return hexDigits(rng, 64);
}

function hexKey(rng) {
    return `${SECTOR}/${String(int(rng, 0, 9999)).padStart(4, '0')}`;
}

function day(rng) {
    return { year: 1105, day: int(rng, 1, 364) };
}

function image(rng, caption) {
    const row = {
        hash: imageHash(rng),
        thumbHash: imageHash(rng),
        width: int(rng, 1, 2048),
        height: int(rng, 1, 2048),
        bytes: int(rng, 0, 8000),
    };
    if (caption) row.caption = caption;
    return row;
}

function checked(schema, row, label) {
    const parsed = schema.safeParse(row);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    throw new Error(`${label} ${issue.path.map(String).join('.')}: ${issue.message}`);
}

/** Drops a deleted row, as apps/api/src/routes/campaign_export.ts live() does. */
export function liveRows(rows) {
    return rows.filter((row) => row.deleted !== true);
}

/**
 * The export file. The route that writes it is apps/api/src/routes/campaign_export.ts.
 * There is no export function under apps/web/src/campaign/.
 */
export function exportDocument(campaign) {
    return {
        universe: {
            id: campaign.universe.id,
            name: campaign.universe.name,
            truthVersion: campaign.universe.truthVersion,
        },
        exportedAt: campaign.exportedAt,
        records: liveRows(campaign.records),
        links: liveRows(campaign.links),
        journal: liveRows(campaign.journal),
        settings: campaign.settings,
        clock: campaign.clock,
    };
}

function systemAnchor(rng, withBody) {
    const anchor = { kind: 'system', hexKey: hexKey(rng) };
    if (withBody) {
        anchor.bodyKey = rng() < 0.5 ? 'w0' : 'w0m1';
        anchor.locationLabel = 'downport';
    } else {
        anchor.point = { x: int(rng, -20, 20) + 0.25, y: int(rng, -20, 20) - 0.5 };
    }
    return anchor;
}

function buildRecords(rng, index) {
    const byType = {};
    const records = [];
    for (let typeIndex = 0; typeIndex < CAMPAIGN_RECORD_TYPES.length; typeIndex += 1) {
        const type = CAMPAIGN_RECORD_TYPES[typeIndex];
        const id = rowId('cr', rng);
        const visibility = (typeIndex + index) % 2 === 0 ? 'players' : 'referee';
        const record = {
            id,
            type,
            kind: type === 'vessel' ? 'trader' : type,
            name: `${type} ${index}`,
            summary: `${type} summary ${index}`,
            details: type === 'note'
                ? `Shown.\n:::referee\nThe crate mark stays in this block.\n:::\nShown again.`
                : `${type} details ${index}`,
            tags: ['round', `n${index}`],
            anchor: null,
            when: null,
            visibility,
            playerNotes: visibility === 'players' ? `For the table ${index}` : null,
            sheet: null,
            status: null,
            images: null,
            provenance: null,
            rev: int(rng, 0, 8),
            createdAt: STAMP,
            updatedAt: STAMP,
            deleted: false,
        };
        byType[type] = record;
        records.push(record);
    }

    const person = byType.person;
    const place = byType.place;
    const event = byType.event;
    const item = byType.item;
    const vessel = byType.vessel;
    person.anchor = systemAnchor(rng, true);
    place.anchor = { kind: 'record', id: byType.organization.id };
    event.anchor = systemAnchor(rng, false);
    event.when = { start: day(rng), end: { year: 1105, day: 365 } };
    person.sheet = {
        schema: 'mgt2e_character@1',
        characterId: `ch-${index}`,
        fields: { display: person.name },
    };
    person.images = [image(rng, 'portrait')];
    item.provenance = index % 2 === 0
        ? { mode: 'copy', universeId: 'uni-src', recordId: rowId('cr', rng), rev: 1, at: STAMP }
        : { mode: 'package', packageId: `pack-${index}`, version: 1, installId: `inst-${index}`, at: STAMP };
    vessel.sheet = { display: `Hull ${index}` };
    const departs = int(rng, 1, 500);
    const origin = systemAnchor(rng, true);
    const destination = systemAnchor(rng, false);
    vessel.status = {
        track: [
            {
                from: origin,
                to: destination,
                departs,
                arrives: departs + 2,
                mode: 'docked',
                note: 'berthed',
            },
            {
                from: destination,
                to: origin,
                departs: departs + 2,
                arrives: departs + 9,
                mode: 'flight',
                accelG: int(rng, 1, 6),
                hoursTyped: true,
            },
        ],
        cargo: [{
            itemId: item.id,
            label: `Crate ${index}`,
            tons: int(rng, 0, 40),
            value: int(rng, 0, 1000),
            origin: 'Regina',
            destination: 'Jewell',
            note: 'sealed',
        }],
        passengers: [{
            personId: person.id,
            label: person.name,
            class: 'middle',
            note: 'one cabin',
            fareCr: int(rng, 0, 20000),
        }],
        ledger: [{
            when: day(rng),
            amount: int(rng, -5000, 5000),
            memo: `Passage ${index}`,
            kind: index % 2 === 0 ? 'income' : 'expense',
        }],
        owners: [
            { holder: { kind: 'record', id: person.id }, shares: int(rng, 1, 12) },
            { holder: 'party', shares: 1 },
        ],
        payment: {
            amountCr: int(rng, 1, 9000),
            everyDays: 30,
            nextDueDay: day(rng),
            payee: `Payee ${index}`,
        },
        fuelTons: int(rng, 0, 80) + 0.5,
        fuelMark: index % 2 === 0 ? 'naval' : 'scout',
    };

    const dropped = {
        id: rowId('cr', rng),
        type: 'note',
        kind: 'note',
        name: `dropped ${index}`,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility: 'referee',
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: true,
    };
    records.push(dropped);
    return { records: records.map((row) => checked(CampaignRecord, row, `record ${row.type}`)), byType };
}

function buildLinks(rng, index, byType) {
    const links = [];
    for (const kind of CAMPAIGN_LINK_KINDS) {
        const fromType = kind.fromTypes[0];
        const toType = kind.toTypes.find((type) => type !== fromType) ?? kind.toTypes[0];
        const from = byType[fromType];
        const to = byType[toType];
        const since = day(rng);
        links.push(checked(CampaignLink, {
            id: rowId('cl', rng),
            from: from.id,
            to: to.id,
            kind: kind.kind,
            role: '',
            order: links.length,
            since,
            until: { year: since.year, day: Math.min(365, since.day + 1) },
            notes: `${kind.kind} ${index}`,
            visibility: links.length % 2 === 0 ? 'players' : 'referee',
            provenance: null,
            rev: int(rng, 0, 4),
            createdAt: STAMP,
            updatedAt: STAMP,
            deleted: false,
        }, `link ${kind.kind}`));
    }
    links.push(checked(CampaignLink, {
        id: rowId('cl', rng),
        from: byType.person.id,
        to: byType.organization.id,
        kind: 'ally',
        role: '',
        order: 99,
        since: null,
        until: null,
        notes: 'dropped',
        visibility: 'referee',
        provenance: null,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: true,
    }, 'deleted link'));
    return links;
}

function buildJournal(rng, index, byType) {
    const sessionId = rowId('cj', rng);
    const person = byType.person;
    const mention = `[[${person.id}|${person.name}]]`;
    const hexMention = `[[hex:${SECTOR}/1910|Regina]]`;
    const bodies = {
        session: `Session ${index} opens.`,
        note: `Seen at the port.\n:::referee\nThe crate mark stays in this block.\n:::\nStill at the port. ${mention} ${hexMention}`,
        handout: `A page for the table ${index}.`,
        rumor: `Someone saw a light ${index}.`,
    };
    const entries = CAMPAIGN_ENTRY_KINDS.map((kind, kindIndex) => {
        const id = kind === 'session' ? sessionId : rowId('cj', rng);
        return checked(CampaignEntry, {
            id,
            kind,
            title: `${kind} ${index}`,
            body: bodies[kind],
            when: kind === 'rumor' ? null : day(rng),
            realDate: kind === 'session' ? '2026-10-31' : null,
            sequence: kind === 'session' ? index + 1 : null,
            author: kindIndex % 2 === 0 ? 'referee' : 'players',
            visibility: ['referee', 'players', 'public'][kindIndex % 3],
            anchor: kind === 'handout' ? { kind: 'record', id: person.id } : systemAnchor(rng, true),
            mentions: kind === 'note' ? [person.id, `hex:${SECTOR}/1910`] : [],
            images: kind === 'handout' || kind === 'session' ? [image(rng, kind)] : null,
            parent: kind === 'note' ? sessionId : null,
            replies: kind === 'session' ? 1 : 0,
            authorRole: kindIndex % 2 === 0 ? 'referee' : undefined,
            rev: int(rng, 0, 3),
            createdAt: STAMP,
            updatedAt: STAMP,
            deleted: false,
        }, `entry ${kind}`);
    });
    entries.push(checked(CampaignEntry, {
        id: rowId('cj', rng),
        kind: 'rumor',
        title: `dropped ${index}`,
        body: '',
        when: null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: 'referee',
        anchor: null,
        mentions: [],
        images: null,
        parent: null,
        replies: 0,
        rev: 1,
        createdAt: STAMP,
        updatedAt: STAMP,
        deleted: true,
    }, 'deleted entry'));
    return entries;
}

function buildSettings(rng, index, byType) {
    return checked(CampaignSettings, {
        party: {
            vesselIds: [byType.vessel.id],
            aboard: { [byType.person.id]: byType.vessel.id },
            memberIds: [byType.person.id],
            anchor: systemAnchor(rng, true),
        },
        kinds: { person: ['broker'], vessel: ['trader'] },
        calendar: { dateFormat: index % 2 === 0 ? 'imperial' : 'long' },
        living: { chatter: index % 2 === 0, traffic: index % 3 === 0 },
        tableSets: { trade: `tables-${index}`, passengers: `passage-${index}` },
        rev: int(rng, 0, 6),
    }, 'settings');
}

export function buildCampaign(rng, index) {
    const { records, byType } = buildRecords(rng, index);
    const seconds = String(index).padStart(2, '0');
    const campaign = {
        universe: {
            id: `uni-src-${index}`,
            name: `Game ${index}`,
            truthVersion: index % 2 === 0 ? 'v10' : null,
        },
        exportedAt: `2026-10-31T12:00:${seconds}.000Z`,
        records,
        links: buildLinks(rng, index, byType),
        journal: buildJournal(rng, index, byType),
        settings: buildSettings(rng, index, byType),
        clock: index % 5 === 0 ? null : checked(CampaignClock, { days: 403325 + index, rev: int(rng, 0, 4) }, 'clock'),
    };
    return { campaign, exported: exportDocument(campaign) };
}

/** `count` campaigns from one fixed seed. The generator is mulberry32. */
export function buildCampaigns(seed, count) {
    const rng = mulberry32(hashString(seed));
    const built = [];
    for (let index = 0; index < count; index += 1) built.push(buildCampaign(rng, index));
    return built;
}
