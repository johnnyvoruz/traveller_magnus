const MAX_INPUT_STEPS = 10;

/** The chain ended with no inputs/<version>/sectors.json. `limited` is the 10-step stop. */
export class InputChainError extends Error {
    readonly tried: string[];
    readonly limited: boolean;

    constructor(tried: string[], limited: boolean) {
        super(`No catalogue for ${tried.join(', ')}.`);
        this.name = 'InputChainError';
        this.tried = tried;
        this.limited = limited;
    }
}

/**
 * The inputs directory for a version: the first version in the chain whose
 * inputs/<version>/sectors.json exists. `hintedFrom` is the parent when the
 * version row does not exist yet, and it is used only for that first hop.
 * Later hops read truth_versions.derived_from. Stops on a missing parent, a
 * cycle, or 10 versions.
 */
export async function resolveCatalogue(
    db: D1Database,
    bucket: R2Bucket,
    version: string,
    hintedFrom?: string | null,
): Promise<{ version: string; text: string }> {
    const tried: string[] = [];
    let current = version;
    let hint = hintedFrom && hintedFrom.length > 0 ? hintedFrom : undefined;
    while (tried.length < MAX_INPUT_STEPS) {
        tried.push(current);
        const object = await bucket.get(`inputs/${current}/sectors.json`);
        if (object) return { version: current, text: await object.text() };
        let next: string | undefined;
        if (hint) {
            next = hint;
            hint = undefined;
        } else {
            const row = await db.prepare(
                'SELECT derived_from AS derivedFrom FROM truth_versions WHERE version = ?',
            ).bind(current).first<{ derivedFrom: string | null }>();
            next = row?.derivedFrom && row.derivedFrom.length > 0 ? row.derivedFrom : undefined;
        }
        if (!next || tried.includes(next)) break;
        current = next;
    }
    throw new InputChainError(tried, tried.length >= MAX_INPUT_STEPS);
}
