/**
 * Public games on the map (prompts/d_public_games_wire.md): the feed's lines in the map view,
 * the owner's switch in the account menu, and the sign-in card's pitch when it opens from Build.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import { SIGN_IN_FREE, SIGN_IN_PITCH, signInFrom, signInPitch } from '../../apps/web/src/workspace/account.ts';
import { _forgetPublicGames, PUBLIC_GAMES_SAY, publicGamesOf, publicGamesToast, setPublicGames } from '../../apps/web/src/workspace/public_games.ts';

const read = (file) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const answer = (status, body, calls = []) => async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};

beforeEach(() => { _forgetPublicGames(); });

test('absent is not on: a universe without the field shows no switch', () => {
    assert.equal(publicGamesOf(null), null);
    assert.equal(publicGamesOf({ id: 'uni_a' }), null);
    assert.equal(publicGamesOf({ id: 'uni_a', publicGames: false }), false);
    assert.equal(publicGamesOf({ id: 'uni_a', publicGames: true }), true);
    const menu = read('apps/web/src/workspace/AccountMenu.vue');
    assert.match(menu, /v-if="openOne && publicOn !== null"\s+type="button"\s+role="menuitemcheckbox"/);
    assert.match(menu, /:aria-checked="publicOn \? 'true' : 'false'"/);
    // The arrow keys walk the switch with the other items.
    assert.ok(menu.includes(`'[role="menuitem"], [role="menuitemcheckbox"]'`));
});

test('the switch: PATCH with { public }, the raw answer is what is shown from then on', async () => {
    const calls = [];
    assert.deepEqual(await setPublicGames('uni_a', true, answer(200, { public: true }, calls)), { ok: true, public: true });
    assert.deepEqual(calls, [{ url: '/api/universes/uni_a/public-games', method: 'PATCH', body: { public: true } }]);
    // The list this browser holds still says off; the answer wins, for that universe only.
    assert.equal(publicGamesOf({ id: 'uni_a', publicGames: false }), true);
    assert.equal(publicGamesOf({ id: 'uni_b', publicGames: false }), false);
    // A server without the setting never gains a switch from an answer.
    assert.equal(publicGamesOf({ id: 'uni_a' }), null);
    assert.deepEqual(await setPublicGames('uni_a', false, answer(200, { public: false })), { ok: true, public: false });
    assert.equal(publicGamesOf({ id: 'uni_a', publicGames: false }), false);
});

test('a refusal is said in the server’s sentence and changes nothing', async () => {
    const refusals = [
        [401, 'unauthorized', 'Sign in required.'],
        [403, 'forbidden', 'Origin check failed.'],
        [404, 'not_found', 'No such universe.'],
        [400, 'validation', 'Invalid request.'],
        [503, 'public_games_unavailable', 'Public games are not available yet.'],
    ];
    for (const [status, code, message] of refusals) {
        assert.deepEqual(await setPublicGames('uni_a', true, answer(status, { ok: false, error: { code, message } })), { ok: false, message }, String(status));
    }
    assert.equal(publicGamesOf({ id: 'uni_a', publicGames: false }), false);
    assert.deepEqual(await setPublicGames('uni_a', true, answer(500, 'not json')), { ok: false, message: 'The setting could not be saved. Try again.' });
    assert.deepEqual(await setPublicGames('uni_a', true, answer(200, { ok: true })), { ok: false, message: 'The setting could not be saved. Try again.' });
    assert.deepEqual(await setPublicGames('uni_a', true, async () => { throw new TypeError('offline'); }), { ok: false, message: 'The server could not be reached. Try again.' });
});

test('the sentence beside the switch says what other people see, and no more', () => {
    assert.equal(PUBLIC_GAMES_SAY, 'When this is on, people on the same published chart see one mark on your party’s hex, with this campaign’s name. They see nothing else.');
    assert.ok(read('apps/web/src/workspace/AccountMenu.vue').includes('id="account-public-say" class="account-say">{{ PUBLIC_GAMES_SAY }}'));
    assert.equal(publicGamesToast(true, 'Deneb run'), 'Other people on this chart now see Deneb run where your party is.');
    assert.equal(publicGamesToast(false, 'Deneb run'), 'Deneb run is no longer shown on other maps.');
});

test('the card opened from Build says what Build is; from anywhere else, today’s line', () => {
    assert.equal(signInFrom.value, null);
    assert.equal(signInPitch(null), SIGN_IN_PITCH + ' ' + SIGN_IN_FREE);
    assert.equal(signInPitch('build'), 'Sign in to use Build. It generates systems on a copy of the map that’s yours.');
    assert.ok(read('apps/web/src/workspace/passkey/SignInBody.vue').includes('{{ signInPitch(signInFrom) }}'));
    // The pop-up forgets where it was opened from when it closes.
    assert.match(read('apps/web/src/workspace/AccountMenu.vue'), /if \(!open\) signInFrom\.value = null;/);
});

test('the map view hands the feed its watch on every frame and the renderer its marks at the hex tier', () => {
    const view = read('apps/web/src/views/MapView.vue');
    assert.ok(view.includes("import { dropPublicShip, publicGamesOverlay, watchPublicGames } from '../map/public_games.ts';"));
    const frame = view.slice(view.indexOf('const drawn = renderer.draw(cam);'));
    const lines = frame.slice(0, frame.indexOf('renderer.setPublicGames') + 120);
    assert.match(lines, /signedIn: session\.user !== null,\s+truthVersion: version \? version : null,\s+sectors: drawn\.tier === 'hex' \? drawn\.sectorsOnScreen : \[\],\s+\}, onPublicGames\);/);
    // An answer is drawn by the very next frame: its ships go to the renderer before that frame draws.
    assert.match(view, /if \(publicArrived\) \{\s*publicArrived = false;\s*renderer\.setPublicGames\(publicSectors \? publicGamesOverlay\(publicSectors\) : null\);\s*\}\s*const drawn = renderer\.draw\(cam\);/);
    assert.match(view, /function onPublicGames\(\): void \{\s*publicArrived = true;\s*markDirty\(\);/);
    // The server leaves the caller's own games out: every game it sends is drawn, and no name is handed over to drop.
    assert.ok(!lines.includes('ownName'));
    assert.match(lines, /renderer\.setPublicGames\(drawn\.tier === 'hex' \? publicGamesOverlay\(drawn\.sectorsOnScreen\) : null\);/);
});
