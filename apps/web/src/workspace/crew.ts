/**
 * The crew: who is on which ship, in what role (DS2; findings/ship_crew_plan.md §3 (1); Johnny 2026-11-01,
 * questions 131, 134 and 135: a Crew list on the ship's page, a party character and a role each, Captain
 * preset, one ship per character at a time; the role is typed, the rules files hold no list of ship
 * positions). Stored as `status.crew` on the vessel record (`CrewRow`); the projection keeps a row whose
 * person the players can see. Pure: nothing here writes.
 */
import type { CampaignRecord, CrewRole, CrewRow } from '@voyage/shared';

export const CAPTAIN = 'Captain';
export const NO_CREW = 'No crew yet. Add a party character and say what they do aboard.';
export const ONE_SHIP = 'A character crews one ship at a time.';

/** The rows as stored, in order; none on a record without them. */
export function crewOf(record: CampaignRecord | null | undefined): CrewRow[] {
    const status = record && record.status ? (record.status as { crew?: unknown }) : null;
    const rows = status && Array.isArray(status.crew) ? status.crew : [];
    return rows.filter((row): row is CrewRow => !!row && typeof row === 'object' && typeof (row as CrewRow).personId === 'string' && typeof (row as CrewRow).role === 'string');
}

/** The person's role on this ship, or null when they are not on its crew. */
export function roleOf(record: CampaignRecord | null | undefined, personId: string): string | null {
    const found = crewOf(record).find((row) => row.personId === personId);
    return found ? found.role : null;
}

/** The role the box starts with: Captain for a ship with no crew yet, empty after (Johnny 134). */
export function presetRole(rows: readonly CrewRow[]): string {
    return rows.length === 0 ? CAPTAIN : '';
}

/** The crew with this person in this role: added at the end, or the role changed in place. */
export function crewWith(rows: readonly CrewRow[], personId: string, role: string): CrewRow[] {
    const trimmed = role.trim();
    const at = rows.findIndex((row) => row.personId === personId);
    if (at >= 0) return rows.map((row, i) => (i === at ? { personId, role: trimmed } : row));
    return [...rows, { personId, role: trimmed }];
}

export function crewWithout(rows: readonly CrewRow[], personId: string): CrewRow[] {
    return rows.filter((row) => row.personId !== personId);
}

/** The party's ships: the vessel records the party settings name, live, in that order. */
export function partyShips(records: Readonly<Record<string, CampaignRecord>>, party: { vesselIds?: unknown } | null | undefined): CampaignRecord[] {
    const ids = party && Array.isArray(party.vesselIds) ? party.vesselIds : [];
    const out: CampaignRecord[] = [];
    for (const id of ids) {
        const record = typeof id === 'string' ? records[id] : undefined;
        if (record && !record.deleted && record.type === 'vessel') out.push(record);
    }
    return out;
}

/** The party's people, offered for the crew: the party's member persons, live, by name. */
export function partyPersons(records: Readonly<Record<string, CampaignRecord>>, party: { memberIds?: unknown } | null | undefined): CampaignRecord[] {
    const ids = party && Array.isArray(party.memberIds) ? party.memberIds : [];
    const out: CampaignRecord[] = [];
    for (const id of ids) {
        const record = typeof id === 'string' ? records[id] : undefined;
        if (record && !record.deleted && record.type === 'person' && !out.includes(record)) out.push(record);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** The one-ship rule (Johnny 134): the other party ship this person crews now, or null. */
export function shipHolding(ships: readonly CampaignRecord[], personId: string, exceptId: string): CampaignRecord | null {
    return ships.find((ship) => ship.id !== exceptId && roleOf(ship, personId) !== null) ?? null;
}

/** The words of the move: "Moved Tam Oduya from Kestrel Dawn. A character crews one ship at a time." */
export function movedWords(personName: string, fromShip: string): string {
    return 'Moved ' + personName + ' from ' + fromShip + '. ' + ONE_SHIP;
}

/** Every role typed on the party's ships, once each, in order of first use: the box's suggestions. */
export function roleSuggestions(ships: readonly CampaignRecord[]): string[] {
    const out: string[] = [CAPTAIN];
    for (const ship of ships) {
        for (const row of crewOf(ship)) {
            if (row.role && !out.includes(row.role)) out.push(row.role);
        }
    }
    return out;
}

/** "Captain of Kestrel Dawn": a person's role line across the party's ships, or '' when they crew none. */
export function crewLine(ships: readonly CampaignRecord[], personId: string): string {
    for (const ship of ships) {
        const role = roleOf(ship, personId);
        if (role !== null) return (role || 'Crew') + ' of ' + ship.name;
    }
    return '';
}

// ---- The switches (DS3; Johnny 131, 136) ----------------------------------------------------------------

export const SWITCHES = ['ledger', 'trade', 'locker'] as const;
export type Switch = (typeof SWITCHES)[number];
export const SWITCH_WORDS: Record<Switch, string> = { ledger: 'The Ledger', trade: 'Trade', locker: 'The locker' };
/** The plan's rule: players trade, the referee keeps time; and what is never a player's. */
export const REFEREE_ALONE = 'The referee alone: the sheet, Set up the ship, the owners and the payment, Players, the course and the clock.';
export const ALL_ON = 'Every role may do everything until a switch is turned off.';

/** A row's role as the switches name it: a row with no role typed is "Crew". */
export function roleName(row: Pick<CrewRow, 'role'>): string {
    return row.role.trim() || 'Crew';
}

/** The role rows as stored; none on a record without them. */
export function rolesOf(record: CampaignRecord | null | undefined): CrewRole[] {
    const status = record && record.status ? (record.status as { roles?: unknown }) : null;
    const rows = status && Array.isArray(status.roles) ? status.roles : [];
    return rows.filter((row): row is CrewRole => !!row && typeof row === 'object' && typeof (row as CrewRole).name === 'string'
        && SWITCHES.every((key) => typeof (row as CrewRole)[key] === 'boolean'));
}

/** A role's switches: its row, or all on when it has none (131). */
export function roleSwitches(roles: readonly CrewRole[], name: string): CrewRole {
    return roles.find((row) => row.name === name) ?? { name, ledger: true, trade: true, locker: true };
}

/** The roles in use on this crew, each once, in the crew's order, with their switches. */
export function rolesInUse(crew: readonly CrewRow[], roles: readonly CrewRole[]): CrewRole[] {
    const out: CrewRole[] = [];
    for (const row of crew) {
        const name = roleName(row);
        if (!out.some((item) => item.name === name)) out.push(roleSwitches(roles, name));
    }
    return out;
}

/** The rows with one switch of one role set: a role with no row gets one, all on, then the flip. */
export function withSwitch(roles: readonly CrewRole[], name: string, key: Switch, on: boolean): CrewRole[] {
    const at = roles.findIndex((row) => row.name === name);
    if (at >= 0) return roles.map((row, i) => (i === at ? { ...row, [key]: on } : row));
    return [...roles, { ...roleSwitches(roles, name), [key]: on }];
}

/** Whether this person may do this on this ship: on the crew, in a role whose switch is on. The referee's own calls never ask. */
export function may(record: CampaignRecord | null | undefined, personId: string, key: Switch): boolean {
    const row = crewOf(record).find((item) => item.personId === personId);
    if (!row) return false;
    return roleSwitches(rolesOf(record), roleName(row))[key];
}
