/**
 * Lane M, the version-video look (2026-10-17): the shared pieces stay in base.css on tokens that
 * exist, and a journal row's date box takes the date out of the meta line without changing its words.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { rowFace } from '../../apps/web/src/workspace/journal/list.ts';

const base = fs.readFileSync(new URL('../../apps/web/src/design/base.css', import.meta.url), 'utf8');
const tokens = fs.readFileSync(new URL('../../apps/web/src/design/tokens.css', import.meta.url), 'utf8');

test('every shared piece of the look is a class in base.css', () => {
    for (const name of ['ui-ground', 'ui-kicker', 'ui-kicker-row', 'ui-new', 'ui-rule', 'ui-frame', 'ui-frame-label', 'ui-frame-count', 'ui-date', 'ui-steps', 'ui-step', 'ui-brand', 'ui-brand-dot']) {
        assert.ok([' ', '.', ':', ',', '['].some((next) => base.includes('.' + name + next)), name);
    }
});

test('every token the look reads is defined in tokens.css', () => {
    const start = base.indexOf('The version-video look');
    assert.ok(start > 0, 'the block is headed "The version-video look"');
    const used = new Set([...base.slice(start).matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
    for (const name of used) assert.ok(tokens.includes(name + ':'), name);
});

function entry(patch) {
    return {
        id: 'cj_11111111-1111-4111-8111-111111111111', kind: 'note', title: 'T', body: '', when: null, realDate: null,
        sequence: null, author: 'referee', visibility: 'referee', anchor: null, mentions: [], rev: 0,
        createdAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z', deleted: false, ...patch,
    };
}

test('a row\'s date box holds the in-fiction date and the rest of the meta line keeps its words', () => {
    const handout = rowFace(entry({
        kind: 'handout', visibility: 'players', when: { year: 1105, day: 213 },
        anchor: { kind: 'system', hexKey: 'Spinward_Marches/1910', locationLabel: 'Regina' },
    }), {});
    assert.equal(handout.meta, 'Players · 213-1105 · Regina 1910');
    assert.equal(handout.when, '213-1105');
    assert.equal(handout.metaRest, 'Players · Regina 1910');

    const session = rowFace(entry({ kind: 'session', sequence: 2, when: { year: 1105, day: 208 }, realDate: '2026-10-04' }), {});
    assert.equal(session.when, '208-1105');
    assert.equal(session.metaRest, 'played 2026-10-04 · Nowhere in particular');

    const undated = rowFace(entry({}), {});
    assert.equal(undated.when, null);
    assert.equal(undated.metaRest, undated.meta);
});
