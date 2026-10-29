/**
 * AQ1. setQuiet and setTrafficShown write this device's living switches.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { device, deviceTraffic, setQuiet, setTrafficShown } from '../../apps/web/src/living/quiet.ts';

test('quiet and the traffic chip follow the last call', () => {
    setQuiet(true);
    assert.equal(device.quiet, true);
    setQuiet(false);
    assert.equal(device.quiet, false);
    setTrafficShown(false);
    assert.equal(deviceTraffic.shown, false);
    setTrafficShown(true);
    assert.equal(deviceTraffic.shown, true);
});
