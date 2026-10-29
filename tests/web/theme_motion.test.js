import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMotion } from '../../apps/web/src/map/theme.ts';

function withStyle(props, run) {
    const previous = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({
        getPropertyValue(name) { return props[name] ?? ''; },
    });
    try {
        return run();
    } finally {
        globalThis.getComputedStyle = previous;
    }
}

test('readMotion reads the three motion tokens as seconds', () => {
    const motion = withStyle({
        '--t-base': '200ms',
        '--t-slow': '1.5s',
        '--t-long': '0ms',
    }, () => readMotion({}));
    assert.deepEqual(motion, { tBase: 0.2, tSlow: 1.5, tLong: 0 });
});

test('readMotion refuses a token that is not a time', () => {
    assert.throws(
        () => withStyle({ '--t-base': 'fast', '--t-slow': '1s', '--t-long': '1s' }, () => readMotion({})),
        /cannot read time "fast"/,
    );
    assert.throws(
        () => withStyle({}, () => readMotion({})),
        /cannot read time ""/,
    );
});
