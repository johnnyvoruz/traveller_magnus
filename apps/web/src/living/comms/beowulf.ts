/**
 * The Free Trader Beowulf archive (ZC1; brief 6). Wording is verbatim from
 * assets/.../receiver/comms-receiver.js lines 24-30; the gate is the same
 * function as lines 37-42 there. hashString is the same FNV-1a as that file's
 * hashText (lines 55-59). A recorded archive, never a fresh incident, never a
 * pool line, never a button. Four segments, one event, played once per campaign.
 */
import { hashString } from '@voyage/shared';
import type { PartyPlace } from '../facts.ts';
import type { RadioEvent } from './events.ts';

export const BEOWULF_QUOTE = 'This is Free Trader Beowulf, calling anyone.... Mayday, Mayday... we are under attack. main drive is gone.... turret number one not responding... Mayday... losing cabin pressure fast. calling anyone... please help.... This is Free Trader Beowulf... Mayday...';
export const BEOWULF_SEGMENTS: readonly string[] = Object.freeze([
    'This is Free Trader Beowulf, calling anyone.... Mayday, Mayday... we are under attack.',
    'main drive is gone.... turret number one not responding...',
    'Mayday... losing cabin pressure fast. calling anyone... please help....',
    'This is Free Trader Beowulf... Mayday...',
]);
export const BEOWULF_ODDS = 2048;
export const BEOWULF_FROM = 'FREE TRADER BEOWULF';

if (BEOWULF_SEGMENTS.join(' ') !== BEOWULF_QUOTE) throw new Error('Beowulf original wording altered');

export type BeowulfGate = {
    campaignKey: string;
    hexKey: string;
    party: PartyPlace;
    starport: string;
    alreadyPlayed: boolean;
};

export function beowulfHash(campaignKey: string, hexKey: string): number {
    return hashString(`${campaignKey}|${hexKey}|beowulf-legacy`);
}

export function shouldQueueBeowulf(g: BeowulfGate): boolean {
    if (g.alreadyPlayed || !g.campaignKey || !g.hexKey) return false;
    if (g.party !== 'inSystem' && g.party !== 'docked') return false;
    if (!['A', 'B', 'C', 'D', 'E'].includes(String(g.starport || '').toUpperCase())) return false;
    return beowulfHash(g.campaignKey, g.hexKey) % BEOWULF_ODDS === 0;
}

export function beowulfEvent(opts?: { recordOnce?: boolean }): RadioEvent {
    return {
        id: 'beowulf:legacy', family: 'archive', channel: 'archive',
        turns: BEOWULF_SEGMENTS.map((text) => ({ speaker: BEOWULF_FROM, text })),
        allowSignalNoise: false, uninterruptible: true, theme: 'emergency',
        recordOnce: opts?.recordOnce,
    };
}

export function beowulfStorageKey(campaignKey: string): string {
    return `voyage.comms.beowulf.${campaignKey}`;
}