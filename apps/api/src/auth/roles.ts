const ROLE_RANK = { user: 0, reviewer: 1, admin: 2 } as const;

export type RoleName = keyof typeof ROLE_RANK;

export function roleSatisfies(have: string, required: RoleName): boolean {
    const got = ROLE_RANK[have as RoleName];
    return got != null && got >= ROLE_RANK[required];
}
