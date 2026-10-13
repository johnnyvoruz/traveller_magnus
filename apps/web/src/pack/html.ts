/**
 * The Player Pack as one HTML file. Styles and the notes script are inline.
 * The file asks for nothing over the network. Colours are the app's tokens,
 * passed in already resolved, so this file has no colour literal of its own.
 */
import type { PackPaint } from './paint.ts';
import type { PackPlan } from './plan.ts';

function css(value: string): string {
    const clean = value.replace(/[{}<>;]/g, '').trim();
    return clean || 'black';
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function notes(id: string): string {
    return '<div class="notes">'
        + '<label>Your notes<textarea data-note="' + escapeHtml(id) + '"></textarea></label>'
        + '<button type="button" data-save-notes>Download my notes</button>'
        + '<p class="hint">Download my notes saves the copy that lasts. The box itself is only a convenience, and a file opened from disk may not keep it.</p>'
        + '</div>';
}

function block(title: string, text: string | null): string {
    if (!text || !text.trim()) return '';
    return '<h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
}

const NOTES_SCRIPT = [
    '(function () {',
    '  var root = document.querySelector("[data-pack]");',
    '  var packName = root ? (root.getAttribute("data-pack") || "campaign") : "campaign";',
    '  var areas = document.querySelectorAll("textarea[data-note]");',
    '  for (var i = 0; i < areas.length; i++) {',
    '    var area = areas[i];',
    '    var id = area.getAttribute("data-note") || "";',
    '    try {',
    '      var stored = localStorage.getItem("voyage.playerPack." + packName + "." + id);',
    '      if (stored) area.value = stored;',
    '    } catch (err) {}',
    '    area.addEventListener("input", onType);',
    '  }',
    '  function onType(event) {',
    '    var box = event.currentTarget;',
    '    if (!box || !box.getAttribute) return;',
    '    try {',
    '      localStorage.setItem("voyage.playerPack." + packName + "." + (box.getAttribute("data-note") || ""), box.value);',
    '    } catch (err) {}',
    '  }',
    '  var buttons = document.querySelectorAll("[data-save-notes]");',
    '  for (var j = 0; j < buttons.length; j++) buttons[j].addEventListener("click", saveNotes);',
    '  function saveNotes() {',
    '    var notes = {};',
    '    var list = document.querySelectorAll("textarea[data-note]");',
    '    for (var k = 0; k < list.length; k++) {',
    '      var item = list[k];',
    '      if (!item.value) continue;',
    '      notes[item.getAttribute("data-note") || String(k)] = item.value;',
    '    }',
    '    var blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });',
    '    var url = URL.createObjectURL(blob);',
    '    var link = document.createElement("a");',
    '    link.href = url;',
    '    link.download = "player_notes_" + packName + ".json";',
    '    document.body.appendChild(link);',
    '    link.click();',
    '    link.remove();',
    '  }',
    '})();',
].join('\n');

/** One self-contained file. `paint` is the token colours already read from the page. */
export function renderPack(plan: PackPlan, paint: PackPaint): string {
    const counts = plan.counts;
    const audit = [
        ['Records left out', counts.recordsLeftOut],
        ['Journal entries left out', counts.entriesLeftOut],
        ['Links left out', counts.linksLeftOut],
        ['Links shown without their role or notes', counts.linkTextLeftOff],
        ['Mentions shown as a record', counts.mentions],
        ['Places left out', counts.places],
        ['Party members left out', counts.partyMembers],
        ['Ship left out', counts.ship],
        ['Timeline rows after the campaign date', counts.timeline],
    ];
    const auditList = audit.map((row) => '<li>' + row[0] + ': ' + row[1] + '</li>').join('');
    const contents = [
        '<li><a href="#party">Party</a></li>',
        '<li><a href="#timeline">Timeline</a></li>',
        ...plan.records.map((row) => '<li><a href="#r-' + escapeHtml(row.id) + '">' + escapeHtml(row.name) + '</a></li>'),
        ...plan.entries.map((row) => '<li><a href="#e-' + escapeHtml(row.id) + '">' + escapeHtml(row.title) + '</a></li>'),
    ].join('');

    const partyMembers = plan.party.members.length
        ? '<ul>' + plan.party.members.map((member) => '<li><a href="#r-' + escapeHtml(member.id) + '">' + escapeHtml(member.name) + '</a></li>').join('') + '</ul>'
        : '<p>No party member is marked for players.</p>';
    const ship = plan.party.ship
        ? '<p>Ship: <a href="#r-' + escapeHtml(plan.party.ship.id) + '">' + escapeHtml(plan.party.ship.name) + '</a></p>'
        : '<p>No ship is marked for players.</p>';

    const timeline = plan.timeline.length
        ? '<ol class="timeline">' + plan.timeline.map((row) => (
            '<li><a href="#' + (row.id.startsWith('cj_') ? 'e-' : 'r-') + escapeHtml(row.id) + '">'
            + '<b>' + escapeHtml(row.date) + '</b> ' + escapeHtml(row.weekday) + ' · '
            + escapeHtml(row.title) + ' <span>' + escapeHtml(row.kind) + '</span>'
            + (row.place ? ' · ' + escapeHtml(row.place) : '')
            + '</a></li>'
        )).join('') + '</ol>'
        : '<p>No dated row falls on or before the campaign date.</p>';

    const records = plan.records.map((row) => (
        '<article id="r-' + escapeHtml(row.id) + '">'
        + '<p class="kind">' + escapeHtml(row.typeName) + (row.kind ? ' · ' + escapeHtml(row.kind) : '') + '</p>'
        + '<h2>' + escapeHtml(row.name) + '</h2>'
        + block('Summary', row.summary)
        + block('Details', row.details)
        + (row.tags.length ? '<p class="tags">' + row.tags.map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('') + '</p>' : '')
        + (row.when ? '<p>In fiction: ' + escapeHtml(row.when) + '</p>' : '')
        + (row.place ? '<p>Place: ' + escapeHtml(row.place) + '</p>' : '')
        + block('Notes for players', row.playerNotes)
        + block('Sheet', row.sheet)
        + block('Status', row.status)
        + '<h3>Connections</h3>'
        + connectionList(plan, row.id)
        + notes('r-' + row.id)
        + '</article>'
    )).join('');

    const entries = plan.entries.map((row) => (
        '<article id="e-' + escapeHtml(row.id) + '">'
        + '<p class="kind">' + escapeHtml(row.kindName) + '</p>'
        + '<h2>' + escapeHtml(row.title) + '</h2>'
        + '<p>' + escapeHtml(row.author) + (row.when ? ' · ' + escapeHtml(row.when) : '') + (row.played ? ' · Played ' + escapeHtml(row.played) : '') + '</p>'
        + (row.place ? '<p>Place: ' + escapeHtml(row.place) + '</p>' : '')
        + '<div class="body"><p>' + escapeHtml(row.body).replace(/\n/g, '<br>') + '</p></div>'
        + notes('e-' + row.id)
        + '</article>'
    )).join('');

    const dateLine = plan.noDate
        ? 'Campaign date: no date. The timeline includes every dated row that is marked for players.'
        : 'Campaign date: ' + escapeHtml(plan.clockLabel) + '. The timeline stops on that day.';

    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        + '<meta name="viewport" content="width=device-width, initial-scale=1">'
        + '<title>' + escapeHtml(plan.name) + ' — Player Pack</title>'
        + '<style>'
        + 'body{margin:0;background:' + css(paint.bg) + ';color:' + css(paint.text) + ';font:16px/1.5 sans-serif;}'
        + 'main{max-width:42rem;margin:0 auto;padding:24px 16px 64px;}'
        + 'h1,h2,h3{font-family:sans-serif;line-height:1.25;}'
        + 'h1{font-size:1.6rem;margin:0 0 8px;}'
        + 'a{color:' + css(paint.signal) + ';}'
        + 'article,section{margin:28px 0;padding-top:8px;border-top:1px solid ' + css(paint.line) + ';}'
        + '.kind,.hint,li span{color:' + css(paint.muted) + ';}'
        + '.audit,.timeline{padding-left:1.2rem;}'
        + '.tags span{display:inline-block;margin:0 6px 6px 0;padding:2px 8px;border:1px solid ' + css(paint.line) + ';border-radius:999px;}'
        + 'textarea{display:block;width:100%;min-height:6rem;box-sizing:border-box;margin-top:6px;padding:8px;border:1px solid ' + css(paint.line) + ';border-radius:6px;background:' + css(paint.surface) + ';color:' + css(paint.text) + ';font:inherit;}'
        + 'button{margin-top:8px;padding:8px 12px;border:0;border-radius:6px;background:' + css(paint.signal) + ';color:' + css(paint.onSignal) + ';font:inherit;cursor:pointer;}'
        + '@media (max-width:640px){main{padding:16px 12px 48px;}h1{font-size:1.35rem;}}'
        + '</style></head><body>'
        + '<main data-pack="' + escapeHtml(fileSlug(plan.name)) + '">'
        + '<header><p class="kind">Player Pack</p><h1>' + escapeHtml(plan.name) + '</h1>'
        + '<p>' + dateLine + '</p>'
        + '<p>This file leaves out the map and the images. Anything that is not marked for players is left out. The counts below name no one.</p>'
        + '<h2>Left out</h2><ul class="audit">' + auditList + '</ul>'
        + notes('cover')
        + '<h2>Contents</h2><ul>' + contents + '</ul></header>'
        + '<section id="party"><h2>Party</h2>' + ship + partyMembers + notes('party') + '</section>'
        + '<section id="timeline"><h2>Timeline</h2>'
        + (plan.noDate ? '<p>This campaign has no date.</p>' : '')
        + timeline + notes('timeline') + '</section>'
        + records + entries
        + '</main><script>' + NOTES_SCRIPT + '</script></body></html>';
}

function connectionList(plan: PackPlan, id: string): string {
    const rows = plan.links.filter((link) => link.fromId === id || link.toId === id);
    if (!rows.length) return '<p>No connection to another record that is marked for players.</p>';
    return '<ul>' + rows.map((link) => {
        const otherId = link.fromId === id ? link.toId : link.fromId;
        const otherName = link.fromId === id ? link.toName : link.fromName;
        return '<li>' + escapeHtml(link.kind) + ' <a href="#r-' + escapeHtml(otherId) + '">' + escapeHtml(otherName) + '</a></li>';
    }).join('') + '</ul>';
}

function fileSlug(name: string): string {
    const clean = name.replace(/[^A-Za-z0-9._ -]+/g, '').trim().replace(/\s+/g, '-');
    return clean || 'campaign';
}
