<script setup lang="ts">
/**
 * Dev-only enhanced disc harness. Cloud amount, city on/off, light, spin and
 * a fixed camera. Nothing here is on a product route. Overrides are printed
 * on the frame.
 */
import { nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { nextFrame } from '../../platform/browser.ts';
import { ENHANCED_CITY_VERSION } from '../../surface/enhanced/bake.ts';
import { cityLook, setCityLook, type CityLookId } from '../../surface/enhanced/city_look.ts';
import { mountDiscProgram } from '../../surface/enhanced/session.ts';
import { createDiscBaker, type DiscBaker } from '../../surface/vanilla/gl.ts';
import type { ShadeProfile, ShadeRequest } from '../../surface/vanilla/gl_shade.ts';

type Pin = {
    slug: string;
    bodyName: string;
    light: [number, number];
    spin: number;
    cloudSpin: number;
    tiltDeg: number;
    profile: ShadeProfile;
};

type Shot = {
    cloud: number | null;
    city: boolean;
    day: boolean;
    diag: number;
    light: [number, number];
    spin: number;
    cloudSpin: number;
    radius: number;
    lod: number | null;
};

const MANIFEST = '/@fs/D:/webstorm/traveller_magnus/findings/city_design_s1_manifest.json';
const route = useRoute();
const status = ref('Starting the enhanced disc.');
const lines = ref<string[]>([]);
const stacked = ref(false);
const panels = ref<{ title: string }[]>([]);
const panelCanvas: HTMLCanvasElement[] = [];

function keepCanvas(el: unknown, index: number): void {
    if (el instanceof HTMLCanvasElement) panelCanvas[index] = el;
}

function readShot(params: URLSearchParams, pin: Pin): Shot {
    const cloudText = params.get('cloud');
    const lightText = params.get('light');
    const light = lightText
        ? lightText.split(',').map((part) => Number(part)) as [number, number]
        : pin.light;
    return {
        cloud: cloudText == null || cloudText === '' ? null : Number(cloudText),
        city: params.get('city') !== '0',
        day: params.get('day') === '1',
        diag: Number(params.get('diag') || '0'),
        light: [light[0] ?? pin.light[0], light[1] ?? pin.light[1]],
        spin: params.get('spin') == null ? pin.spin : Number(params.get('spin')),
        cloudSpin: params.get('cloudSpin') == null ? pin.cloudSpin : Number(params.get('cloudSpin')),
        radius: Number(params.get('radius') || '160'),
        lod: params.get('lod') == null ? null : Number(params.get('lod')),
    };
}

function caption(pin: Pin, shot: Shot): string[] {
    const diag = shot.diag > 1.5 ? 'core' : shot.diag > 0.5 ? 'rgb' : 'shaded';
    const cloud = shot.cloud == null ? 'natural' : shot.cloud.toFixed(2) + ' forced';
    const lightPinned = shot.light[0] === pin.light[0] && shot.light[1] === pin.light[1];
    const spinPinned = shot.spin === pin.spin;
    const cloudPinned = shot.cloudSpin === pin.cloudSpin;
    return [
        pin.bodyName + '  ' + ENHANCED_CITY_VERSION,
        'cloud ' + cloud,
        'city ' + (shot.city ? 'on' : 'off'),
        'light ' + shot.light[0].toFixed(4) + ', ' + shot.light[1].toFixed(4) + (lightPinned ? ' pinned' : ' override'),
        'spin ' + shot.spin.toFixed(4) + (spinPinned ? ' pinned' : ' override'),
        'cloud spin ' + shot.cloudSpin.toFixed(4) + (cloudPinned ? ' pinned' : ' override'),
        (shot.day ? 'day' : 'night') + '  diag ' + diag + '  radius ' + String(shot.radius),
        shot.lod == null ? 'lod from radius' : 'lod ' + String(shot.lod),
        'inspection sun 1.00, 0.96, 0.90',
    ];
}

function shadeRequest(pin: Pin, shot: Shot): ShadeRequest {
    const request: ShadeRequest = {
        key: pin.slug,
        profile: pin.profile,
        radius: shot.radius,
        spin: shot.spin,
        cloudSpin: shot.cloudSpin,
        sweep: 0,
        samples: 1,
        ring: null,
        tilt: pin.tiltDeg,
        light: shot.light,
        sun: [1, 0.96, 0.9],
        casters: [],
        lightMode: shot.day,
        uTime: 0,
        cityOn: shot.city,
        diag: shot.diag,
        cssDiameter: shot.radius * 2,
        cityLook: cityLook().index,
    };
    if (shot.cloud != null) request.cloudForce = shot.cloud;
    return request;
}

async function untilReady(baker: DiscBaker): Promise<void> {
    for (let i = 0; i < 120; i++) {
        baker.pump();
        if (baker.ready()) return;
        await new Promise<void>((resolve) => {
            nextFrame(() => resolve());
        });
    }
    throw new Error('disc program did not link');
}

let baker: DiscBaker | null = null;
let pin: Pin | null = null;
let shot: Shot | null = null;

async function draw(): Promise<{ ms: number; memory: number }> {
    const current = baker;
    const body = pin;
    const view = shot;
    const canvas = document.querySelector('canvas.disc');
    if (!current || !body || !view || !(canvas instanceof HTMLCanvasElement)) throw new Error('harness is not ready');
    const request = shadeRequest(body, view);
    const started = performance.now();
    if (view.lod != null) {
        current.prepare(body.profile, 0);
        current.bakeSize(body.profile, view.lod, 0);
    }
    current.renderBatch([request]);
    for (let i = 0; i < 80 && current.jobPending(body.profile.id); i++) {
        await new Promise<void>((resolve) => {
            nextFrame(() => resolve());
        });
        current.renderBatch([request]);
    }
    const ms = performance.now() - started;
    return { ms, memory: current.memory() };
}

onMounted(async () => {
    try {
        await mount();
    } catch (err) {
        status.value = err instanceof Error ? err.message : 'The harness failed.';
    }
});

async function mount(): Promise<void> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(route.query)) {
        if (typeof value === 'string') params.set(key, value);
    }
    const asked = params.get('look');
    if (asked === 'A' || asked === 'B' || asked === 'C') setCityLook(asked as CityLookId);
    const slug = params.get('world') || 'rhylanor';
    const loaded = await fetch(MANIFEST);
    if (!loaded.ok) {
        status.value = 'The pinned manifest did not load.';
        return;
    }
    const manifest = await loaded.json() as { worlds: Pin[] };
    const found = manifest.worlds.find((item) => item.slug === slug) ?? null;
    if (!found) {
        status.value = 'Unknown world.';
        return;
    }
    pin = found;
    shot = readShot(params, found);
    lines.value = caption(found, shot);
    const canvas = document.querySelector('canvas.disc');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const sheet = params.get('sheet');
    if (sheet === 'lod' || sheet === 'spin' || sheet === 'day') {
        stacked.value = true;
        const views = sheetViews(shot, sheet);
        panels.value = views.map((panel) => ({ title: found.bodyName + ' ' + panel.title }));
        await nextTick();
        for (let i = 0; i < views.length; i++) {
            const canvas = panelCanvas[i];
            const view = views[i];
            if (!canvas || !view) continue;
            await paintOne(canvas, view.view);
        }
        lines.value = [
            found.bodyName + '  ' + ENHANCED_CITY_VERSION + '  sheet ' + sheet,
            'pinned light ' + found.light[0].toFixed(4) + ', ' + found.light[1].toFixed(4),
            'pinned spin ' + found.spin.toFixed(4) + '  pinned cloud spin ' + found.cloudSpin.toFixed(4),
            'inspection sun 1.00, 0.96, 0.90',
            'each panel title is that panel\'s override',
        ];
        status.value = 'ready';
        Object.assign(window, { __cityLights: { ready: true, world: found.slug, sheet } });
        return;
    }
    canvas.width = 32;
    canvas.height = 32;
    baker = createDiscBaker(canvas);
    await untilReady(baker);
    mountDiscProgram(baker, 'enhanced', ENHANCED_CITY_VERSION);
    let bakeCold = 0;
    let bakeWarm = 0;
    let bakeMemory = 0;
    if (params.get('bake') === '1' && shot.lod != null) {
        baker.prepare(found.profile, 0);
        const coldStarted = performance.now();
        baker.bakeSize(found.profile, shot.lod, 0);
        bakeCold = performance.now() - coldStarted;
        const warmStarted = performance.now();
        baker.bakeSize(found.profile, shot.lod, 0);
        bakeWarm = performance.now() - warmStarted;
        bakeMemory = baker.memory();
        shot = { ...shot, lod: null };
    }
    const first = await draw();
    status.value = 'ready';
    Object.assign(window, {
        __cityLights: {
            ready: true,
            version: ENHANCED_CITY_VERSION,
            world: found.slug,
            spin: found.spin,
            cloudSpin: found.cloudSpin,
            lines: lines.value,
            frameMs: first.ms,
            bakeColdMs: bakeCold,
            bakeWarmMs: bakeWarm,
            memory: baker.memory(),
            bakeMemory,
            draw,
            set: async (partial: Partial<Shot>) => {
                if (!shot || !pin) throw new Error('harness is not ready');
                shot = { ...shot, ...partial };
                lines.value = caption(pin, shot);
                return draw();
            },
        },
    });
}

async function paintOne(canvas: HTMLCanvasElement, view: Shot): Promise<void> {
    canvas.width = 32;
    canvas.height = 32;
    const local = createDiscBaker(canvas);
    await untilReady(local);
    mountDiscProgram(local, 'enhanced', ENHANCED_CITY_VERSION);
    const previous = baker;
    const previousShot = shot;
    baker = local;
    shot = view;
    await draw();
    baker = previous;
    shot = previousShot;
}

function sheetViews(view: Shot, sheet: string): { title: string; view: Shot }[] {
    const views: { title: string; view: Shot }[] = [];
    if (sheet === 'lod') {
        for (const lod of [32, 64, 128, 256]) {
            const radius = lod === 32 ? 20 : lod === 64 ? 48 : lod === 128 ? 96 : 160;
            views.push({
                title: 'lod ' + String(lod) + '  r ' + String(radius) + '  cloud 0 forced  city on  diag rgb  night',
                view: { ...view, lod, radius, cloud: 0, city: true, diag: 1 },
            });
        }
    } else if (sheet === 'spin') {
        views.push({ title: 'cloud spin pinned  natural cloud  city on  diag shaded', view: { ...view, cloud: null, city: true, diag: 0 } });
        views.push({
            title: 'cloud spin +1.2  natural cloud  city on  diag shaded',
            view: { ...view, cloud: null, cloudSpin: view.cloudSpin + 1.2, city: true, diag: 0 },
        });
    } else {
        views.push({ title: 'day ground  cloud 0 forced  city on  diag shaded', view: { ...view, day: true, city: true, diag: 0, cloud: 0 } });
        views.push({ title: 'night cube rgb  cloud 0 forced  city on  diag rgb', view: { ...view, day: false, city: true, diag: 1, cloud: 0 } });
    }
    return views;
}
</script>

<template>
  <main class="harness">
    <p class="status">{{ status }}</p>
    <canvas v-if="!stacked" class="disc"></canvas>
    <div class="row">
      <div v-for="(panel, index) in panels" :key="panel.title">
        <canvas class="disc" :ref="(el) => keepCanvas(el, index)"></canvas>
        <p class="label">{{ panel.title }}</p>
      </div>
    </div>
    <p v-for="line in lines" :key="line" class="label">{{ line }}</p>
  </main>
</template>

<style scoped>
.harness {
  width: max-content;
  margin: 0;
  padding: 12px;
  background: var(--bg-0);
  color: var(--text-1);
}
.status, .label {
  margin: 0 0 4px;
  font: 14px/1.4 var(--font-text);
  color: var(--text-0);
}
.disc {
  display: block;
  background: var(--bg-1);
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}
</style>
