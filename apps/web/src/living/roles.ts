/**
 * How many background ships a world draws (spec_living_systems.md §3.2).
 * The activity index borrows the shape of the Freight Traffic world DMs
 * (assets/trade.txt:175-189). It is not a count of ships.
 * The numbers are the presentation dials in reports/x_living_systems.md section 3.
 */
export const SHIP_CAP = 12;
export const SHUTTLE_COUNT = 2;
/** Dial 7: the arrival point sits this many times the mainworld's 100D radius out from it. */
export const EDGE_MARGIN = 1.15;
/** Dial 5: a dock lasts from this many hours up to this many. */
export const DOCK_HOURS_MIN = 6;
export const DOCK_HOURS_MAX = 30;
/** Dial 6: this share of traders fly on to a gas giant. */
export const SKIM_SHARE = 1 / 3;
/** Dial 8: flights use this many G, the second column of the Transit Times table. */
export const FLIGHT_G = 2;
/** Dial 9: above this many campaign days a second, only docked and orbiting ships are drawn. */
export const FAST_DAYS_PER_SECOND = 2;

export type TrafficRole = 'trader' | 'liner' | 'patrol' | 'scout' | 'xboat' | 'shuttle';

export type TrafficProfile = {
    starport: string;
    pop: number;
    tl: number;
    zone: string;
    bases: string;
    highport: boolean;
    xboat: boolean;
};

export type RoleCounts = Record<TrafficRole, number>;

const EMPTY: RoleCounts = { trader: 0, liner: 0, patrol: 0, scout: 0, xboat: 0, shuttle: 0 };

function portOf(profile: TrafficProfile): string {
    return profile.starport.toUpperCase();
}

function redZone(profile: TrafficProfile): boolean {
    const zone = profile.zone.toLowerCase();
    return zone === 'red' || zone === 'r';
}

function amberZone(profile: TrafficProfile): boolean {
    const zone = profile.zone.toLowerCase();
    return zone === 'amber' || zone === 'a';
}

function hasBase(profile: TrafficProfile, code: string): boolean {
    return profile.bases.toUpperCase().includes(code);
}

/**
 * Sum of the freight world DMs for this world as a source.
 * Population 1 or less −4, 6 to 7 +2, 8 or more +4.
 * Starport A +2, B +1, E −1, X −3.
 * Tech level 6 or less −1, 9 or more +2.
 * Amber −2, Red −6.
 * The index runs from −14 to +8.
 */
export function activityIndex(profile: TrafficProfile): number {
    let index = 0;
    if (profile.pop <= 1) index -= 4;
    else if (profile.pop >= 8) index += 4;
    else if (profile.pop >= 6) index += 2;
    const port = portOf(profile);
    if (port === 'A') index += 2;
    else if (port === 'B') index += 1;
    else if (port === 'E') index -= 1;
    else if (port === 'X') index -= 3;
    if (profile.tl <= 6) index -= 1;
    else if (profile.tl >= 9) index += 2;
    if (amberZone(profile)) index -= 2;
    else if (redZone(profile)) index -= 6;
    return index;
}

/** Dial 1: round(clamp((index + 4) / 12, 0, 1) × 12). */
export function drawnCount(index: number): number {
    const share = (index + 4) / 12;
    const clamped = share < 0 ? 0 : share > 1 ? 1 : share;
    return Math.round(clamped * SHIP_CAP);
}

/**
 * How many of each role. A Red zone draws two patrols and no other ship.
 * A class X world draws no trader, liner or shuttle. A base still draws its
 * ship when the index is at the floor. Shuttles sit outside the cap of 12.
 */
export function roleCounts(profile: TrafficProfile): RoleCounts {
    const counts: RoleCounts = { ...EMPTY };
    if (redZone(profile)) {
        counts.patrol = 2;
        return counts;
    }
    const port = portOf(profile);
    const civilian = port !== 'X';
    const drawn = drawnCount(activityIndex(profile));
    if (civilian && (profile.pop >= 8 || port === 'A' || port === 'B')) {
        counts.liner = Math.min(3, Math.floor(drawn / 4));
    }
    if (civilian) counts.trader = drawn - counts.liner;
    if (hasBase(profile, 'N')) counts.patrol = 1;
    if (hasBase(profile, 'S') || hasBase(profile, 'W')) counts.scout = 1;
    if (hasBase(profile, 'W') || profile.xboat) counts.xboat = 1;
    while (counts.trader + counts.liner + counts.patrol + counts.scout + counts.xboat > SHIP_CAP && counts.trader > 0) {
        counts.trader -= 1;
    }
    while (counts.trader + counts.liner + counts.patrol + counts.scout + counts.xboat > SHIP_CAP && counts.liner > 0) {
        counts.liner -= 1;
    }
    if (civilian && profile.highport) counts.shuttle = SHUTTLE_COUNT;
    return counts;
}

export const ROLE_SHAPE: Record<TrafficRole, 'triangle' | 'circle' | 'square' | 'rectangle'> = {
    trader: 'circle',
    liner: 'rectangle',
    patrol: 'square',
    scout: 'triangle',
    xboat: 'triangle',
    shuttle: 'circle',
};

/** The role in words on the hover block. A trader is one of the two trader words. */
export function roleWord(role: TrafficRole, traderFar: boolean): string {
    if (role === 'trader') return traderFar ? 'far trader' : 'free trader';
    if (role === 'liner') return 'liner';
    if (role === 'patrol') return 'patrol';
    if (role === 'scout') return 'scout';
    if (role === 'xboat') return 'courier';
    return 'shuttle';
}
