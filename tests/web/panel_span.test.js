/**
 * A visit can show Column without remembering it (apps/web/src/shell/panel_state.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { holdSpan, onSpan, readSpan, releaseSpan, writeSpan } from '../../apps/web/src/shell/panel_state.ts';

test('a visit shows its span and puts the remembered width back', () => {
    releaseSpan();
    const remembered = readSpan();
    const visit = remembered === 'half' ? 'column' : 'half';
    let seen = 0;
    const stop = onSpan(() => { seen += 1; });
    try {
        holdSpan(visit);
        assert.equal(readSpan(), visit);
        assert.equal(seen, 1);
        releaseSpan();
        assert.equal(readSpan(), remembered);
        assert.equal(seen, 2);
        holdSpan(visit);
        writeSpan(remembered);
        assert.equal(readSpan(), remembered);
        releaseSpan();
        assert.equal(readSpan(), remembered);
    } finally {
        writeSpan(remembered);
        releaseSpan();
        stop();
    }
});
