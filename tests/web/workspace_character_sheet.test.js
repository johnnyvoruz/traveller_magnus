/**
 * The character sheet (apps/web/src/workspace/character_sheet.ts, sheet_fields.ts): the 420
 * widgets of the 2026 PDF through the generated wrapper, every one placed once by the
 * layout; the skills as the PDF prints them; the values under the PDF's own names; one box
 * under two hands; and the boundary that lets the sheet move house (it reads no store).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import {
    blockFields, CHARACTER_RULES, CHARACTER_SCHEMA, characterDoc, characterSections, characterSheetWith, filledIn, otherKeys, sectionFields,
    skillName, skillsFound,
} from '../../apps/web/src/workspace/character_sheet.ts';
import { boxEntered, boxGiven, boxLeft, boxOf, boxTyped, valueOf, withValue } from '../../apps/web/src/workspace/sheet_fields.ts';

const sections = characterSections();
const block = (section, kind) => sections.find((s) => s.name === section).blocks.find((b) => b.kind === kind);

test('the 420 widgets come through the generated wrapper, with the PDF as their source', () => {
    assert.equal(CHARACTER_RULES.fields.length, 420);
    assert.match(CHARACTER_RULES.source, /Character Sheet 2026_fillable\.pdf$/);
    assert.equal(CHARACTER_RULES.fields.filter((f) => f.type === 'checkbox').length, 10);
    assert.equal(new Set(CHARACTER_RULES.fields.map((f) => f.name)).size, 420);
});

test('the layout places every widget once: none forgotten, none twice', () => {
    const placed = sections.flatMap(sectionFields).map((f) => f.name);
    const all = CHARACTER_RULES.fields.map((f) => f.name);
    assert.deepEqual(all.filter((name) => !placed.includes(name)), [], 'widgets the layout forgot');
    assert.deepEqual(placed.filter((name, index) => placed.indexOf(name) !== index), [], 'widgets placed twice');
    assert.equal(placed.length, 420);
});

test('a widget the PDF gains and the layout does not place is caught; one the layout needs and the PDF lacks throws', () => {
    const more = [...CHARACTER_RULES.fields, { name: 'A New Box', page: 2, type: 'text', box: { x: 0, y: 0, w: 10, h: 10 }, section: 'Finances' }];
    // Finances takes whatever the file has there; a box anywhere else is not placed.
    const elsewhere = [...CHARACTER_RULES.fields, { name: 'A New Box', page: 1, type: 'text', box: { x: 0, y: 0, w: 10, h: 10 }, section: 'Weapons' }];
    assert.ok(characterSections(more).flatMap(sectionFields).some((f) => f.name === 'A New Box'));
    assert.ok(!characterSections(elsewhere).flatMap(sectionFields).some((f) => f.name === 'A New Box'));
    assert.throws(() => characterSections(CHARACTER_RULES.fields.filter((f) => f.name !== 'Weapon Traits 8')), /Weapon Traits 8/);
});

test('the sections are the PDF’s fourteen, in its order, each with its count', () => {
    assert.deepEqual(sections.map((s) => [s.name, sectionFields(s).length]), [
        ['Personal Data File', 25], ['Skills', 149], ['Augments', 15], ['Armour', 40], ['Weapons', 56], ['Equipment', 32], ['Finances', 8],
        ['Wounds', 16], ['Careers', 30], ['History & Background', 1], ['Allies', 12], ['Contacts', 12], ['Rivals', 12], ['Enemies', 12],
    ]);
});

test('characteristics are a value and a DM; the two uncaptioned slots have a name box; the profile shows the six again', () => {
    const [core, other] = sections[0].blocks.filter((b) => b.kind === 'chars');
    assert.deepEqual(core.cells.map((c) => [c.label, c.value.name, c.dm.name, c.name]), [
        ['Strength', 'Strength', 'Strength DM', null], ['Dexterity', 'Dexterity', 'Dexterity DM', null], ['Endurance', 'Endurance', 'Endurance DM', null],
        ['Intellect', 'Intellect', 'Intellect DM', null], ['Education', 'Education', 'Education DM', null], ['Social', 'Social', 'Social DM', null],
    ]);
    assert.deepEqual(other.cells.map((c) => [c.name.name, c.value.name, c.dm.name]), [
        ['Other Characteristic 1', 'Other Stat 1', 'Other DM 1'], ['Other Characteristic 2', 'Other Stat 2', 'Other Dm 2'],
    ]);
    const profile = block('Personal Data File', 'profile');
    assert.deepEqual(profile.cells.map((c) => c.value.name), core.cells.map((c) => c.value.name));
    assert.deepEqual(blockFields(profile), [], 'the profile is no widget of its own');
});

test('the skills are the PDF’s lines: a box each, a specialism where it prints one, and eleven blank rows', () => {
    const skills = block('Skills', 'skills');
    assert.equal(skills.lines.length, CHARACTER_RULES.fields.filter((f) => / Modifier$/.test(f.name)).length);
    assert.equal(skills.blanks.length, 11);
    assert.deepEqual([skills.blanks[0].name.name, skills.blanks[0].dm.name, skills.blanks[10].name.name], ['Skill/Ability 1', 'Skill/Ability DM 1', 'Skill/Ability 11']);
    const line = (label, n) => skills.lines.find((l) => l.label === label && l.n === n);
    assert.equal(line('Admin', null).specialism, null);
    assert.equal(line('Pilot', 2).specialism.name, 'Pilot Specialism 2');
    // The PDF's own spellings are found, and kept as the keys.
    assert.equal(line('Animals', 2).specialism.name, 'Animals Speciialism 2');
    assert.equal(line('Profession', 1).specialism.name, 'Profession Specialiasm 1');
    assert.equal(skillName(line('Athletics', 3)), 'Athletics 3');
    assert.equal(skillName(line('Vacc Suit', null)), 'Vacc Suit');
    assert.ok(skills.lines.filter((l) => l.n !== null).every((l) => l.specialism !== null), 'every numbered line has its specialism box');
    const names = skills.lines.map(skillName);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), 'in name order');
});

test('finding a skill: by its name or its typed specialism; Trained shows the lines with something typed', () => {
    const { lines } = block('Skills', 'skills');
    const values = { 'Pilot 1 Modifier': '2', 'Pilot Specialism 1': 'spacecraft', 'Admin Modifier': '1', 'Science Specialism 2': 'planetology' };
    assert.deepEqual(skillsFound(lines, values, 'gun', false).map(skillName), ['Gun Combat 1', 'Gun Combat 2', 'Gun Combat 3', 'Gunner 1', 'Gunner 2', 'Gunner 3']);
    assert.deepEqual(skillsFound(lines, values, 'SPACE', false).map(skillName), ['Pilot 1']);
    assert.deepEqual(skillsFound(lines, values, '', true).map(skillName), ['Admin', 'Pilot 1', 'Science 2']);
    assert.equal(skillsFound(lines, null, '', false).length, lines.length);
});

test('tables are the PDF’s rows and columns; the first column is the key; careers carry their two ticks', () => {
    const weapons = block('Weapons', 'table');
    assert.deepEqual(weapons.columns.map((c) => c.label), ['Type', 'TL', 'Range', 'Damage', 'KG', 'Magazine', 'Traits']);
    assert.equal(weapons.rows.length, 8);
    assert.deepEqual(weapons.rows[7].map((f) => f.name), ['Weapon Type 8', 'Weapon TL 8', 'Weapon Range 8', 'Weapon Damage 8', 'Weapon KG 8', 'Weapon Magazine 8', 'Weapon Traits 8']);
    const careers = block('Careers', 'table');
    assert.deepEqual(careers.columns.map((c) => c.label + ':' + c.type), ['Career:text', 'Term:text', 'Rank:text', 'Notes:text', 'Survival:checkbox', 'Advancement:checkbox']);
    assert.deepEqual(careers.rows[0].map((f) => f.type), ['text', 'text', 'text', 'text', 'checkbox', 'checkbox']);
    assert.equal(careers.rows.length, 5);
    assert.deepEqual([block('Augments', 'table').rows.length, block('Armour', 'table').rows.length, block('Equipment', 'table').rows.length, block('Wounds', 'table').rows.length], [5, 8, 8, 4]);
    const allies = sections.find((s) => s.name === 'Allies');
    assert.deepEqual(allies.blocks.map((b) => b.kind), ['slot', 'table']);
    assert.deepEqual(allies.blocks[1].rows[5].map((f) => f.name), ['Ally Name 6', 'Ally Notes 6']);
    assert.deepEqual(sections.find((s) => s.name === 'Enemies').blocks[1].rows[0].map((f) => f.name), ['Enemy Name 1', 'Enemy Notes 1']);
});

test('values are stored under the PDF’s names against mgt2e_character@1; a free-form sheet’s own keys are kept', () => {
    const field = CHARACTER_RULES.fields.find((f) => f.name === 'Strength');
    const tick = CHARACTER_RULES.fields.find((f) => f.name === 'Career Survival 1');
    const free = { notes: 'STR 7', level: 3 };
    assert.equal(characterDoc(free), null, 'a free-form sheet is not a character sheet');
    assert.equal(characterDoc(null), null);
    let values = withValue(null, field, '7');
    values = withValue(values, tick, true);
    const sheet = characterSheetWith(free, values);
    assert.deepEqual(sheet, { notes: 'STR 7', level: 3, fields: { Strength: '7', 'Career Survival 1': true }, schema: CHARACTER_SCHEMA });
    assert.deepEqual(otherKeys(sheet), free);
    const doc = characterDoc(sheet);
    assert.deepEqual(doc, { schema: 'mgt2e_character@1', fields: { Strength: '7', 'Career Survival 1': true } });
    assert.equal(valueOf(doc.fields, field), '7');
    assert.deepEqual(withValue(withValue(doc.fields, field, '  '), tick, false), {}, 'an emptied box is dropped');
    assert.equal(filledIn(sections[0], doc.fields), 1);
    assert.equal(filledIn(sections.find((s) => s.name === 'Careers'), doc.fields), 1);
});

test('one box under two hands: a value from outside lands in a box nobody is in, and the box being typed in keeps its text', () => {
    // Four boxes; the person is in the fourth and has typed.
    let boxes = ['a', 'b', 'c', 'd'].map(boxOf);
    boxes[3] = boxTyped(boxEntered(boxes[3]), 'my words');
    const arrived = ['A', 'B', 'C', 'D'].map((given, i) => boxGiven(boxes[i], given));
    assert.deepEqual(arrived.map((r) => r.state.shown), ['A', 'B', 'C', 'my words']);
    assert.deepEqual(arrived.map((r) => r.changed), [true, true, true, false], 'three are marked as changed; the fourth is left alone');
    assert.equal(arrived[3].state.focused, true);
    // Leaving it commits what was typed, over what arrived.
    assert.deepEqual(boxLeft(arrived[3].state, 'D'), { state: { shown: 'my words', focused: false, dirty: false }, commit: 'my words' });
    // A box only looked at commits nothing and takes what arrived meanwhile.
    const looked = boxEntered(boxOf('a'));
    assert.deepEqual(boxLeft(boxGiven(looked, 'A').state, 'A'), { state: { shown: 'A', focused: false, dirty: false }, commit: null });
    // Typed back to what the sheet holds: nothing to commit.
    assert.equal(boxLeft(boxTyped(boxEntered(boxOf('a')), 'a'), 'a').commit, null);
    // The same value arriving again is not a change.
    assert.equal(boxGiven(boxOf('a'), 'a').changed, false);
});

test('the sheet can move house: the component and its parts read no store, no record and no router', () => {
    const dir = new URL('../../apps/web/src/workspace/', import.meta.url);
    for (const name of ['CharacterSheet.vue', 'SheetBox.vue', 'SheetPanel.vue', 'character_sheet.ts', 'sheet_fields.ts']) {
        const text = fs.readFileSync(new URL(name, dir), 'utf8');
        const imports = [...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
        const outside = imports.filter((from) => /campaign\/|\/store|actions\.ts|vue-router|records\.ts|shell\/|account\//.test(from));
        assert.deepEqual(outside, [], name + ' reaches outside the sheet: ' + outside.join(', '));
    }
    // The page's wiring is the one place that does.
    assert.match(fs.readFileSync(new URL('PersonSheet.vue', dir), 'utf8'), /campaign\/store\.ts/);
});

test('the sheet mounts from a plain object with no store: every box of the PDF is drawn, with what was typed and who is in it', async () => {
    // The real component, compiled by the app's own Vite and rendered on the server: no campaign, no record, no router.
    const { createServer } = await import('vite');
    const { createSSRApp } = await import('vue');
    const { renderToString } = await import('vue/server-renderer');
    const server = await createServer({
        root: new URL('../../apps/web/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'custom',
        logLevel: 'silent',
    });
    try {
        const sheet = (await server.ssrLoadModule('/src/workspace/CharacterSheet.vue')).default;
        const doc = { schema: CHARACTER_SCHEMA, fields: { Name: 'Marc Hault', Strength: '7', 'Career Survival 1': true, 'Weapon Type 8': 'last weapon' } };
        const app = createSSRApp(sheet, {
            doc,
            editable: true,
            presence: { Species: { name: 'Mara', tone: '--attention' } },
            homeworld: { name: 'Regina' },
            links: { ally: [{ id: 'cr_1', name: 'Jonna Reyes' }], items: [{ id: 'cr_2', name: 'Medikit' }] },
        });
        const html = await renderToString(app);
        const boxes = (html.match(/<(?:input|textarea)/g) ?? []).length;
        assert.equal(boxes, 421, 'the 420 boxes and the skills finder');
        assert.equal((html.match(/<section class="sheet-panel/g) ?? []).length, 14);
        for (const name of ['Personal Data File', 'Skills', 'Weapons', 'History &amp; Background', 'Enemies']) assert.ok(html.includes('aria-label="' + name + '"'), name);
        assert.match(html, /In use by <\/span>Mara/, 'the box someone else is in says who');
        assert.equal((html.match(/class="sbox-holder"/g) ?? []).length, 1);
        assert.match(html, /Regina/);
        assert.match(html, /Jonna Reyes/);
        assert.match(html, /Medikit/);
        // The profile shows the core value exactly as typed.
        assert.match(html, /<b>7<\/b><span>Strength<\/span>/);
        // Not editable: every box is disabled.
        const fixed = await renderToString(createSSRApp(sheet, { doc, editable: false }));
        assert.equal((fixed.match(/<(?:input|textarea)[^>]* disabled/g) ?? []).length, 420);
    } finally {
        await server.close();
    }
});
