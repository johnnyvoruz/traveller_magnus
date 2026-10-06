import { orbitPath } from '../orbit/bodies.ts';
import { withQuery, type Query } from '../shell/pane.ts';

/** The orbit view for this system, keeping the pane, the camera and the clock. */
export function orbitOpenLocation(
    slug: string, hex: string, key: string | null, query: Query,
): { path: string; query: Record<string, string> } {
    return { path: orbitPath(slug, hex, key), query: withQuery(query, {}) };
}
