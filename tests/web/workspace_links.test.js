/**
 * Connections (apps/web/src/workspace/links.ts and actions.ts): worded from each end out
 * of the shared vocabulary, the kinds two records may be joined by, the changes sent, undo,
 * and what a record's delete takes with it. The store's index answers the backlinks.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_LINK_KINDS, CampaignLink, LinkChange } from '@voyage/shared';
import { rebuildCampaignIndex } from '../../apps/web/src/campaign/index.ts';
import { pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { clearToasts, toasts } from '../../apps/web/src/shell/toast.ts';
import {
    addLink, createRecord, deleteRecord, forgetDeleted, removeLink, restoreLink, restoreRecord, saveRecord, setLinkRole,
} from '../../apps/web/src/workspace/actions.ts';
import {
    alreadyLinked, cleanRole, connectionsOf, createdLink, editedLink, groupConnections, kindChoices, labelFor, linksTouching,
    newLink, pickRecords, recordsAboard, removedLink, restoredLink, ROLE_MAX,
} from '../../apps/web/src/workspace/links.ts';
import { newRecord, placeLine } from '../../apps/web/src/workspace/records.ts';

const STAMP = '2026-10-05T12:00:00.000Z';
const rid = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const lid = (n) => 'cl_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';
const make = (n, type, name, over = {}) => ({ ...newRecord(type, rid(n), STAMP), name, rev: 1, ...over });
const byId = (list) => Object.fromEntries(list.map((row) => [row.id, row]));

const VOSS = make(1, 'person', 'Captain Idris Voss');
const SHIP = make(2, 'vessel', 'Far Margin');
const SOL = make(3, 'person', 'Broker Hana Sol');
const JOB = make(4, 'job', 'Canister for Hefry');
const GUILD = make(5, 'organization', 'Regina Traders');
const GONE = make(6, 'person', 'Nobody', { deleted: true });

test('each end has its own words, from the vocabulary', () => {
    assert.equal(labelFor('commands', true), 'Commands');
    assert.equal(labelFor('commands', false), 'Commanded by');
    assert.equal(labelFor('ally', true), 'Ally');
    assert.equal(labelFor('ally', false), 'Ally');
    assert.equal(labelFor('nonsense', true), 'nonsense');
    for (const row of CAMPAIGN_LINK_KINDS) {
        assert.equal(labelFor(row.kind, true), row.labelFrom);
        assert.equal(labelFor(row.kind, false), row.labelTo);
    }
});

test('the kinds two records may be joined by, worded from this side, each once', () => {
    const personToShip = kindChoices('person', 'vessel');
    assert.deepEqual(personToShip.map((c) => [c.kind, c.outward, c.label]), [
        ['owns', true, 'Owns'], ['crew', true, 'Crew of'], ['passenger', true, 'Passenger on'], ['commands', true, 'Commands'],
    ]);
    const shipToPerson = kindChoices('vessel', 'person');
    assert.deepEqual(shipToPerson.map((c) => [c.kind, c.outward, c.label]), [
        ['owns', false, 'Owned by'], ['crew', false, 'Crew'], ['passenger', false, 'Passengers'], ['commands', false, 'Commanded by'],
    ]);
    // A symmetric kind is offered once, outward.
    const allies = kindChoices('person', 'person').filter((c) => c.kind === 'ally');
    assert.deepEqual(allies, [{ kind: 'ally', outward: true, label: 'Ally' }]);
    assert.deepEqual(kindChoices('job', 'person').map((c) => c.label), ['Patron', 'Client', 'Concerns']);
    assert.deepEqual(kindChoices('person', 'job').map((c) => c.label), ['Patron of', 'Client of', 'Subject of']);
    assert.deepEqual(kindChoices('item', 'note'), [], 'the vocabulary has no kind for this pair');
    // Every choice is one the vocabulary allows in the direction it says.
    for (const a of ['person', 'vessel', 'job', 'event', 'item']) for (const b of ['person', 'vessel', 'organization', 'job', 'event']) {
        for (const choice of kindChoices(a, b)) {
            const row = CAMPAIGN_LINK_KINDS.find((item) => item.kind === choice.kind);
            const [from, to] = choice.outward ? [a, b] : [b, a];
            assert.ok(row.fromTypes.includes(from) && row.toTypes.includes(to), a + ' ' + b + ' ' + choice.kind);
        }
    }
});

test('a new link is a whole, valid row; the changes sent; the role cleaned', () => {
    const outward = newLink(lid(1), VOSS.id, SHIP.id, { kind: 'commands', outward: true, label: 'Commands' }, '  Master  ', STAMP);
    assert.equal(CampaignLink.safeParse(outward).success, true);
    assert.deepEqual([outward.from, outward.to, outward.kind, outward.role, outward.rev], [VOSS.id, SHIP.id, 'commands', 'Master', 0]);
    const inward = newLink(lid(2), SHIP.id, VOSS.id, { kind: 'crew', outward: false, label: 'Crew' }, '', STAMP);
    assert.deepEqual([inward.from, inward.to], [VOSS.id, SHIP.id], 'an inward choice puts this record at the to end');
    assert.equal(LinkChange.safeParse(createdLink(outward)).success, true);
    assert.equal(createdLink(outward).baseRev, 0);
    const held = { ...outward, rev: 3 };
    const edit = editedLink(held, { role: ' First  officer ' }, '2026-10-06T00:00:00.000Z');
    assert.deepEqual([edit.role, edit.baseRev, edit.rev, edit.updatedAt], ['First officer', 3, 3, '2026-10-06T00:00:00.000Z']);
    assert.deepEqual(removedLink(held), { id: lid(1), baseRev: 3, deleted: true });
    const back = restoredLink({ ...held, deleted: true, rev: 4 }, STAMP);
    assert.deepEqual([back.deleted, back.baseRev], [false, 4]);
    assert.equal(cleanRole('x'.repeat(200)).length, ROLE_MAX);
});

test('a record page reads its connections from the index, worded from its side, live ends only', () => {
    const records = byId([VOSS, SHIP, SOL, JOB, GUILD, GONE]);
    const links = byId([
        newLink(lid(1), VOSS.id, SHIP.id, { kind: 'commands', outward: true, label: '' }, 'Master', STAMP),
        newLink(lid(2), SOL.id, SHIP.id, { kind: 'crew', outward: true, label: '' }, 'Purser', STAMP),
        newLink(lid(3), VOSS.id, SOL.id, { kind: 'contact', outward: true, label: '' }, '', STAMP),
        newLink(lid(4), VOSS.id, JOB.id, { kind: 'patron', outward: false, label: '' }, '', STAMP),
        newLink(lid(5), VOSS.id, GONE.id, { kind: 'ally', outward: true, label: '' }, '', STAMP),
        { ...newLink(lid(6), VOSS.id, GUILD.id, { kind: 'member', outward: true, label: '' }, '', STAMP), deleted: true },
    ]);
    rebuildCampaignIndex(records, links);
    const words = (id) => connectionsOf(id, records, links).map((c) => c.label + ' · ' + c.other.name + (c.link.role ? ' · ' + c.link.role : ''));
    assert.deepEqual(words(VOSS.id), ['Commands · Far Margin · Master', 'Contact · Broker Hana Sol', 'Patron · Canister for Hefry']);
    assert.deepEqual(words(SHIP.id), ['Crew · Broker Hana Sol · Purser', 'Commanded by · Captain Idris Voss · Master']);
    assert.deepEqual(words(SOL.id), ['Crew of · Far Margin · Purser', 'Contact · Captain Idris Voss']);
    assert.deepEqual(words(JOB.id), ['Patron of · Captain Idris Voss']);
    assert.deepEqual(words(GONE.id), [], 'a deleted record has no page');
    const groups = groupConnections(connectionsOf(SHIP.id, records, links));
    assert.deepEqual(groups.map((g) => [g.label, g.items.length]), [['Crew', 1], ['Commanded by', 1]]);
    assert.equal(alreadyLinked(connectionsOf(VOSS.id, records, links), SHIP.id, 'commands'), true);
    assert.equal(alreadyLinked(connectionsOf(VOSS.id, records, links), SHIP.id, 'crew'), false);
    // What a delete takes with it: every link of the record that is not already a tombstone.
    assert.deepEqual(linksTouching(VOSS.id, links).map((l) => l.id).sort(), [lid(1), lid(3), lid(4), lid(5)]);
});

test('aboard: a record anchored on a vessel is wherever it is, and the vessel lists it', () => {
    const ship = make(2, 'vessel', 'Far Margin', { anchor: { kind: 'system', hexKey: 'Spinward_Marches/2007', locationLabel: 'Roup' } });
    const voss = make(1, 'person', 'Captain Idris Voss', { anchor: { kind: 'record', id: ship.id } });
    const stray = make(7, 'item', 'Crate', { anchor: { kind: 'record', id: rid(99) } });
    const records = byId([ship, voss, stray, SOL]);
    assert.deepEqual(recordsAboard(ship.id, records).map((r) => r.name), ['Captain Idris Voss']);
    assert.deepEqual(recordsAboard(SOL.id, records), []);
    assert.equal(placeLine(voss, records), 'Aboard Far Margin');
    assert.equal(placeLine(voss), 'With another record');
    assert.equal(placeLine(stray, records), 'With another record');
});

test('the picker: live records of the types asked, matching the words, never the record itself', () => {
    const records = byId([VOSS, SHIP, SOL, JOB, GONE]);
    assert.deepEqual(pickRecords(records, '', { exclude: VOSS.id }).map((r) => r.name), ['Broker Hana Sol', 'Canister for Hefry', 'Far Margin']);
    assert.deepEqual(pickRecords(records, 'sol').map((r) => r.name), ['Broker Hana Sol']);
    assert.deepEqual(pickRecords(records, '', { types: ['vessel'] }).map((r) => r.name), ['Far Margin']);
    assert.deepEqual(pickRecords(records, 'nobody'), []);
    assert.equal(pickRecords(records, '', { cap: 2 }).length, 2);
});

test('add, word, remove and undo a connection against the store; a delete takes the links and an undo brings them back', () => {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    resetCampaign();
    forgetDeleted();
    clearToasts();
    transport.schedule = () => () => {};
    campaign.universeId = 'un_test';
    campaign.status = 'ready';
    const voss = createRecord('person');
    const ship = createRecord('vessel');
    saveRecord(voss, { name: 'Voss' });
    saveRecord(ship, { name: 'Far Margin' });

    assert.equal(addLink(voss, voss, { kind: 'ally', outward: true, label: 'Ally' }, ''), null, 'not to itself');
    const linkId = addLink(ship, voss, { kind: 'commands', outward: false, label: 'Commanded by' }, 'Master');
    assert.match(linkId, /^cl_/);
    assert.deepEqual([campaign.links[linkId].from, campaign.links[linkId].to, campaign.links[linkId].role], [voss, ship, 'Master']);
    assert.deepEqual(connectionsOf(voss, campaign.records, campaign.links).map((c) => c.label), ['Commands']);
    assert.deepEqual(connectionsOf(ship, campaign.records, campaign.links).map((c) => c.label), ['Commanded by']);
    assert.equal(pending.value, true);

    assert.equal(setLinkRole(linkId, 'Master'), false, 'unchanged sends nothing');
    assert.equal(setLinkRole(linkId, ' Owner-aboard '), true);
    assert.equal(campaign.links[linkId].role, 'Owner-aboard');

    clearToasts();
    assert.equal(removeLink(linkId), true);
    assert.equal(campaign.links[linkId].deleted, true);
    assert.deepEqual(connectionsOf(voss, campaign.records, campaign.links), []);
    assert.equal(toasts[0].message, 'Removed the connection between Voss and Far Margin.');
    toasts[0].action.run();
    assert.equal(campaign.links[linkId].deleted, false);
    assert.equal(restoreLink(linkId), false, 'it is back already');

    // The record goes: the toast counts the connection; the page of the other end shows none; undo brings both back.
    clearToasts();
    deleteRecord(voss);
    assert.equal(toasts[0].message, 'Deleted Voss and one connection.');
    assert.deepEqual(connectionsOf(ship, campaign.records, campaign.links), [], 'the other end is gone');
    restoreRecord(voss);
    assert.equal(campaign.records[voss].deleted, false);
    assert.deepEqual(connectionsOf(ship, campaign.records, campaign.links).map((c) => c.other.name), ['Voss']);

    // Aboard: the anchor names the vessel; the vessel lists the person; the list line says so.
    saveRecord(voss, { anchor: { kind: 'record', id: ship } });
    assert.deepEqual(recordsAboard(ship, campaign.records).map((r) => r.id), [voss]);
    assert.equal(placeLine(campaign.records[voss], campaign.records), 'Aboard Far Margin');
    resetCampaign();
});
