import { z } from 'zod';
import { Settings } from './generate.ts';

/** Indexed columns on a sector index, plus the summary record (data_model.md §5). */
export const HexSummary = z.object({
    type: z.string(),
    name: z.string().optional(),
    uwp: z.string().optional(),
    allegiance: z.string().optional(),
    zone: z.string().optional(),
    bases: z.string().optional(),
    tradeCodes: z.array(z.string()).optional(),
    pbg: z.string().optional(),
    ix: z.number().optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
export type HexSummary = z.infer<typeof HexSummary>;

export const Derivation = z.object({
    edition: z.string(),
    mode: z.string(),
    seed: z.string(),
    settings: Settings,
    inputs: z.unknown(),
});
export type Derivation = z.infer<typeof Derivation>;

/**
 * Tree object envelope. body is the engine-owned HexState document
 * (data_model.md §1). Validated by hash and size, not by a field schema.
 */
export const TreeEnvelope = z.object({
    kind: z.literal('tree'),
    engineVersion: z.string(),
    derivation: Derivation,
    hexKey: z.string(),
    body: z.record(z.string(), z.unknown()),
});
export type TreeEnvelope = z.infer<typeof TreeEnvelope>;

/** HexState is the envelope body. The engine package owns the field shape. */
export type HexState = TreeEnvelope['body'];
