/**
 * The join page: four states, the claim page's refusal sentences, the archived sentence,
 * and the token leaving the address bar.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    JOIN_BAR,
    JOIN_TOKEN_KEY,
    heldJoinToken,
    joinFace,
    joinRefusal,
} from '../../apps/web/src/characters/screens/join_model.ts';

const page = readFileSync(new URL('../../apps/web/src/characters/screens/JoinPage.vue', import.meta.url), 'utf8');
const router = readFileSync(new URL('../../apps/web/src/router.ts', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../apps/web/index.html', import.meta.url), 'utf8');

test('the join page has four states', () => {
    const invited = { name: 'Hollow Verge', ownerHandle: 'ada', refusal: '', people: [] };
    assert.equal(joinFace({ signedIn: false, refused: false, chosen: false, ...invited }).state, 'signed-out');
    assert.equal(joinFace({ signedIn: true, refused: false, chosen: false, ...invited }).state, 'ready');
    assert.equal(joinFace({
        signedIn: true,
        refused: false,
        chosen: true,
        ...invited,
        people: [{ id: 'cr_1', name: 'Jamison' }],
    }).state, 'choose');
    assert.equal(joinFace({ signedIn: true, refused: true, chosen: false, ...invited, refusal: 'This link has expired.' }).state, 'refused');
    assert.equal(joinFace({ signedIn: false, refused: true, chosen: false, ...invited }).state, 'refused');
});

test('the invite names the campaign and the referee', () => {
    const signedOut = joinFace({
        signedIn: false,
        refused: false,
        chosen: false,
        name: 'Hollow Verge',
        ownerHandle: 'ada',
        refusal: '',
        people: [],
    });
    assert.equal(signedOut.title, "You're invited to Hollow Verge");
    assert.equal(signedOut.line, 'ada runs this campaign. Sign in to join. You come back to this page.');
    const ready = joinFace({
        signedIn: true,
        refused: false,
        chosen: false,
        name: 'Hollow Verge',
        ownerHandle: '',
        refusal: '',
        people: [],
    });
    assert.equal(ready.line, 'Select Join to enter.');
    const choose = joinFace({
        signedIn: true,
        refused: false,
        chosen: true,
        name: 'Hollow Verge',
        ownerHandle: 'ada',
        refusal: '',
        people: [],
    });
    assert.equal(choose.title, 'Which one is you?');
    assert.equal(choose.line, 'There is nobody in the party yet. Select Not yet.');
    const people = joinFace({
        signedIn: true,
        refused: false,
        chosen: true,
        name: 'Hollow Verge',
        ownerHandle: 'ada',
        refusal: '',
        people: [{ id: 'cr_1', name: 'Jamison' }],
    });
    assert.equal(people.line, 'Select the person you play, or select Not yet.');
});

test('a bad link uses the claim page sentences, and an archive says who did it', () => {
    assert.equal(joinRefusal('invite_expired', 'This invite has expired.'), 'This link has expired.');
    assert.equal(joinRefusal('invite_revoked', 'This invite was revoked.'), 'This link has been revoked.');
    assert.equal(joinRefusal('conflict', 'already used'), 'This link has already been used.');
    assert.equal(joinRefusal('not_found', 'No such invite.'), 'This link cannot be used.');
    assert.equal(joinRefusal('not_a_member', 'The referee archived you from this campaign.'), 'The referee archived you from this campaign.');
    assert.equal(joinRefusal('campaign_full', 'full'), 'This campaign has 255 players, the most it can have.');
    assert.equal(joinRefusal('forbidden', 'You cannot change that.'), 'You cannot change that.');
    assert.equal(joinFace({
        signedIn: true,
        refused: true,
        chosen: false,
        name: '',
        ownerHandle: '',
        refusal: 'The referee archived you from this campaign.',
        people: [],
    }).line, 'The referee archived you from this campaign.');
});

test('the token leaves the address bar and stays for the return from sign-in', () => {
    assert.equal(JOIN_BAR, '/join');
    assert.equal(heldJoinToken('raw-token', null), 'raw-token');
    assert.equal(heldJoinToken('', 'kept-token'), 'kept-token');
    assert.equal(heldJoinToken('raw-token', 'kept-token'), 'raw-token');
    assert.equal(JOIN_TOKEN_KEY, 'voyage.join.token');
    assert.match(page, /history\.replaceState\([\s\S]*JOIN_BAR\)/);
    assert.match(page, /sessionStorage\.setItem\(JOIN_TOKEN_KEY/);
    assert.match(page, /signIn\(fetch, JOIN_BAR\)/);
    assert.match(page, /panel: 'campaign'/);
    assert.match(page, /'Join'/);
    assert.match(page, />Not yet</);
    assert.match(page, /'Sign in'/);
    assert.match(router, /path: '\/join\/:token'/);
    assert.match(router, /path: '\/join'/);
    assert.match(html, /<meta name="referrer" content="same-origin" \/>/);
});
