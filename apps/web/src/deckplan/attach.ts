/**
 * Stores a shipyard deck plan on a vessel record's sheet.
 * The write goes through campaign/commit.ts. Other sheet keys stay.
 * A sheet that is not a document is left as it is.
 */
import {
    CampaignChanges,
    DeckPlan,
    type CampaignRecord,
    type RecordChange,
} from '@voyage/shared';
import { commit } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';

export type DeckPlanResult = { ok: true } | { ok: false; message: string };

const NOT_SHIPYARD = 'This is not a Geomorph Shipyard file.';
const NOT_JSON = 'This file is not JSON.';
const NOT_VESSEL = 'A deck plan can only be added to a vessel.';
const MISSING = 'That record is not in this campaign.';
const DELETED = 'This vessel has been deleted.';
const NOT_DOCUMENT = "This vessel's sheet is not a document, so the plan was not saved.";
const TOO_LARGE = 'This deck plan is too large to save. It has to fit in one update.';
const NOT_SAVED = 'This deck plan could not be saved.';
const NO_PLAN = 'This vessel has no deck plan.';

function refuse(record: CampaignRecord | undefined): DeckPlanResult | null {
    if (!record) return { ok: false, message: MISSING };
    if (record.type !== 'vessel') return { ok: false, message: NOT_VESSEL };
    if (record.deleted) return { ok: false, message: DELETED };
    return null;
}

/** A copy of a plain sheet, or null when the sheet is empty. `'bad'` is left untouched. */
function documentOf(sheet: unknown): Record<string, unknown> | null | 'bad' {
    if (sheet == null) return null;
    if (typeof sheet !== 'object' || Array.isArray(sheet)) return 'bad';
    return { ...sheet };
}

function save(record: CampaignRecord, sheet: unknown): DeckPlanResult {
    const change: RecordChange = {
        ...record,
        sheet,
        updatedAt: new Date().toISOString(),
        deleted: false,
        baseRev: record.rev,
    };
    const parsed = CampaignChanges.safeParse({ records: [change] });
    if (!parsed.success) {
        const tooLarge = parsed.error.issues.some((issue) => issue.message === 'too_large');
        return { ok: false, message: tooLarge ? TOO_LARGE : NOT_SAVED };
    }
    const kept = parsed.data.records?.[0];
    if (!kept || !('type' in kept) || JSON.stringify(kept.sheet) !== JSON.stringify(sheet)) {
        return { ok: false, message: NOT_SAVED };
    }
    commit(parsed.data);
    return { ok: true };
}

/** Validates a shipyard JSON file and stores it on the vessel as `sheet.deckPlan`. */
export function importDeckPlan(recordId: string, fileText: string): DeckPlanResult {
    const record = campaign.records[recordId];
    const blocked = refuse(record);
    if (blocked) return blocked;
    let json: unknown;
    try {
        json = JSON.parse(fileText);
    } catch {
        return { ok: false, message: NOT_JSON };
    }
    const plan = DeckPlan.safeParse(json);
    if (!plan.success) return { ok: false, message: NOT_SHIPYARD };
    const document = documentOf(record.sheet);
    if (document === 'bad') return { ok: false, message: NOT_DOCUMENT };
    const sheet = { ...(document ?? {}), deckPlan: plan.data };
    return save(record, sheet);
}

/** Removes `sheet.deckPlan`. An empty sheet becomes null. Other keys stay. */
export function removeDeckPlan(recordId: string): DeckPlanResult {
    const record = campaign.records[recordId];
    const blocked = refuse(record);
    if (blocked) return blocked;
    const document = documentOf(record.sheet);
    if (document === 'bad' || !document || !Object.prototype.hasOwnProperty.call(document, 'deckPlan')) {
        return { ok: false, message: NO_PLAN };
    }
    delete document.deckPlan;
    const sheet = Object.keys(document).length === 0 ? null : document;
    return save(record, sheet);
}
