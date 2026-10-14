import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

/**
 * Fifty other prefix matches sort ahead of Regina by name alone.
 * The Spinward Marches tie-break has to keep Regina inside the 50-row cap.
 */
function searchSql(version) {
    const lines = [
        `INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, notes, manifest_hash, sectors_total, sectors_done, sectors_failed) VALUES ('${version}', '1.0.0', 'M1105', 'search', '{}', '[]', 'released', '2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00.000Z', NULL, NULL, 1, 1, '[]');`,
        `INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, allegiance, zone, tree_hash, partial) VALUES ('${version}', 'Spinward_Marches', '1910', 'Regina', 'A788899-C', NULL, NULL, NULL, NULL);`,
    ];
    for (let index = 0; index < 50; index += 1) {
        const hex = String(index + 1).padStart(4, '0');
        const name = `Rega${String(index).padStart(2, '0')}`;
        lines.push(`INSERT INTO truth_systems (version, sector_slug, hex, name, uwp, allegiance, zone, tree_hash, partial) VALUES ('${version}', 'Other', '${hex}', '${name}', 'A788899-C', NULL, NULL, NULL, NULL);`);
    }
    return lines.join('\n');
}

if (process.env.RUN_API_TESTS !== '1') {
    test('truth search order', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('truth search order', { skip: 'wrangler is absent' }, () => {});
} else {
    test('a prefix search keeps Regina in the Spinward Marches inside the cap', { timeout: 180000 }, async () => {
        const persistTo = mkdtempSync(path.join(tmpdir(), 'voyage-search-'));
        const port = 18862;
        const base = `http://127.0.0.1:${port}`;
        let child;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            if (process.env.VOYAGE_BEFORE_0013 === '1') {
                const drop = path.join(persistTo, 'drop-later.sql');
                writeFileSync(drop, 'DROP TABLE IF EXISTS object_byte_charges;\nDROP TABLE IF EXISTS public_marks;\nALTER TABLE universes DROP COLUMN public_games;\n');
                runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', drop]);
                rmSync(drop);
            }
            const version = 'vsearchorder';
            const file = path.join(persistTo, 'search.sql');
            writeFileSync(file, searchSql(version));
            runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
            rmSync(file);
            child = startDev({ port, persistTo, inspectorPort: 19862 });
            const deadline = Date.now() + 90000;
            let last = '';
            while (Date.now() < deadline) {
                try {
                    const health = await fetch(`${base}/api/health`);
                    if (health.ok) break;
                    last = `status ${health.status}`;
                } catch (err) {
                    last = err instanceof Error ? err.message : String(err);
                }
                await new Promise((resolve) => setTimeout(resolve, 400));
            }
            const ready = await fetch(`${base}/api/health`);
            if (!ready.ok) throw new Error(last || 'wrangler did not answer /api/health');
            const response = await fetch(`${base}/api/truth/search?q=${encodeURIComponent('Reg')}&version=${version}&layer=all`);
            const body = await response.json();
            assert.equal(response.status, 200, JSON.stringify(body));
            const names = body.data.items.map((item) => item.name);
            assert.equal(names.length, 50);
            assert.equal(names[0], 'Regina');
            assert.equal(body.data.items[0].sectorSlug, 'Spinward_Marches');
            assert.equal(names[1], 'Rega00');
            assert.equal(names.includes('Rega49'), false);
        } finally {
            stopDev(child?.pid);
            rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
