/**
 * XD3 (spec_xboat_ripples.md §4.2, §5 D3): a record or a journal entry with a date and a place can be
 * the news. The rule is pure (map/news_ask.ts); the button is SpreadNews.vue on both pages; the map
 * opens the ripple from the place on the date, the scrubber at Today. Nothing is written.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { askNews, onNewsAsk, spreadState } from '../../apps/web/src/map/news_ask.ts';
import { totalDays } from '../../apps/web/src/orbit/clock.ts';

test('date and place: the news, from that place on that day', () => {
    const state = spreadState({ year: 1105, day: 141 }, 'Spinward_Marches/1910');
    assert.deepEqual(state, { ok: true, ask: { hexKey: 'Spinward_Marches/1910', day0: totalDays(1105, 141) } });
});

test('a date and no place: unable, and the line says the place is missing; no date: no button', () => {
    assert.deepEqual(spreadState({ year: 1105, day: 141 }, null), { ok: false, why: 'To spread this news, add a place.' });
    assert.equal(spreadState(null, 'Spinward_Marches/1910'), null, 'a place and no date: no button (decided 23:10)');
    assert.equal(spreadState(null, null), null);
});

test('the ask reaches the map while it listens, and nothing after', () => {
    const heard = [];
    const stop = onNewsAsk((ask) => heard.push(ask));
    assert.equal(askNews({ hexKey: 'A/0101', day0: 5 }), true);
    stop();
    assert.equal(askNews({ hexKey: 'A/0101', day0: 6 }), false);
    assert.deepEqual(heard, [{ hexKey: 'A/0101', day0: 5 }]);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(root, 'apps/web/src', rel), 'utf8');

test('the button on records and entries, keyed on date and place, never on kind; the map at Today', () => {
    const record = read('workspace/RecordPage.vue');
    assert.match(record, /<SpreadNews :when="record\.when \? record\.when\.start : null" :anchor="where\.anchor" :locate-id="id" @map="emit\('map'\)" \/>/);
    const entry = read('workspace/journal/EntryPage.vue');
    assert.match(entry, /<SpreadNews :when="entry\.when" :anchor="entry\.anchor" :locate-id="entry\.id" @map="emit\('map'\)" \/>/);
    const button = read('workspace/SpreadNews.vue');
    assert.doesNotMatch(button, /\.kind\b/, 'the button keys on date and place, not on kind');
    assert.doesNotMatch(button, /saveRecord|commit\.ts|write\(/, 'nothing is written');
    assert.match(button, /<p v-if="offered && state" class="spread-news">/);
    const view = read('views/MapView.vue');
    assert.match(view, /stopNewsAsk = onNewsAsk\(spreadNews\);/);
    assert.match(view, /const today = campaign\.clock \? campaign\.clock\.days - ask\.day0 : 0;/);
    assert.match(view, /t: Math\.max\(0, Math\.min\(today, NEWS_PARAMS\.horizonDays\)\)/);
});
