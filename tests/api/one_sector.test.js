import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ONE_SECTOR_LIMIT, sectorCount } from '../../apps/api/src/jobs/one_sector.ts';

test('one sector: hex keys are counted by sector', () => {
    assert.equal(sectorCount([]), 0);
    assert.equal(sectorCount(['Spinward_Marches/1910', 'Spinward_Marches/0101']), 1);
    assert.equal(sectorCount(['Spinward_Marches/1910', 'Deneb/0101']), 2);
    assert.equal(sectorCount(['~01ABC/0101', '~01ABC/0202']), 1);
});

test('one sector: the refusal is plain and names no other route', () => {
    assert.equal(ONE_SECTOR_LIMIT, 'The limit is one sector per request.');
    assert.doesNotMatch(ONE_SECTOR_LIMIT, /local|upload|build\.js|admin/i);
});

test('one sector: every Workers path that starts generation checks the limit', () => {
    const read = (file) => readFileSync(new URL('../../apps/api/src/' + file, import.meta.url), 'utf8');
    const admin = read('routes/admin.ts');
    assert.match(admin, /if \(slugs\.length > 1\) return fail\(c, 400, 'validation', ONE_SECTOR_LIMIT/);
    assert.match(admin, /if \(targets\.length > 1\) return fail\(c, 400, 'validation', ONE_SECTOR_LIMIT/);
    const builder = read('routes/builder.ts');
    assert.equal(builder.match(/if \(sectorCount\(input\.hexKeys\) > 1\) return fail\(c, 400, 'validation', ONE_SECTOR_LIMIT/g).length, 2);
    assert.match(read('jobs/generate_queue.ts'), /if \(sectorCount\(first\.spec\.hexKeys\) > 1\)/);
});
