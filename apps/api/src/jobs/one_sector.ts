// Workers generate at most one sector per request or job (Johnny, 2026-10-13).
// Larger work is refused with this plain sentence.
export const ONE_SECTOR_LIMIT = 'The limit is one sector per request.';

/** Number of distinct sectors named by hex keys of the form "<sector>/<hex>". */
export function sectorCount(hexKeys: readonly string[]): number {
    return new Set(hexKeys.map((hexKey) => hexKey.slice(0, Math.max(0, hexKey.indexOf('/'))))).size;
}
