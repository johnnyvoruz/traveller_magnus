/** Sent on campaign reads and campaign saves. The server then returns stored `public`. */
export const JOURNAL_PUBLIC_HEADERS = { 'X-Voyage-Journal': 'public' } as const;

/** The bits of a schema this reader walks. Structural so a Zod 3 schema type-checks in the web app. */
type LooseSchema = {
    parse: (data: unknown) => unknown;
    safeParse: (data: unknown) => { success: boolean };
    unwrap: () => LooseSchema;
    shape: Record<string, LooseSchema>;
    element: LooseSchema;
    options: LooseSchema[];
    optionsMap: Map<unknown, LooseSchema>;
    discriminator: string;
    _def: {
        typeName?: string;
        effect?: { type?: string; transform?: (value: unknown, ctx: { addIssue: () => void; path: unknown[] }) => unknown };
        schema?: LooseSchema;
        innerType?: LooseSchema;
        valueType?: LooseSchema;
        unknownKeys?: string;
    };
};

/**
 * Parses a server answer and drops keys the schema does not declare.
 * The strict schemas stay in place for writes.
 */
export function parseRead<T>(schema: { parse(data: unknown): T }, value: unknown): T {
    return schema.parse(dropUnknown(schema as LooseSchema, value));
}

function kind(schema: LooseSchema): string {
    return schema._def?.typeName ?? '';
}

function dropUnknown(schema: LooseSchema, value: unknown): unknown {
    const name = kind(schema);
    if (name === 'ZodEffects') {
        const effect = schema._def.effect as { type?: string; transform?: (value: unknown, ctx: { addIssue: () => void; path: unknown[] }) => unknown };
        if (effect?.type === 'preprocess' && effect.transform) {
            let processed = value;
            try {
                processed = effect.transform(value, { addIssue() {}, path: [] });
            } catch {
                processed = value;
            }
            return dropUnknown(schema._def.schema as LooseSchema, processed);
        }
        return dropUnknown(schema._def.schema as LooseSchema, value);
    }
    if (name === 'ZodOptional' || name === 'ZodNullable') {
        if (value === undefined || value === null) return value;
        return dropUnknown(schema.unwrap(), value);
    }
    if (name === 'ZodDefault') {
        if (value === undefined) return value;
        return dropUnknown(schema._def.innerType as LooseSchema, value);
    }
    if (name === 'ZodArray') {
        if (!Array.isArray(value)) return value;
        return value.map((item) => dropUnknown(schema.element, item));
    }
    if (name === 'ZodRecord') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const source = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(source)) out[key] = dropUnknown(schema._def.valueType as LooseSchema, source[key]);
        return out;
    }
    if (name === 'ZodObject') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const source = value as Record<string, unknown>;
        const shape = schema.shape;
        if (schema._def.unknownKeys === 'passthrough') {
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
    if (name === 'ZodDiscriminatedUnion') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
        const key = (value as Record<string, unknown>)[schema.discriminator];
        const option = schema.optionsMap.get(key as never);
        if (!option) return value;
        return dropUnknown(option, value);
    }
    if (name === 'ZodUnion') {
        for (const option of schema.options) {
            const dropped = dropUnknown(option, value);
            if (option.safeParse(dropped).success) return dropped;
        }
        return value;
    }
    return value;
}
