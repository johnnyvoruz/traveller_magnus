/**
 * The account's daily generation allowance. Pure helpers for the Build screens.
 * The number itself lives on the session: it arrives on GET /api/me, before any map is open.
 */
import { GenerationAllowance, type GenerationAllowance as Allowance } from '@voyage/shared';

/** A generate the server refused whole. The message is the server's sentence. */
export class AllowanceRefused extends Error {
    readonly code = 'generation_allowance' as const;
    readonly remaining: number;
    readonly limit: number;
    readonly resetsAt: string;

    constructor(message: string, details: { remaining: number; limit: number; resetsAt: string }) {
        super(message);
        this.name = 'AllowanceRefused';
        this.remaining = details.remaining;
        this.limit = details.limit;
        this.resetsAt = details.resetsAt;
    }
}

/**
 * True when this account may ask for `count` systems.
 * An admin (null limit or remaining) and an unknown allowance are not blocked here.
 * The server counts the density roll's writes, which can be fewer than the hexes named.
 */
export function allowanceCovers(allowance: Allowance | null, count: number): boolean {
    if (!allowance) return true;
    if (allowance.limit === null || allowance.remaining === null) return true;
    return count <= allowance.remaining;
}

/** The reset instant. The screen formats it in the local zone. Null when there is no allowance. */
export function allowanceResetsLocal(allowance: Allowance | null): Date | null {
    if (!allowance) return null;
    const date = new Date(allowance.resetsAt);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** The 429 details have no `used`. It is limit minus remaining. */
export function allowanceFromRefusal(details: { remaining: number; limit: number; resetsAt: string }): Allowance | null {
    const parsed = GenerationAllowance.safeParse({
        limit: details.limit,
        used: details.limit - details.remaining,
        remaining: details.remaining,
        resetsAt: details.resetsAt,
    });
    return parsed.success ? parsed.data : null;
}
