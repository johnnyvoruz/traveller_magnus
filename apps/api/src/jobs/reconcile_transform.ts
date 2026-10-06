/**
 * Pure helpers for the reconcile-environment derived transform.
 * Reads stored trees and calls reconcileTree. No generation.
 */
import { environmentPolicy, reconcileTree } from '@voyage/engines';
import { sha256Hex, stable } from '@voyage/shared';

export const RECONCILE_TRANSFORM = 'reconcile-environment';
export const SCHEMA_VERSION = 1;
export const RECONCILE_SLICE = 25;
export const DEPENDENCY_REBUILDS = ['sector-index', 'territories', 'regions', 'truth-systems'] as const;

const CHANGED_FIELDS = ['surfaceTempBand', 'orbitalTempBand', 'liquidType', 'liquidStatus', 'reconciliation'] as const;
const OUTCOME_KEYS = [
    'hydro-invalid', 'known-valid', 'known-outside', 'ice-zero', 'ice-frozen',
    'ice-thaw', 'unknown-exotic', 'zero', 'missing',
] as const;
const DIAGNOSTIC_KINDS = [
    'surface-unknown', 'orbital-unknown', 'hydro-invalid', 'temperature-inverted', 'liquid-unresolved',
] as const;

export type BodyRef = { hex: string; path: string };

export type ReconcileReport = {
    bodiesSeen: number;
    bodiesChanged: number;
    changedByField: Record<string, number>;
    liquidOutcomes: Record<string, number>;
    diagnosticsByKind: Record<string, number>;
    unresolved: BodyRef[];
    blocking: BodyRef[];
};

type Policy = {
    version: string;
    surfaceBands: unknown;
    orbitBands: unknown;
    liquid: unknown;
    liquids: unknown;
};

type ReconcileResult = {
    tree: unknown;
    changes: { hex?: unknown; path?: unknown; field?: unknown }[];
    diagnostics: { hex?: unknown; path?: unknown; kind?: unknown; blocking?: unknown }[];
};

export type StoredReconcile = {
    hash: string;
    canonical: string;
    changed: boolean;
    report: ReconcileReport;
};

export type HexCounts = { systems: number; built: number; partial: number };

function zeros(keys: readonly string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const key of keys) out[key] = 0;
    return out;
}

export function emptyReport(): ReconcileReport {
    return {
        bodiesSeen: 0,
        bodiesChanged: 0,
        changedByField: zeros(CHANGED_FIELDS),
        liquidOutcomes: zeros(OUTCOME_KEYS),
        diagnosticsByKind: zeros(DIAGNOSTIC_KINDS),
        unresolved: [],
        blocking: [],
    };
}

function sortRefs(refs: BodyRef[]): BodyRef[] {
    return refs.slice().sort((left, right) => left.hex.localeCompare(right.hex) || left.path.localeCompare(right.path));
}

export function mergeReports(into: ReconcileReport, extra: ReconcileReport): ReconcileReport {
    into.bodiesSeen += extra.bodiesSeen;
    into.bodiesChanged += extra.bodiesChanged;
    for (const [key, count] of Object.entries(extra.changedByField)) {
        into.changedByField[key] = (into.changedByField[key] ?? 0) + count;
    }
    for (const [key, count] of Object.entries(extra.liquidOutcomes)) {
        into.liquidOutcomes[key] = (into.liquidOutcomes[key] ?? 0) + count;
    }
    for (const [key, count] of Object.entries(extra.diagnosticsByKind)) {
        into.diagnosticsByKind[key] = (into.diagnosticsByKind[key] ?? 0) + count;
    }
    into.unresolved = sortRefs(into.unresolved.concat(extra.unresolved));
    into.blocking = sortRefs(into.blocking.concat(extra.blocking));
    return into;
}

function systemOf(tree: unknown): { worlds: unknown[] } | null {
    if (!tree || typeof tree !== 'object') return null;
    const record = tree as Record<string, unknown>;
    const body = record.body;
    if (body && typeof body === 'object') {
        const system = (body as Record<string, unknown>).mgtSystem;
        if (system && typeof system === 'object' && Array.isArray((system as { worlds?: unknown }).worlds)) {
            return system as { worlds: unknown[] };
        }
    }
    if (record.mgtSystem && typeof record.mgtSystem === 'object' && Array.isArray((record.mgtSystem as { worlds?: unknown }).worlds)) {
        return record.mgtSystem as { worlds: unknown[] };
    }
    if (Array.isArray(record.worlds)) return record as { worlds: unknown[] };
    return null;
}

function walkBodies(tree: unknown, visit: (body: Record<string, unknown>, path: string) => void): void {
    const system = systemOf(tree);
    if (!system) return;
    const walk = (list: unknown[], path: string) => {
        list.forEach((body, index) => {
            if (!body || typeof body !== 'object') return;
            const here = `${path}[${index}]`;
            visit(body as Record<string, unknown>, here);
            const moons = (body as { moons?: unknown }).moons;
            if (Array.isArray(moons)) walk(moons, `${here}.moons`);
        });
    };
    walk(system.worlds, 'worlds');
}

export function reportForTree(indexHex: string, result: ReconcileResult): ReconcileReport {
    const report = emptyReport();
    const changedBodies = new Set<string>();
    const changedFields = new Set<string>();
    walkBodies(result.tree, (body, path) => {
        report.bodiesSeen += 1;
        const status = body.liquidStatus;
        if (status && typeof status === 'object') {
            const outcome = (status as { outcome?: unknown }).outcome;
            if (typeof outcome === 'string' && outcome.length > 0) {
                report.liquidOutcomes[outcome] = (report.liquidOutcomes[outcome] ?? 0) + 1;
            }
        }
    });
    for (const change of result.changes) {
        if (typeof change.field !== 'string' || typeof change.path !== 'string') continue;
        const bodyKey = `${indexHex}\t${change.path}`;
        changedBodies.add(bodyKey);
        const fieldKey = `${bodyKey}\t${change.field}`;
        if (changedFields.has(fieldKey)) continue;
        changedFields.add(fieldKey);
        report.changedByField[change.field] = (report.changedByField[change.field] ?? 0) + 1;
    }
    report.bodiesChanged = changedBodies.size;
    for (const item of result.diagnostics) {
        if (typeof item.kind !== 'string' || typeof item.path !== 'string') continue;
        report.diagnosticsByKind[item.kind] = (report.diagnosticsByKind[item.kind] ?? 0) + 1;
        const ref = { hex: indexHex, path: item.path };
        if (item.kind === 'liquid-unresolved') report.unresolved.push(ref);
        if (item.kind === 'hydro-invalid' || item.blocking === true) report.blocking.push(ref);
    }
    report.unresolved = sortRefs(report.unresolved);
    report.blocking = sortRefs(report.blocking);
    return report;
}

export function hexCounts(hexes: Record<string, { partial?: unknown } | null>): HexCounts {
    let systems = 0;
    let built = 0;
    let partial = 0;
    for (const entry of Object.values(hexes)) {
        systems += 1;
        if (entry && entry.partial != null) partial += 1;
        else built += 1;
    }
    return { systems, built, partial };
}

export function sliceKeys(keys: string[], offset: number, limit: number): { keys: string[]; nextOffset: number | null } {
    if (!Number.isInteger(offset) || offset < 0) throw new Error('Reconcile offset is not a whole number.');
    const sorted = keys.slice().sort();
    if (offset > sorted.length) throw new Error('Reconcile offset is past the end of the sector.');
    const chosen = sorted.slice(offset, offset + limit);
    const next = offset + chosen.length;
    return { keys: chosen, nextOffset: next < sorted.length ? next : null };
}

/** Cache identity is the source version, the source index hash, and the policy digest. */
export function reconcileCachePrefix(from: string, sourceHash: string, policyDigest: string, slug: string): string {
    return `reconcile-cache/${from}/${sourceHash}/${policyDigest}/${slug}`;
}

export async function reconciliationDigests(): Promise<{ policyDigest: string; rulesDigest: string; policy: Policy }> {
    const policy = environmentPolicy as Policy;
    if (!policy || typeof policy.version !== 'string') throw new Error('environment policy is missing');
    const parsed = JSON.parse(policy.version) as { surface?: unknown; orbit?: unknown; liquids?: unknown };
    if (parsed.surface == null || parsed.orbit == null || parsed.liquids == null) {
        throw new Error('environment policy version is missing the rules tables');
    }
    const rulesDigest = await sha256Hex(stable({
        liquids: parsed.liquids,
        orbit: parsed.orbit,
        surface: parsed.surface,
    }));
    const policyDigest = await sha256Hex(policy.version);
    return { policyDigest, rulesDigest, policy };
}

export async function provenanceDocument(from: string, engineVersion: string): Promise<Record<string, unknown>> {
    const digests = await reconciliationDigests();
    return {
        schemaVersion: SCHEMA_VERSION,
        transform: RECONCILE_TRANSFORM,
        from,
        policyDigest: digests.policyDigest,
        rulesDigest: digests.rulesDigest,
        engineVersion,
        generationProvenance: 'carried',
        dependencyRebuilds: [...DEPENDENCY_REBUILDS],
    };
}

/**
 * Reconcile one stored object. Unchanged canonical bytes keep sourceHash.
 * The returned canonical is stable JSON of the reconciled tree.
 */
export async function reconcileStoredObject(
    sourceHash: string,
    canonical: string,
    indexHex: string,
    policy: Policy,
): Promise<StoredReconcile> {
    const tree = JSON.parse(canonical) as unknown;
    const result = reconcileTree(tree, policy) as ReconcileResult;
    const next = stable(result.tree);
    const changed = next !== canonical;
    if (!changed) {
        const check = await sha256Hex(canonical);
        if (check !== sourceHash) throw new Error(`Stored object ${sourceHash} does not match its bytes.`);
    }
    const hash = changed ? await sha256Hex(next) : sourceHash;
    return { hash, canonical: next, changed, report: reportForTree(indexHex, result) };
}

export function assertChartPreserved(
    source: Record<string, Record<string, unknown>>,
    merged: Record<string, Record<string, unknown>>,
): void {
    const sourceKeys = Object.keys(source).sort();
    const mergedKeys = Object.keys(merged).sort();
    if (sourceKeys.join('\n') !== mergedKeys.join('\n')) {
        throw new Error('Reconciled hex keys do not match the source index.');
    }
    for (const hex of sourceKeys) {
        const left = { ...source[hex] };
        const right = { ...merged[hex] };
        delete left.tree;
        delete right.tree;
        if (stable(left) !== stable(right)) throw new Error(`Chart fields changed for ${hex}.`);
    }
}

export function assertCountsMatchSource(
    source: { systems?: unknown; built?: unknown; partial?: unknown; hexes: Record<string, { partial?: unknown }> },
    counts: HexCounts,
): void {
    if (Object.keys(source.hexes).length !== counts.systems) {
        throw new Error('Reconciled system count does not match the source index.');
    }
    if (typeof source.systems === 'number' && source.systems !== counts.systems) {
        throw new Error('Reconciled system count does not match the source index.');
    }
    if (typeof source.built === 'number' && source.built !== counts.built) {
        throw new Error('Reconciled built count does not match the source index.');
    }
    if (typeof source.partial === 'number' && source.partial !== counts.partial) {
        throw new Error('Reconciled partial count does not match the source index.');
    }
}
