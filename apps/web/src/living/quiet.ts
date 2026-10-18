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
export const COMMS_KEY = 'voyage.comms.on';

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

export function setQuiet(on: boolean): void {
    device.quiet = on;
    storageSet(QUIET_KEY, on ? '1' : '0');
}

/** The referee's switches as stored: both off when the campaign has none. */
export function livingOf(settings: Pick<CampaignSettings, 'living'> | null | undefined): Living {
    const living = settings ? settings.living : undefined;
    return living ? { chatter: living.chatter, traffic: living.traffic } : LIVING_OFF;
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
