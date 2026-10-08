import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const draftPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../findings/character_sheet_transcription.json',
);

test('the character sheet draft has one shape', {
    skip: fs.existsSync(draftPath) ? false : 'findings/character_sheet_transcription.json is absent',
}, () => {
    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
    const declared = new Set(draft.types);
    assert.equal(declared.size, draft.types.length);
    const used = new Set();

    const sectionIds = new Set();
    for (const section of draft.sections) {
        assert.equal(sectionIds.has(section.id), false, 'section ' + section.id);
        sectionIds.add(section.id);
        const fieldIds = new Set();
        for (const field of section.fields ?? []) {
            assert.equal(fieldIds.has(field.id), false, section.id + ' ' + field.id);
            fieldIds.add(field.id);
            if (field.ref != null) {
                const dot = String(field.ref).indexOf('.');
                assert.ok(dot > 0, field.ref);
                const targetSection = draft.sections.find((item) => item.id === field.ref.slice(0, dot));
                const target = (targetSection?.fields ?? []).find((item) => item.id === field.ref.slice(dot + 1));
                assert.ok(target, field.ref);
            }
            if (field.vocab != null) {
                assert.ok(Array.isArray(draft.vocab?.[field.vocab]), field.vocab);
            }
            if (field.type === 'table') {
                assert.ok(Array.isArray(field.columns) && field.columns.length > 0, field.id);
            }
        }
    }

    const names = (node) => {
        if (Array.isArray(node)) {
            for (const item of node) names(item);
            return;
        }
        if (!node || typeof node !== 'object') return;
        if (typeof node.type === 'string') used.add(node.type);
        for (const value of Object.values(node)) names(value);
    };
    names(draft.sections);
    for (const type of used) assert.ok(declared.has(type), type);
    for (const type of declared) assert.ok(used.has(type), type);

    for (const list of Object.values(draft.vocab)) {
        assert.ok(Array.isArray(list));
        for (const entry of list) {
            const name = typeof entry === 'string' ? entry : entry?.name;
            assert.equal(typeof name, 'string');
            assert.ok(name.length > 0);
        }
    }
});
