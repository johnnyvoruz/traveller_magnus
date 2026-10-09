/**
 * WCAG 2.1 AA contrast for every text and meaningful-mark colour pair the web app uses.
 * Parses apps/web/src/design/tokens.css, so a token change that drops a pair below its
 * minimum fails here. Minimums: 4.5 for text, 3 for large text (24 px, or 18.66 px bold)
 * and for non-text marks (icons, focus ring, control borders).
 *
 * A background is one token or a stack, top layer first, ending in an opaque token:
 * ['--wash', '--bg-1'] is the wash painted over the panel. CONTRAST_REPORT=1 prints the table.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const css = fs.readFileSync(new URL('../../apps/web/src/design/tokens.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

const TOKENS = new Map();
for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) TOKENS.set(match[1], match[2].trim());

function hex(value) {
    let digits = value.slice(1);
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((d) => d + d).join('');
    const n = (at) => parseInt(digits.slice(at, at + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
}

function colour(value) {
    const text = value.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(text)) return hex(text);
    const ref = /^var\((--[a-z0-9-]+)\)$/.exec(text);
    if (ref) return token(ref[1]);
    const mix = /^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/.exec(text);
    if (mix) {
        const base = colour(mix[1]);
        return { ...base, a: base.a * Number(mix[2]) / 100 };
    }
    throw new Error('contrast: cannot read colour "' + value + '"');
}

function token(name) {
    const value = TOKENS.get(name);
    if (value === undefined) throw new Error('contrast: no token ' + name);
    return colour(value);
}

function over(top, bottom) {
    const a = top.a;
    return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

/** A layer may be `--token@0.55` for a fill drawn at that alpha. */
function paint(spec) {
    const text = String(spec);
    const cut = text.lastIndexOf('@');
    if (cut < 0) return token(text);
    const base = token(text.slice(0, cut));
    return { ...base, a: base.a * Number(text.slice(cut + 1)) };
}

function flatten(layers) {
    const names = Array.isArray(layers) ? layers : [layers];
    let result = paint(names[names.length - 1]);
    if (result.a !== 1) throw new Error('contrast: base layer ' + names[names.length - 1] + ' is not opaque');
    for (let i = names.length - 2; i >= 0; i--) result = over(paint(names[i]), result);
    return result;
}

function luminance(c) {
    const channel = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function ratio(fg, bg) {
    const back = flatten(bg);
    const front = over(token(fg), back);
    const a = luminance(front);
    const b = luminance(back);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const TEXT = 4.5;
const SMALL = 7; // house rule, stricter than AA: text under 12 px
const LARGE = 3;
const MARK = 3;
const MAINWORLD_ROW = ['--wash-faint', '--bg-1'];
const OMNI_FIELD = ['--chrome-glass', '--bg-0'];
const RAIL = ['--rail-glass', '--bg-0'];

/** [foreground, background, minimum, where it is used] */
const PAIRS = [
    // Panel header
    ['--text-0', '--surface-1', TEXT, 'panel title'],
    ['--text-muted', '--surface-1', TEXT, 'panel place line, hex chip, idle width control'],
    ['--signal', '--surface-1', SMALL, 'panel breadcrumb (10.5 px)'],
    ['--signal', '--row-active', TEXT, 'pressed width control'],
    ['--text-1', '--surface-1', TEXT, 'width control on hover'],
    ['--signal-dim', '--surface-1', MARK, 'panel close icon'],
    // Dossier
    ['--text-1', '--bg-1', TEXT, 'dossier text, row names, values, body position'],
    ['--text-1', '--bg-1', SMALL, 'deck plan credit (10 px) on the panel, not the paper sheet'],
    ['--text-muted', '--bg-1', SMALL, 'row labels, detail lines (11.5 px), row UWP, section headings, hints'],
    ['--signal', '--bg-1', TEXT, 'unparsed UWP line'],
    ['--signal', ['--wash-faint', '--bg-1'], TEXT, 'UWP ribbon digits'],
    ['--text-muted', ['--wash-faint', '--bg-1'], SMALL, 'UWP ribbon labels (9.5 px), mainworld row detail (11.5 px)'],
    ['--text-1', MAINWORLD_ROW, TEXT, 'mainworld row name'],
    ['--signal', ['--wash', '--bg-1'], SMALL, 'code badge, map badge (10.5 px)'],
    ['--text-1', ['--neutral-wash', '--bg-1'], SMALL, 'count pill (10.5 px)'],
    ['--text-1', '--panel-raised', TEXT, 'buttons, chips, fact values, socio headline and rows'],
    ['--text-muted', '--panel-raised', SMALL, 'socio title, fact labels (10.5 px), socio row labels'],
    ['--signal', '--panel-raised', TEXT, 'chip code, button icon'],
    ['--on-signal', '--signal', SMALL, 'mainworld tag (10 px), primary button'],
    ['--on-signal', '--signal-bright', TEXT, 'primary button on hover'],
    ['--zone-green', '--bg-1', TEXT, 'travel zone name, green'],
    ['--zone-amber', '--bg-1', TEXT, 'travel zone name, amber'],
    ['--zone-red', '--bg-1', TEXT, 'travel zone name, red'],
    ['--zone-green', ['--zone-green-wash', '--bg-1'], LARGE, 'travel zone code badge, green (19 px bold)'],
    ['--zone-amber', ['--zone-amber-wash', '--bg-1'], LARGE, 'travel zone code badge, amber (19 px bold)'],
    ['--zone-red', ['--zone-red-wash', '--bg-1'], LARGE, 'travel zone code badge, red (19 px bold)'],
    ['--text-muted', '--bg-0', TEXT, 'surface stage note, map sector names, account role'],
    // Omnibox and status
    ['--text-1', OMNI_FIELD, TEXT, 'omnibox input, status pill'],
    ['--text-2', OMNI_FIELD, TEXT, 'omnibox placeholder'],
    ['--text-muted', OMNI_FIELD, MARK, 'omnibox search icon'],
    ['--text-1', '--chrome-bg', TEXT, 'omnibox result name'],
    ['--text-muted', '--chrome-bg', SMALL, 'omnibox result detail, kind (10 px), status line'],
    ['--signal-active', '--row-active', TEXT, 'selected omnibox result, active rail label'],
    ['--text-1', '--row-active', SMALL, 'selected omnibox result detail and kind (10 px)'],
    // Rail
    ['--rail-text', RAIL, TEXT, 'rail labels'],
    ['--rail-icon', RAIL, MARK, 'rail icons'],
    ['--text-0', '--rail-hover', TEXT, 'rail label on hover'],
    ['--signal-bright', '--row-active', MARK, 'active rail icon'],
    // Orbit view
    ['--text-0', '--stage-head', TEXT, 'orbit view system name'],
    ['--text-muted', '--stage-head', SMALL, 'orbit view place line and age, popover notes'],
    ['--text-2', '--stage-head', TEXT, 'orbit view field labels'],
    ['--text-1', '--stage-head', TEXT, 'orbit view popover text'],
    ['--signal', '--stage-head', TEXT, 'orbit view key names, speed readout'],
    ['--signal', '--bg-2', TEXT, 'orbit view date fields'],
    ['--signal-bright', '--surface-2', TEXT, 'orbit view buttons'],
    ['--signal', '--surface-1', MARK, 'orbit view transport icons'],
    ['--signal-dim', '--stage-head', MARK, 'orbit view button and card borders'],
    ['--control-line', '--stage-head', MARK, 'orbit view field borders, slider track'],
    ['--text-muted', ['--chrome-glass', '--bg-0'], SMALL, 'moon count on a body chip'],
    ['--signal-bright', ['--chrome-glass', '--bg-0'], TEXT, 'mainworld body chip name (12 px)'],
    ['--signal', ['--chrome-glass', '--bg-0'], MARK, 'mainworld star on a body chip'],
    ['--on-signal', '--signal', MARK, 'mainworld star on the selected body chip'],
    ['--signal-dim', '--bg-0', MARK, 'orbit card border on the field'],
    ['--signal', ['--wash', '--stage-head'], SMALL, 'orbit view edition badge (10.5 px)'],
    ['--text-muted', '--stage-head', TEXT, 'orbit view layout buttons and layer chips, idle (12 px)'],
    ['--signal', '--row-active', TEXT, 'orbit view layout button, pressed'],
    ['--text-muted', '--stage-head', TEXT, 'orbit header: drawer tabs, idle (12.5 px), their keys (10.5 px: MARK)'],
    ['--signal', '--row-active', TEXT, 'orbit header: the open drawer tab'],
    ['--signal', '--bg-2', TEXT, 'orbit header: the date readout'],
    ['--text-1', '--bg-2', TEXT, 'orbit header: the readout time'],
    ['--text-muted', '--bg-2', MARK, 'orbit header: the readout separators and icon'],
    ['--text-1', ['--chrome-glass', '--orbit-space'], TEXT, 'orbit drawer: field labels, picture controls, the layout radios, idle'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'orbit drawer: the local time, the on-the-day note (12 px)'],
    ['--signal', ['--chrome-glass', '--orbit-space'], TEXT, 'orbit drawer: the speed readout, field values'],
    ['--signal', ['--chrome-glass', '--orbit-space'], MARK, 'orbit drawer: the hairline at its edge'],
    ['--signal-bright', '--row-active', TEXT, 'orbit drawer: the layout radio, on'],
    ['--text-1', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 strip: the state words, the ship chips, the plot card (12.5 px)'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 strip: Jump while not ready, "No ships here", the destination label (12 px)'],
    ['--attention', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 strip: the words in jump'],
    ['--signal', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 strip: the selected ship chip'],
    ['--on-signal', '--signal', TEXT, 'K12 strip: Jump when ready'],
    ['--text-0', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 strip: the destination name, the plotted body'],
    ['--signal', '--row-active', TEXT, 'K12 plot card: the chosen G'],
    ['--attention', ['--chrome-glass', '--orbit-space'], TEXT, 'View drawer: the Plotting toggle, on'],
    ['--on-signal', '--signal', SMALL, 'ship sheet folded tab count (10 px)'],
    ['--on-signal', '--signal-bright', SMALL, 'ship sheet tab chip, hovered (11 px)'],
    ['--text-1', '--chrome-bg', TEXT, 'person field floating box: menu items, picker, new name'],
    ['--text-muted', '--panel-raised', MARK, 'ship sheet: the + on a passenger berth, idle'],
    ['--text-0', '--panel-raised', TEXT, 'ship sheet: the name on a person pill'],
    ['--signal-dim', '--panel-raised', MARK, 'ship sheet: the edge of a person pill'],
    ['--text-1', '--chrome-bg', TEXT, 'person field menu: Existing person, New person'],
    ['--text-0', '--bg-1', TEXT, 'person card: the name'],
    ['--text-1', '--bg-1', TEXT, 'person card: the summary (13.5 px)'],
    ['--text-muted', '--bg-1', TEXT, 'person card: where (12.5 px)'],
    ['--text-muted', '--bg-1', SMALL, 'person card: the type label (11 px)'],
    ['--text-0', '--surface-2', TEXT, 'orbit view layer chip, checked'],
    ['--signal', '--surface-2', MARK, 'orbit view layer chip icon, checked'],
    ['--daylight', '--night-sky', MARK, 'day and night strip: light against dark'],
    ['--bg-0', '--daylight', MARK, 'day and night play marker: dark edge on the day'],
    ['--text-0', '--night-sky', MARK, 'day and night play marker: light edge on the night'],
    ['--daylight', '--bg-1', MARK, 'day and night strip: light against the panel'],
    ['--text-1', '--orbit-space', SMALL, 'orbit picture: star names (11 px)'],
    ['--text-1', '--orbit-space', TEXT, 'orbit picture: line-up captions (12 px and up)'],
    ['--signal', '--orbit-space', SMALL, 'orbit picture: scan designations (10 px)'],
    ['--text-muted', '--orbit-space', SMALL, 'orbit picture: a companion’s separation (10 px)'],
    ['--signal', '--orbit-space', SMALL, 'orbit picture: the mainworld’s name (10 px)'],
    ['--orbit-lock', '--orbit-tag', SMALL, 'orbit picture: selection tag name (11 px)'],
    ['--signal', '--orbit-tag', SMALL, 'orbit picture: selection tag detail (10 px)'],
    ['--orbit-jump', '--orbit-space', MARK, 'orbit picture: 100D jump circle'],
    ['--orbit-lock', '--orbit-space', MARK, 'orbit picture: selection lock'],
    ['--orbit-hz', '--orbit-space', MARK, 'orbit picture: habitable band edge'],
    ['--text-1', ['--chrome-glass', '--orbit-space'], TEXT, 'body card lines (12 px)'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'body card labels, type, season note (12 px)'],
    ['--signal', ['--chrome-glass', '--orbit-space'], TEXT, 'body card title, season help mark'],
    ['--text-1', ['--chrome-glass', '--orbit-space'], TEXT, 'orbit legend lines (12 px)'],
    ['--orbit-hz', ['--chrome-glass', '--orbit-space'], MARK, 'orbit legend: habitable swatch'],
    ['--orbit-jump', ['--chrome-glass', '--orbit-space'], MARK, 'orbit legend: jump circle swatch'],
    ['--signal', ['--chrome-glass', '--orbit-space'], MARK, 'orbit legend: mainworld star'],
    ['--signal-bright', ['--chrome-glass', '--orbit-space'], TEXT, 'Fit button'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'Fit button while the view is fitted'],
    // Controls and focus
    ['--control-line', '--bg-1', MARK, 'button and accordion border in the panel'],
    ['--control-line', '--surface-1', MARK, 'width control border in the panel header'],
    ['--control-line', '--bg-0', MARK, 'omnibox field border over the map'],
    ['--focus-ring', '--bg-0', MARK, 'focus ring over the map'],
    ['--focus-ring', '--bg-1', MARK, 'focus ring in the panel'],
    ['--focus-ring', '--surface-1', MARK, 'focus ring in the panel header'],
    ['--focus-ring', '--panel-raised', MARK, 'focus ring on a raised control'],
    ['--signal-dim', '--scroll-track', MARK, 'scrollbar thumb'],
    // Body glyphs
    ['--glyph-rock', '--bg-1', MARK, 'world glyph'],
    ['--glyph-belt', '--bg-1', MARK, 'belt glyph'],
    ['--glyph-gas', '--bg-1', MARK, 'gas giant glyph'],
    ['--star-bd', '--bg-1', MARK, 'dimmest star glyph'],
    // Map (canvas)
    ['--chart-world', '--bg-0', TEXT, 'map hex numbers, UWP lines, names, port letters'],
    ['--chart-title-text', ['--chart-title-pill@0.55', '--bg-0'], TEXT, 'subsector title on its pill at 55%'],
    ['--text-1', '--bg-0', TEXT, 'map far labels, design page text'],
    ['--signal', '--bg-0', TEXT, 'map subsector titles, account heading'],
    ['--chart-water', '--bg-0', MARK, 'wet-world disc'],
    ['--chart-zone-amber', '--bg-0', MARK, 'amber zone ring'],
    ['--chart-zone-red', '--bg-0', MARK, 'red zone ring'],
    ['--chart-selected', '--bg-0', MARK, 'selected hex outline'],
    // Account and design pages
    ['--text-2', '--bg-0', TEXT, 'account page text'],
    ['--text-faint', '--bg-0', TEXT, 'design page captions'],
    ['--attention', '--bg-0', TEXT, 'account error line'],
    ['--bg-0', '--signal', TEXT, 'account primary button'],
    ['--signal-dim', '--bg-0', MARK, 'account button border'],
    // The account pop-up and the Campaign panel's sign-in and loading states (K5a)
    ['--text-0', '--chrome-bg', TEXT, 'account pop-up heading and name'],
    ['--attention', '--chrome-bg', TEXT, 'sign-in error and offline line in the pop-up (12.5 px)'],
    ['--attention', '--bg-1', TEXT, 'sign-in error and offline line in the Campaign panel (12.5 px)'],
    ['--text-muted', '--bg-1', TEXT, 'Campaign panel fine print (12 px) and empty line'],
    ['--signal', ['--wash', '--rail-glass', '--bg-0'], TEXT, 'initials on the rail (12 px bold)'],
    ['--signal', ['--wash', '--chrome-bg'], TEXT, 'initials at the head of the account menu (14 px)'],
    ['--signal-dim', '--chrome-bg', MARK, 'account pop-up border, initials ring'],
    ['--text-1', '--row-active', TEXT, 'account menu item under the pointer or focus (14 px)'],
    ['--signal', '--row-active', MARK, 'account menu item icon under the pointer or focus'],
    ['--danger', '--panel-raised', MARK, 'error strip edge'],
    ['--attention', '--panel-raised', MARK, 'offline strip edge'],
    // The record list, the record page and the toast (K5b)
    ['--text-0', '--panel-raised', TEXT, 'record row name, first-run heading'],
    ['--text-0', '--row-active', TEXT, 'record row name, selected'],
    ['--text-muted', '--row-active', TEXT, 'record row type and place line, selected (12 px)'],
    ['--text-muted', '--surface-1', TEXT, 'record row type and place line under the pointer (12 px)'],
    ['--signal', ['--wash-faint', '--panel-raised'], MARK, 'record row type glyph'],
    ['--signal', '--row-active', TEXT, 'type chip, chosen'],
    ['--text-0', '--bg-2', TEXT, 'record search and tag field text'],
    ['--text-muted', '--bg-2', TEXT, 'record search placeholder and icon'],
    ['--signal', '--chrome-bg', MARK, 'Add menu type icons'],
    ['--text-0', '--bg-1', TEXT, 'record name, tag under the pointer'],
    ['--danger', '--bg-1', TEXT, 'Delete under the pointer, "Not saved" (12 px)'],
    ['--danger', '--panel-raised', TEXT, 'Delete button under the pointer'],
    ['--signal-dim', '--bg-1', MARK, 'toast edge, tag border under the pointer'],
    ['--signal', '--bg-1', TEXT, 'toast action, "Saving" mark'],
    // Places: the Where block and its editor, Locate, and a dossier's "your records here" (K5c)
    ['--text-muted', '--bg-1', TEXT, 'where: the system line, "Nowhere in particular" (13 px)'],
    ['--text-1', '--row-active', SMALL, 'where: chosen body row, its detail line (11.5 px) and UWP'],
    ['--signal', '--row-active', TEXT, 'Locating (pressed), on the record page and on a row'],
    ['--control-line', '--panel-raised', MARK, 'Locate button border on a record row'],
    ['--signal', '--bg-1', MARK, 'Locate icon on a record row'],
    ['--text-muted', '--panel-raised', TEXT, 'where: hints and the picked system line (13 px); records here: row detail (12 px)'],
    ['--signal', ['--wash', '--bg-1'], SMALL, 'system tree: count of records on a body (10.5 px)'],
    // The orbit view's week step and More menu
    ['--text-muted', '--stage-head', TEXT, 'More menu: the note under an item (12 px)'],
    ['--text-muted', '--row-active', TEXT, 'More menu: the note under an item, under the pointer or focus (12 px)'],
    ['--signal', '--stage-head', TEXT, 'More menu: the way back, the item icons'],
    // Connections: the chips, the add steps and the record picker (K5d)
    ['--text-0', '--panel-raised', TEXT, 'connection chip: the other record (12.5 px)'],
    ['--text-1', '--panel-raised', TEXT, 'connection chip: the role (12.5 px)'],
    ['--text-muted', '--panel-raised', TEXT, 'connection chip: an empty role, the remove mark; group headings on the page'],
    ['--text-0', '--row-active', TEXT, 'connection chip under the pointer; a kind chosen'],
    ['--text-muted', '--bg-1', TEXT, 'kind rows: the other record’s name (13 px); picker: a row’s detail (12 px)'],
    ['--text-1', '--row-active', TEXT, 'kind row chosen: the name; picker row chosen: its detail (12 px)'],
    ['--text-0', '--bg-2', TEXT, 'role fields and the picker’s search'],
    ['--signal', '--panel-raised', MARK, 'connection chip icons'],
    // The journal tab, its list and an entry (K7)
    ['--text-0', '--surface-1', TEXT, 'journal: the panel title'],
    ['--signal', '--surface-1', TEXT, 'journal: the campaign name'],
    ['--text-muted', '--bg-1', TEXT, 'journal: an idle tab, a hint, an empty prompt (12 px and up)'],
    ['--signal', '--bg-1', TEXT, 'journal: the open tab and its count, the saving mark'],
    ['--text-0', '--bg-1', TEXT, 'journal: the title and the in-fiction date'],
    ['--text-1', '--bg-1', TEXT, 'journal: the body and the kind select'],
    ['--text-0', '--panel-raised', TEXT, 'journal: a row name'],
    ['--text-1', '--panel-raised', TEXT, 'journal: a kind chip and a button'],
    ['--text-muted', '--panel-raised', TEXT, 'journal: a row date line and a chip count (12 px)'],
    ['--signal', '--panel-raised', TEXT, 'journal: the session number'],
    ['--signal', '--row-active', TEXT, 'journal: the kind chip that is on, the visibility segment that is on'],
    ['--text-0', '--row-active', TEXT, 'journal: the open row name'],
    ['--text-muted', '--row-active', TEXT, 'journal: the open row date line (12 px)'],
    ['--text-muted', '--bg-2', TEXT, 'journal: the search placeholder and an empty date field'],
    ['--text-0', '--bg-2', TEXT, 'journal: text being typed'],
    ['--on-signal', '--signal', TEXT, 'journal: New session'],
    ['--danger', '--bg-1', TEXT, 'journal: Delete, Not saved'],
    ['--attention', '--bg-1', MARK, 'journal: the Players edge and the focus ring'],
    ['--signal', ['--wash-faint', '--panel-raised'], MARK, 'journal: the kind glyph'],
    // The party tab, the campaign group in the omnibox, the list's chip and order (K5e)
    ['--text-muted', '--bg-1', TEXT, 'tabs at rest (13 px), the party line beside Party (12 px), the order control'],
    ['--signal', '--bg-1', TEXT, 'the tab chosen, its count'],
    ['--text-0', '--panel-raised', TEXT, 'party: the ship, a member'],
    ['--text-muted', '--panel-raised', TEXT, 'party: a member role or place (12 px)'],
    // The track on a vessel's page (K12)
    ['--signal', '--panel-raised', TEXT, 'track: a flight leg\'s mode (12 px bold)'],
    ['--attention', '--panel-raised', TEXT, 'track: a jump leg\'s mode (12 px bold)'],
    ['--text-muted', '--panel-raised', TEXT, 'track: a resting leg\'s mode, the leg number, the dates, a note (12 px)'],
    ['--text-1', '--panel-raised', TEXT, 'track: a leg\'s origin, its G (12 px mono)'],
    ['--signal', '--bg-1', TEXT, 'track: "Show n earlier legs" (12.5 px)'],
    // The measuring pass (K12 part 2): the estimates on the previews, the party under way
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 previews: an estimate line, the fuel lines, "set by hand" (12 px)'],
    ['--text-1', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 jump preview: the roll beside its field (12 px mono)'],
    ['--text-0', '--bg-1', TEXT, 'party: "In flight …" where the place would stand (20 px)'],
    ['--attention', '--bg-1', TEXT, 'party: "In jump to …" where the place would stand (20 px)'],
    // The orbit header's readout says where the view stands against the campaign date (follow-up 19)
    ['--signal', '--bg-2', MARK, 'orbit readout: the calendar, the view on the campaign date'],
    // The reset before Play (Johnny, 2026-10-06): live off the campaign date, quiet (disabled) on it
    ['--attention', ['--chrome-glass', '--orbit-space'], MARK, 'orbit header: the reset, live (its icon)'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], MARK, 'orbit header: the reset, quiet, before its 60% (a disabled control)'],
    // The ships' tags, drawn as the planet's selection tag, and the course card (follow-up 28)
    ['--orbit-lock', ['--orbit-tag', '--orbit-space'], SMALL, 'ship tag, selected: the name (11 px bold mono), as the planet tag has it'],
    ['--signal', ['--orbit-tag', '--orbit-space'], SMALL, 'ship tag, selected: the state (10 px mono); the party ship unselected: its name (11 px)'],
    ['--text-0', ['--orbit-tag', '--orbit-space'], SMALL, 'ship tag, another ship unselected: its name (11 px bold mono)'],
    ['--text-1', ['--orbit-tag', '--orbit-space'], SMALL, 'ship tag, unselected: the state (10 px mono)'],
    ['--orbit-lock', '--orbit-space', MARK, 'ship tag, selected: its edge, bar and leader'],
    ['--signal', '--orbit-space', MARK, 'ship tag, the party ship: its edge, bar and leader'],
    ['--text-1', '--orbit-space', MARK, 'ship tag, another ship: its leader'],
    ['--attention', ['--chrome-glass', '--orbit-space'], TEXT, 'course card: the number of a waypoint (12 px mono)'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'K12 plot card: the dates under the destination (12 px)'],
    ['--text-muted', '--chrome-bg', SMALL, 'omnibox group labels (10.5 px)'],
    ['--text-1', '--bg-2', SMALL, 'omnibox "Person here" and "Place here" (11 px bold)'],
    ['--signal', '--bg-2', SMALL, 'omnibox "Person here" highlighted (11 px bold)'],
    // Several campaigns: the account menu's list, forms and the delete question (K5f)
    ['--text-muted', '--chrome-bg', SMALL, 'account menu: "Your campaigns" (10.5 px), a campaign not open: its icon'],
    ['--text-0', '--chrome-bg', TEXT, 'account menu: the open campaign, the delete question'],
    ['--text-1', '--chrome-bg', TEXT, 'account menu: field labels (12.5 px)'],
    ['--attention', '--chrome-bg', TEXT, 'account menu: "That could not be done" (12.5 px)'],
    ['--danger', '--chrome-bg', MARK, 'account menu: the delete icon'],
    ['--bg-0', '--danger', TEXT, 'the Delete button on the red'],
    // The campaign date: the chip beside the search bar, the panel line, the orbit view mark (K6c)
    ['--text-0', OMNI_FIELD, TEXT, 'date chip: the date (16 px mono)'],
    ['--text-muted', OMNI_FIELD, TEXT, 'date chip: the weekday (13 px); signed out, its icon'],
    ['--text-1', OMNI_FIELD, TEXT, 'date chip signed out: the date; "No campaign date"'],
    ['--signal', OMNI_FIELD, MARK, 'date chip: the icon'],
    ['--text-0', '--bg-2', TEXT, 'the date field'],
    ['--text-1', '--surface-2', TEXT, 'orbit view: the campaign mark (13 px)'],
    ['--text-muted', '--surface-2', TEXT, 'orbit view: the weekday on the mark (13 px)'],
    // Images: the gallery strip, its marks, the lightbox (K14)
    ['--on-signal', '--signal', SMALL, 'the Primary tag on a thumbnail (9.5 px)'],
    ['--text-0', '--chrome-bg', MARK, 'the marks on a thumbnail (make primary, remove)'],
    ['--danger', '--chrome-bg', MARK, 'the remove mark under the pointer'],
    ['--text-muted', '--bg-1', TEXT, 'the add tile, the hint under the strip (12.5 px), a caption'],
    ['--text-0', '--bg-1', TEXT, 'lightbox: the count'],
    ['--text-muted', '--bg-1', TEXT, 'lightbox: the size line (12.5 px)'],
    ['--text-0', ['--chrome-glass', '--bg-0'], MARK, 'lightbox: the previous and next arrows'],
    // The orbit showpiece: the key, the corner control, the scrub, the date readout (K15)
    ['--text-1', ['--chrome-glass', '--orbit-space'], TEXT, 'key: an entry on (12 px)'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'key: an entry off (12 px); the corner control at rest'],
    ['--orbit-ring', ['--chrome-glass', '--orbit-space'], MARK, 'key: the paths mark'],
    ['--orbit-hz', ['--chrome-glass', '--orbit-space'], MARK, 'key: the habitable mark'],
    ['--orbit-jump', ['--chrome-glass', '--orbit-space'], MARK, 'key: the jump limit mark'],
    ['--daylight', ['--chrome-glass', '--orbit-space'], MARK, 'key: the day half of the day/night mark'],
    ['--signal', ['--chrome-glass', '--orbit-space'], MARK, 'key: the scan box and the mainworld star; the corner control chosen'],
    ['--signal', '--row-active', TEXT, 'the corner control, chosen'],
    ['--text-2', '--stage-head', TEXT, 'the scrub’s end labels (11.5 px)'],
    ['--attention', '--stage-head', MARK, 'the campaign date on the scrub’s track'],
    ['--signal', '--bg-2', TEXT, 'the date readout'],
    // The ship sheet (K13): the tabs, the value tags, the frame, the fields
    ['--on-signal', '--signal', SMALL, 'sheet: a section tab (11 px)'],
    ['--text-0', '--sheet-rust', TEXT, 'sheet: a value in its rust-red tag (13 px mono bold)'],
    ['--sheet-rust-line', '--panel-raised', MARK, 'sheet: an empty value tag, its edge'],
    ['--text-1', '--panel-raised', TEXT, 'sheet: a field label (12.5 px), a row heading'],
    ['--text-muted', '--panel-raised', SMALL, 'sheet: a column heading (10.5 px), a page label'],
    ['--text-0', '--bg-2', TEXT, 'sheet: a value in a table cell or a tall field'],
    // The ship's nav console (follow-up 29): the sheet's tab and rust tag, the readout's well, on the picture's glass
    ['--on-signal', '--signal', SMALL, 'nav console: the tab and the ship in it (11 px)'],
    ['--text-0', '--sheet-rust', TEXT, 'nav console: the thrust in its rust tag (13 px mono bold)'],
    ['--text-muted', '--bg-2', TEXT, 'nav console: the thrust tag before a thrust is set; the readout labels (12 px)'],
    ['--signal-bright', '--bg-2', TEXT, 'nav console: the arrival (20 px mono bold)'],
    ['--signal', '--bg-2', TEXT, 'nav console: range and time; a leg hours field'],
    ['--text-0', '--bg-2', TEXT, 'nav console: the place under the plotter'],
    ['--attention', '--bg-2', TEXT, 'nav console: a leg hours field, typed'],
    ['--attention', '--bg-2', MARK, 'nav console: a typed hours field, its edge'],
    ['--text-muted', ['--chrome-glass', '--orbit-space'], TEXT, 'nav console: labels, a notch figure, the quiet lines, Release (12 px)'],
    ['--signal', ['--chrome-glass', '--orbit-space'], TEXT, 'nav console: a lit notch figure'],
    ['--signal', ['--chrome-glass', '--orbit-space'], MARK, 'nav console: a lit notch'],
    ['--control-line', ['--chrome-glass', '--orbit-space'], MARK, 'nav console: an unlit notch, its edge'],
    ['--attention', ['--chrome-glass', '--orbit-space'], TEXT, 'nav console: a leg number; the words asking for a thrust'],
    ['--text-0', ['--chrome-glass', '--orbit-space'], TEXT, 'nav console: a leg name, the total'],
    ['--text-1', ['--chrome-glass', '--orbit-space'], TEXT, 'nav console: a leg arrival'],
    ['--on-signal', '--signal', TEXT, 'nav console: Add course, the one filled control'],
    // The character sheet (K13 part 4): what it adds to the ship sheet's pairs
    ['--signal', '--bg-2', TEXT, 'character sheet: a typed DM; a profile hex value'],
    ['--text-muted', '--bg-2', TEXT, 'character sheet: the DM mark, a hex name (12 px)'],
    ['--text-muted', '--panel-raised', TEXT, 'character sheet: an idle skill name, a line number, a note (12 px and up)'],
    ['--text-0', '--panel-raised', TEXT, 'character sheet: a skill with something typed'],
    ['--attention', '--panel-raised', TEXT, 'character sheet: the found words in a skill name'],
    ['--signal', '--row-active', TEXT, 'character sheet: the All / Trained switch, on'],
    ['--control-line', '--panel-raised', MARK, 'character sheet: the DM tag and the switch, their edge'],
    ['--attention', '--panel-raised', MARK, 'sheet box: the dashed ring of a box someone else is in'],
    ['--signal', '--panel-raised', MARK, 'sheet box: the ring on a value that arrived'],
    ['--text-0', '--sheet-rust', TEXT, 'record page: the PC tag (12 px mono bold)'],
    // Presence on a live sheet: the colours the Characters store hands out (characters/types.ts PRESENCE_TONES), as the dashed ring and the name's edge.
    // Tone 2 is --sheet-rust-line. --sheet-rust itself is 2.88:1 as a ring, under the 3:1 a mark needs.
    ['--signal', '--panel-raised', MARK, 'presence: the dashed ring round a box someone is in'],
    ['--attention', '--panel-raised', MARK, 'presence: the dashed ring round a box someone is in'],
    ['--zone-green', '--panel-raised', MARK, 'presence: the dashed ring round a box someone is in'],
    ['--star-k', '--panel-raised', MARK, 'presence: the dashed ring round a box someone is in'],
    ['--star-o', '--panel-raised', MARK, 'presence: the dashed ring round a box someone is in'],
    ['--danger', '--panel-raised', MARK, 'presence: the dashed ring round a box someone is in'],
    ['--text-0', '--panel-raised', MARK, 'presence: the dashed ring round a box someone is in'],
    ['--text-0', '--bg-2', TEXT, 'presence: the name of the person in a box (12 px bold), whatever their colour'],
    ['--signal', '--panel-raised', TEXT, 'person page: an attached Character, Live'],
    ['--attention', '--panel-raised', TEXT, 'person page: an attached Character, connecting or offline'],
    ['--text-muted', '--bg-2', TEXT, 'person page: whose a Character is, in the picker (12 px)'],
    // Characters: the library, the share section and the claim page
    ['--text-0', '--panel-raised', TEXT, 'characters: a row name'],
    ['--text-muted', '--panel-raised', TEXT, 'characters: a row’s summary, who is here (12 px)'],
    ['--text-1', '--panel-raised', TEXT, 'characters: a row’s button, the claim page body'],
    ['--text-muted', '--bg-1', TEXT, 'characters: the owner line and the live status (12 px)'],
    ['--text-0', '--bg-1', TEXT, 'characters: a presence mark’s name'],
    ['--text-0', '--bg-2', TEXT, 'characters: a name being typed, the share link'],
    ['--text-muted', '--bg-2', TEXT, 'characters: the search placeholder'],
    ['--danger', '--bg-1', TEXT, 'characters: Delete, a failed claim'],
    ['--signal', '--bg-1', MARK, 'characters: presence 0, the mark’s edge'],
    ['--attention', '--bg-1', MARK, 'characters: presence 1, the mark’s edge'],
    ['--sheet-rust-line', '--bg-1', MARK, 'characters: presence 2, the mark’s edge'],
    ['--zone-green', '--bg-1', MARK, 'characters: presence 3, the mark’s edge'],
    ['--star-k', '--bg-1', MARK, 'characters: presence 4, the mark’s edge'],
    ['--star-o', '--bg-1', MARK, 'characters: presence 5, the mark’s edge'],
    ['--danger', '--bg-1', MARK, 'characters: presence 6, the mark’s edge'],
    ['--text-0', '--bg-1', MARK, 'characters: presence 7, the mark’s edge'],
    ['--text-0', '--bg-0', TEXT, 'claim: the page behind the card'],
    ['--attention', '--bg-1', MARK, 'characters: the focus ring'],
    // Build (workspace/build/, the dossier panel in Build)
    ['--attention', '--surface-1', SMALL, 'build: Preview or Removed, the last word of the panel breadcrumb (10.5 px)'],
    ['--text-1', '--surface-1', SMALL, 'build: the subsector in the panel breadcrumb (10.5 px)'],
    ['--signal', OMNI_FIELD, SMALL, 'build strip: Building (10 px), the count'],
    ['--text-0', OMNI_FIELD, TEXT, 'build strip: the universe’s name'],
    ['--text-muted', OMNI_FIELD, TEXT, 'build strip: on the chart, the key hint'],
    ['--danger', '--panel-raised', TEXT, 'build: Remove button'],
    ['--danger', '--chrome-bg', TEXT, 'build menu: Remove from my map'],
    ['--text-1', '--chrome-bg', TEXT, 'build menu: an act'],
    ['--text-muted', '--chrome-bg', SMALL, 'build menu: its title (11 px), an act’s second line, the key hint'],
    ['--signal-active', '--row-active', TEXT, 'generate sheet: the chosen option'],
    ['--text-muted', '--panel-raised', SMALL, 'generate sheet: not yet, bottom up only; the next mark on Edit (10 px)'],
    ['--on-signal', '--signal', SMALL, 'build: the key hint on the filled Generate button (11 px)'],
    ['--signal', ['--wash', '--bg-1'], SMALL, 'build: Yours tag (10 px)'],
    ['--text-1', ['--neutral-wash', '--bg-1'], SMALL, 'build: Chart tag (10 px)'],
    ['--chart-selected', '--bg-0', MARK, 'build marks: a selected hex, a previewed hex'],
    ['--text-faint', '--bg-0', MARK, 'build marks: a removed hex'],
    ['--signal', '--panel-raised', TEXT, 'build: a subsector’s name on the sector page'],
    ['--text-muted', '--panel-raised', SMALL, 'build: a subsector’s letter (11 px)'],
];

if (process.env.CONTRAST_REPORT) {
    for (const [fg, bg, min, where] of PAIRS) {
        const value = ratio(fg, bg);
        console.log((value < min ? 'FAIL ' : 'ok   ') + value.toFixed(2).padStart(6) + '  min ' + min + '  ' + fg + ' on ' + [].concat(bg).join(' over ') + '  (' + where + ')');
    }
}

for (const [fg, bg, min, where] of PAIRS) {
    test('contrast ' + fg + ' on ' + [].concat(bg).join(' over ') + ' is at least ' + min + ': ' + where, () => {
        const value = ratio(fg, bg);
        assert.ok(value >= min, where + ': ' + value.toFixed(2) + ' is below ' + min);
    });
}
