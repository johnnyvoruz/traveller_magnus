/**
 * The card a public ship mark shows on hover (prompts/d_public_ships_map.md): the ship's name and
 * who is aboard, nothing else, and never an id. It is not a control. A click or a tap opens the
 * read-only card (PublicShipSheet.vue), which is placed by the same rule.
 */

/** The card's width at most, and its gap from the mark and from the map's edges, in pixels. */
export const SHIP_CARD_W = 240;
export const SHIP_CARD_GAP = 8;
/** A line of the card and the card's padding, in pixels, for placing it before it is drawn. */
export const SHIP_CARD_LINE = 19;
export const SHIP_CARD_PAD = 18;
/** About this many characters of names fit on one line of the card. */
const LINE_CHARS = 30;
/** Below this map width the read-only card is a sheet along the bottom, this share of the map tall at most. */
export const SHIP_SHEET_BELOW = 600;
export const SHIP_SHEET_SHARE = 0.52;
/** Ships named on one card. The "+N" card names the first few and counts the rest. */
export const SHIP_CARD_SHIPS = 5;

export type ShipCardShip = { ship: string; aboard: readonly string[] };
export type ShipCardBox = { x0: number; y0: number; x1: number; y1: number };

export type ShipCardLine = { ship: string; aboard: string | null };

/** What the card says: one entry per ship, and a last line when more ships are on the hex. */
export function shipCardLines(ships: readonly ShipCardShip[], more: number): { ships: ShipCardLine[]; rest: string | null } {
    const named = ships.slice(0, SHIP_CARD_SHIPS).map((item) => ({
        ship: item.ship,
        aboard: item.aboard.length > 0 ? item.aboard.join(', ') : null,
    }));
    const left = ships.length - named.length + Math.max(0, more);
    return { ships: named, rest: left > 0 ? 'And ' + String(left) + (left === 1 ? ' more ship.' : ' more ships.') : null };
}

/** About how tall the card will be: enough to keep it inside the map before it is measured. */
export function shipCardHeight(lines: { ships: readonly ShipCardLine[]; rest: string | null }): number {
    let rows = lines.rest ? 1 : 0;
    for (const line of lines.ships) rows += 1 + (line.aboard ? Math.ceil(('Aboard: ' + line.aboard).length / LINE_CHARS) : 0);
    return SHIP_CARD_PAD + rows * SHIP_CARD_LINE + Math.max(0, lines.ships.length - 1) * 8;
}

/**
 * Where the card sits, in the map's pixels: right of the marks, or left of them when the right has
 * no room. When neither side has (a phone), above them, so the world under the marks stays in
 * view, or under them when the top has no room. Always inside the map with a gap.
 */
export function shipCardPlace(box: ShipCardBox, width: number, height: number, cardH: number, cardW = SHIP_CARD_W): { left: number; top: number; width: number } {
    const w = Math.max(0, Math.min(cardW, width - SHIP_CARD_GAP * 2));
    let left: number;
    let top: number;
    if (box.x1 + SHIP_CARD_GAP + w <= width - SHIP_CARD_GAP) {
        left = box.x1 + SHIP_CARD_GAP;
        top = box.y0;
    } else if (box.x0 - SHIP_CARD_GAP - w >= SHIP_CARD_GAP) {
        left = box.x0 - SHIP_CARD_GAP - w;
        top = box.y0;
    } else {
        left = box.x0;
        top = box.y0 - SHIP_CARD_GAP - cardH;
        if (top < SHIP_CARD_GAP) top = box.y1 + SHIP_CARD_GAP;
    }
    left = Math.min(Math.max(left, SHIP_CARD_GAP), Math.max(SHIP_CARD_GAP, width - SHIP_CARD_GAP - w));
    top = Math.min(Math.max(top, SHIP_CARD_GAP), Math.max(SHIP_CARD_GAP, height - SHIP_CARD_GAP - cardH));
    return { left: Math.round(left), top: Math.round(top), width: Math.round(w) };
}
