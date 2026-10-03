/** Deterministic JSON: sorted keys, non-finite numbers explicit so they never become null. */
export function stable(value: unknown): string {
    return JSON.stringify(value, (_k, v) => {
        if (typeof v === 'number' && !Number.isFinite(v)) return { $num: String(v) };
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.keys(v as object).sort().reduce((o: Record<string, unknown>, key) => { o[key] = (v as any)[key]; return o; }, {});
        }
        return v;
    });
}
export async function sha256Hex(text: string): Promise<string> {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
