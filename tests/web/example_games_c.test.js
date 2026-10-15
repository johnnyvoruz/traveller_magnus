import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PUBLIC_DEFAULT_DAYS } from '@voyage/shared';
import { judgeUsername } from '../../apps/api/src/auth/passkey_words.ts';
import { parseHex, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { getHexDistance } from '../../packages/engines/src/core/hex.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gamesDir = path.join(root, 'tools/examples/games');
const packsDir = path.join(root, 'tools/examples/packs');
const CHART_SKIP = 'truth-local/v10 is not in this checkout';
/** Set to a missing folder to prove the chart skip without moving truth-local/. */
const sectorsDir = process.env.VOYAGE_TRUTH_SECTORS || path.join(root, 'truth-local/v10/sectors');
const chartSkip = fs.existsSync(sectorsDir) ? false : CHART_SKIP;

function dayCount(year, day) {
    return year * 365 + day - 1;
}

function words(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function sortedKeys(value) {
    return Object.keys(value).sort().join(',');
}

const sectorGrid = new Map(
    JSON.parse(fs.readFileSync(path.join(root, 'universe/raw/sectors.json'), 'utf8')).sectors.map((row) => [row.slug, row]),
);

/** Chart hexes on the engines grid, then getHexDistance. Sector x,y come from the chart catalogue. */
function apart(from, to) {
    function place(hexKey) {
        const slash = hexKey.indexOf('/');
        const slug = hexKey.slice(0, slash);
        const local = parseHex(hexKey.slice(slash + 1));
        const sector = sectorGrid.get(slug);
        assert.ok(local && sector, hexKey);
        return toGlobal(sector.x, sector.y, local.col, local.row);
    }
    const a = place(from);
    const b = place(to);
    return getHexDistance(a.q, a.r, b.q, b.r);
}

function packNames() {
    const names = [];
    for (const dir of fs.readdirSync(packsDir)) {
        const folder = path.join(packsDir, dir);
        if (!fs.statSync(folder).isDirectory()) continue;
        for (const file of ['campaign.json', 'listing.json']) {
            const full = path.join(folder, file);
            if (!fs.existsSync(full)) continue;
            const doc = JSON.parse(fs.readFileSync(full, 'utf8'));
            if (typeof doc.title === 'string') names.push(doc.title);
            for (const row of doc.records || []) names.push(row.name);
        }
    }
    return names;
}

function loadGames() {
    return fs.readdirSync(gamesDir)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => ({
            file,
            doc: JSON.parse(fs.readFileSync(path.join(gamesDir, file), 'utf8')),
        }));
}

test('the default public day uses year 1105, day 2, on 365-day years', () => {
    assert.equal(PUBLIC_DEFAULT_DAYS, 1105 * 365 + 2 - 1);
});

test('twelve example games match the public-card shape', () => {
    const games = loadGames();
    assert.equal(games.length, 12);
    const names = new Set(packNames().map((name) => name.trim().toLowerCase()));
    const handles = new Set();
    const endings = new Map();
    let shown = 0;
    let singles = 0;
    let groups = 0;
    let ships = 0;

    function claim(label) {
        const key = label.trim().toLowerCase();
        assert.equal(names.has(key), false, label);
        names.add(key);
    }

    for (const { file, doc } of games) {
        assert.equal(sortedKeys(doc), 'clockDays,game,journal,referee,ships,showReferee', file);
        assert.equal(typeof doc.game, 'string', file);
        assert.equal(typeof doc.referee, 'string', file);
        assert.equal(typeof doc.showReferee, 'boolean', file);
        assert.equal(Number.isInteger(doc.clockDays), true, file);
        assert.equal(Array.isArray(doc.ships) && Array.isArray(doc.journal), true, file);
        claim(doc.game);
        claim(doc.referee);
        const verdict = judgeUsername(doc.referee);
        assert.equal(verdict.ok, true, doc.referee);
        assert.equal(verdict.username, doc.referee, doc.referee);
        assert.equal(handles.has(doc.referee), false, doc.referee);
        handles.add(doc.referee);
        if (doc.showReferee) shown += 1;
        if (doc.ships.length === 1) singles += 1;
        else if (doc.ships.length === 2 || doc.ships.length === 3) groups += 1;
        else assert.fail(file + ' ship count');
        ships += doc.ships.length;
        assert.equal(doc.journal.length >= 1 && doc.journal.length <= 3, true, file);

        for (const note of doc.journal) {
            assert.equal(sortedKeys(note), 'body,title,when', note.title);
            assert.equal(typeof note.title, 'string', file);
            assert.equal(note.title.length > 0, true, file);
            assert.equal(typeof note.body, 'string', file);
            assert.equal(words(note.body) <= 80, true, note.title);
            assert.equal(sortedKeys(note.when), 'day,year', note.title);
            assert.equal(Number.isInteger(note.when.year) && Number.isInteger(note.when.day), true, note.title);
            assert.equal(dayCount(note.when.year, note.when.day) <= doc.clockDays, true, note.title);
            claim(note.title);
        }

        for (const ship of doc.ships) {
            assert.equal(sortedKeys(ship), 'crew,legs,name', ship.name);
            assert.equal(typeof ship.name, 'string', file);
            claim(ship.name);
            assert.equal(ship.crew.length >= 1 && ship.crew.length <= 5, true, ship.name);
            assert.equal(ship.legs.length >= 2 && ship.legs.length <= 6, true, ship.name);
            for (const person of ship.crew) {
                assert.equal(typeof person, 'string', ship.name);
                assert.equal(person.length > 0, true, ship.name);
                claim(person);
            }
            let previous = null;
            for (const leg of ship.legs) {
                assert.equal(sortedKeys(leg), 'arrives,departs,from,to', ship.name);
                assert.equal(Number.isInteger(leg.departs) && Number.isInteger(leg.arrives), true, ship.name);
                assert.equal(leg.arrives >= leg.departs, true, ship.name);
                assert.equal(leg.arrives <= doc.clockDays, true, ship.name);
                if (previous) assert.equal(leg.departs >= previous.arrives, true, ship.name);
                const distance = apart(leg.from, leg.to);
                assert.equal(distance >= 1 && distance <= 2, true, leg.from + ' ' + leg.to + ' ' + distance);
                previous = leg;
            }
            const finalHex = ship.legs[ship.legs.length - 1].to;
            if (!endings.has(finalHex)) endings.set(finalHex, new Set());
            endings.get(finalHex).add(doc.game);
        }
    }

    assert.equal(shown, 6);
    assert.equal(singles, 8);
    assert.equal(groups, 4);
    assert.equal(ships, 18);
    const stacked = [...endings.values()].filter((gamesOnHex) => gamesOnHex.size >= 2);
    assert.equal(stacked.length >= 1, true);
});

test('example game hexes are on the v10 chart', { skip: chartSkip }, () => {
    const indexes = new Map();
    function present(hexKey) {
        const slash = hexKey.lastIndexOf('/');
        assert.equal(slash > 0, true, hexKey);
        const sector = hexKey.slice(0, slash);
        const local = hexKey.slice(slash + 1);
        if (!indexes.has(sector)) {
            const file = path.join(sectorsDir, sector, 'index.json');
            indexes.set(sector, JSON.parse(fs.readFileSync(file, 'utf8')));
        }
        const world = indexes.get(sector).hexes[local];
        assert.equal(world && world.type, 'SYSTEM_PRESENT', hexKey);
    }
    for (const { doc } of loadGames()) {
        for (const ship of doc.ships) {
            for (const leg of ship.legs) {
                present(leg.from);
                present(leg.to);
            }
        }
    }
});
