/**
 * DF32: a refused save says the server's sentence where the screens said offline, and the save is still
 * sent again. The store path with a fake fetch (A's AF9 keeps the sentence in `lastError`), the words, and
 * the pins on the four screens that show them.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { campaign, transport } from '../../apps/web/src/campaign/store.ts';
import { commit, flushCampaign, lastError, newRecordId, pending, resetCampaign } from '../../apps/web/src/campaign/commit.ts';
import { NOT_SAVED, notSavedWords, refusalSentence, saveFailedWords } from '../../apps/web/src/campaign/save_words.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (file) => fs.readFileSync(path.join(here, '../../apps/web/src', file), 'utf8');

test('the words: offline keeps the strip as it was; a sentence is shown in it', () => {
    assert.equal(refusalSentence('offline'), null);
    assert.equal(refusalSentence(''), null);
    assert.equal(refusalSentence('  Too many requests. '), 'Too many requests.');
    assert.equal(saveFailedWords('offline'), NOT_SAVED);
    assert.equal(saveFailedWords('offline'), 'That change was not saved. Your text is still here.');
    assert.equal(saveFailedWords('Too many requests.'), 'That change was not saved: Too many requests. Your text is still here.');
    assert.equal(saveFailedWords('Invalid request.'), 'That change was not saved: Invalid request. Your text is still here.');
    assert.equal(notSavedWords('offline'), 'Not saved');
    assert.equal(notSavedWords('Too many requests.'), 'Not saved: Too many requests.');
});

test('with a fake fetch: a 429 puts its sentence in the strip and the save is sent again; a dropped connection says offline', async () => {
    const saved = { fetch: transport.fetch, schedule: transport.schedule };
    const row = () => ({ id: newRecordId(), type: 'person', kind: '', name: 'Ada', summary: '', details: '', tags: [], anchor: null, when: null, visibility: 'referee', playerNotes: null, sheet: null, status: null, rev: 0, deleted: false, baseRev: 0 });
    const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const calls = [];
    try {
        resetCampaign();
        transport.schedule = () => () => {};
        campaign.universeId = 'uni-1';
        const person = row();
        commit({ records: [person] });
        transport.fetch = async (_url, init) => {
            calls.push(JSON.parse(init.body));
            if (calls.length === 1) return answer(429, { ok: false, error: { code: 'rate_limited', message: 'Too many requests.' } });
            return answer(200, { ok: true, data: { applied: [{ table: 'records', id: person.id, rev: 1, seq: 1 }], conflicts: [] } });
        };
        await flushCampaign();
        assert.equal(saveFailedWords(lastError.value), 'That change was not saved: Too many requests. Your text is still here.');
        assert.equal(notSavedWords(lastError.value), 'Not saved: Too many requests.');
        assert.equal(pending.value, true, 'still queued: it is sent again');
        await flushCampaign();
        assert.equal(calls.length, 2, 'sent again');
        assert.equal(lastError.value, '');
        assert.equal(pending.value, false);

        const dropped = row();
        resetCampaign();
        transport.schedule = () => () => {};
        campaign.universeId = 'uni-1';
        commit({ records: [dropped] });
        transport.fetch = async () => { throw new Error('network'); };
        await flushCampaign();
        assert.equal(saveFailedWords(lastError.value), NOT_SAVED);
        assert.equal(notSavedWords(lastError.value), 'Not saved');
        assert.equal(pending.value, true);
    } finally {
        transport.fetch = saved.fetch;
        transport.schedule = saved.schedule;
        resetCampaign();
    }
});

test('the screens read the words from one place', () => {
    for (const file of ['workspace/RecordPage.vue', 'workspace/journal/EntryPage.vue']) {
        const text = src(file);
        assert.match(text, /<span data-save-failed>\{\{ saveFailedWords\(lastError\) \}\}<\/span>/, file + ': the strip');
        assert.match(text, /<template v-else-if="saveState === 'failed'">\{\{ notSavedWords\(lastError\) \}\}<\/template>/, file + ': the status');
        assert.doesNotMatch(text, /That change was not saved\./, file + ': no second copy of the words');
    }
    assert.match(src('workspace/PartyPanel.vue'), /<template v-else-if="saveState === 'failed'">\{\{ notSavedWords\(lastError\) \}\}<\/template>/);
    assert.match(src('workspace/ClockLine.vue'), /:title="saveState === 'failed' \? saveFailedWords\(lastError\) : undefined"/, 'the clock chip keeps its two words and carries the sentence');
    assert.match(src('campaign/save_words.ts'), /^export function saveFailedWords/m);
});
