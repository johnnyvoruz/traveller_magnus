/**
 * The onboarding checklist (streams/D.md DU9; backlog_ux_industry_best.md U9): Epic L's first-run
 * card grown to seven lines in the account pop-up: world found, ship added, date set, first record,
 * first entry, players invited, package browsed. Every state is read from what the app already
 * holds; nothing is stored and no new route is asked of the server. Players invited is read once per
 * campaign per session from the existing players list when the checklist opens (DU9b), and noted by
 * the Players section after. Pure, but for that one memory and that one read.
 */
import { ref } from 'vue';
import type { CampaignClock, CampaignRecord } from '@voyage/shared';
import { dateIsSet, vesselHasPlace } from './first_run.ts';
import { liveById } from './places.ts';

export type OnboardingId = 'world' | 'ship' | 'date' | 'record' | 'entry' | 'players' | 'package';

export type OnboardingLine = { id: OnboardingId; label: string; done: boolean };

export type OnboardingInput = {
    /** A world's dossier is open (this visit; not stored). */
    worldOpen: boolean;
    records: Readonly<Record<string, CampaignRecord>>;
    clock: CampaignClock | null;
    journal: Readonly<Record<string, { deleted: boolean }>>;
    /** The Players section has seen a link or a member this session. */
    invited: boolean;
    /** The store was opened this session, or a package's page was kept. */
    storeSeen: boolean;
    packagesKept: number;
};

export const ONBOARDING_ORDER: readonly OnboardingId[] = ['world', 'ship', 'date', 'record', 'entry', 'players', 'package'];

export const ONBOARDING_LABELS: Record<OnboardingId, string> = {
    world: 'Find a world',
    ship: 'Add your ship',
    date: 'Set the campaign date',
    record: 'Make your first record',
    entry: 'Write your first journal entry',
    players: 'Invite your players',
    package: 'Browse the packages',
};

/** A live vessel, placed or not. */
export function vesselAdded(records: Readonly<Record<string, CampaignRecord>>): boolean {
    return Object.values(liveById(records)).some((record) => record.type === 'vessel');
}

/** A live record that is not the ship: a person, a place, a thing. */
export function firstRecordMade(records: Readonly<Record<string, CampaignRecord>>): boolean {
    return Object.values(liveById(records)).some((record) => record.type !== 'vessel');
}

export function firstEntryWritten(journal: Readonly<Record<string, { deleted: boolean }>>): boolean {
    return Object.values(journal).some((row) => !row.deleted);
}

/** The seven lines, in order, each done or not. */
export function onboardingLines(input: OnboardingInput): OnboardingLine[] {
    const placed = vesselHasPlace(input.records);
    const done: Record<OnboardingId, boolean> = {
        world: input.worldOpen || placed,
        ship: vesselAdded(input.records),
        date: dateIsSet(input.clock),
        record: firstRecordMade(input.records),
        entry: firstEntryWritten(input.journal),
        players: input.invited,
        package: input.storeSeen || input.packagesKept > 0,
    };
    return ONBOARDING_ORDER.map((id) => ({ id, label: ONBOARDING_LABELS[id], done: done[id] }));
}

export function onboardingCount(lines: readonly OnboardingLine[]): { done: number; total: number } {
    return { done: lines.filter((line) => line.done).length, total: lines.length };
}

/** The list leaves at 7 of 7. */
export function onboardingShows(lines: readonly OnboardingLine[]): boolean {
    return lines.some((line) => !line.done);
}

/** The first line not done: the one to light. */
export function onboardingNext(lines: readonly OnboardingLine[]): OnboardingId | null {
    const next = lines.find((line) => !line.done);
    return next ? next.id : null;
}

// ---- Players invited: what the Players section saw this session, per campaign ----------------------

const invitedCampaign = ref<string | null>(null);

/** The Players section read the list or made a link: a member or a live link means the players were invited. */
export function noteInvited(universeId: string | null, seen: { invite: boolean; members: number }): void {
    if (!universeId) return;
    if (seen.invite || seen.members > 0) invitedCampaign.value = universeId;
    else if (invitedCampaign.value === universeId) invitedCampaign.value = null;
}

export function invitedIn(universeId: string | null): boolean {
    return universeId !== null && invitedCampaign.value === universeId;
}

/** The campaigns whose list was read this session (DU9b): one read each. */
const asked = new Set<string>();

/** The players list read (campaign/membership.ts `listPlayers`), given by the caller: that module's schemas stay out of the first paint. */
export type MembersRead = () => Promise<{ playing: readonly unknown[]; archived: readonly unknown[] } | null>;

/**
 * The existing players list, read once per campaign per session when the checklist opens for the
 * referee: a member, playing or archived, means the players were invited. A failed read is asked
 * again next time. The Players section's note covers what changes after.
 */
export async function ensureInvitedKnown(universeId: string | null, read: MembersRead): Promise<void> {
    if (!universeId || asked.has(universeId)) return;
    asked.add(universeId);
    const list = await read();
    if (!list) {
        asked.delete(universeId);
        return;
    }
    const members = list.playing.length + list.archived.length;
    if (members > 0) noteInvited(universeId, { invite: false, members });
}

/** Tests and sign-out. */
export function resetOnboarding(): void {
    invitedCampaign.value = null;
    asked.clear();
}
