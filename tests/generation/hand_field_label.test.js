import assert from 'node:assert/strict';
import test from 'node:test';
import { applyForm, blankEnvelope, FormRefusal } from '@voyage/generation';
import { TRUTH_SEED, TRUTH_SETTINGS } from '../../tools/truth/settings.js';

const pinned = { seed: TRUTH_SEED, settings: { ...TRUTH_SETTINGS }, engineVersion: '1.1.0' };

function system(starId, bodyId) {
    const blank = blankEnvelope('spin/2008', 'MgT2E', pinned, {});
    return applyForm(blank, [
        { id: 'star.add', value: starId },
        { id: 'body.add', value: bodyId },
    ], []).envelope;
}

test('a numbered owner is named by its leaf', () => {
    const numbered = system('star.0', 'body.2');
    const plain = system('s1', 'b1');
    const cases = [
        [numbered, 'star.0.temp', -1, /Temperature cannot hold that/],
        [numbered, 'star.0.mass', 0, /Mass cannot hold that/],
        [numbered, 'star.0.diam', 0, /Diameter cannot hold that/],
        [numbered, 'star.0.lum', 0, /Luminosity cannot hold that/],
        [numbered, 'star.0.orbit.eccentricity', Number.POSITIVE_INFINITY, /Eccentricity cannot hold that/],
        [numbered, 'body.2.orbit.au', 'near', /AU cannot hold that/],
        [numbered, 'body.2.orbit.eccentricity', Number.NaN, /Eccentricity cannot hold that/],
        [numbered, 'body.2.profile.a', '77', /Atmosphere cannot hold that/],
        [numbered, 'body.2.profile.tl', '77', /Tech Level cannot hold that/],
        [plain, 's1.temp', -1, /Temperature cannot hold that/],
        [plain, 's1.orbit.id', 'far', /Orbit cannot hold that/],
        [plain, 'b1.orbit.eccentricity', Number.POSITIVE_INFINITY, /Eccentricity cannot hold that/],
        [plain, 'b1.name', 'x'.repeat(81), /Name cannot hold that/],
    ];
    for (const [envelope, id, value, message] of cases) {
        assert.throws(() => applyForm(envelope, [{ id, value }], []), message, id);
    }
});

test('a bare star names Type, Subtype, and Class', () => {
    const blank = blankEnvelope('spin/2008', 'MgT2E', pinned, {});
    const made = applyForm(blank, [
        { id: 'star.add', value: true },
        { id: 'body.add', value: true },
    ], []).envelope;
    const rolled = applyForm(made, [], [{ id: 'b1.profile.roll' }]);
    const text = rolled.answer.messages.find((item) => item.id === 'b1.profile.roll').text;
    assert.match(text, /Set Type, Subtype, and Class\./);
    assert.equal(/Y6A40000/.test(text), false);
    const main = applyForm(made, [{ id: 'b1.mainworld', value: true }], []).envelope;
    const again = applyForm(main, [], [{ id: 'b1.profile.roll' }]);
    const mainText = again.answer.messages.find((item) => item.id === 'b1.profile.roll').text;
    assert.match(mainText, /Set Type, Subtype, and Class\./);
    assert.equal(again.envelope.kind, 'hand');
});

test('FormRefusal is the hand refusal', () => {
    const envelope = system('s1', 'b1');
    assert.throws(() => applyForm(envelope, [{ id: 's1.temp', value: -1 }], []), FormRefusal);
});
