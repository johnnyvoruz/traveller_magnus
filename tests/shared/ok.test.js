import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { Ok } from '@voyage/shared';

test('Ok accepts only ok true and data of the given shape', () => {
    const schema = Ok(z.string());
    assert.deepEqual(schema.parse({ ok: true, data: 'Regina' }), { ok: true, data: 'Regina' });
    assert.throws(() => schema.parse({ ok: false, data: 'Regina' }));
    assert.throws(() => schema.parse({ ok: true }));
    assert.throws(() => schema.parse({ ok: true, data: 1 }));
    assert.deepEqual(schema.parse({ ok: true, data: 'Regina', extra: true }), { ok: true, data: 'Regina' });
});
