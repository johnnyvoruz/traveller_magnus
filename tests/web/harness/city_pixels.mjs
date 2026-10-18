/**
 * Pixel harness for tests/web/surface_city_pixels.test.js.
 * Renders one pinned world's orbit disc twice in the asked program, city terms
 * on and off, and publishes both tiles' pixels on window.__cityPixels.
 * The test copies this file next to city_pixels.html under .tmp/city-pixels/
 * and replaces __FS__ with /@fs/<repo root>, so Vite serves the app's sources.
 * Query: mode=enhanced|vanilla, world=<manifest slug>, radius=<device px>.
 */
import { ENHANCED_CITY_VERSION } from '__FS__/apps/web/src/surface/enhanced/bake.ts';
import { mountDiscProgram } from '__FS__/apps/web/src/surface/enhanced/session.ts';
import { createDiscBaker } from '__FS__/apps/web/src/surface/vanilla/gl.ts';
import { cubeSizeFor } from '__FS__/apps/web/src/surface/vanilla/gl_bake.ts';
import { HALO, tileSide } from '__FS__/apps/web/src/surface/vanilla/gl_plan.ts';

const MANIFEST = '__FS__/tests/web/harness/city_design_s1_manifest.json';
const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'vanilla' ? 'vanilla' : 'enhanced';
const slug = params.get('world') || 'pavabid';
const radius = Number(params.get('radius') || '160');
const result = { status: 'starting', mode, world: slug, radius };
window.__cityPixels = result;

function frame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function base64(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(text);
}

/**
 * The same world with every city term at zero. The id is kept, so the bake is
 * shared; only the draw's uniforms change. cityOn is the enhanced program's
 * switch; the vanilla program has none, so gain, glow and haze go to zero too.
 */
function lightsOff(profile) {
    return { ...profile, lights: { ...profile.lights, gain: 0, glow: 0, haze: 0 } };
}

function request(pin, cityOn) {
    const shade = {
        key: slug + (cityOn ? ':on' : ':off'),
        profile: cityOn ? pin.profile : lightsOff(pin.profile),
        radius,
        spin: pin.spin,
        cloudSpin: pin.cloudSpin,
        sweep: 0,
        samples: 1,
        ring: null,
        tilt: pin.tiltDeg,
        light: [pin.light[0], pin.light[1]],
        sun: [1, 0.96, 0.9],
        casters: [],
        lightMode: false,
        uTime: 0,
        cityOn,
        cssDiameter: radius * 2,
    };
    if (mode === 'enhanced') shade.cityLook = 2;
    return shade;
}

async function settle(baker, pin, requests) {
    baker.renderBatch(requests);
    if (!baker.tiltIsWarm()) baker.warmTilt();
    baker.renderBatch(requests);
    for (let i = 0; i < 200 && baker.jobPending(pin.profile.id); i++) {
        await frame();
        baker.renderBatch(requests);
    }
    return baker.renderBatch(requests);
}

async function main() {
    const loaded = await fetch(MANIFEST);
    if (!loaded.ok) throw new Error('the pinned manifest did not load');
    const manifest = await loaded.json();
    const pin = manifest.worlds.find((item) => item.slug === slug);
    if (!pin) throw new Error('unknown world ' + slug);
    const canvas = document.getElementById('disc');
    const baker = createDiscBaker(canvas);
    const until = Date.now() + 30000;
    while (!baker.ready()) {
        baker.pump();
        if (baker.failed()) throw new Error('the disc program failed to compile');
        if (Date.now() > until) throw new Error('the disc program did not link in 30 s');
        await frame();
    }
    mountDiscProgram(baker, mode, ENHANCED_CITY_VERSION);
    baker.prepare(pin.profile, 0);
    baker.bakeSize(pin.profile, cubeSizeFor(radius), 0);
    const requests = [request(pin, true), request(pin, false)];
    const tiles = await settle(baker, pin, requests);
    const on = baker.readTile(requests[0].key);
    const off = baker.readTile(requests[1].key);
    if (!on || !off) throw new Error('a tile was not read back');
    const placed = tiles.get(requests[0].key);
    const gl = baker.gl();
    const debug = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    Object.assign(result, {
        status: 'done',
        version: ENHANCED_CITY_VERSION,
        size: placed ? placed.size : tileSide(radius, null),
        halo: HALO,
        light: [pin.light[0], pin.light[1]],
        air: pin.profile.air.strength,
        pop: pin.profile.lights.pop,
        renderer: gl ? String(debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'none',
        on: base64(on),
        off: base64(off),
    });
}

main().catch((err) => {
    result.status = 'error';
    result.message = err instanceof Error ? err.message : String(err);
});
