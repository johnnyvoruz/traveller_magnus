/** Sent on campaign reads and campaign saves. The server then returns stored `public`. */
export const JOURNAL_PUBLIC_HEADERS = { 'X-Voyage-Journal': 'public' } as const;

/** The bits of a schema this reader walks. Structural, so this file does not import zod. */
type LooseSchema = {
    type?: string;
    parse: (data: unknown) => unknown;
    safeParse: (data: unknown) => { success: boolean };
    unwrap: () => LooseSchema;
    shape: Record<string, LooseSchema>;
    element: LooseSchema;
    options: LooseSchema[];
    optionsMap: Map<unknown, LooseSchema>;
    discriminator: string;
    def?: LooseDef;
    _def: LooseDef;
};

type LooseDef = {
    type?: string;
    typeName?: string;
    effect?: { type?: string; transform?: (value: unknown, ctx: { addIssue: () => void; path: unknown[] }) => unknown };
    schema?: LooseSchema;
    innerType?: LooseSchema;
    valueType?: LooseSchema;
    unknownKeys?: string;
    catchall?: { type?: string };
    in?: LooseSchema;
    out?: LooseSchema;
    options?: LooseSchema[];
    discriminator?: string;
    transform?: (value: unknown) => unknown;
    element?: LooseSchema;
    values?: unknown[];
    value?: unknown;
};

/**
 * Parses a server answer and drops keys the schema does not declare.
 * The strict schemas stay in place for writes.
 */
export function parseRead<T>(schema: { parse(data: unknown): T }, value: unknown): T {
    return schema.parse(dropUnknown(schema as LooseSchema, value));
}

function kind(schema: LooseSchema): string {
    if (schema.type) return schema.type;
    const name = schema._def?.typeName ?? '';
    if (name === 'ZodObject') return 'object';
    if (name === 'ZodOptional') return 'optional';
    if (name === 'ZodNullable') return 'nullable';
    if (name === 'ZodDefault') return 'default';
    if (name === 'ZodArray') return 'array';
    if (name === 'ZodRecord') return 'record';
    if (name === 'ZodUnion') return 'union';
    if (name === 'ZodDiscriminatedUnion') return 'union';
    if (name === 'ZodEffects') return 'effects';
    if (name === 'ZodPipe') return 'pipe';
    return name;
}

function defOf(schema: LooseSchema): LooseDef {
    return schema.def ?? schema._def ?? {};
}

function dropUnknown(schema: LooseSchema, value: unknown): unknown {
    const name = kind(schema);
    const def = defOf(schema);
    if (name === 'effects') {
        const effect = def.effect;
        if (effect?.type === 'preprocess' && effect.transform) {
            let processed = value;
            try {
                processed = effect.transform(value, { addIssue() {}, path: [] });
            } catch {
                processed = value;
            }
            return dropUnknown(def.schema as LooseSchema, processed);
        }
        return dropUnknown(def.schema as LooseSchema, value);
    }
    if (name === 'pipe') {
        const incoming = def.in;
        const outgoing = def.out;
        if (incoming && kind(incoming) === 'transform') {
            let processed = value;
            try {
                const transform = defOf(incoming).transform;
                if (transform) processed = transform(value);
            } catch {
                processed = value;
            }
            return outgoing ? dropUnknown(outgoing, processed) : value;
        }
        return incoming ? dropUnknown(incoming, value) : value;
    }
    if (name === 'optional' || name === 'nullable') {
        if (value === undefined || value === null) return value;
        const inner = typeof schema.unwrap === 'function' ? schema.unwrap() : def.innerType;
        return inner ? dropUnknown(inner, value) : value;
    }
    if (name === 'default') {
        if (value === undefined) return value;
        const inner = def.innerType;
        return inner ? dropUnknown(inner, value) : value;
    }
    if (name === 'array') {
        if (!Array.isArray(value)) return value;
        const element = schema.element ?? def.element;
        if (!element) return value;
        return value.map((item) => dropUnknown(element, item));
    }
    if (name === 'record') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const source = value as Record<string, unknown>;
        const valueType = def.valueType;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(source)) out[key] = valueType ? dropUnknown(valueType, source[key]) : source[key];
        return out;
    }
    if (name === 'object') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const source = value as Record<string, unknown>;
        const shape = schema.shape;
        const keep = def.unknownKeys === 'passthrough' || def.catchall?.type === 'unknown';
        if (keep) {
            const out: Record<string, unknown> = { ...source };
            for (const key of Object.keys(shape)) {
                if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = dropUnknown(shape[key]!, source[key]);
            }
            return out;
        }
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(shape)) {
            if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = dropUnknown(shape[key]!, source[key]);
        }
        return out;
    }
    if (name === 'union') {
        const disc = schema.discriminator || def.discriminator;
        if (disc) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
            const key = (value as Record<string, unknown>)[disc];
            const mapped = schema.optionsMap?.get(key as never);
            const option = mapped ?? unionOption(schema, disc, key);
            if (!option) return value;
            return dropUnknown(option, value);
        }
        const options = schema.options ?? def.options ?? [];
        for (const option of options) {
            const dropped = dropUnknown(option, value);
            if (option.safeParse(dropped).success) return dropped;
        }
        return value;
    }
    return value;
}

function unionOption(schema: LooseSchema, disc: string, key: unknown): LooseSchema | undefined {
    const options = schema.options ?? defOf(schema).options ?? [];
    for (const option of options) {
        const field = option.shape?.[disc];
        const values = field ? defOf(field).values : undefined;
        if (Array.isArray(values) && values.includes(key)) return option;
        if (field && defOf(field).value === key) return option;
    }
    return undefined;
}

/**
 * How many proposals are still open, when a poll page or an index carries that count.
 * Absent means this page does not say. The campaign page itself has no such field today;
 * an index page does (`counts.pendingProposals`).
 */
export function pendingProposalCount(page: unknown): number | null {
    if (!page || typeof page !== 'object') return null;
    const body = page as { pendingProposals?: unknown; counts?: { pendingProposals?: unknown } };
    if (typeof body.pendingProposals === 'number' && Number.isInteger(body.pendingProposals) && body.pendingProposals >= 0) {
        return body.pendingProposals;
    }
    const nested = body.counts?.pendingProposals;
    if (typeof nested === 'number' && Number.isInteger(nested) && nested >= 0) return nested;
    return null;
}
