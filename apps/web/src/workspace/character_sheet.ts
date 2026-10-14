/**
 * The character sheet's fields (slice_2_campaign.md K13 part 4): the 420 named widgets of
 * the official 2026 PDF, read from rules/ through the generated wrapper, and **the one
 * place that says how that flat list is grouped on the page**: which boxes are a value and
 * its DM, which are a skill's line, which are a table's rows. Names are the PDF's own, kept
 * as spelled ("Other Dm 2", "Animals Speciialism 2"); they are the keys the values are
 * stored under. A widget this layout does not place is a failed test
 * (tests/web/workspace_character_sheet.test.js), never a silent gap. Nothing here says what
 * a box means or computes anything from one. Pure.
 */
import { extraFieldName, parseExtraName } from '@voyage/shared';
import generated from '../../../../packages/engines/src/generated/rules/mgt2e_character_sheet_fields.js';
import { byPage, isTall, sheetWith, type SheetDoc, type SheetField, type SheetRules, type SheetValues } from './sheet_fields.ts';

export const CHARACTER_RULES: SheetRules = generated as SheetRules;
/** The schema a person's sheet is stored against. */
export const CHARACTER_SCHEMA = 'mgt2e_character@1';

export type BoxLook = 'plain' | 'tag' | 'tall';
export type FieldCell = { field: SheetField; label: string; look: BoxLook };
/** A characteristic: a value and its DM, both typed. The two uncaptioned slots have a name box as well. */
export type CharCell = { label: string; name: SheetField | null; value: SheetField; dm: SheetField };
/** A skill as the PDF prints it: its box (the PDF calls it the Modifier), and a specialism box on the lines that have one. */
export type SkillLine = { label: string; n: number | null; specialism: SheetField | null; modifier: SheetField };
export type TableColumn = { label: string; type: 'text' | 'checkbox' };
/** A place the page fills with linked things: the sheet never reads them itself. */
export type SlotName = 'homeworld' | 'items' | 'ally' | 'contact' | 'rival' | 'enemy';

export type CharBlock =
    | { kind: 'fields'; cells: FieldCell[] }
    | { kind: 'chars'; cells: CharCell[] }
    /** The six core values shown again, exactly as typed. No widget of its own. */
    | { kind: 'profile'; cells: { label: string; value: SheetField }[] }
    | { kind: 'skills'; lines: SkillLine[]; blanks: { name: SheetField; dm: SheetField }[] }
    /** rows[row][column]; the first column is the key that stays when the table scrolls sideways. */
    | { kind: 'table'; name: string; columns: TableColumn[]; rows: SheetField[][] }
    | { kind: 'slot'; slot: SlotName };

export type CharSection = { name: string; blocks: CharBlock[] };

const CORE = ['Strength', 'Dexterity', 'Endurance', 'Intellect', 'Education', 'Social'] as const;

/** Johnny's display labels for the profile row. The hex's accessible name stays the full word. */
const PROFILE_ABBR: Record<(typeof CORE)[number], string> = {
    Strength: 'STR', Dexterity: 'DEX', Endurance: 'END', Intellect: 'INT', Education: 'EDU', Social: 'SOC',
};

export function profileAbbr(label: string): string {
    return label in PROFILE_ABBR ? PROFILE_ABBR[label as (typeof CORE)[number]] : label;
}

/** Builds the layout over a list of widgets; a name the layout asks for and the file lacks is an error, loudly. */
export function characterSections(fields: readonly SheetField[] = CHARACTER_RULES.fields): CharSection[] {
    const named = new Map(fields.map((field) => [field.name, field]));
    const need = (name: string): SheetField => {
        const found = named.get(name);
        if (!found) throw new Error('character sheet: the rules file has no widget named "' + name + '"');
        return found;
    };
    const inSection = (section: string): SheetField[] => fields.filter((field) => field.section === section);
    const cell = (name: string, look: BoxLook = 'plain', label = name): FieldCell => {
        const field = need(name);
        return { field, label, look: isTall(field) ? 'tall' : look };
    };
    /** A numbered table: `names(column, n)` is the PDF's own name for that cell. */
    const table = (name: string, columns: readonly (readonly [string, string] | readonly [string, string, 'checkbox'])[], rows: number): CharBlock => ({
        kind: 'table',
        name,
        columns: columns.map((column) => ({ label: column[0], type: column[2] ?? 'text' })),
        rows: Array.from({ length: rows }, (_, row) => columns.map((column) => need(column[1].replace('#', String(row + 1))))),
    });

    // The skills: every "<name> [n] Modifier" box is a line; its specialism is the box of the same name and number, however the PDF spells "Specialism".
    const skillFields = inSection('Skills');
    const lines: SkillLine[] = [];
    for (const field of skillFields) {
        const found = /^(.*?)(?: (\d+))? Modifier$/.exec(field.name);
        if (!found) continue;
        const n = found[2] ? Number(found[2]) : null;
        const specialism = n === null ? null : skillFields.find((other) => {
            const their = /^(.*) Spec\w+ (\d+)$/.exec(other.name);
            return their !== null && their[1] === found[1] && Number(their[2]) === n;
        }) ?? null;
        lines.push({ label: found[1], n, specialism, modifier: field });
    }
    lines.sort((a, b) => a.label.localeCompare(b.label) || (a.n ?? 0) - (b.n ?? 0));
    const blanks = skillFields
        .filter((field) => /^Skill\/Ability \d+$/.test(field.name))
        .sort((a, b) => Number(a.name.split(' ').pop()) - Number(b.name.split(' ').pop()))
        .map((field) => ({ name: field, dm: need(field.name.replace('Skill/Ability ', 'Skill/Ability DM ')) }));

    const people = (section: string, one: string, slot: SlotName): CharSection => ({
        name: section,
        blocks: [{ kind: 'slot', slot }, table(section, [['Name', one + ' Name #'], ['Notes', one + ' Notes #']], 6)],
    });

    return [
        {
            name: 'Personal Data File',
            blocks: [
                { kind: 'fields', cells: [cell('Name'), cell('Title'), cell('Age', 'tag'), cell('Species'), cell('Homeworld'), cell('Traits')] },
                { kind: 'slot', slot: 'homeworld' },
                { kind: 'chars', cells: CORE.map((name) => ({ label: name, name: null, value: need(name), dm: need(name + ' DM') })) },
                {
                    kind: 'chars',
                    cells: [
                        { label: 'Other characteristic 1', name: need('Other Characteristic 1'), value: need('Other Stat 1'), dm: need('Other DM 1') },
                        // The PDF spells this one "Other Dm 2"; the key keeps its spelling.
                        { label: 'Other characteristic 2', name: need('Other Characteristic 2'), value: need('Other Stat 2'), dm: need('Other Dm 2') },
                    ],
                },
                { kind: 'profile', cells: CORE.map((name) => ({ label: name, value: need(name) })) },
                { kind: 'fields', cells: [cell('Distinguishing Features', 'tall')] },
            ],
        },
        {
            name: 'Skills',
            blocks: [
                { kind: 'fields', cells: [cell('Training Skill'), cell('Completed Weeks', 'tag'), cell('Completed Study Periods', 'tag')] },
                { kind: 'skills', lines, blanks },
            ],
        },
        { name: 'Augments', blocks: [table('Augments', [['Type', 'Augment Type #'], ['TL', 'Augment TL #'], ['Traits', 'Augment Traits #']], 5)] },
        {
            name: 'Armour',
            blocks: [table('Armour', [['Type', 'Armour Type #'], ['Radiation', 'Armour Radiation #'], ['Protection', 'Armour Protection #'], ['KG', 'Armour KG #'], ['Options', 'Armour Options #']], 8)],
        },
        {
            name: 'Weapons',
            blocks: [table('Weapons', [
                ['Type', 'Weapon Type #'], ['TL', 'Weapon TL #'], ['Range', 'Weapon Range #'], ['Damage', 'Weapon Damage #'],
                ['KG', 'Weapon KG #'], ['Magazine', 'Weapon Magazine #'], ['Traits', 'Weapon Traits #'],
            ], 8)],
        },
        {
            name: 'Equipment',
            blocks: [
                { kind: 'slot', slot: 'items' },
                table('Equipment', [['Type', 'Equipment Type #'], ['TL', 'Equipment TL #'], ['KG', 'Equipment KG #'], ['Notes', 'Equipment Notes #']], 8),
            ],
        },
        { name: 'Finances', blocks: [{ kind: 'fields', cells: inSection('Finances').slice().sort(byPage).map((field) => cell(field.name, 'tag')) }] },
        {
            name: 'Wounds',
            blocks: [table('Wounds', [['Type', 'Wound Type #'], ['Location', 'Wound Location #'], ['Recovery Period', 'Wound Recovery Period #'], ['Notes', 'Wound Notes #']], 4)],
        },
        {
            name: 'Careers',
            // The career is the row's key, so it leads; the PDF prints the term first.
            blocks: [table('Careers', [
                ['Career', 'Career #'], ['Term', 'Career Term #'], ['Rank', 'Career Rank #'], ['Notes', 'Career Notes #'],
                ['Survival', 'Career Survival #', 'checkbox'], ['Advancement', 'Career Advancement #', 'checkbox'],
            ], 5)],
        },
        { name: 'History & Background', blocks: [{ kind: 'fields', cells: [cell('History & Background', 'tall')] }] },
        people('Allies', 'Ally', 'ally'),
        people('Contacts', 'Contact', 'contact'),
        people('Rivals', 'Rival', 'rival'),
        people('Enemies', 'Enemy', 'enemy'),
    ];
}

/** Every widget a block places, in order. The profile places none: it shows the core values again. */
export function blockFields(block: CharBlock): SheetField[] {
    if (block.kind === 'fields') return block.cells.map((item) => item.field);
    if (block.kind === 'chars') return block.cells.flatMap((item) => (item.name ? [item.name, item.value, item.dm] : [item.value, item.dm]));
    if (block.kind === 'skills') return [...block.lines.flatMap((line) => (line.specialism ? [line.specialism, line.modifier] : [line.modifier])), ...block.blanks.flatMap((blank) => [blank.name, blank.dm])];
    if (block.kind === 'table') return block.rows.flat();
    return [];
}

export function sectionFields(section: CharSection): SheetField[] {
    return section.blocks.flatMap(blockFields);
}

/** How many of a section's boxes hold a value, for its tab while it is folded. */
export function filledIn(section: CharSection, values: SheetValues | null): number {
    if (!values) return 0;
    return sectionFields(section).filter((field) => field.name in values).length;
}

/** A skill's line as a referee reads it: "Athletics 2". */
export function skillName(line: Pick<SkillLine, 'label' | 'n'>): string {
    return line.n === null ? line.label : line.label + ' ' + line.n;
}

/** Labels the PDF prints as numbered lines, read from the layout. */
export function numberedLabelsOf(lines: readonly SkillLine[]): ReadonlySet<string> {
    return new Set(lines.filter((line) => line.n !== null).map((line) => line.label));
}

/** The first line number that is not one of the PDF's own lines for this skill. */
export function firstExtraNumber(lines: readonly SkillLine[], label: string): number {
    let max = 0;
    for (const line of lines) {
        if (line.label === label && line.n !== null && line.n > max) max = line.n;
    }
    return max + 1;
}

/** One skill as the page shows it: its first line, then later lines under that. */
export type SkillGroup = {
    label: string;
    head: SkillLine;
    /** Later PDF lines to show, in order. */
    more: SkillLine[];
    /** Line numbers past the PDF's own, in order. */
    extra: number[];
    /** The PDF gave this skill numbered lines, so the row can grow. */
    numbered: boolean;
};

function textAt(values: SheetValues | null, name: string | null): string {
    if (!name || !values) return '';
    const held = values[name];
    return typeof held === 'string' ? held : '';
}

/**
 * One row per skill. A numbered skill shows its first line, plus any later line that has
 * something typed, that was added while this sheet is open (`open`), or whose specialism
 * matches the finder. A found or trained line sits under that first line.
 */
export function skillGroups(
    lines: readonly SkillLine[],
    values: SheetValues | null,
    find: string,
    trainedOnly: boolean,
    open: Readonly<Record<string, readonly number[]>>,
): SkillGroup[] {
    const labels = numberedLabelsOf(lines);
    const words = find.trim().toLowerCase();
    const byLabel = new Map<string, SkillLine[]>();
    for (const line of lines) {
        const list = byLabel.get(line.label);
        if (list) list.push(line);
        else byLabel.set(line.label, [line]);
    }
    const groups: SkillGroup[] = [];
    for (const [label, group] of byLabel) {
        const head = group[0];
        if (!head) continue;
        const numbered = labels.has(label);
        const firstExtra = numbered ? firstExtraNumber(lines, label) : 0;
        const stored: number[] = [];
        if (values && numbered) {
            for (const name of Object.keys(values)) {
                const parsed = parseExtraName(name, labels);
                if (parsed && parsed.label === label && !stored.includes(parsed.n)) stored.push(parsed.n);
            }
        }
        const opened = open[label] ?? [];
        const specText = (line: SkillLine): string => textAt(values, line.specialism ? line.specialism.name : null).toLowerCase();
        const lineTyped = (line: SkillLine): boolean => textAt(values, line.modifier.name) !== '' || specText(line) !== '';
        const extraSpec = (n: number): string => textAt(values, extraFieldName(label, n, 'Specialism')).toLowerCase();
        const extraTyped = (n: number): boolean => extraSpec(n) !== '' || textAt(values, extraFieldName(label, n, 'Modifier')) !== '';
        const labelHit = words === '' || label.toLowerCase().includes(words);
        const specHit = group.some((line) => words !== '' && specText(line).includes(words))
            || stored.some((n) => words !== '' && extraSpec(n).includes(words));
        const anyTyped = group.some(lineTyped) || stored.some(extraTyped);
        const show = trainedOnly ? anyTyped && (labelHit || specHit) : words === '' || labelHit || specHit;
        if (!show) continue;
        const more = group.slice(1).filter((line) => {
            if (lineTyped(line)) return true;
            if (line.n !== null && opened.includes(line.n)) return true;
            return words !== '' && specText(line).includes(words);
        });
        const extraNs = new Set<number>();
        for (const n of stored) {
            if (extraTyped(n) || opened.includes(n) || (words !== '' && extraSpec(n).includes(words))) extraNs.add(n);
        }
        for (const n of opened) if (n >= firstExtra) extraNs.add(n);
        groups.push({ label, head, more, extra: [...extraNs].sort((a, b) => a - b), numbered });
    }
    return groups;
}

/** How many skill lines have something typed, including a line stored past the PDF's own. */
export function trainedLineCount(lines: readonly SkillLine[], values: SheetValues | null): number {
    const pdf = skillsFound(lines, values, '', true).length;
    const labels = numberedLabelsOf(lines);
    const seen = new Set<string>();
    if (!values) return pdf;
    for (const name of Object.keys(values)) {
        const parsed = parseExtraName(name, labels);
        if (!parsed) continue;
        const key = parsed.label + '/' + parsed.n;
        if (seen.has(key)) continue;
        const spec = values[extraFieldName(parsed.label, parsed.n, 'Specialism')];
        const mod = values[extraFieldName(parsed.label, parsed.n, 'Modifier')];
        if ((typeof spec === 'string' && spec !== '') || (typeof mod === 'string' && mod !== '')) seen.add(key);
    }
    return pdf + seen.size;
}

/** The lines a finder shows: those whose name, or whose typed specialism, has the words; and, when asked, only those with something typed. */
export function skillsFound(lines: readonly SkillLine[], values: SheetValues | null, find: string, trainedOnly: boolean): SkillLine[] {
    const words = find.trim().toLowerCase();
    const typed = (field: SheetField | null): string => (field && values && typeof values[field.name] === 'string' ? (values[field.name] as string) : '');
    return lines.filter((line) => {
        if (trainedOnly && typed(line.modifier) === '' && typed(line.specialism) === '') return false;
        return words === '' || line.label.toLowerCase().includes(words) || typed(line.specialism).toLowerCase().includes(words);
    });
}

/** A record's sheet as the character sheet's document, or null when it is not one (no sheet, or a free-form one). */
export function characterDoc(sheet: unknown): SheetDoc | null {
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return null;
    const held = sheet as Record<string, unknown>;
    if (held.schema !== CHARACTER_SCHEMA) return null;
    const fields: SheetValues = {};
    if (held.fields && typeof held.fields === 'object' && !Array.isArray(held.fields)) {
        for (const [name, value] of Object.entries(held.fields as Record<string, unknown>)) {
            if (typeof value === 'string' || typeof value === 'boolean') fields[name] = value;
        }
    }
    return { schema: CHARACTER_SCHEMA, fields };
}

/** The record's sheet with these values as a character sheet; whatever else it held (a free-form sheet's own keys) stays beside them. */
export function characterSheetWith(sheet: unknown, values: SheetValues): Record<string, unknown> {
    return sheetWith(sheet, values, CHARACTER_SCHEMA);
}

/** What a sheet holds that is not the character sheet's own: a free-form sheet's keys, kept and shown, never discarded. */
export function otherKeys(sheet: unknown): Record<string, unknown> {
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sheet as Record<string, unknown>)) {
        if (key !== 'schema' && key !== 'fields' && key !== 'homeworld' && key !== 'characterId') out[key] = value;
    }
    return out;
}
