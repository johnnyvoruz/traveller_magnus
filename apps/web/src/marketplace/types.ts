/**
 * Marketplace stub shapes from contracts/b_marketplace.md.
 * Replace each type with the shared schema when Lane B adds it to
 * packages/shared/src/schemas/package.ts.
 */

/** from contracts/b_marketplace.md, replace with the shared schema */
export type PackageCreate = {
    title: string;
    kind: string;
    description: string;
    tags: readonly string[];
    universeId: string;
};

/** from contracts/b_marketplace.md, replace with the shared schema */
export type PackagePublish = {
    universeId: string;
    hexKeys: readonly string[];
    recordIds: readonly string[];
};

/** from contracts/b_marketplace.md, replace with the shared schema */
export type PackageListing = {
    id: string;
    title: string;
    authorHandle: string;
    kind: string;
    truthVersion: string | null;
    edition: string;
    hexCount: number;
    tags: string[];
    latestVersion: number;
};

/** from contracts/b_marketplace.md, replace with the shared schema */
export type PackageVersionState = 'queued' | 'running' | 'done' | 'failed';

/** from contracts/b_marketplace.md, replace with the shared schema */
export type PackageVersion = {
    version: number;
    state: PackageVersionState;
    hexCount: number;
    recordCount: number;
    manifestHash: string | null;
    error: string | null;
};

/** from contracts/b_marketplace.md, replace with the shared schema */
export type PackagePage = PackageListing & {
    description: string;
    versions: PackageVersion[];
};

/** from contracts/b_marketplace.md, replace with the shared schema */
export type PackagePublishAccepted = {
    jobId: string;
    version: number;
};

/**
 * from contracts/b_marketplace.md, replace with the shared schema.
 * `nextCursor` follows the existing page rule (`BuilderHexPage`): a string, or null when the page ends.
 */
export type PackageListPage = {
    items: PackageListing[];
    nextCursor: string | null;
};

/** The signed-in account. Null when signed out. */
export type MarketplaceAccount = {
    id: string;
    handle: string | null;
};

/**
 * The universe a publish comes from. The screen already has this.
 * `truthVersion` null is the server's "not on a published chart".
 */
export type PublishSource = {
    ownerId: string;
    truthVersion: string | null;
};

export type PackageListQuery = {
    cursor?: string;
    limit?: number;
};

export type PublishHandle = {
    accepted: Promise<PackagePublishAccepted>;
    finished: Promise<PackageVersion>;
};
