import { z } from 'zod';

export const Role = z.enum(['user', 'reviewer', 'admin']);
export type Role = z.infer<typeof Role>;

/** profile row from data_model.md §2. Identity columns stay on the better-auth user. */
export const Profile = z.object({
    userId: z.string(),
    handle: z.string(),
    displayName: z.string().nullable().optional(),
    avatarUrl: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    lastSeenAt: z.string().nullable().optional(),
});
export type Profile = z.infer<typeof Profile>;

/** GET /api/me: session user plus our profile row. */
export const User = z.object({
    id: z.string(),
    email: z.string(),
    role: Role,
    profile: Profile.optional(),
});
export type User = z.infer<typeof User>;
