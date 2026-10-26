import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as barrel from '@voyage/shared';
import * as campaignCore from '@voyage/shared/campaign_core';
import * as publicLimits from '@voyage/shared/public_limits';
import * as sectorCore from '@voyage/shared/sector_core';
import * as builderCore from '@voyage/shared/builder_core';
import * as place from '@voyage/shared/package_place';
import * as orbitAu from '@voyage/shared/orbit_au';

// ZP1 item 5. A first-paint module that needs only a limit, a kind, or a coordinate helper imports it
// through a zod-free subpath, so the schema library is not what that import pulls in.

const SHARED = new URL('../../packages/shared/', import.meta.url);
const WEB = new URL('../../apps/web/src/', import.meta.url);
const read = (base, rel) => fs.readFileSync(new URL(rel, base), 'utf8');

const ZOD_FREE = {
    campaign_core: 'src/campaign_core.ts',
    public_limits: 'src/public_limits.ts',
    sector_core: 'src/sector_core.ts',
    builder_core: 'src/builder_core.ts',
    package_place: 'src/package_place.ts',
    orbit_au: 'src/orbit_au.ts',
};

/** Import specifiers of a file, and whether each import is type-only. */
function importsOf(text) {
    const found = [];
    for (const m of text.matchAll(/^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
        found.push({ type: Boolean(m[2]), from: m[3] });
    }
    for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push({ type: false, from: m[1] });
    return found;
}

test('the zod-free modules import neither zod nor another module at runtime', () => {
    for (const [name, file] of Object.entries(ZOD_FREE)) {
        const imports = importsOf(read(SHARED, file));
        for (const item of imports) {
            assert.notEqual(item.from, 'zod', name + ' imports zod');
            assert.ok(item.type, name + ' has a runtime import of ' + item.from + '. Only `import type` is allowed here');
        }
    }
});

test('package.json exports each zod-free module as a subpath, and the barrel stays', () => {
    const pkg = JSON.parse(read(SHARED, 'package.json'));
    assert.equal(pkg.exports['.'], './src/index.ts');
    for (const [name, file] of Object.entries(ZOD_FREE)) {
        assert.equal(pkg.exports['./' + name], './' + file, name);
    }
});

test('every name the map moved to a subpath is the same value the barrel answers', () => {
    const pairs = [
        [campaignCore, ['CAMPAIGN_LIMITS', 'POINT_AU_LIMIT', 'CAMPAIGN_RECORD_TYPES', 'CAMPAIGN_ENTRY_KINDS', 'CAMPAIGN_LINK_KINDS', 'mentionsOf', 'locate', 'linkAllowed']],
        [publicLimits, ['PUBLIC_SHIPS_PER_HEX', 'PUBLIC_NAMES_PER_SHIP', 'PUBLIC_CARD_ENTRIES', 'PUBLIC_CARD_BODY']],
        [sectorCore, ['SUBSECTOR_LETTERS']],
        [builderCore, ['builderPairReady']],
        [place, ['HEX_SIZE', 'ROW_STEP', 'SECTOR_COLS', 'SECTOR_ROWS', 'PlaceError', 'placeCells', 'placeKeys']],
        [orbitAu, ['mgt2eAuToOrbit', 'mgt2eOrbitToAu']],
    ];
    for (const [mod, names] of pairs) {
        for (const name of names) {
            assert.notEqual(mod[name], undefined, name + ' missing from its subpath');
            assert.equal(barrel[name], mod[name], name + ' differs between the barrel and its subpath');
        }
    }
});

test('the helpers moved out of the schema file behave as they did', () => {
    const id = 'cr_11111111-2222-3333-4444-555555555555';
    assert.deepEqual(campaignCore.mentionsOf(`[[${id}|Voss]] and [[hex:Spinward_Marches/1910|Regina]] and [[${id}]] and [[nope]]`), [id, 'hex:Spinward_Marches/1910']);
    assert.equal(campaignCore.linkAllowed('crew', 'person', 'vessel'), true);
    assert.equal(campaignCore.linkAllowed('crew', 'vessel', 'person'), false);
    assert.equal(campaignCore.linkAllowed('nope', 'person', 'vessel'), false);
    const system = { kind: 'system', hexKey: 'Spinward_Marches/1910' };
    const records = { a: { anchor: { kind: 'record', id: 'b' } }, b: { anchor: system } };
    assert.equal(campaignCore.locate('a', records), system);
    assert.equal(campaignCore.locate('missing', records), null);
    assert.equal(builderCore.builderPairReady('MgT2E', 'top-down'), true);
    assert.equal(builderCore.builderPairReady('MgT2E', 'bottom-up'), false);
    assert.equal(sectorCore.SUBSECTOR_LETTERS.length, 16);
    // The zod enum is still built from the same list.
    assert.deepEqual(barrel.SubsectorLetter.options, [...sectorCore.SUBSECTOR_LETTERS]);
    assert.deepEqual(barrel.CampaignLinkKindName.options.length, campaignCore.LINK_KIND_NAMES.length);
});

test('the map modules that need only a helper import it from a subpath, with no runtime barrel import', () => {
    const files = [
        'campaign/journal.ts', 'campaign/place.ts', 'map/campaign_layer.ts', 'map/geometry.ts', 'map/public_games.ts',
        'workspace/build/orbit_pick.ts', 'workspace/build/scope.ts', 'workspace/build/sectors.ts', 'workspace/build/state.ts',
        'workspace/links.ts', 'workspace/market/place.ts', 'workspace/party.ts', 'workspace/places.ts',
        'workspace/public_card.ts', 'workspace/records.ts',
    ];
    for (const file of files) {
        const imports = importsOf(read(WEB, file));
        const barrelRuntime = imports.filter((item) => item.from === '@voyage/shared' && !item.type);
        assert.deepEqual(barrelRuntime, [], file + ' imports a value from the @voyage/shared barrel');
        assert.ok(imports.some((item) => item.from.startsWith('@voyage/shared/') && !item.type), file + ' has no subpath import');
    }
});

test('the shared package is marked side-effect free so the bundler drops schemas nothing imports', () => {
    const pkg = JSON.parse(read(SHARED, 'package.json'));
    assert.equal(pkg.sideEffects, false);
    // A bare `import '@voyage/shared'` would be dropped with it. None exists.
    for (const root of ['apps/web/src/', 'apps/api/src/']) {
        const stack = [new URL('../../' + root, import.meta.url)];
        while (stack.length) {
            const dir = stack.pop();
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const next = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
                if (entry.isDirectory()) { stack.push(next); continue; }
                if (!/\.(ts|vue|js)$/.test(entry.name)) continue;
                const text = fs.readFileSync(next, 'utf8');
                assert.doesNotMatch(text, /^\s*import\s+['"]@voyage\/shared/m, entry.name + ' has a bare import of the shared package');
            }
        }
    }
});