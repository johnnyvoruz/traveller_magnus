/**
 * The map's campaign layer against a recording canvas.
 * Nothing is drawn when no campaign is open. The party marker changes with the
 * zoom tier. A person aboard a vessel is drawn at the vessel's hex. The locator
 * ring pulses once the camera has arrived, and stays still under reduced motion.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toScreen } from '../../apps/web/src/map/camera.ts';
import {
    drawCampaignLayer,
    partyContains,
    resolvePartyHex,
    standInSnapshot,
    vesselContains,
    VESSELS_PER_HEX,
} from '../../apps/web/src/map/campaign_layer.ts';
import { DISC_R } from '../../apps/web/src/map/glyphs.ts';
import { hexCentre, toGlobal } from '../../apps/web/src/map/geometry.ts';
import { MapRenderer } from '../../apps/web/src/map/MapRenderer.ts';
import { PPP_NAMES } from '../../apps/web/src/map/tiers.ts';
import { recordingContext } from './orbit_fixture.js';

const SECTORS = [{ slug: 'Spinward_Marches', x: -4, y: -1 }];
const HEX = 'Spinward_Marches/1910';
const INK = { signal: 'signal', tag: 'tag', bg: 'bg', font: 'Font', pulseMs: 1000 };
const VP = { width: 400, height: 300 };

const world = hexCentre(toGlobal(-4, -1, 19, 10).q, toGlobal(-4, -1, 19, 10).r);

function camera(ppp) {
    return { x: world.x, y: world.y, ppp };
}

function screenOf(ppp) {
    return toScreen(camera(ppp), VP, world.x, world.y);
}

function paint(snapshot, ppp, nowMs) {
    const { ctx, calls } = recordingContext();
    const frame = drawCampaignLayer(ctx, {
        cam: camera(ppp),
        vp: VP,
        sectors: SECTORS,
        snapshot,
        ink: INK,
        nowMs,
    });
    return { calls, frame };
}

function party(extra = {}) {
    return {
        party: { name: 'Far Margin', hexKey: HEX, focused: false, ...extra },
        locate: null,
        reducedMotion: false,
    };
}

function texts(calls) {
    return calls.filter((call) => call.op === 'fillText').map((call) => call.args[0]);
}

function arcs(calls) {
    return calls.filter((call) => call.op === 'arc').map((call) => call.args[2]);
}

test('a closed campaign draws nothing', () => {
    const closed = paint(null, 80, 0);
    assert.equal(closed.calls.length, 0);
    assert.equal(closed.frame.mark, null);
    const empty = paint({ party: null, locate: null, reducedMotion: false }, 80, 0);
    assert.equal(empty.calls.length, 0);
});

test('the party marker follows the zoom tier', () => {
    const names = paint(party(), 80, 0);
    assert.ok(PPP_NAMES <= 80);
    assert.ok(texts(names.calls).includes('FAR MARGIN'));
    assert.equal(names.frame.mark.tier, 'names');
    const at = screenOf(80);
    assert.ok(names.frame.mark.cx > at.sx);
    assert.ok(names.calls.some((call) => call.op === 'lineTo'));
    assert.equal(names.calls.find((call) => call.op === 'fillText').fill, 'signal');

    const chevron = paint(party(), 30, 0);
    assert.equal(chevron.frame.mark.tier, 'chevron');
    assert.equal(texts(chevron.calls).length, 0);
    assert.ok(chevron.calls.some((call) => call.op === 'lineTo'));
    const focused = paint(party({ focused: true }), 30, 0);
    assert.ok(texts(focused.calls).includes('FAR MARGIN'));

    const point = paint(party(), 4, 0);
    assert.equal(point.frame.mark.tier, 'point');
    assert.equal(texts(point.calls).length, 0);
    assert.equal(point.calls.some((call) => call.op === 'lineTo'), false);
    assert.ok(arcs(point.calls).includes(3.5));
    assert.ok(arcs(point.calls).includes(7));
});

test('a click on the marker is the party, and a click on the system glyph is not', () => {
    const names = paint(party(), 80, 0);
    const mark = names.frame.mark;
    assert.equal(partyContains(mark, mark.worldX, mark.worldY), false);
    assert.equal(partyContains(mark, mark.cx, mark.cy), true);
    assert.equal(partyContains(mark, mark.tag.x + 4, mark.tag.y + 4), true);
    const glyph = DISC_R * 80;
    assert.ok(Math.hypot(mark.cx - mark.worldX, mark.cy - mark.worldY) > glyph + mark.hitR);
    const point = paint(party(), 4, 0);
    assert.equal(partyContains(point.frame.mark, point.frame.mark.cx + 6, point.frame.mark.cy), false);
});

test('a person aboard a vessel resolves to the vessel hex', () => {
    const records = {
        cr_vessel: { anchor: { kind: 'system', hexKey: HEX } },
        cr_person: { anchor: { kind: 'record', id: 'cr_vessel' } },
    };
    const aboard = resolvePartyHex(
        { vesselId: 'cr_vessel', anchor: { kind: 'system', hexKey: 'Spinward_Marches/0101' } },
        records,
    );
    assert.equal(aboard, HEX);
    const followed = resolvePartyHex(
        { vesselId: null, anchor: { kind: 'record', id: 'cr_person' } },
        records,
    );
    assert.equal(followed, HEX);
    const stand = standInSnapshot(2000, 0);
    assert.equal(stand.party.hexKey, HEX);
    const one = paint(party(), 80, 0);
    const many = paint(stand, 80, 0);
    assert.equal(one.calls.length > 0, true);
    assert.equal(many.calls.filter((call) => call.op === 'fillText').length, 1);
});

test('the locator pulses after the camera arrives, and reduced motion stays still', () => {
    const locate = {
        party: null,
        locate: { hexKey: HEX, fromX: 12, fromY: 24, arrivedAt: 5000 },
        reducedMotion: false,
    };
    const start = paint(locate, 80, 5000);
    const mid = paint(locate, 80, 5500);
    assert.equal(start.frame.animating, true);
    assert.notEqual(arcs(start.calls)[0], arcs(mid.calls)[0]);
    assert.ok(start.calls.some((call) => call.op === 'fill' && call.args[0] === 'evenodd' && call.fill === 'bg'));
    assert.ok(start.calls.some((call) => call.op === 'moveTo' && call.args[0] === 12 && call.args[1] === 24));

    const still = {
        ...locate,
        reducedMotion: true,
    };
    const held = paint(still, 80, 5000);
    const later = paint(still, 80, 5500);
    assert.equal(held.frame.animating, false);
    assert.equal(arcs(held.calls)[0], arcs(later.calls)[0]);

    const flying = paint({
        party: null,
        locate: { hexKey: HEX, fromX: 12, fromY: 24, arrivedAt: null },
        reducedMotion: false,
    }, 80, 5500);
    assert.equal(flying.frame.animating, false);
    assert.equal(arcs(flying.calls)[0], arcs(held.calls)[0]);
});

test('the renderer draws the marker only from the snapshot', () => {
    const { ctx, calls } = recordingContext();
    const canvas = { width: 0, height: 0, getContext() { return ctx; } };
    const theme = {
        bg0: 'bg', line1: 'l1', line2: 'l2', signal: 'signal', signalDim: 'sigdim',
        text1: 't1', textMuted: 'muted', fontDisplay: 'display', fontData: 'data', fontText: 'text',
        tFast: 0, tag: 'tag', tPulse: 2.4,
        chart: {
            world: 'world', water: 'water', zoneAmber: 'amber', zoneRed: 'red',
            grid: 'grid', selected: 'selected', routeXboat: 'xboat', routeOther: 'other',
            titleText: 'title', titlePill: 'pill',
        },
        routeColours: {},
    };
    const renderer = new MapRenderer(canvas, theme);
    renderer.resize(VP.width, VP.height, 1);
    renderer.setChart(
        { sectors: [{ slug: 'Spinward_Marches', name: 'Spinward Marches', x: -4, y: -1, canonical: true }] },
        { sectors: [] },
        'canonical',
    );
    renderer.setCampaign(null);
    renderer.draw(camera(80));
    assert.equal(texts(calls).includes('FAR MARGIN'), false);
    const before = calls.length;
    renderer.setCampaign(party());
    renderer.draw(camera(80));
    assert.ok(texts(calls.slice(before)).includes('FAR MARGIN'));
    const at = screenOf(80);
    assert.equal(renderer.partyAt(at.sx, at.sy), false);
    assert.equal(renderer.partyAt(at.sx + 30, at.sy), true);
});

const vesselId = (n) => 'cr_' + String(n).padStart(8, '0') + '-0000-4000-8000-000000000000';

function vessel(n, name, extra = {}) {
    return { id: vesselId(n), name, hexKey: HEX, party: false, inJump: false, ...extra };
}

test('two vessels at one hex both show, and five show three plus a count', () => {
    assert.equal(VESSELS_PER_HEX, 3);
    const shared = paint({
        party: { name: 'Far Margin', hexKey: HEX, focused: false },
        locate: null,
        reducedMotion: false,
        vessels: [
            vessel(1, 'Far Margin', { party: true }),
            vessel(3, 'Liner', { inJump: true }),
            vessel(2, 'Courier'),
        ],
    }, 80, 0);
    assert.deepEqual(texts(shared.calls), ['COURIER', 'LINER · IN JUMP', 'FAR MARGIN']);
    const discs = shared.calls.filter((call) => call.op === 'arc' && call.args[2] === 6);
    assert.equal(discs.length, 2);
    const gap = Math.hypot(discs[0].args[0] - discs[1].args[0], discs[0].args[1] - discs[1].args[1]);
    assert.ok(gap >= 12);
    assert.equal(shared.frame.vessels.length, 2);
    assert.deepEqual(shared.frame.vessels.map((hit) => hit.id), [vesselId(2), vesselId(3)]);
    const hit = shared.frame.vessels[0];
    assert.equal(vesselContains(hit, hit.cx, hit.cy), true);
    assert.equal(vesselContains(hit, hit.tag.x + 2, hit.tag.y + 2), true);
    assert.equal(vesselContains(hit, hit.worldX, hit.worldY), false);
    assert.equal(shared.calls.some((call) => call.op === 'lineTo' && call.fill === 'signal'), true);

    const five = paint({
        party: null,
        locate: null,
        reducedMotion: true,
        vessels: [1, 2, 3, 4, 5].map((n) => vessel(n, 'Ship ' + n)),
    }, 80, 0);
    assert.deepEqual(texts(five.calls), ['SHIP 1', 'SHIP 2', 'SHIP 3', '+2']);
    assert.equal(five.frame.vessels.length, 3);
    assert.equal(five.frame.animating, false);
    const quiet = five.calls.filter((call) => call.op === 'arc' && call.args[2] === 6);
    assert.equal(quiet.length, 3);
    assert.ok(quiet.every((call) => call.fill === 'tag' && call.alpha === 0.45));

    const chevron = paint({
        party: null,
        locate: null,
        reducedMotion: false,
        vessels: [vessel(1, 'Courier'), vessel(2, 'Liner')],
    }, 30, 0);
    assert.equal(texts(chevron.calls).length, 0);
    assert.equal(chevron.frame.vessels.length, 2);

    const point = paint({
        party: null,
        locate: null,
        reducedMotion: false,
        vessels: [1, 2, 3, 4, 5].map((n) => vessel(n, 'Ship ' + n)),
    }, 4, 0);
    assert.equal(texts(point.calls).length, 0);
    assert.equal(point.frame.vessels.length, 1);
    assert.equal(vesselContains(point.frame.vessels[0], point.frame.vessels[0].cx, point.frame.vessels[0].cy), false);
});
