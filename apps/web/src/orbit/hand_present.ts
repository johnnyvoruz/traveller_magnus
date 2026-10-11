/**
 * A hand document, as the dossier walk already reads it.
 * Same fields as packages/generation handWalk. No orbital element is filled in.
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

/** The system object pickSystem and the orbit model read. Au and period stay absent. */
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
            row.separation = 'Companion';
            row.parentStarIdx = parentIndex;
        }
        return row;
    });
    const worlds = byOrder(system.bodies.filter((body) => body.kind !== 'moon'));
    const worldRows = worlds.map((body) => {
        const row: Record<string, unknown> = {
            name: body.name,
            type: walkType(body),
            notes: body.notes,
            allegiance: body.allegiance,
            travelZone: body.zone,
            bases: body.bases,
            tradeCodes: body.trade.split(/\s+/).filter(Boolean),
            moons: byOrder(system.bodies.filter((moon) => moon.kind === 'moon' && moon.parentId === body.id)).map((moon) => {
                const nested: Record<string, unknown> = {
                    name: moon.name,
                    type: walkType(moon),
                    isMoon: true,
                    notes: moon.notes,
                };
                const uwp = profileComplete(moon.profile);
                if (uwp) nested.uwp = uwp;
                return nested;
            }),
        };
        const uwp = profileComplete(body.profile);
        if (uwp) row.uwp = uwp;
        if (body.alsoParentId) {
            const primary = stars.findIndex((star) => star.id === body.parentId);
            const other = stars.findIndex((star) => star.id === body.alsoParentId);
            row.orbitType = 'P-Type';
            if (primary >= 0) row.parentStarIdx = primary;
            if (other >= 0) row.pairStarIdx = other;
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
