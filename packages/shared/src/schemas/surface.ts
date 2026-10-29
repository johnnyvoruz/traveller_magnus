import { z } from 'zod';

/**
 * A referee's painted surface for one body (BW1). The shape is the HexEdits document
 * `apps/web/src/surface/hybrid/serialize.ts` names, plus the digest and surface fields
 * that document gains when the painter saves. The code list is the hybrid map's list.
 * The grid side is the world size that map already accepts (1 through 15).
 */

export const SURFACE_PAYLOAD_MAX = 256 * 1024;

export const SURFACE_TOO_LARGE = 'A painted map is at most 256 KB.';

/** Dossier body key, the same pattern as a campaign system anchor. */
export const SURFACE_BODY_KEY = /^(?:s\d+|w\d+(?:m\d+)?)$/;

const TERRAIN_CODES = [
    'OC', 'SH', 'SI', 'IF', 'IC', 'FR', 'TU', 'TA', 'FO', 'JU', 'SW', 'GR', 'DE', 'BK', 'EV', 'XR', 'RG', 'RK', 'LV',
] as const;

const ACCENT_CODES = ['MT', 'VO', 'CR'] as const;

const FEATURE_CODES = [
    'starport', 'city', 'arcology', 'town', 'outpost', 'rural', 'farm', 'resource',
    'naval', 'scout', 'military', 'estate', 'penal', 'dome',
] as const;

const SURFACE_CODES = [...TERRAIN_CODES, ...ACCENT_CODES, ...FEATURE_CODES] as const;

const TerrainCode = z.enum(TERRAIN_CODES);
const SurfaceCode = z.enum(SURFACE_CODES);

/** World size the hybrid map accepts. A larger side is not a grid that map builds. */
const SURFACE_GRID_MAX = 15;

/** Hexes in row r of a grid of side n. The same count as the hybrid grid. */
function rowLength(n: number, r: number): number {
    if (r === 0 || r === 3 * n) return 1;
    if (r <= n) return 5 * r;
    if (r <= 2 * n) return 5 * n;
    return 5 * (3 * n - r);
}

export const SurfaceEdit = z.object({
    row: z.number().int().nonnegative(),
    col: z.number().int().nonnegative(),
    terrain: TerrainCode.optional(),
    features: z.array(SurfaceCode).max(SURFACE_CODES.length).optional(),
    accents: z.array(SurfaceCode).max(SURFACE_CODES.length).optional(),
    note: z.string().optional(),
}).strict();
export type SurfaceEdit = z.infer<typeof SurfaceEdit>;

export const SurfaceEdits = z.object({
    format: z.literal(1),
    n: z.number().int().min(1).max(SURFACE_GRID_MAX),
    /** worldDigest: eight hex characters, a colon, and the length of the hashed text. */
    digest: z.string().regex(/^[0-9a-f]{8}:\d+$/),
    surface: z.string().regex(/^hybrid-surface-\d+$/),
    edits: z.array(SurfaceEdit).max(4000),
}).strict().superRefine((value, ctx) => {
    const rows = 3 * value.n;
    for (let i = 0; i < value.edits.length; i += 1) {
        const edit = value.edits[i];
        if (!edit) continue;
        const off = edit.row > rows || edit.col >= rowLength(value.n, edit.row);
        if (off) ctx.addIssue({ code: 'custom', path: ['edits', i], message: 'off the grid' });
    }
});
export type SurfaceEdits = z.infer<typeof SurfaceEdits>;

export const SurfacePut = z.object({
    baseRev: z.number().int().nonnegative(),
    edits: SurfaceEdits.nullable(),
}).strict();
export type SurfacePut = z.infer<typeof SurfacePut>;

export const SurfaceRead = z.object({
    rev: z.number().int().nonnegative(),
    edits: SurfaceEdits.nullable(),
}).strict();
export type SurfaceRead = z.infer<typeof SurfaceRead>;
