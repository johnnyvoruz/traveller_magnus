/**
 * The six checks of findings/living_systems/check_sample.mjs, over the shipped
 * lines. The draft is 100 lines. This file is 97: customs-001, customs-002 and
 * customs-003 each tie a ban to a Law Level range. Johnny, 2026-10-17 21:10:
 * no line restates a rule.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ChatterFile } from '@voyage/shared';
import { eligible } from '../../apps/web/src/living/chatter.ts';
import { corpusLines, sampleLines } from '../../apps/web/src/living/lines.ts';
import { corpusGate } from '../../apps/web/src/living/comms/corpus_events.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHIPPED = path.join(ROOT, 'apps/web/src/living/lines/sample.json');
const CATEGORIES = ['control', 'customs', 'news', 'market', 'weather', 'advert', 'ship', 'rumour', 'distress'];
const SLOTS = ['world', 'port', 'starport', 'ship', 'ship2', 'sector', 'subsector', 'date', 'gasGiant', 'belt', 'moon', 'body'];

const base = {
    hexKey: 'Test_Sector/0101', name: 'Regina', sector: 'Test Sector', subsector: 'Test',
    size: 7, atm: 6, hydro: 7, pop: 8, gov: 5, law: 4, tl: 12,
    tradeCodes: ['Ri'], zone: 'green', bases: '', highport: false,
    gasGiants: 1, belts: 1, moons: 1, otherBodies: 3, xboat: false,
    party: 'away', day: 2,
    bodies: { gasGiant: 'Regina II', belt: 'Regina Belt', moon: 'Regina-a', body: 'Regina I' },
};
const FIXTURES = [
    { ...base, starport: 'A', highport: true, bases: 'NS', xboat: true, pop: 9, tradeCodes: ['Hi', 'Ri'] },
    { ...base, starport: 'B', highport: true, bases: 'W', law: 7, tradeCodes: ['In'], atm: 4 },
    { ...base, starport: 'C', bases: 'S', pop: 6, law: 2, tradeCodes: ['Ag'] },
    { ...base, starport: 'D', pop: 4, law: 0, gov: 0, hydro: 1, atm: 3, tradeCodes: ['Po', 'Ni'], gasGiants: 0 },
    { ...base, starport: 'E', pop: 2, law: 1, gov: 1, hydro: 0, atm: 0, tradeCodes: ['Lo', 'Va'], belts: 0, moons: 0 },
    { ...base, starport: 'X', pop: 0, law: 0, gov: 0, tl: 0, tradeCodes: ['Ba'], zone: 'red', otherBodies: 0, moons: 0, belts: 0, gasGiants: 0 },
];

function resolve(text, facts, ships = ['Far Margin', 'Blue Runner']) {
    return text.replace(/\{(\w+)\}/g, (_, slot) => {
        switch (slot) {
            case 'world': return facts.name || facts.hexKey;
            case 'port': return facts.name + (facts.highport ? ' Highport' : ' Downport');
            case 'starport': return facts.starport;
            case 'ship': return ships[0];
            case 'ship2': return ships[1];
            case 'sector': return facts.sector;
            case 'subsector': return facts.subsector;
            case 'date': return String(facts.day).padStart(3, '0') + '-1105';
            case 'gasGiant': case 'belt': case 'moon': case 'body': {
                const name = facts.bodies[slot];
                if (!name) throw new Error('slot {' + slot + '} has no body');
                return name;
            }
            default: throw new Error('unknown slot {' + slot + '}');
        }
    });
}

function sixProblems(lines) {
    const problems = [];
    const fail = (id, what) => problems.push(id + ': ' + what);
    const ids = new Set();
    for (const line of lines) {
        if (ids.has(line.id)) fail(line.id, 'duplicate id');
        ids.add(line.id);
        if (!line.id.startsWith(line.category + '-')) fail(line.id, 'id does not start with its category');
    }
    for (const category of CATEGORIES) {
        if (!lines.some((line) => line.category === category)) fail('file', 'no lines in category ' + category);
    }
    const minOf = (range) => (range && range.min !== undefined ? range.min : 0);
    for (const line of lines) {
        const w = line.when;
        const slots = [...line.text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
        for (const slot of slots) if (!SLOTS.includes(slot)) fail(line.id, 'unknown slot {' + slot + '}');
        if (slots.includes('gasGiant') && minOf(w.gasGiants) < 1) fail(line.id, '{gasGiant} without gasGiants.min >= 1');
        if (slots.includes('belt') && minOf(w.belts) < 1) fail(line.id, '{belt} without belts.min >= 1');
        if (slots.includes('moon') && minOf(w.moons) < 1) fail(line.id, '{moon} without moons.min >= 1');
        if (slots.includes('body') && minOf(w.otherBodies) < 1) fail(line.id, '{body} without otherBodies.min >= 1');
        if ((slots.includes('port') || slots.includes('starport')) && (!w.starport || w.starport.includes('X'))) {
            fail(line.id, '{port} or {starport} without a starport list that excludes X');
        }
        const text = line.text;
        const codes = w.tradeCodes || [];
        const wet = codes.some((code) => ['Ag', 'Wa', 'Fl', 'Ic', 'Ga'].includes(code)) || minOf(w.hydro) >= 1;
        if (/\b(sea|ocean|tides?|fog|rain|raining)\b/i.test(text) && !wet) fail(line.id, 'water words without hydro.min >= 1 or a wet trade code');
        if (/\bhighport\b/i.test(text) && w.highport !== true) fail(line.id, 'highport words without highport true');
        if (/\b(navy|naval)\b/i.test(text) && !(w.bases && w.bases.includes('N')) && !(w.zone && w.zone.length === 1 && w.zone[0] === 'red')) {
            fail(line.id, 'navy words without bases N or zone red');
        }
        if (/\bscout/i.test(text) && !(w.bases && w.bases.some((code) => code === 'S' || code === 'W'))) fail(line.id, 'scout words without bases S or W');
        if (/\bway station\b/i.test(text) && !(w.bases && w.bases.includes('W'))) fail(line.id, 'way station without bases W');
        if (/\b(firearms|weapons|armour)\b/i.test(text) && line.category === 'customs' && !w.law) fail(line.id, 'a weapons notice without a law condition');
        if (/\bHoliday\b/.test(text) && !(w.day && w.day.min === 1 && w.day.max === 1)) fail(line.id, 'Holiday without day 1');
        if (/\bshipyard\b/i.test(text) && !(w.starport && w.starport.every((code) => code === 'A' || code === 'B' || code === 'C'))) {
            fail(line.id, 'shipyard outside starports A to C');
        }
        if (/\brefined fuel\b/i.test(text) && !(w.starport && w.starport.every((code) => code === 'A' || code === 'B'))) {
            fail(line.id, 'refined fuel outside starports A and B');
        }
        if (/\b(domes?)\b/i.test(text) && !(w.atm && w.atm.max !== undefined && w.atm.max <= 4)) fail(line.id, 'domes without atm.max <= 4');
        if (/\bcompany\b/i.test(text) && !(w.gov && w.gov.min === 1 && w.gov.max === 1)) fail(line.id, 'company words without gov 1');
        if (/\b(suit|vacc)\b/i.test(text) && line.category !== 'weather' && !(w.atm && w.atm.max !== undefined && w.atm.max <= 1)) {
            fail(line.id, 'vacc suit words without atm.max <= 1');
        }
        if (line.category === 'weather' && !w.atm && !w.tradeCodes) fail(line.id, 'a weather line needs an atm or trade code condition');
        if (line.category === 'distress' && line.weight !== 0.2) fail(line.id, 'a distress line weighs 0.2');
        if (/\b(Imperi|Zhodani|Vargr|Aslan|Solomani|Hiver|K'kree)/i.test(text)) fail(line.id, 'a polity or species name');
        if (/\d/.test(text.replace(/\{[^}]+\}/g, ''))) fail(line.id, 'a digit in the text');
    }
    for (const facts of FIXTURES) {
        let count = 0;
        for (const line of lines) {
            if (!eligible(line, facts)) continue;
            count += 1;
            const said = resolve(line.text, facts);
            if (/\{|\}/.test(said)) fail(line.id, 'unresolved brace for starport ' + facts.starport);
        }
        if (count === 0) fail('fixtures', 'no eligible line for the starport ' + facts.starport + ' fixture');
    }
    return problems;
}

test('the shipped lines pass the six sample checks, with no law-ban customs line', () => {
    const raw = JSON.parse(fs.readFileSync(SHIPPED, 'utf8'));
    const file = ChatterFile.parse(raw);
    const lines = file.lines;
    assert.deepEqual(sampleLines(), lines);
    assert.equal(lines.length, 97);
    assert.equal(lines.some((line) => line.id === 'customs-001' || line.id === 'customs-002' || line.id === 'customs-003'), false);
    assert.equal(raw.lines.some((line) => /firearms|weapons|armour/.test(line.text) && line.category === 'customs'), false);

    assert.deepEqual(sixProblems(lines), []);
});

const TRADE = ['Ag', 'As', 'Ba', 'De', 'Fl', 'Ga', 'Hi', 'Ht', 'Ic', 'In', 'Lo', 'Lt', 'Na', 'Ni', 'Po', 'Ri', 'Va', 'Wa'];

/**
 * ZC1: corpus.json is the comms package's 1,178-line file, shipped unedited
 * (assets/Traveller_Living_Systems_Comms_FINAL/.../content/corpus.json). Its
 * six-check failures are lines that never air: the corpus adapter refuses them
 * on every fixture (living/comms/corpus_events.ts corpusGate).
 */
test('every chatter file passes the six checks, or never airs', () => {
    const dir = path.join(ROOT, 'apps/web/src/living/lines');
    const names = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
    assert.ok(names.includes('sample.json'));
    assert.ok(names.includes('corpus.json'));
    for (const name of names) {
        const file = ChatterFile.parse(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
        const problems = sixProblems(file.lines);
        if (name !== 'corpus.json') { assert.deepEqual(problems, [], name); continue; }
        const byId = new Map(file.lines.map((line) => [line.id, line]));
        for (const problem of problems) {
            const line = byId.get(problem.split(':')[0]);
            assert.ok(line, problem);
            for (const facts of FIXTURES) {
                for (const party of ['inSystem', 'docked']) assert.equal(corpusGate(line, { ...facts, party }), false, problem);
            }
        }
    }
});

test('the corpus is the package\'s 1,178 lines, split as shipped, and every fixture hears at least forty', () => {
    const lines = corpusLines();
    assert.equal(lines.length, 1178);
    const count = (pred) => lines.filter(pred).length;
    assert.deepEqual(
        Object.fromEntries(CATEGORIES.map((category) => [category, count((line) => line.category === category)])),
        { control: 143, customs: 113, news: 182, market: 160, weather: 134, advert: 124, ship: 145, rumour: 135, distress: 42 },
    );
    for (const category of CATEGORIES) {
        const thin = count((line) => line.category === category && Object.keys(line.when).length <= 1);
        assert.ok(thin >= 20, category + ' near-empty ' + thin);
    }
    assert.equal(count((line) => line.category === 'distress' && line.weight === 0.2), 42);
    for (const code of TRADE) {
        assert.ok(count((line) => line.category === 'news' && line.when.tradeCodes && line.when.tradeCodes.includes(code)) >= 5, code);
        assert.ok(count((line) => line.category === 'market' && line.when.tradeCodes && line.when.tradeCodes.includes(code)) >= 5, code);
    }
    for (let digit = 0; digit <= 15; digit++) {
        assert.ok(count((line) => line.category === 'weather' && line.when.atm && line.when.atm.min <= digit && (line.when.atm.max ?? 15) >= digit) >= 20, 'atm ' + digit);
    }
    for (const facts of FIXTURES) {
        const heard = lines.filter((line) => eligible(line, facts)).length;
        assert.ok(heard >= 40, facts.starport + ' hears ' + heard);
    }
    for (const facts of FIXTURES) {
        const aired = lines.filter((line) => corpusGate(line, { ...facts, party: 'docked' }));
        assert.equal(aired.some((line) => /firearms|weapons|armour/i.test(line.text)), false, facts.starport);
    }
});

test('an unknown when key is refused', () => {
    const line = {
        id: 'news-001', category: 'news', voice: 'news',
        text: 'A line long enough to be a chatter line for the schema.',
        when: { inventedCondition: ['Im'] },
    };
    assert.equal(ChatterFile.safeParse({ schemaVersion: 1, written: 'x', notes: [], lines: [line] }).success, false);
});
