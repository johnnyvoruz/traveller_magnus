import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CampaignPage, linkAllowed, mentionsOf } from '@voyage/shared';

const page = CampaignPage.parse(JSON.parse(readFileSync(new URL('../../tools/demo/example_campaign.json', import.meta.url), 'utf8')));
const chart = JSON.parse(readFileSync(new URL('../../truth-local/v10/sectors/Spinward_Marches/index.json', import.meta.url), 'utf8'));

const WORLDS = [
    { name: 'Jenghe', hex: '1810', uwp: 'C799663-9' },
    { name: 'Roup', hex: '2007', uwp: 'C77A9A9-7' },
    { name: 'Regina', hex: '1910', uwp: 'A788899-C' },
];

function texts(value, out = []) {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((item) => texts(item, out));
    else if (value && typeof value === 'object') Object.values(value).forEach((item) => texts(item, out));
    return out;
}

test('the example campaign matches the shared page, and every row is for players', () => {
    assert.equal(page.done, true);
    assert.equal(page.records.filter((row) => row.type === 'person').length, 5);
    assert.equal(page.records.filter((row) => row.type === 'vessel').length, 1);
    assert.equal(page.records.filter((row) => row.type === 'place').length, 3);
    assert.equal(page.records.filter((row) => row.type === 'item').length, 2);
    assert.equal(page.journal.length, 6);
    assert.equal(page.journal.filter((row) => row.kind === 'handout').length, 1);
    for (const row of [...page.records, ...page.links, ...page.journal]) {
        assert.equal(row.visibility, 'players');
        assert.equal(row.deleted, false);
    }
    assert.equal(page.settings.party.vesselIds.length, 1);
    assert.equal(page.settings.party.memberIds.length, 4);
    const ship = page.settings.party.vesselIds[0];
    assert.equal(page.links.filter((row) => row.kind === 'crew' && row.to === ship).length, 4);
    for (const id of page.settings.party.memberIds) assert.equal(page.settings.party.aboard[id], ship);
    const harun = page.records.find((row) => row.name === 'Harun Pell');
    assert.equal(page.settings.party.memberIds.includes(harun.id), false);
});

test('the three worlds are the chart, and the ship track visits them', () => {
    for (const world of WORLDS) {
        const row = chart.hexes[world.hex];
        assert.equal(row.name, world.name);
        assert.equal(row.uwp, world.uwp);
        const place = page.records.find((item) => item.type === 'place' && item.details.includes(world.uwp));
        assert.equal(place.anchor.hexKey, `Spinward_Marches/${world.hex}`);
        assert.match(place.details, new RegExp(`hex ${world.hex}`));
    }
    const ship = page.records.find((row) => row.type === 'vessel');
    const hexes = [];
    for (const leg of ship.status.track) {
        for (const end of [leg.from, leg.to]) {
            if (!hexes.includes(end.hexKey)) hexes.push(end.hexKey);
        }
    }
    assert.deepEqual(hexes, WORLDS.map((world) => `Spinward_Marches/${world.hex}`));
    const last = ship.status.track[ship.status.track.length - 1];
    assert.equal(last.to.hexKey, 'Spinward_Marches/1910');
    assert.equal(page.clock.days >= last.arrives, true);
    assert.equal(page.settings.party.anchor.hexKey, 'Spinward_Marches/1910');
});

test('links are allowed, mentions match the words, and the text states no rule', () => {
    const byId = new Map(page.records.map((row) => [row.id, row]));
    for (const link of page.links) {
        assert.equal(linkAllowed(link.kind, byId.get(link.from).type, byId.get(link.to).type), true);
    }
    for (const entry of page.journal) {
        assert.deepEqual(entry.mentions, mentionsOf(entry.body));
    }
    const spoken = texts(page).filter((line) => line !== 'referee');
    const blob = spoken.join('\n');
    assert.equal(blob.includes(':::referee'), false);
    assert.equal(blob.includes('!'), false);
    assert.equal(/\b(Cr|credits?|prices?|rolls?|dice|parsecs?|tonnage)\b/i.test(blob), false);
    assert.equal(JSON.stringify(page).includes('fuelMark'), false);
    for (const row of page.records) assert.equal(row.sheet, null);
});
