/**
 * BU26: the same HTML tag rewrite as L5, for /join/<token> and /ship/<mark>.
 * A crawler that prefers HTML gets the card. Anyone else gets the page unchanged.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runWrangler } from './session.js';
import { startDev, stopDev, wranglerBin } from './server.js';

const MARK = 'pm_0123456789ABCDEFGHJKMNPQRS';
const CLASS_MARK = 'pm_0123456789ABCDEFGHJKMNPQRT';
const MEMBER = 'Nora Member';
const SHIP = 'Beowulf';
const CLASSED = 'Empress';
const SHIP_CLASS = 'Free Trader';
const CAMPAIGN = 'Pilot Run';

function hash(token) {
    return createHash('sha256').update(token).digest('hex');
}

function sqlFile(persistTo, sql) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-sql-')), 'query.sql');
    writeFileSync(file, sql);
    runWrangler(['d1', 'execute', 'voyage', '--local', '--persist-to', persistTo, '--file', file]);
}

function r2Put(persistTo, key, text) {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'voyage-r2-')), 'body');
    writeFileSync(file, text);
    runWrangler(['r2', 'object', 'put', `voyage-public/${key}`, '--file', file, '--local', '--persist-to', persistTo]);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function up(url) {
    const deadline = Date.now() + 90000;
    let last = '';
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${url}/api/health`);
            if (response.ok) return;
            last = `status ${response.status}`;
        } catch (err) {
            last = err instanceof Error ? err.message : String(err);
        }
        await sleep(500);
    }
    throw new Error(last || 'wrangler dev did not answer /api/health');
}

if (process.env.RUN_API_TESTS !== '1') {
    test('join and ship unfurl', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('join and ship unfurl', { skip: 'wrangler is absent' }, () => {});
} else {
    test('join and ship unfurl', { timeout: 180000 }, async () => {
        const ownedPersist = !process.env.VOYAGE_PERSIST_TO;
        const persistTo = process.env.VOYAGE_PERSIST_TO || mkdtempSync(path.join(tmpdir(), 'voyage-unfurl-'));
        const port = Number(process.env.VOYAGE_API_PORT || 18915);
        const inspectorPort = Number(process.env.VOYAGE_INSPECTOR_PORT || 19915);
        const base = `http://127.0.0.1:${port}`;
        let child = null;
        try {
            runWrangler(['d1', 'migrations', 'apply', 'voyage', '--local', '--persist-to', persistTo]);
            const stamp = Date.now();
            const version = `unf${stamp}`;
            const when = new Date(stamp).toISOString();
            const later = new Date(stamp + 30 * 24 * 60 * 60 * 1000).toISOString();
            const earlier = new Date(stamp - 60 * 1000).toISOString();
            const live = 'live-token-unfurl';
            const ended = 'ended-token-unfurl';
            sqlFile(persistTo, `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('unf-owner', 'unf-owner', 'unf-owner@localhost', 1, ${stamp}, ${stamp}, 'user', 0);
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('unf-member', '${MEMBER}', 'unf-member@localhost', 1, ${stamp}, ${stamp}, 'user', 0);
INSERT INTO profile (user_id, handle, display_name, created_at)
VALUES ('unf-owner', 'unfowner', 'Owner', '${when}');
INSERT INTO profile (user_id, handle, display_name, created_at)
VALUES ('unf-member', 'noramember', '${MEMBER}', '${when}');
INSERT INTO universes (id, owner_id, name, slug, engine_version, edition_default, created_at, updated_at, public_games)
VALUES ('uni-unf', 'unf-owner', '${CAMPAIGN}', 'unf', '1.2.0', 'MgT2E', '${when}', '${when}', 1);
INSERT INTO universe_members (universe_id, user_id, role, person_id, status, archived_at, archived_by, created_at)
VALUES ('uni-unf', 'unf-member', 'player', NULL, 'active', NULL, NULL, '${when}');
INSERT INTO universe_invites (id, universe_id, token, token_hash, role, expires_at, revoked_at, uses, created_at)
VALUES ('ui-live', 'uni-unf', '${live}', '${hash(live)}', 'player', '${later}', NULL, 1, '${when}');
INSERT INTO universe_invites (id, universe_id, token, token_hash, role, expires_at, revoked_at, uses, created_at)
VALUES ('ui-ended', 'uni-unf', NULL, '${hash(ended)}', 'player', '${earlier}', '${when}', 2, '${when}');
INSERT INTO truth_versions (version, engine_version, milieu, seed, settings, sectors, state, started_at, released_at, sectors_total, sectors_done, sectors_failed)
VALUES ('${version}', '1.2.0', 'M1105', 'TravellerMagnus', '{}', '[]', 'released', '${when}', '${when}', 0, 0, '[]');
INSERT INTO public_ships (mark_id, universe_id, truth_version, sector_slug, local_hex, ship_name, aboard_names, updated_at)
VALUES ('${MARK}', 'uni-unf', '${version}', 'Spinward_Marches', '1910', '${SHIP}', '["${MEMBER}"]', '${when}');
INSERT INTO public_ships (mark_id, universe_id, truth_version, sector_slug, local_hex, ship_name, ship_class, aboard_names, updated_at)
VALUES ('${CLASS_MARK}', 'uni-unf', '${version}', 'Spinward_Marches', '1910', '${CLASSED}', '${SHIP_CLASS}', '["${MEMBER}"]', '${when}');
`);
            r2Put(persistTo, `truth/${version}/sectors/Spinward_Marches/index.json`, JSON.stringify({
                name: 'Spinward Marches',
                hexes: { '1910': { name: 'Regina', uwp: 'A788899-C' } },
            }));
            child = startDev({ port, persistTo, inspectorPort });
            await up(base);
            const html = { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' };

            const livePage = await fetch(`${base}/join/${live}`, { headers: html });
            const liveText = await livePage.text();
            assert.equal(livePage.status, 200);
            assert.match(liveText, new RegExp(`<title>You're invited to ${CAMPAIGN}</title>`));
            assert.match(liveText, new RegExp(`og:title" content="You're invited to ${CAMPAIGN}"`));
            assert.match(liveText, /property="og:image" content="https:\/\/traveller.voyage\/og.png"/);
            assert.equal(liveText.includes(MEMBER), false);
            assert.equal(liveText.includes(live), false);

            const quiet = await fetch(`${base}/join/${live}`, { headers: { accept: 'application/json' } });
            const quietText = await quiet.text();
            assert.equal(quietText.includes(CAMPAIGN), false);
            assert.match(quietText, /<title>Traveller\.voyage<\/title>/);

            const endedPage = await fetch(`${base}/join/${ended}`, { headers: html });
            const endedText = await endedPage.text();
            assert.equal(endedPage.status, 200);
            assert.match(endedText, /<title>This invitation has ended<\/title>/);
            assert.equal(endedText.includes(CAMPAIGN), false);
            assert.equal(endedText.includes(MEMBER), false);

            const missing = await fetch(`${base}/join/nobody-stored-this`, { headers: html });
            const missingText = await missing.text();
            assert.equal(missing.status, 200);
            assert.match(missingText, /<title>This invitation has ended<\/title>/);

            const shipPage = await fetch(`${base}/ship/${MARK}`, { headers: html });
            const shipText = await shipPage.text();
            assert.equal(shipPage.status, 200);
            assert.match(shipText, new RegExp(`<title>${SHIP}</title>`));
            assert.match(shipText, new RegExp(`${SHIP} at Regina, Spinward Marches`));
            assert.equal(shipText.includes(`${SHIP},`), false);
            assert.match(shipText, /property="og:image" content="https:\/\/traveller.voyage\/og.png"/);
            assert.equal(shipText.includes('/objects/'), false);
            assert.equal(shipText.includes(MEMBER), false);
            assert.equal(shipText.includes('noramember'), false);

            const classedPage = await fetch(`${base}/ship/${CLASS_MARK}`, { headers: html });
            const classedText = await classedPage.text();
            assert.equal(classedPage.status, 200);
            assert.match(classedText, new RegExp(`<title>${CLASSED}</title>`));
            assert.match(classedText, new RegExp(`${CLASSED}, ${SHIP_CLASS}, at Regina, Spinward Marches`));
            assert.equal(classedText.includes(MEMBER), false);
        } finally {
            stopDev(child?.pid);
            if (ownedPersist) rmSync(persistTo, { recursive: true, force: true });
        }
    });
}
