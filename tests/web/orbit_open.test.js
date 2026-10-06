import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orbitOpenLocation } from '../../apps/web/src/dossier/orbit_open.ts';

test('opening the orbit view keeps the pane, the camera and the clock', () => {
    const opened = orbitOpenLocation('Spinward_Marches', '1810', 'w0', {
        panel: 'dossier',
        record: 'r1',
        x: '4',
        y: '5',
        z: '2',
        date: '1105-203',
        time: '08:00',
        campaignStandIn: '1',
        foo: 'drop',
    });
    assert.equal(opened.path, '/s/Spinward_Marches/1810/orbit/b/w0');
    assert.deepEqual(opened.query, {
        panel: 'dossier',
        record: 'r1',
        x: '4',
        y: '5',
        z: '2',
        date: '1105-203',
        time: '08:00',
        campaignStandIn: '1',
    });
    assert.equal(orbitOpenLocation('Spinward_Marches', '1810', null, {}).path, '/s/Spinward_Marches/1810/orbit');
    assert.deepEqual(orbitOpenLocation('Spinward_Marches', '1810', null, {}).query, {});
});
