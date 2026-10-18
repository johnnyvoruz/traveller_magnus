/**
 * What an orbit address shows when it names no body. A named body is left alone.
 * A visit the visitor already cleared stays clear. Otherwise the mainworld.
 */
export function openingKey(bodyParam: string, mainKey: string | null, dismissed: boolean): string | null {
    if (bodyParam || dismissed || !mainKey) return null;
    return mainKey;
}

/** The crumb's orbit address: no body, and not the opening mainworld. */
export function showsSystemOverview(query: Record<string, unknown>): boolean {
    const raw = Array.isArray(query.overview) ? query.overview[0] : query.overview;
    return raw === '1';
}
