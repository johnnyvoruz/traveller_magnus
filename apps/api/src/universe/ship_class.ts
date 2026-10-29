/** The public card uses the same cap as a ship's name. */
const SHIP_CLASS_MAX = 200;

/**
 * The vessel's class is the ship sheet's Class box (`mgt2e_ship_sheet@1`).
 * A blank box, a missing sheet, or any other schema is no class.
 */
export function vesselShipClass(record: { sheet?: unknown } | null | undefined): string | null {
    const sheet = record?.sheet;
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return null;
    const held = sheet as { schema?: unknown; fields?: unknown };
    if (held.schema !== 'mgt2e_ship_sheet@1') return null;
    const fields = held.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
    const value = (fields as Record<string, unknown>).Class;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text) return null;
    return text.length > SHIP_CLASS_MAX ? text.slice(0, SHIP_CLASS_MAX) : text;
}
