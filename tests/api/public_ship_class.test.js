import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicShipCard } from '@voyage/shared';
import { vesselShipClass } from '../../apps/api/src/universe/ship_class.ts';

const sheet = (fields) => ({ schema: 'mgt2e_ship_sheet@1', fields });

test('the public class is the ship sheet Class box', () => {
    assert.equal(vesselShipClass({ sheet: sheet({ Class: 'Free Trader' }) }), 'Free Trader');
    assert.equal(vesselShipClass({ sheet: sheet({ Class: '  Type A  ' }) }), 'Type A');
    assert.equal(vesselShipClass({ sheet: sheet({ Class: '' }) }), null);
    assert.equal(vesselShipClass({ sheet: sheet({ Class: '   ' }) }), null);
    assert.equal(vesselShipClass({ sheet: sheet({}) }), null);
    assert.equal(vesselShipClass({ sheet: sheet({ Class: 'x'.repeat(201) }) }).length, 200);
    assert.equal(vesselShipClass({ sheet: { schema: 'other', fields: { Class: 'Free Trader' } } }), null);
    assert.equal(vesselShipClass({ kind: 'Free Trader', sheet: null }), null);
    assert.equal(vesselShipClass(null), null);

    const card = {
        game: 'Open',
        referee: null,
        example: false,
        ship: 'Far',
        aboard: [],
        legs: [],
        course: [],
        journal: [],
    };
    assert.equal(PublicShipCard.safeParse(card).success, true);
    assert.equal(PublicShipCard.safeParse({ ...card, shipClass: null }).success, true);
    assert.equal(PublicShipCard.safeParse({ ...card, shipClass: 'Free Trader' }).success, true);
    assert.equal(PublicShipCard.safeParse({ ...card, shipClass: '' }).success, false);
});
