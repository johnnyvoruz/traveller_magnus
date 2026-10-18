/**
 * Chatter line schema, moved from findings/living_systems/check_sample.mjs
 * (directives/spec_living_systems.md section 1.2). An unknown `when` key is refused.
 */
import { z } from 'zod';

const STARPORTS = ['A', 'B', 'C', 'D', 'E', 'X'] as const;
const ZONES = ['green', 'amber', 'red'] as const;
const BASES = ['N', 'S', 'W', 'M', 'C', 'D'] as const;
const PARTY = ['inSystem', 'docked', 'inJump', 'away'] as const;
const CATEGORIES = ['control', 'customs', 'news', 'market', 'weather', 'advert', 'ship', 'rumour', 'distress'] as const;
const VOICES = ['control', 'customs', 'news', 'trader', 'local', 'advert', 'crew', 'beacon'] as const;
const TRADE_CODES = ['Ag', 'As', 'Ba', 'Cx', 'De', 'Fl', 'Ga', 'Hi', 'Ht', 'Ic', 'In', 'Lo', 'Lt', 'Na', 'Ni', 'Po', 'Ri', 'Va', 'Wa'] as const;

const Range = z.object({
    min: z.number().int().min(0).max(33).optional(),
    max: z.number().int().min(0).max(33).optional(),
    in: z.array(z.number().int().min(0).max(33)).min(1).optional(),
}).strict().refine((r) => r.min !== undefined || r.max !== undefined || r.in !== undefined, 'an empty range');

const DayRange = z.object({
    min: z.number().int().min(1).max(365),
    max: z.number().int().min(1).max(365),
}).strict();

export const ChatterWhen = z.object({
    allegiance: z.array(z.string().min(1).max(16)).min(1).optional(),
    starport: z.array(z.enum(STARPORTS)).min(1).optional(),
    highport: z.boolean().optional(),
    size: Range.optional(),
    atm: Range.optional(),
    hydro: Range.optional(),
    pop: Range.optional(),
    gov: Range.optional(),
    law: Range.optional(),
    tl: Range.optional(),
    tradeCodes: z.array(z.enum(TRADE_CODES)).min(1).optional(),
    notTradeCodes: z.array(z.enum(TRADE_CODES)).min(1).optional(),
    zone: z.array(z.enum(ZONES)).min(1).optional(),
    bases: z.array(z.enum(BASES)).min(1).optional(),
    notBases: z.array(z.enum(BASES)).min(1).optional(),
    gasGiants: Range.optional(),
    belts: Range.optional(),
    moons: Range.optional(),
    otherBodies: Range.optional(),
    xboat: z.boolean().optional(),
    party: z.array(z.enum(PARTY)).min(1).optional(),
    day: DayRange.optional(),
}).strict();
export type ChatterWhenData = z.infer<typeof ChatterWhen>;

export const ChatterLine = z.object({
    id: z.string().regex(/^[a-z]+-\d{3}$/),
    category: z.enum(CATEGORIES),
    voice: z.enum(VOICES),
    text: z.string().min(20).max(220),
    when: ChatterWhen,
    weight: z.number().min(0.1).max(5).optional(),
}).strict();
export type ChatterLineData = z.infer<typeof ChatterLine>;

export const ChatterFile = z.object({
    schemaVersion: z.literal(1),
    written: z.string(),
    notes: z.array(z.string()),
    lines: z.array(ChatterLine),
}).strict();
export type ChatterFileData = z.infer<typeof ChatterFile>;
