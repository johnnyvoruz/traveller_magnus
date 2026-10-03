import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hexCentre, sectorRect, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { homeRect, targetFor } from '../../apps/web/src/map/routes.ts';

const manifest = {
    sectors: [
        { slug: 'Spinward_Marches', x: -4, y: -1, tags: ['OTU'] },
        { slug: 'Core', x: 0, y: 0, tags: ['OTU'] },
        { slug: 'Zcr', x: -7, y: -100, tags: ['ZCR'] },
    ],
};

test('targetFor covers the five routes and an unknown sector', () => {
    const home = targetFor({ path: '/' }, manifest);
    assert.equal(home.kind, 'fit');
    assert.deepEqual(home.rect, homeRect(manifest));
    const marches = sectorRect(-4, -1);
    const core = sectorRect(0, 0);
    assert.equal(home.rect.x0, marches.x0);
    assert.equal(home.rect.y0, marches.y0);
    assert.equal(home.rect.x1, core.x1);
    assert.equal(home.rect.y1, core.y1);
    assert.notEqual(home.rect.y0, sectorRect(-7, -100).y0);

    assert.deepEqual(targetFor({ path: '/s/Spinward_Marches' }, manifest), {
        kind: 'fit',
        rect: marches,
    });

    const global = toGlobal(-4, -1, 19, 10);
    const centre = hexCentre(global.q, global.r);
    assert.deepEqual(targetFor({ path: '/s/Spinward_Marches/1910' }, manifest), {
        kind: 'camera',
        camera: { x: centre.x, y: centre.y, ppp: 80 },
    });

    assert.deepEqual(targetFor({ path: '/account' }, manifest), { kind: 'account' });
    assert.deepEqual(targetFor({ path: '/design' }, manifest), { kind: 'design' });

    const unknown = targetFor({ path: '/s/Nope' }, manifest);
    assert.equal(unknown.kind, 'unknown');
    assert.match(unknown.message, /Nope/);
});
