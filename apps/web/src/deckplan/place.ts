/**
 * Places geomorph tiles from a shipyard export.
 * The gutter (10 map units, 4 squares) and the three-corner rotation
 * are the ones written in assets/geomorphs/REBUILD.md.
 */

export type MapPoint = readonly [number, number];

export type DeckPart = {
    code: string;
    corner: readonly [number, number];
    rotation: number;
    mirror?: boolean;
    overlay?: boolean;
};

export type GeomorphRow = {
    code: string;
    role: string;
    path: string;
};

export type GeomorphManifest = {
    images: readonly GeomorphRow[];
};

export type PlacedTile = {
    path: string;
    topLeft: MapPoint;
    topRight: MapPoint;
    bottomLeft: MapPoint;
};

export type ShipBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

export type PlacedShip = {
    tiles: PlacedTile[];
    /** Part codes whose base tile is absent or has no size tag. */
    missing: string[];
    bounds: ShipBounds | null;
};

const ROTATIONS = new Set([0, 90, 180, 270]);

function feetToSquares(path: string): { sizeX: number; sizeY: number } | null {
    const tag = path.match(/\[(\d+)x(\d+)\]/);
    if (!tag) return null;
    return { sizeX: Number(tag[1]) / 5, sizeY: Number(tag[2]) / 5 };
}

function cornersFor(corner: readonly [number, number], sizeX: number, sizeY: number, rotation: number): [MapPoint, MapPoint, MapPoint] | null {
    const x1 = corner[0] - 10;
    const y1 = corner[1] - 10;
    const width = (sizeX + 4) * 5;
    const length = (sizeY + 4) * 5;
    if (rotation === 0) return [[x1, y1 + length], [x1 + width, y1 + length], [x1, y1]];
    if (rotation === 90) return [[x1, y1], [x1, y1 + width], [x1 + length, y1]];
    if (rotation === 180) return [[x1 + width, y1], [x1, y1], [x1 + width, y1 + length]];
    if (rotation === 270) return [[x1 + length, y1 + width], [x1 + length, y1], [x1, y1 + width]];
    return null;
}

function include(bounds: ShipBounds, point: MapPoint): void {
    bounds.minX = Math.min(bounds.minX, point[0]);
    bounds.minY = Math.min(bounds.minY, point[1]);
    bounds.maxX = Math.max(bounds.maxX, point[0]);
    bounds.maxY = Math.max(bounds.maxY, point[1]);
}

/**
 * Draw list in part order. An overlay follows its base. A code with no base
 * tile is skipped and named in `missing`.
 */
export function placeShip(manifest: GeomorphManifest, parts: readonly DeckPart[]): PlacedShip {
    const byCode = new Map<string, GeomorphRow[]>();
    for (const row of manifest.images) {
        const list = byCode.get(row.code);
        if (list) list.push(row);
        else byCode.set(row.code, [row]);
    }
    const tiles: PlacedTile[] = [];
    const missing: string[] = [];
    let bounds: ShipBounds | null = null;
    for (const part of parts) {
        const rows = byCode.get(part.code) ?? [];
        const base = rows.find((row) => row.role === (part.mirror ? 'mirrorUrl' : 'url'));
        if (!base) {
            missing.push(part.code);
            continue;
        }
        const size = feetToSquares(base.path);
        const rotation = part.rotation % 360;
        const corners = size && ROTATIONS.has(rotation) ? cornersFor(part.corner, size.sizeX, size.sizeY, rotation) : null;
        if (!corners) {
            missing.push(part.code);
            continue;
        }
        const [topLeft, topRight, bottomLeft] = corners;
        const placed: PlacedTile = { path: base.path, topLeft, topRight, bottomLeft };
        tiles.push(placed);
        if (!bounds) {
            bounds = { minX: topLeft[0], minY: topLeft[1], maxX: topLeft[0], maxY: topLeft[1] };
        }
        include(bounds, topLeft);
        include(bounds, topRight);
        include(bounds, bottomLeft);
        if (part.overlay) {
            const over = rows.find((row) => row.role === (part.mirror ? 'overlayMirrorUrl' : 'overlayUrl'));
            if (over) tiles.push({ path: over.path, topLeft, topRight, bottomLeft });
        }
    }
    return { tiles, missing, bounds };
}
