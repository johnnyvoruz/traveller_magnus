/**
 * Marketplace stub shapes. The wire types come from @voyage/shared
 * (packages/shared/src/schemas/package.ts, contracts/b_marketplace.md).
 * The four types below them are the browser's own.
 */
import type { PackagePublishAccepted, PackageVersion } from '@voyage/shared';

export type {
    PackageCreate,
    PackageListPage,
    PackageListing,
    PackagePage,
    PackagePublish,
    PackagePublishAccepted,
    PackageVersion,
} from '@voyage/shared';

/** The shared version state's enum. It is not a separate export. */
export type PackageVersionState = PackageVersion['state'];

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
