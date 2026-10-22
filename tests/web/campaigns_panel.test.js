/**
 * DU10 (UX backlog U10): the account menu becomes a Campaigns panel. `?panel=campaigns` is a pane of its
 * own; the referee's campaigns are cards there, with their actions and switches; the account menu keeps
 * the person: who, Campaigns…, Characters, My packages, Account and sign-in, Help, this device, Sign out.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { addressPane, atPane, escapePane, focusTarget } from '../../apps/web/src/shell/pane.ts';

test('the pane: ?panel=campaigns opens it, Escape shuts it, and it puts focus itself', () => {
    assert.deepEqual(addressPane('/', { panel: 'campaigns' }).pane, { kind: 'campaigns' });
    assert.deepEqual(addressPane('/s/Spinward_Marches/1910', { panel: 'campaigns' }).pane, { kind: 'campaigns' });
    assert.deepEqual(atPane('/', { record: 'cr_x', x: '1' }, { kind: 'campaigns' }).query, { x: '1', panel: 'campaigns' });
    assert.deepEqual(escapePane('/', { panel: 'campaigns' }).query, { panel: 'closed' });
    assert.equal(focusTarget({ kind: 'shut' }, { kind: 'campaigns' }), 'leave');
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the account menu keeps the person; the campaign actions and switches have gone to the panel', () => {
    const menu = read('workspace/AccountMenu.vue');
    const template = menu.slice(menu.indexOf('<template>'), menu.indexOf('<style>'));
    const order = ['data-command="campaigns"', 'data-command="characters"', 'class="account-packages"', 'data-command="account-page"', 'data-command="help"', '<LivingSettings part="device"', 'data-command="sign-out"'];
    let last = -1;
    for (const item of order) {
        const at = template.indexOf(item);
        assert.ok(at > last, item);
        last = at;
    }
    for (const gone of ['data-command="public-games"', 'Import into', 'account-delete', 'account-rename', 'account-new', 'Go to the party']) {
        assert.equal(template.includes(gone), false, gone);
    }
    assert.match(menu, /if \(pane\.kind !== 'campaigns'\) void router\.push\(atPane\(route\.path, route\.query, \{ kind: 'campaigns' \}\)\);/);
});

test('the panel: a card a campaign; the open one with its facts, actions and switches folded under Settings', () => {
    const panel = read('workspace/CampaignsPanel.vue');
    assert.match(panel, /<Panel ref="panel" :open="open" title="Campaigns"/);
    assert.match(panel, /<article class="cps-card ui-frame" :class="\{ 'is-open': item\.id === campaign\.universeId \}"/);
    assert.match(panel, /data-campaign-facts>\{\{ openFacts\.join\(' · '\) \}\}<\/p>/);
    assert.match(panel, /Changed <span class="ui-date">\{\{ dateWords\(item\.updatedAt\) \}\}<\/span>/);
    for (const action of ['data-campaign-records', 'data-campaign-rename', 'data-campaign-export', 'data-campaign-delete', 'data-campaign-open', 'data-campaign-new']) {
        assert.ok(panel.includes(action), action);
    }
    // Delete asks once, in the app's one confirm (DU23).
    assert.match(panel, /<AskModal\s+v-if="mode === 'delete' && openOne"\s+:title="'Delete ' \+ openOne\.name \+ '\?'"\s+:text="question"\s+confirm="Delete"\s+cancel-label="Keep it"\s+danger/);
    assert.match(panel, /<details class="cps-back" data-campaign-settings>\s+<summary>Settings<\/summary>/);
    assert.match(panel, /<LivingSettings part="campaign" :can-change="!!openOne" :busy="busy" \/>/);
    const host = read('shell/PanelHost.vue');
    assert.match(host, /<CampaignsPanel\s+v-if="active && campaignsLive && live"\s+:open="campaignsOpen"/);
});
