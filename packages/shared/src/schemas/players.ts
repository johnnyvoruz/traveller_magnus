import { z } from 'zod';
import {
    CampaignClock,
    CampaignEntry,
    CampaignLink,
    CampaignRecord,
    CampaignSettings,
} from './campaign.ts';

/**
 * The member campaign read. `rev` stays only on the caller's own notes.
 * `authorName` is the profile handle. `visible` is the full projected id set.
 */
const PlayersEntry = z.unknown().superRefine((value, ctx) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        ctx.addIssue({ code: 'custom', message: 'Invalid request.' });
        return;
    }
    const raw = value as Record<string, unknown>;
    if ('authorId' in raw || 'provenance' in raw) {
        ctx.addIssue({ code: 'custom', message: 'Invalid request.' });
        return;
    }
    if (raw.authorName !== undefined && typeof raw.authorName !== 'string') {
        ctx.addIssue({ code: 'custom', message: 'Invalid request.' });
        return;
    }
    const rev = raw.rev === undefined ? 0 : raw.rev;
    const rest = { ...raw };
    delete rest.authorName;
    if (!CampaignEntry.safeParse({ ...rest, rev }).success) {
        ctx.addIssue({ code: 'custom', message: 'Invalid request.' });
    }
});

export const PlayersRecord = CampaignRecord.omit({ rev: true, provenance: true });
export const PlayersLink = CampaignLink.omit({ rev: true, provenance: true });
export const PlayersSettings = CampaignSettings.omit({ rev: true });
export const PlayersClock = CampaignClock.omit({ rev: true });

export const PlayersPage = z.object({
    records: z.array(PlayersRecord),
    links: z.array(PlayersLink),
    journal: z.array(PlayersEntry),
    settings: PlayersSettings.nullable(),
    clock: PlayersClock.nullable(),
    seq: z.number().int().nonnegative(),
    done: z.boolean(),
    visible: z.object({
        records: z.array(z.string()),
        links: z.array(z.string()),
        journal: z.array(z.string()),
    }).strict().optional(),
}).strict();
export type PlayersPage = z.infer<typeof PlayersPage>;

export const PlayerInvite = z.object({
    url: z.string(),
    expiresAt: z.string(),
    role: z.literal('player'),
    uses: z.number().int().nonnegative(),
}).strict();
export type PlayerInvite = z.infer<typeof PlayerInvite>;

const PlayerMember = z.object({
    userId: z.string(),
    handle: z.string(),
    personId: z.string().nullable(),
    joined: z.string(),
    status: z.enum(['active', 'archived']),
    archivedAt: z.string().nullable(),
    archivedBy: z.enum(['owner', 'self']).nullable(),
}).strict();

export const PlayerList = z.object({
    playing: z.array(PlayerMember),
    archived: z.array(PlayerMember),
}).strict();
export type PlayerList = z.infer<typeof PlayerList>;

export const PlayerPerson = z.object({
    personId: z.string().nullable(),
}).strict();
export type PlayerPerson = z.infer<typeof PlayerPerson>;

export const PlayerStatus = z.object({
    status: z.literal('active'),
}).strict();
export type PlayerStatus = z.infer<typeof PlayerStatus>;

export const JoinBody = z.object({
    token: z.string().min(1),
}).strict();
export type JoinBody = z.infer<typeof JoinBody>;

export const JoinClaim = z.object({
    universeId: z.string(),
    name: z.string(),
    role: z.literal('player'),
}).strict();
export type JoinClaim = z.infer<typeof JoinClaim>;

export const JoinPreview = z.object({
    name: z.string(),
    ownerHandle: z.string(),
    expiresAt: z.string(),
}).strict();
export type JoinPreview = z.infer<typeof JoinPreview>;

export const PlayingList = z.object({
    items: z.array(z.object({
        id: z.string(),
        name: z.string(),
        ownerHandle: z.string(),
        truthVersion: z.string().nullable(),
    }).strict()),
}).strict();
export type PlayingList = z.infer<typeof PlayingList>;
