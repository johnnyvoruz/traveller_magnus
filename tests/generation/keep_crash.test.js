import assert from 'node:assert/strict';
import test from 'node:test';
import { stable } from '@voyage/shared';
import { applyForm, blankEnvelope, formOf, generateHex } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' };
const NUMERIC = [
    'siderealHours', 'axialTilt', 'solarDayHours', 'eccentricity',
    'albedo', 'greenhouseFactor', 'density', 'diamKm', 'mass', 'gravity',
];

function stored(envelope) {
    return JSON.parse(stable(envelope));
}

function bodiesOf(envelope) {
    const sys = envelope.body?.mgtSystem || envelope.body?.aowSystem;
    const rows = [];
    for (const world of sys?.worlds || []) {
        if (!world || world.type === 'Empty') continue;
        rows.push(world);
        for (const moon of world.moons || world.satellites || []) if (moon) rows.push(moon);
    }
    return rows;
}

function hasWrappedInfinity(envelope) {
    return bodiesOf(envelope).some((body) => body.solarDayHours && body.solarDayHours.$num === 'Infinity');
}

function mainworldNameId(form) {
    for (const section of form.sections) {
        for (const item of section.fields) {
            if (item.id.endsWith('.mainworld') && item.value === true) return item.id.replace(/\.mainworld$/, '.name');
        }
    }
    const named = form.sections.flatMap((section) => section.fields).find((item) => /^body\.\d+\.name$/.test(item.id));
    return named ? named.id : null;
}

function rename(envelope) {
    const form = formOf(envelope);
    const id = mainworldNameId(form);
    assert.ok(id, 'the form has a mainworld name');
    return { id, applied: applyForm(envelope, [{ id, value: 'Renamed World' }], []) };
}

function assertKept(applied) {
    const held = applied.answer.messages.filter((item) => item.holds);
    assert.deepEqual(held, []);
    for (const body of bodiesOf(applied.envelope)) {
        for (const key of NUMERIC) {
            if (body[key] == null) continue;
            assert.equal(typeof body[key], 'number', `${body.type} ${key}`);
        }
        if (body.tidallyLocked != null) assert.equal(typeof body.tidallyLocked, 'boolean');
        if (body.composition != null) assert.equal(typeof body.composition, 'string');
        if (body.size != null) assert.equal(typeof body.size === 'number' || typeof body.size === 'string', true);
    }
}

function hexes(prefix, count) {
    const keys = [];
    for (let n = 0; n < count; n += 1) {
        const col = String((n % 8) + 1).padStart(2, '0');
        const row = String(Math.floor(n / 8) + 1).padStart(2, '0');
        keys.push(`${prefix}/${col}${row}`);
    }
    return keys;
}

test('a stored MgT2E tree keeps a mainworld rename', { timeout: 120000 }, () => {
    let wrapped = 0;
    let escaped = 0;
    for (const hexKey of hexes('blank', 16)) {
        const live = generateHex({ hexKey, edition: 'MgT2E', mode: 'top-down', summary: { type: 'SYSTEM_PRESENT' }, pinned });
        const envelope = stored(live);
        if (hasWrappedInfinity(envelope)) wrapped += 1;
        else escaped += 1;
        const { id, applied } = rename(envelope);
        assertKept(applied);
        const named = formOf(applied.envelope).sections.flatMap((section) => section.fields).find((item) => item.id === id);
        assert.equal(named.value, 'Renamed World');
        const again = rename(stored(applied.envelope));
        assertKept(again.applied);
    }
    assert.equal(wrapped > 0, true);
    assert.equal(escaped > 0, true);
});

test('each numeric physical field survives a stored rename', { timeout: 120000 }, () => {
    const live = generateHex({
        hexKey: 'blank/1910', edition: 'MgT2E', mode: 'top-down', summary: { type: 'SYSTEM_PRESENT' }, pinned,
    });
    const envelope = stored(live);
    const host = bodiesOf(envelope).find((body) => body.type === 'Mainworld') || bodiesOf(envelope)[0];
    assert.ok(host);
    for (const key of NUMERIC) {
        for (const token of ['Infinity', '-Infinity', 'NaN']) {
            const copy = stored(live);
            const planted = bodiesOf(copy).find((body) => body.type === host.type && body.name === host.name) || bodiesOf(copy)[0];
            planted[key] = { $num: token };
            const { applied } = rename(copy);
            assertKept(applied);
        }
    }
});

test('a stored AoW tree keeps a mainworld rename', { timeout: 120000 }, () => {
    for (const hexKey of hexes('own', 4)) {
        const live = generateHex({ hexKey, edition: 'AoW', mode: 'bottom-up', summary: { type: 'SYSTEM_PRESENT' }, pinned });
        const envelope = stored(live);
        const { applied } = rename(envelope);
        assertKept(applied);
        const again = rename(stored(applied.envelope));
        assertKept(again.applied);
    }
});

test('a hand system keeps a rename without the world engine', () => {
    const blank = blankEnvelope('spin/2008', 'MgT2E', pinned, {});
    const starred = applyForm(blank, [{ id: 'star.add', value: true }], []).envelope;
    const world = applyForm(starred, [{ id: 'body.add', value: true }], []).envelope;
    const placed = applyForm(world, [
        { id: 'b1.orbit.eccentricity', value: 0.2 },
        { id: 'b1.mainworld', value: true },
        { id: 'system.name', value: 'Hand' },
    ], []).envelope;
    const envelope = stored(placed);
    const applied = applyForm(envelope, [{ id: 'system.name', value: 'Renamed World' }], []);
    assert.deepEqual(applied.answer.messages.filter((item) => item.holds), []);
    assert.equal(applied.envelope.kind, 'hand');
    assert.equal(applied.envelope.system.name, 'Renamed World');
    assert.equal(applied.envelope.system.bodies[0].eccentricity, 0.2);
    assert.equal(Object.hasOwn(applied.envelope.system.bodies[0], 'solarDayHours'), false);
});
