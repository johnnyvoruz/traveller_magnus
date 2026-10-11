/**
 * A hand document, as the dossier walk already reads it.
 * Same fields as packages/generation handWalk, including a stored orbit.
 * A belt's year is not copied. A missing number is not invented.
 * A belt around a world or a gas giant is nested in that body's moons.
 */
import type { HandBody, HandProfile, HandSystem } from '@voyage/shared';

const PROFILE = ['st', 's', 'a', 'h', 'p', 'g', 'l', 'tl'] as const;

function byOrder<T extends { order: number; id: string }>(items: readonly T[]): T[] {
    return [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function profileComplete(profile: HandProfile): string {
    const cells = PROFILE.map((cell) => profile[cell]);
    if (cells.every((cell) => cell.length === 1)) {
        return `${profile.st}${profile.s}${profile.a}${profile.h}${profile.p}${profile.g}${profile.l}-${profile.tl}`;
    }
    return '';
}

function walkType(body: HandBody): string {
    if (body.mainworld) return 'Mainworld';
    if (body.kind === 'gas') return 'Gas Giant';
    if (body.kind === 'belt') return 'Planetoid Belt';
    if (body.kind === 'moon') return 'Satellite';
    return 'World';
}

function copyFinite(row: Record<string, unknown>, key: string, value: number | undefined): void {
    if (typeof value === 'number' && Number.isFinite(value)) row[key] = value;
}

/** A belt whose parent is a world or a gas giant. It is nested, not a world row. */
function beltAroundBody(system: HandSystem, body: HandBody): boolean {
    if (body.kind !== 'belt') return false;
    const host = system.bodies.find((item) => item.id === body.parentId);
    return !!host && (host.kind === 'world' || host.kind === 'gas');
}

/** The system object pickSystem and the orbit model read. */
export function presentHand(system: HandSystem): { name: string; stars: Record<string, unknown>[]; worlds: Record<string, unknown>[] } {
    const stars = byOrder(system.stars);
    const starRows = stars.map((star) => {
        const parentIndex = star.parentId == null ? -1 : stars.findIndex((item) => item.id === star.parentId);
        const row: Record<string, unknown> = {
            name: star.name,
            sType: star.sType,
            subType: star.subType,
            sClass: star.sClass,
            role: parentIndex >= 0 ? 'Companion' : 'Primary',
        };
        if (parentIndex >= 0) {
            row.role = 'Companion';
            row.separation = 'Companion';
            row.parentStarIdx = parentIndex;
        }
        copyFinite(row, 'orbitId', star.orbitId);
        copyFinite(row, 'orbitAU', star.orbitAU);
        copyFinite(row, 'eccentricity', star.eccentricity);
        copyFinite(row, 'periodYears', star.periodYears);
        return row;
    });
    const worlds = byOrder(system.bodies.filter((body) => body.kind !== 'moon' && !beltAroundBody(system, body)));
    const worldRows = worlds.map((body) => {
        const row: Record<string, unknown> = {
            name: body.name,
            type: walkType(body),
            notes: body.notes,
            allegiance: body.allegiance,
            travelZone: body.zone,
            bases: body.bases,
            tradeCodes: body.trade.split(/\s+/).filter(Boolean),
            moons: byOrder(system.bodies.filter((child) => child.parentId === body.id && (child.kind === 'moon' || beltAroundBody(system, child)))).map((child) => {
                if (child.kind === 'belt') {
                    const nested: Record<string, unknown> = {
                        name: child.name,
                        type: 'Planetoid Belt',
                        notes: child.notes,
                    };
                    const beltUwp = profileComplete(child.profile);
                    if (beltUwp) nested.uwp = beltUwp;
                    copyFinite(nested, 'pd', child.pd);
                    copyFinite(nested, 'eccentricity', child.eccentricity);
                    return nested;
                }
                const nested: Record<string, unknown> = {
                    name: child.name,
                    type: walkType(child),
                    isMoon: true,
                    notes: child.notes,
                };
                const uwp = profileComplete(child.profile);
                if (uwp) nested.uwp = uwp;
                copyFinite(nested, 'pd', child.pd);
                copyFinite(nested, 'eccentricity', child.eccentricity);
                return nested;
            }),
        };
        const uwp = profileComplete(body.profile);
        if (uwp) row.uwp = uwp;
        copyFinite(row, 'orbitId', body.orbitId);
        copyFinite(row, 'au', body.au);
        copyFinite(row, 'eccentricity', body.eccentricity);
        if (body.kind !== 'belt') copyFinite(row, 'periodYears', body.periodYears);
        if (body.alsoParentId) {
            const primary = stars.findIndex((star) => star.id === body.parentId);
            const other = stars.findIndex((star) => star.id === body.alsoParentId);
            row.orbitType = 'P-Type';
            if (primary >= 0) row.parentStarIdx = primary;
            if (other >= 0) row.pairStarIdx = other;
        } else if (typeof body.au === 'number' || typeof body.orbitId === 'number') {
            row.orbitType = 'S-Type';
            const parent = stars.findIndex((star) => star.id === body.parentId);
            if (parent >= 0) row.parentStarIdx = parent;
        }
        return row;
    });
    return { name: system.name, stars: starRows, worlds: worldRows };
}

export function presentTree(doc: unknown): unknown {
    if (!doc || typeof doc !== 'object') return doc;
    const envelope = doc as { kind?: string; system?: HandSystem; hexKey?: string };
    if (envelope.kind !== 'hand' || !envelope.system) return doc;
    return {
        kind: 'tree',
        hexKey: envelope.hexKey,
        body: { handSystem: presentHand(envelope.system) },
    };
}
