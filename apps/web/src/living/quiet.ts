/**
 * Systems that feel alive: the switches (spec_living_systems.md §4; streams/D.md LS3). The referee's two
 * switches live in the campaign settings (`living`: chatter and background traffic, absent meaning both
 * off) and are written as one settings change on the held revision, as the party is. Anyone can quiet
 * them on their own device (`voyage.living.quiet`), and the device wins. `livingShown` is what the ticker
 * and the traffic read. Nothing here is a rule.
 */
import { reactive } from 'vue';
import type { CampaignSettings, SettingsChange } from '@voyage/shared';
import { storageGet, storageSet } from '../platform/browser.ts';

export const QUIET_KEY = 'voyage.living.quiet';
/** The orbit view's Traffic chip. Absent means shown. Quiet still hides the ships. */
export const TRAFFIC_LAYER_KEY = 'voyage.living.traffic';
/** System Comms in the orbit view. Absent means on. This device only. */
/** `.2` since 2026-11-14: System Comms opens by default again on every device (Johnny); the old key's "off" is not read. */
export const COMMS_KEY = 'voyage.comms.on.2';

export type Living = { chatter: boolean; traffic: boolean };

export const LIVING_OFF: Living = { chatter: false, traffic: false };

/** This device's choice, read once and kept in step with what is written. */
export const device = reactive({ quiet: storageGet(QUIET_KEY) === '1' });

/** This device's Traffic chip. Shown unless the chip was turned off. */
export const deviceTraffic = reactive({ shown: storageGet(TRAFFIC_LAYER_KEY) !== '0' });

/** System Comms. On unless this device stored off. */
export function commsOnStored(value: string | null): boolean {
    return value !== '0';
}

export const deviceComms = reactive({ shown: commsOnStored(storageGet(COMMS_KEY)) });

export function setTrafficShown(on: boolean): void {
    deviceTraffic.shown = on;
    storageSet(TRAFFIC_LAYER_KEY, on ? '1' : '0');
}

export function setCommsShown(on: boolean): void {
    deviceComms.shown = on;
    storageSet(COMMS_KEY, on ? '1' : '0');
}

/**
 * The receiver's own minimize: put away for this visit, and open again the next time the app loads.
 * Nothing is stored; the System Comms button is what this device remembers.
 */
export function minimizeComms(): void {
    deviceComms.shown = false;
}

export function setQuiet(on: boolean): void {
    device.quiet = on;
    storageSet(QUIET_KEY, on ? '1' : '0');
}

/** A campaign that has never set the switches: traffic shows (Johnny, 2026-11-14: the system should feel alive), chatter as before. */
export const LIVING_UNSET: Living = { chatter: false, traffic: true };

/**
 * The referee's switches as stored. A campaign that has none stored gets LIVING_UNSET: background
 * traffic is on until the referee turns it off. No campaign at all is both off.
 */
export function livingOf(settings: Pick<CampaignSettings, 'living'> | null | undefined): Living {
    if (!settings) return LIVING_OFF;
    const living = settings.living;
    return living ? { chatter: living.chatter, traffic: living.traffic } : LIVING_UNSET;
}

/** What shows on this device: the referee's switches, unless this device is quiet. Signed out or no campaign: nothing. */
export function livingShown(settings: Pick<CampaignSettings, 'living'> | null | undefined, quiet: boolean): Living {
    if (quiet) return LIVING_OFF;
    return livingOf(settings);
}

/** One settings change on the held revision: the whole document, with the switches as given. */
export function livingChange(settings: CampaignSettings, living: Living): SettingsChange {
    return { ...settings, living: { chatter: living.chatter, traffic: living.traffic }, baseRev: settings.rev };
}
