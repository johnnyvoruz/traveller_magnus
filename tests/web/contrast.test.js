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
    ['--text-0', '--surface-2', TEXT, 'orbit view layer chip, checked'],
    ['--signal', '--surface-2', MARK, 'orbit view layer chip icon, checked'],
    ['--daylight', '--night-sky', MARK, 'day and night strip: light against dark'],
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
