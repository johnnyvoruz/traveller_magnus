/**
 * CW2: the orbit crumb opens the system overview, and Back returns to the body once.
 * The body-less orbit path is also the opening mainworld, so the overview query is its own pane.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orbitPath } from '../../apps/web/src/orbit/bodies.ts';
import { openingKey, showsSystemOverview } from '../../apps/web/src/orbit/opening.ts';
import { backTo, canPaneBack, notePane, paneId, resetPaneBack } from '../../apps/web/src/shell/pane_back.ts';

const orbit = orbitPath('Spinward_Marches', '1910', null);
const body = orbitPath('Spinward_Marches', '1910', 's0');

test('the overview address is not the opening mainworld, and not the body', () => {
    assert.equal(showsSystemOverview({}), false);
    assert.equal(showsSystemOverview({ overview: '1' }), true);
    assert.equal(showsSystemOverview({ overview: ['1'] }), true);
    assert.notEqual(paneId(orbit, {}), paneId(orbit, { overview: '1' }));
    assert.notEqual(paneId(body, { date: '120' }), paneId(orbit, { overview: '1', date: '120' }));
    assert.equal(paneId(body, {}), paneId(body, { overview: '1' }));
    assert.equal(openingKey('', 'w4m1', showsSystemOverview({ overview: '1' })), null);
    assert.equal(openingKey('', 'w4m1', showsSystemOverview({})), 'w4m1');
});

test('the crumb is one step, and Back returns to the body once', () => {
    resetPaneBack();
    notePane(orbit, {});
    notePane(body, { date: '120' });
    notePane(orbit, { overview: '1', date: '120' });
    assert.equal(canPaneBack.value, true);
    const back = backTo();
    assert.equal(back && back.path, body);
    assert.equal(back && back.query.date, '120');
    assert.equal(back && back.query.overview, undefined);
    assert.equal(canPaneBack.value, true);
    const first = backTo();
    assert.equal(first && first.path, orbit);
    assert.equal(first && first.query.overview, undefined);
    assert.equal(canPaneBack.value, false);
});

test('the unmarked body-less path is still the opening pane, so it does not stack on itself', () => {
    resetPaneBack();
    notePane(orbit, {});
    notePane(body, {});
    notePane(orbit, {});
    assert.equal(canPaneBack.value, false);
    assert.equal(backTo(), null);
});
