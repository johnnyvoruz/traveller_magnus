/**
 * AQ6. A bare hidden id in Player Pack text.
 * redactText is apps/web/src/pack/text.ts. The replacement matches
 * hideBareIds in packages/shared/src/players_view.ts: after the token read, any letter case.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planPack } from '../../apps/web/src/pack/plan.ts';
import { redactText } from '../../apps/web/src/pack/text.ts';

const HIDDEN = 'cr_22222222-2222-4222-8222-222222222222';
const PERSON = 'cr_11111111-1111-4111-8111-111111111111';

function row(id, type, visibility, over = {}) {
    return {
        id,
        type,
        kind: 'note',
        name: type,
        summary: '',
        details: '',
        tags: [],
        anchor: null,
        when: null,
        visibility,
        playerNotes: null,
        sheet: null,
        status: null,
        images: null,
        provenance: null,
        rev: 1,
        createdAt: '2026-10-31T00:00:00.000Z',
        updatedAt: '2026-10-31T00:00:00.000Z',
        deleted: false,
        ...over,
    };
}

test('a bare hidden id in pack text reads a record', () => {
    const hidden = row(HIDDEN, 'note', 'referee', { name: 'SECRETNAME' });
    const person = row(PERSON, 'person', 'players', {
        name: 'Ada',
        summary: 'Meet ' + HIDDEN.toUpperCase() + ' at the port.',
        kind: 'patron [[' + HIDDEN + '|Secret label]]',
    });
    const records = { [PERSON]: person, [HIDDEN]: hidden };
    const counts = { mentions: 0 };
    assert.equal(redactText('See ' + HIDDEN + ' today', records, counts), 'See a record today');
    assert.equal(counts.mentions, 0);

    const plan = planPack({
        name: 'Open',
        clockDays: null,
        records,
        links: {},
        journal: {
            cj_1: {
                id: 'cj_55555555-5555-4555-8555-555555555555',
                kind: 'note',
                title: 'About ' + HIDDEN,
                body: 'The note names ' + HIDDEN.toLowerCase() + '.',
                when: null,
                realDate: null,
                sequence: null,
                author: 'referee',
                visibility: 'players',
                anchor: null,
                mentions: [],
                images: null,
                parent: null,
                replies: 0,
                rev: 1,
                createdAt: '2026-10-31T00:00:00.000Z',
                updatedAt: '2026-10-31T00:00:00.000Z',
                deleted: false,
            },
        },
        settings: null,
    });
    const packed = JSON.stringify(plan);
    assert.equal(packed.includes(HIDDEN), false);
    assert.equal(packed.includes(HIDDEN.toUpperCase()), false);
    assert.equal(packed.includes('SECRETNAME'), false);
    assert.equal(packed.includes('Secret label'), false);
    assert.equal(plan.records[0].summary, 'Meet a record at the port.');
    assert.equal(plan.records[0].kind, 'patron a record');
    assert.equal(plan.entries[0].title, 'About a record');
    assert.equal(plan.entries[0].body, 'The note names a record.');
    assert.equal(plan.records[0].name, 'Ada');
});
