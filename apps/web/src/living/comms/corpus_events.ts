/**
 * The corpus adapter (ZC1; brief 2). Turns a vetted corpus line into a one-turn
 * radio event. Only control, customs, market, weather and vetted ship lines may
 * play, plus explicitly reviewed new commercials; rumour, distress and news do not. Every line still passes
 * chatter.ts eligible(); the extra gates below come from the line-by-line review
 * in findings/living_systems/comms_audit.md.
 */
import type { ChatterLineData } from '@voyage/shared';
import { eligible } from '../chatter.ts';
import type { SystemFacts } from '../facts.ts';
import { portStaffed, type ProceduralContext, type RadioChannel, type RadioEvent } from './events.ts';
import { pairFrom, rosterFor, seeded } from './roster.ts';
import { flavorLines } from '../lines/flavor.ts';
import { broadcastAdvertIds, broadcastLines, broadcastSources } from '../lines/broadcasts.ts';
import { spaceWeatherRevisions } from '../lines/revisions.ts';
import { spaceLines } from '../lines/space.ts';
import { imperialLines, imperialSources } from '../lines/imperial.ts';
import { travellerLines } from '../lines/traveller.ts';

export const PLAYABLE = ['control', 'customs', 'market', 'weather', 'ship', 'advert'] as const;
export const BLOCKED = ['rumour', 'distress', 'news'] as const;

const ids = (category: string, nums: string) => nums.split(' ').map((n) => `${category}-${n}`);

/**
 * Lines that read as a plot hook, an incident, an emergency, a mystery or an
 * ominous high-law threat, or that name a highport the system may not have,
 * or that fail one of the six sample checks (tests/shared/chatter_schema.test.js).
 */
export const EXCLUDED: ReadonlySet<string> = new Set([
    ...ids('control', '008 009 027 030 031 040 041 055 076 077 078 080 082 083 085 097 101 105 111 116 119 121 124 127 128 132 134 135 140 143'),
    ...ids('customs', '004 007 011 020 023 027 032 034 041 045 048 054 061 062 064 065 068 069 070 076 077 081 082 083 086 087 091 092 095 096 100 101 102 103 105 108 109 110 111 113'),
    ...ids('market', '007 011 014 015 016 017 027 036 037 040 067 075 076 081 083 086 089 090 128 138 146 147'),
    ...ids('weather', '028 041 056 090 092 095 110 115 123 126 128'),
]);

/** Ship lines are a positive list: everyday traffic only. */
export const SHIP_ALLOWED: ReadonlySet<string> = new Set(ids('ship',
    '026 027 030 033 037 038 043 046 047 048 049 050 051 052 053 055 057 059 060 061 062 063 064 065 067 070 079 080 081 084 085 086 087 088 090 091 092 093 095 099 102 103 104 108 109 113 116 119 126 136 141').concat([...flavorLines, ...broadcastLines, ...spaceLines, ...imperialLines, ...travellerLines].filter((line) => line.category === 'ship').map((line) => line.id)));

/** Ship lines that talk to a port office: they need a staffed A-D port. */
export const SHIP_NEEDS_STAFF: ReadonlySet<string> = new Set(ids('ship', '027 030 033 037 038 043 090 092 093 099 102 103 104 116 126 136 141'));

function rangeHas(range: { min?: number; max?: number } | undefined, value: number): boolean {
    if (!range) return false;
    return (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);
}

/** Air-weather words: never heard over a vacuum world (atm 0-1). */
export const AIR_WORDS = /\b(winds?|rain|fog|storms?|swell|crosswinds?|snow|hail|gusts?)\b/i;

/** The audit's gates on top of eligible(). */
export function corpusGate(line: ChatterLineData, f: SystemFacts): boolean {
    if (!(PLAYABLE as readonly string[]).includes(line.category)) return false;
    if (line.category === 'advert' && !broadcastAdvertIds.has(line.id)) return false;
    if (EXCLUDED.has(line.id)) return false;
    if (f.atm <= 1 && AIR_WORDS.test(line.text)) return false;
    const party = line.when.party;
    if (party && !party.includes('inSystem') && !party.includes('docked')) return false;
    switch (line.category) {
        case 'customs':
            if (!portStaffed(f)) return false;
            break;
        case 'control':
            if (f.starport !== 'X' && f.pop < 1) return false;
            break;
        case 'weather':
            if (f.pop < 1) return false;
            break;
        case 'market':
            if (f.pop < 1 && !rangeHas(line.when.pop, 0)) return false;
            break;
        case 'ship':
            if (!SHIP_ALLOWED.has(line.id)) return false;
            if (SHIP_NEEDS_STAFF.has(line.id) && !portStaffed(f)) return false;
            break;
    }
    return eligible(line, f);
}

/**
 * The lines the view can hear. Ambient lines play wherever the party is (ZC2); a line whose
 * `when.party` names a party place is addressed to the party and passes only when the lead
 * ship is there (eligible() reads `when.party`, and the gate above keeps in-jump logs out).
 */
export function corpusPool(lines: readonly ChatterLineData[], f: SystemFacts): ChatterLineData[] {
    return lines.filter((line) => corpusGate(line, f) && resolveSlots(line.text, f, ['a', 'b']) !== null);
}

/** Fill the slots; null when one cannot be filled (the line then never plays). */
export function resolveSlots(text: string, f: SystemFacts, ships: readonly [string, string] | readonly string[]): string | null {
    let missing = false;
    const out = text.replace(/\{(\w+)\}/g, (_, slot: string) => {
        let value: string | undefined;
        switch (slot) {
            case 'world': value = f.name || f.hexKey; break;
            case 'port': value = f.name + (f.highport === true ? ' Highport' : ' Downport'); break;
            case 'starport': value = f.starport; break;
            case 'ship': value = ships[0]; break;
            case 'ship2': value = ships[1]; break;
            case 'sector': value = f.sector; break;
            case 'subsector': value = f.subsector; break;
            case 'date': value = `${String(f.day).padStart(3, '0')}-1105`; break;
            case 'gasGiant': case 'belt': case 'moon': case 'body': value = f.bodies[slot]; break;
        }
        if (!value) missing = true;
        return value ?? '';
    });
    return missing ? null : out;
}

function stationOf(f: SystemFacts): string {
    if (f.highport === true) return `${f.name} Highport`;
    if (f.starport === 'D' || f.starport === 'E') return `${f.name} Field`;
    return `${f.name} Control`;
}

export function speakerFor(line: ChatterLineData, f: SystemFacts, ship: string): string {
    if (spaceWeatherRevisions[line.id]) return `${f.name} Sensor Watch`;
    const source = imperialSources.get(line.id) ?? broadcastSources.get(line.id);
    if (source) return resolveSlots(source.speaker, f, [ship]) ?? ship;
    if (line.voice === 'crew') return ship;
    switch (line.category) {
        case 'customs': return `${f.name} Customs`;
        case 'weather': return `${f.name} Weather`;
        case 'market':
            if (f.pop < 1) return ship;
            return line.voice === 'local' ? `${f.name} Local` : `${f.name} Exchange`;
        case 'control': return f.starport === 'X' ? ship : stationOf(f);
        default: return line.voice === 'control' ? stationOf(f) : ship;
    }
}

export function channelFor(line: ChatterLineData): RadioChannel {
    const source = imperialSources.get(line.id) ?? broadcastSources.get(line.id);
    if (source) return source.channel;
    switch (line.category) {
        case 'control': return 'approach';
        case 'customs': return 'services';
        case 'weather': return 'traffic-advisory';
        default: return 'common';
    }
}

/** Editorial emphasis: twice the draw weight, not twice the broadcast rate. */
export function selectionWeight(line: ChatterLineData, f: SystemFacts): number {
    const imperial = f.allegiance === 'Im' || f.allegianceBase === 'Im';
    return (line.weight ?? 1) * (imperial && line.when.allegiance?.includes('Im') ? 2 : 1);
}

/** One corpus line as an event, or null when the unheard pool is empty. */
export function nextCorpusEvent(pool: readonly ChatterLineData[], f: SystemFacts, ctx: ProceduralContext): RadioEvent | null {
    const avoid = new Set(ctx.avoidIds ?? []);
    const open = pool.filter((line) => !avoid.has(`line:${line.id}`));
    if (!open.length) return null;
    const r = seeded(`${f.hexKey}|${ctx.truthVersion}|${ctx.day}|${ctx.eventIndex}|line`);
    const total = open.reduce((sum, line) => sum + selectionWeight(line, f), 0);
    let ticket = r() * total;
    let chosen = open[open.length - 1] as ChatterLineData;
    for (const line of open) { ticket -= selectionWeight(line, f); if (ticket < 0) { chosen = line; break; } }
    const pair = pairFrom(rosterFor(f.hexKey, ctx.truthVersion), r);
    const text = resolveSlots(chosen.text, f, [pair.ship, pair.other]);
    if (text === null) return null;
    return {
        id: `line:${chosen.id}`, family: chosen.category, channel: channelFor(chosen),
        turns: [{ speaker: speakerFor(chosen, f, pair.ship), text }], allowSignalNoise: false,
    };
}
