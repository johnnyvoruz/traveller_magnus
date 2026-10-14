/**
 * Where Clear leaves the map (prompts/d_first_run_fixes.md item 3; findings/first_run_review.md
 * finding 5). A many-hex selection lives on a sector's or a subsector's address with its pane
 * open; emptied there, that address means the whole sector. So Clear goes back to the address
 * the selection was started from, with the camera where it is now. Pure: runs under Node.
 */
import { addressPane, atPane, withQuery, type Query } from '../../shell/pane.ts';

export type Place = { path: string; query: Query };

/**
 * `before` is the address the selection was started from; null when it isn't known (the page
 * was loaded with the selection's address), and then the map is left with no pane. A sector's
 * or a subsector's address is never left with its pane open: that pane is the whole sector.
 */
export function afterClear(before: Place | null, now: Place): { path: string; query: Record<string, string> } {
    const camera = { x: now.query.x ?? null, y: now.query.y ?? null, z: now.query.z ?? null };
    if (!before) return { path: '/', query: withQuery(now.query, { panel: null, record: null }) };
    const query = withQuery(before.query, camera);
    const view = addressPane(before.path, before.query).view;
    if (view.kind === 'sector' || view.kind === 'subsector') return atPane(before.path, query, { kind: 'shut' });
    return { path: before.path, query };
}
