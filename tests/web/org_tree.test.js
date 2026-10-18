/**
 * DU40 (UX backlog U40): the org chart. Organizations under the organization they are a member of,
 * headed by who commands them, with their members; one parent each, a loop cut, the rest "Also in".
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { orgForest } from '../../apps/web/src/workspace/web/org_tree.ts';

const record = (id, type, name, deleted = false) => ({ id, type, name, deleted });
let n = 0;
const link = (from, to, kind, role = '', order = 0, deleted = false) => ({ id: 'cl_' + String(++n).padStart(3, '0'), from, to, kind, role, order, deleted });
const rows = (...list) => Object.fromEntries(list.map((item) => [item.id, item]));

const records = rows(
    record('cr_guild', 'organization', 'Glass Hand'),
    record('cr_cell', 'organization', 'Harbour Cell'),
    record('cr_bank', 'organization', 'Regina Bank'),
    record('cr_lone', 'organization', 'Lone Office'),
    record('cr_mara', 'person', 'Mara Vell'),
    record('cr_ivo', 'person', 'Ivo Penn'),
    record('cr_sel', 'person', 'Sel Ard'),
    record('cr_ship', 'vessel', 'Quiet Keel'),
    record('cr_gone', 'person', 'Gone Man', true),
);

test('the tree: a cell under its guild; who commands it heads it; members by name; deleted ones gone', () => {
    n = 0;
    const links = rows(
        link('cr_cell', 'cr_guild', 'member'),
        link('cr_mara', 'cr_guild', 'commands', 'grandmaster'),
        link('cr_mara', 'cr_guild', 'member'),
        link('cr_sel', 'cr_guild', 'member', 'fixer'),
        link('cr_ivo', 'cr_cell', 'member'),
        link('cr_ship', 'cr_cell', 'member'),
        link('cr_gone', 'cr_cell', 'member'),
        link('cr_ivo', 'cr_bank', 'member', '', 0, true),
    );
    const roots = orgForest(records, links);
    assert.deepEqual(roots.map((org) => org.name), ['Glass Hand', 'Lone Office', 'Regina Bank']);
    const guild = roots[0];
    assert.deepEqual(guild.leaders, [{ id: 'cr_mara', name: 'Mara Vell', type: 'person', role: 'grandmaster' }]);
    assert.deepEqual(guild.members.map((m) => [m.name, m.role]), [['Sel Ard', 'fixer']], 'a commander is not listed again as a member');
    assert.deepEqual(guild.children.map((org) => org.name), ['Harbour Cell']);
    assert.deepEqual(guild.children[0].members.map((m) => m.name), ['Ivo Penn', 'Quiet Keel']);
    assert.deepEqual(roots[2].members, [], 'a deleted link is gone');
});

test('two parents: the first by order is the branch, the other is "Also in"; a loop is cut', () => {
    n = 0;
    const links = rows(
        link('cr_cell', 'cr_bank', 'member', '', 2),
        link('cr_cell', 'cr_guild', 'member', '', 1),
        link('cr_guild', 'cr_lone', 'member'),
        link('cr_lone', 'cr_guild', 'member'),
    );
    const roots = orgForest(records, links);
    const all = [];
    const walk = (list) => { for (const org of list) { all.push(org.name); walk(org.children); } };
    walk(roots);
    assert.equal(all.length, 4, 'every organization drawn once');
    assert.equal(new Set(all).size, 4);
    const find = (list, name) => { for (const org of list) { if (org.name === name) return org; const hit = find(org.children, name); if (hit) return hit; } return null; };
    const cell = find(roots, 'Harbour Cell');
    assert.deepEqual(cell.alsoIn.map((org) => org.name), ['Regina Bank']);
    assert.ok(find(find(roots, 'Glass Hand') ? [find(roots, 'Glass Hand')] : [], 'Harbour Cell'), 'under the guild, its first by order');
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the chart beside the web: a switch, kept on this device; each name opens its record', () => {
    const web = read('workspace/web/RelationshipWeb.vue');
    assert.match(web, /role="group" aria-label="Show the relationships as"/);
    assert.match(web, /<OrgChart v-if="mode === 'org'" @open="emit\('open', \$event\)" \/>/);
    assert.match(web, /const MODE_KEY = 'voyage\.web\.mode';/);
    const branch = read('workspace/web/OrgBranch.vue');
    assert.match(branch, /class="org-name" :data-org="node\.id" @click="emit\('open', node\.id\)"/);
    assert.match(branch, /<OrgBranch v-for="child in node\.children"/);
});
