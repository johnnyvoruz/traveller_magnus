/**
 * CP6. The orbit picture's first chunk does not include the comms line pool.
 * The receiver still mounts in the orbit view.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const orbit = fs.readFileSync(new URL('../../apps/web/src/views/OrbitView.vue', import.meta.url), 'utf8');

test('the comms lines and the receiver wait outside the orbit picture chunk', () => {
    assert.match(orbit, /import\('\.\.\/living\/CommsReceiver\.vue'\)/);
    assert.match(orbit, /import\('\.\.\/living\/lines\.ts'\)/);
    assert.match(orbit, /whenOrbitPaints/);
    assert.match(orbit, /v-if="showComms"/);
    assert.match(orbit, /<CommsReceiver/);
    assert.doesNotMatch(orbit, /import CommsReceiver from/);
    assert.doesNotMatch(orbit, /import \{ corpusLines/);
    const traffic = fs.readFileSync(new URL('../../apps/web/src/living/traffic.ts', import.meta.url), 'utf8');
    assert.match(traffic, /function fillTrafficSlots/);
    assert.doesNotMatch(traffic, /corpus_events/);
    assert.doesNotMatch(traffic, /comms\/slots/);
    const vite = fs.readFileSync(new URL('../../apps/web/vite.config.ts', import.meta.url), 'utf8');
    assert.match(vite, /name: 'chatter'/);
    assert.match(vite, /living\[\\\\\/\]chatter\\.ts/);
});

test('a ship label fills slots the same way the receiver does', async () => {
    const { fillTrafficSlots } = await import('../../apps/web/src/living/traffic.ts');
    const { resolveSlots } = await import('../../apps/web/src/living/comms/slots.ts');
    const facts = {
        name: 'Regina', hexKey: '1910', highport: true, starport: 'A',
        sector: 'Spinward Marches', subsector: 'Regina', day: 12,
        bodies: { gasGiant: 'Assiniboia', belt: 'Bowman', moon: 'Lumen', body: 'Regina' },
    };
    const ships = ['Lark', 'Tern'];
    for (const line of ['{ship} calls {world}', '{port}', '{ship2}', '{date}', '{gasGiant}', 'no slots', '{missing}']) {
        assert.equal(fillTrafficSlots(line, facts, ships), resolveSlots(line, facts, ships), line);
    }
});
