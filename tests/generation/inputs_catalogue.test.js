import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCatalogue } from '../../apps/api/src/jobs/inputs.ts';

test('resolveCatalogue skips a catalogue that has no sector files', async () => {
    const files = new Map([
        ['inputs/v6/sectors.json', '{"sectors":[{"slug":"Calidan"}]}'],
        ['inputs/v5/sectors.json', '{"sectors":[{"slug":"Calidan"}]}'],
        ['inputs/v4/sectors.json', '{"sectors":[{"slug":"Calidan"},{"slug":"Fixture"}]}'],
        ['inputs/v4/Calidan.xml', '<Sector/>'],
        ['inputs/v4/Fixture.tsv', 'hex'],
    ]);
    const bucket = {
        async get(key) {
            const value = files.get(key);
            if (value == null) return null;
            return { text: async () => value };
        },
        async list({ prefix }) {
            const keys = [...files.keys()].filter((key) => key.startsWith(prefix)).sort();
            return { objects: keys.map((key) => ({ key })), truncated: false };
        },
    };
    const parents = { v6: 'v5', v5: 'v4' };
    const db = {
        prepare() {
            return {
                bind(version) {
                    return { async first() { return { derivedFrom: parents[version] ?? null }; } };
                },
            };
        },
    };
    const found = await resolveCatalogue(db, bucket, 'v6', null);
    assert.equal(found.version, 'v4');
    assert.equal(found.text.includes('Fixture'), true);
    const direct = await resolveCatalogue(db, bucket, 'v4', null);
    assert.equal(direct.version, 'v4');
});
