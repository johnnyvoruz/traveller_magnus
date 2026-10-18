/**
 * DU39 (UX backlog U39): the relationship web. The graph the filter keeps, the layout (deterministic,
 * inside the unit square, joined records nearer than strangers), the tones, and the address.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { declutter, edgeTone, layoutWeb, webChoices, webGraph, webGroups } from '../../apps/web/src/workspace/web/web_layout.ts';
import { addressPane, escapePane, hostsCampaign, paneChanges } from '../../apps/web/src/shell/pane.ts';
import { campaignCrumb } from '../../apps/web/src/workspace/crumb.ts';

const record = (id, type, name, deleted = false) => ({ id, type, name, deleted, anchor: null });
const link = (id, from, to, kind, deleted = false) => ({ id, from, to, kind, deleted });
const records = {
    cr_a: record('cr_a', 'person', 'Ara Silt'),
    cr_b: record('cr_b', 'vessel', 'Bright Ledger'),
    cr_c: record('cr_c', 'organization', 'Cold Guild'),
    cr_d: record('cr_d', 'person', 'Dane Voss'),
    cr_e: record('cr_e', 'person', 'Eli Gone', true),
    cr_f: record('cr_f', 'place', 'Far Dock'),
};
const links = {
    cl_1: link('cl_1', 'cr_a', 'cr_b', 'crew'),
    cl_2: link('cl_2', 'cr_a', 'cr_c', 'member'),
    cl_3: link('cl_3', 'cr_d', 'cr_c', 'rival'),
    cl_4: link('cl_4', 'cr_e', 'cr_c', 'member'),
    cl_5: link('cl_5', 'cr_d', 'cr_a', 'enemy', true),
    cl_6: link('cl_6', 'cr_c', 'cr_a', 'member'),
};
const all = { types: null, kinds: null };

test('the graph: linked, live records only; a deleted record or link is gone; a record with no link is not drawn', () => {
    const graph = webGraph(records, links, all);
    assert.deepEqual(graph.nodes.map((node) => node.id), ['cr_a', 'cr_b', 'cr_c', 'cr_d']);
    assert.deepEqual(graph.edges.map((edge) => edge.id), ['cl_1', 'cl_2', 'cl_3'], 'the same two records joined twice in one kind are one edge');
    assert.equal(graph.nodes.find((node) => node.id === 'cr_a').degree, 2);
});

test('the filter: by record type and by link kind; the choices are what the links use', () => {
    assert.deepEqual(webChoices(records, links), { types: ['organization', 'person', 'vessel'], kinds: ['crew', 'member', 'rival'] });
    const people = webGraph(records, links, { types: new Set(['person', 'organization']), kinds: null });
    assert.deepEqual(people.nodes.map((node) => node.id), ['cr_a', 'cr_c', 'cr_d']);
    const foes = webGraph(records, links, { types: null, kinds: new Set(['rival']) });
    assert.deepEqual(foes.nodes.map((node) => node.id), ['cr_c', 'cr_d']);
    assert.equal(webGraph(records, links, { types: null, kinds: new Set() }).nodes.length, 0);
});

test('the layout: the same every time, inside the square, joined records nearer than strangers', () => {
    const one = layoutWeb(webGraph(records, links, all));
    const two = layoutWeb(webGraph(records, links, all));
    assert.deepEqual(one, two);
    for (const node of one.nodes) {
        assert.ok(node.x >= 0 && node.x <= 1 && node.y >= 0 && node.y <= 1, node.id);
    }
    const at = (id) => one.nodes.find((node) => node.id === id);
    const gap = (a, b) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
    assert.ok(gap('cr_a', 'cr_b') < gap('cr_b', 'cr_d'), 'crewmate nearer than a stranger');
    const single = layoutWeb({ nodes: [{ id: 'x', name: 'X', type: 'person', degree: 0, x: 0, y: 0 }], edges: [] });
    assert.deepEqual([single.nodes[0].x, single.nodes[0].y], [0.5, 0.5]);
});

test('groups are laid out apart: a crew and a stranger pair never share a cell', () => {
    const many = {
        cr_a: record('cr_a', 'person', 'A'), cr_b: record('cr_b', 'vessel', 'B'), cr_c: record('cr_c', 'person', 'C'),
        cr_x: record('cr_x', 'person', 'X'), cr_y: record('cr_y', 'person', 'Y'),
    };
    const joins = { cl_1: link('cl_1', 'cr_a', 'cr_b', 'crew'), cl_2: link('cl_2', 'cr_c', 'cr_b', 'crew'), cl_3: link('cl_3', 'cr_x', 'cr_y', 'ally') };
    const graph = webGraph(many, joins, all);
    assert.deepEqual(webGroups(graph).map((group) => group.map((i) => graph.nodes[i].id)), [['cr_a', 'cr_b', 'cr_c'], ['cr_x', 'cr_y']]);
    const wide = layoutWeb(graph, 2);
    const at = (id) => wide.nodes.find((node) => node.id === id);
    const crewRight = Math.max(at('cr_a').x, at('cr_b').x, at('cr_c').x);
    assert.ok(Math.min(at('cr_x').x, at('cr_y').x) > crewRight, 'on a wide stage the second group sits to the right of the first');
});

test('names that cover each other are pushed apart and kept on the stage', () => {
    const boxes = [{ x: 100, y: 100, w: 120, h: 26 }, { x: 110, y: 104, w: 120, h: 26 }, { x: 500, y: 300, w: 80, h: 26 }];
    const out = declutter(boxes, 400, 200);
    const overlap = (a, b) => Math.min(a.x - a.h / 2 + a.w, b.x - b.h / 2 + b.w) - Math.max(a.x - a.h / 2, b.x - b.h / 2) > 0
        && Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2) > 0;
    assert.equal(overlap(out[0], out[1]), false);
    assert.ok(out[2].x - out[2].h / 2 + out[2].w <= 400 - 12 + 1e-9 && out[2].y + out[2].h / 2 <= 200 - 12 + 1e-9, 'pulled back onto the stage');
    assert.deepEqual(declutter(boxes, 400, 200), out, 'the same every time');
});

test('the tones: friends, foes, work, and plain ties', () => {
    assert.deepEqual(['ally', 'contact', 'rival', 'enemy', 'patron', 'client', 'target', 'member', 'crew', 'involved'].map(edgeTone),
        ['friend', 'friend', 'foe', 'foe', 'work', 'work', 'work', 'plain', 'plain', 'plain']);
});

test('the address: panel=web in the Campaign panel; Escape goes back to the records; the crumb', () => {
    assert.deepEqual(addressPane('/', { panel: 'web' }).pane, { kind: 'web' });
    assert.equal(paneChanges({ kind: 'web' }).panel, 'web');
    assert.equal(hostsCampaign({ kind: 'web' }), true);
    assert.equal(escapePane('/', { panel: 'web' }).query.panel, 'campaign');
    assert.deepEqual(campaignCrumb({ level: 'web', beside: false, middle: '', pageName: '' }).map((part) => part.label), ['Campaign', 'Relationships']);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the panel: Relationships beside Timeline; a click opens the record; the locate line starts at the node', () => {
    const panel = read('workspace/CampaignPanel.vue');
    assert.match(panel, /data-open-web @click="openWeb">Relationships<\/button>/);
    assert.match(panel, /<RelationshipWeb v-else-if="onWeb" @open="go" @map="showMap" \/>/);
    const web = read('workspace/web/RelationshipWeb.vue');
    assert.match(web, /@click="emit\('open', node\.id\)"/);
    assert.match(web, /startLocate\(record\.id, place\.hexKey, \(\) => nodeY\(record\.id\)\);/);
    assert.match(web, /role="group" aria-label="Record types"/);
    assert.match(web, /role="group" aria-label="Link kinds"/);
});
