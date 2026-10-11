/**
 * The marketplace screens' store. Screens depend on this interface.
 * `workspace/` is unchanged. Lane D calls `asMarketplaceStore(openMarketplace(...))`.
 */
import type { Marketplace } from './store.ts';
import type {
    PackageCreate,
    PackageListPage,
    PackageListQuery,
    PackageListing,
    PackagePage,
    PackagePublish,
    PackageVersion,
    PublishHandle,
    PublishSource,
} from './types.ts';

export type MarketplaceStore = {
    tick(): number;
    listings(): PackageListing[];
    page(packageId: string): PackagePage | null;
    nextCursor(): string | null;
    create(body: PackageCreate, source: PublishSource): Promise<PackageListing>;
    publish(
        packageId: string,
        body: PackagePublish,
        source: PublishSource,
        onProgress?: (version: PackageVersion) => void,
    ): PublishHandle;
    watch(packageId: string, version: number, onProgress?: (version: PackageVersion) => void): Promise<PackageVersion>;
    list(query?: PackageListQuery): Promise<PackageListPage>;
    read(packageId: string): Promise<PackagePage>;
};

export function asMarketplaceStore(shelf: Marketplace): MarketplaceStore {
    return {
        tick: () => shelf.tick(),
        listings: () => shelf.listings(),
        page: (packageId) => shelf.page(packageId),
        nextCursor: () => shelf.nextCursor(),
        create: (body, source) => shelf.create(body, source),
        publish: (packageId, body, source, onProgress) => shelf.publish(packageId, body, source, onProgress),
        watch: (packageId, version, onProgress) => shelf.watch(packageId, version, onProgress),
        list: (query) => shelf.list(query),
        read: (packageId) => shelf.read(packageId),
    };
}
