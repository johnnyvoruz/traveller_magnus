/**
 * DU11: the account inside the shell. `?panel=account` is a pane like the others (its address, Escape, focus);
 * /account redirects into it, keeping its query, so the recovery flow and a provider's callback keep their
 * address; a recovery session stays on the panel instead of looping; the account menu opens it over the map
 * where the map is open; the panel host mounts it; the page in its panel mode has no brand, no "Back to the
 * map" and no page ground of its own.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addressPane, atPane, escapePane, focusTarget, hostsCampaign, paneChanges } from '../../apps/web/src/shell/pane.ts';
import { session } from '../../apps/web/src/account/session.ts';
import { noteReturn, recoveryRedirect, returnPath } from '../../apps/web/src/workspace/passkey/recovery.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps', 'web', 'src', rel), 'utf8');
const HEX = '/s/Spinward_Marches/1910';

test('the account pane: its address, Escape shuts it, focus is the panel\'s own', () => {
    assert.deepEqual(addressPane('/', { panel: 'account' }).pane, { kind: 'account' });
    assert.deepEqual(addressPane(HEX, { panel: 'account' }).pane, { kind: 'account' }, 'over a hex too');
    assert.deepEqual(paneChanges({ kind: 'account' }), { panel: 'account', record: null, entry: null, character: null, batch: null, tl: null, tlType: null, tlShip: null });
    assert.deepEqual(atPane(HEX, { date: '120' }, { kind: 'account' }), { path: HEX, query: { date: '120', panel: 'account' } });
    assert.deepEqual(escapePane(HEX, { panel: 'account', date: '120' }), { path: HEX, query: { panel: 'closed', date: '120' } });
    assert.equal(focusTarget({ kind: 'dossier' }, { kind: 'account' }), 'leave');
    assert.equal(hostsCampaign({ kind: 'account' }), false);
});

test('/account redirects onto the panel and keeps its query', () => {
    const router = read('router.ts');
    assert.match(router, /\{ path: '\/account', redirect: \(to\) => accountRedirect\(to\.query\) \},/);
    assert.match(router, /return \{ path: '\/', query: withQuery\(query, \{ panel: 'account' \}\), replace: true \};/);
    assert.equal(fs.existsSync(path.join(root, 'apps', 'web', 'src', 'views', 'Account.vue')), false, 'no page of its own');
    assert.match(router, /const asked = addressPane\(path, router\.currentRoute\.value\.query\)\.pane\.kind === 'account';\s+const home = !asked && /, 'a first visit to /account gets the sign-in, not the welcome');
});

test('a recovery session goes to /account and stays on the panel it redirects to', () => {
    const was = session.gate;
    session.gate = 'recovery';
    try {
        assert.equal(recoveryRedirect(HEX), '/account');
        assert.equal(recoveryRedirect('/account'), null);
        assert.equal(recoveryRedirect('/', { panel: 'account' }), null, 'no loop: the redirect\'s target is allowed');
        assert.equal(recoveryRedirect(HEX, { panel: 'campaign' }), '/account');
    } finally {
        session.gate = was;
    }
    noteReturn(HEX + '?panel=dossier');
    noteReturn(HEX + '?panel=account');
    noteReturn('/?date=12&panel=account');
    assert.equal(returnPath(), HEX + '?panel=dossier', 'the account panel is not a place to return to');
});

test('the account menu opens the panel over the map, else the home map; the host mounts it', () => {
    const menu = read('workspace/AccountMenu.vue');
    assert.match(menu, /void router\.push\(onMap \? atPane\(route\.path, route\.query, \{ kind: 'account' \}\) : RECOVERY_PATH\);/);
    const host = read('shell/PanelHost.vue');
    assert.match(host, /<AccountPanel\s+v-if="active && accountLive && live"\s+:open="accountOpen"/);
    assert.match(host, /import\('\.\.\/workspace\/passkey\/AccountPanel\.vue'\)/);
});

test('the page in the panel: no brand, no Back to the map, no ground of its own; the same sections', () => {
    const page = read('workspace/passkey/AccountPage.vue');
    assert.match(page, /<component :is="props\.panel \? 'div' : 'main'" class="pk-page" :class="props\.panel \? 'is-panel' : 'ui-ground'">/);
    assert.match(page, /<span v-if="!props\.panel" class="ui-brand pk-brand">/);
    assert.match(page, /<RouterLink v-if="!props\.panel && phase !== 'recovery'"/);
    for (const section of ['passkeys', 'codes', 'links', 'sign-out']) assert.match(page, new RegExp(`data-account="${section}"`), section);
    assert.match(page, /<AgentAccess \/>/);
    assert.match(read('workspace/passkey/AccountPanel.vue'), /<Panel ref="panel" :open="open" title="Account"[\s\S]*<AccountPage panel \/>/);
});
