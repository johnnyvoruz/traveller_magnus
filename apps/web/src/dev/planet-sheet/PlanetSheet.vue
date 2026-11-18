<script setup lang="ts">
/**
 * Dev-only contact sheet of the orbit view's planet discs (Johnny, 2026-11-14): a dozen archetype worlds
 * side by side under one light, each with its UWP, so a change to the look is judged on all of them at
 * once. Each disc is the product's own enhanced program (surface/enhanced), from the product's own profile
 * (surface/profile.ts): nothing here draws a planet by another road. Not on a product route.
 *
 *   /dev/planet-sheet                 the sheet
 *   ?light=-0.75,0.3                  the sun, as the disc program takes it (x, y on the disc's plane)
 *   ?radius=150  ?spin=0.6  ?city=0   the disc radius in pixels, the turn, the city terms off
 *   ?only=garden                      one world, large
 *   ?set=kin                          one garden, one rock and two gas giants, four times each from four seeds
 *   ?look=before                      the enhanced program without look pass 1 (enhanced/draw.ts)
 *   ?map=0  ?map=quick                the globe from the disc program's own bake; from the quick map texture
 *   ?time=12.3                        the program's clock in seconds (lightning, lava's breathing, boiling cloud edges)
 *
 * By default each globe is drawn from the world's own hex map (surface/map_disc.ts), as the orbit view draws
 * a disc large enough to show one.
 */
import { nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { nextFrame, publishAutomationResult } from '../../platform/browser.ts';
import { ENHANCED_CITY_VERSION } from '../../surface/enhanced/bake.ts';
import { cityLook } from '../../surface/enhanced/city_look.ts';
import { mountDiscProgram } from '../../surface/enhanced/session.ts';
import { hybridWorld } from '../../surface/hybrid/inputs.ts';
import { buildHybridModel, LOCKED_NIGHT_CENTRED_LON } from '../../surface/hybrid/model.ts';
import { COASTLINE_COMPLEXITY, CONTINENTAL_DEFINITION } from '../../surface/identity.ts';
import { mapDiscTexture, type MapStage } from '../../surface/map_disc.ts';
import { enhancedProfile } from '../../surface/enhanced/climate.ts';
import { createDiscBaker, type DiscBaker } from '../../surface/vanilla/gl.ts';
import type { ShadeProfile, ShadeRequest } from '../../surface/vanilla/gl_shade.ts';

type World = { slug: string; label: string; uwp: string; note: string; body: Record<string, unknown> };

const RESULT_KEY = '__planetSheet';

/** A world as the generator hands one over: the UWP's digits, a temperature, and nothing invented beyond them. */
function world(slug: string, label: string, uwp: string, kelvin: number, note: string, extra: Record<string, unknown> = {}): World {
    const hexDigit = (c: string): number => parseInt(c, 36);
    return {
        slug, label, uwp, note,
        body: {
            type: 'Planet', name: label, uwp,
            size: hexDigit(uwp[1]), atmCode: hexDigit(uwp[2]), hydroCode: hexDigit(uwp[3]),
            meanTempK: kelvin, ...extra,
        },
    };
}

const WORLDS: World[] = [
    world('garden', 'Garden', 'B867974-C', 291, 'standard air, 70% water, billions, TL C'),
    world('ocean', 'Water world', 'C76A656-9', 289, 'standard air, all sea'),
    world('desert', 'Desert', 'C560757-A', 310, 'standard air, no water'),
    world('redrock', 'Thin-air rock', 'D430365-7', 250, 'very thin air, no water'),
    world('vacuum', 'Vacuum rock', 'E200169-8', 240, 'no air, no water'),
    world('ice', 'Ice world', 'C688574-6', 205, 'dense air, frozen seas'),
    world('inferno', 'Corrosive hot', 'X9B0000-0', 620, 'corrosive air, no water, no people'),
    world('exotic', 'Exotic air', 'B8A5568-9', 300, 'exotic air, half sea'),
    world('insidious', 'Insidious', 'C8C3200-8', 330, 'insidious air'),
    world('hive', 'High population', 'A887A9A-F', 293, 'dense air, tens of billions, TL F'),
    world('lowtech', 'Low tech, crowded', 'C766977-4', 292, 'billions at TL 4'),
    world('tainted', 'Thin, tainted', 'A646930-D', 298, 'thin tainted air, billions, TL D'),
    world('volcanic', 'Volcanic', 'D552433-7', 318, 'thin air, high seismic stress', { seismicStress: 90, tectonicPlates: 12, plateInteraction: 'Converging' }),
    world('molten', 'Molten', 'X610000-0', 1150, 'trace air, a molten surface'),
];

/** One kind, eight times over, each from its own seed: the kin sheet (`?set=kin`). Nothing differs but the name. */
const KIN: World[] = [
    ...['a', 'b', 'c', 'd'].map((n) => world('garden-' + n, 'Garden ' + n.toUpperCase(), 'B867974-C', 291, 'the same world data, its own seed')),
    ...['a', 'b', 'c', 'd'].map((n) => world('rock-' + n, 'Rock ' + n.toUpperCase(), 'E300000-0', 230, 'the same world data, its own seed')),
    ...['a', 'b', 'c', 'd'].map((n): World => ({
        slug: 'giant-' + n, label: 'Large giant ' + n.toUpperCase(), uwp: 'GL', note: 'the same gas giant, its own seed',
        body: { type: 'Gas Giant', name: 'Giant ' + n, ggType: 'GL', meanTempK: 130, siderealHours: 10 },
    })),
    ...['a', 'b', 'c', 'd'].map((n): World => ({
        slug: 'small-' + n, label: 'Small giant ' + n.toUpperCase(), uwp: 'GS', note: 'the same gas giant, its own seed',
        body: { type: 'Gas Giant', name: 'Small ' + n, ggType: 'GS', meanTempK: 70, siderealHours: 16 },
    })),
];

const route = useRoute();
const status = ref('Starting the discs.');
const shown = ref<World[]>([]);
const size = ref(0);
const look = ref('');
const canvases: HTMLCanvasElement[] = [];

function keep(el: unknown, index: number): void {
    if (el instanceof HTMLCanvasElement) canvases[index] = el;
}

function numbers(text: unknown, fallback: number[]): number[] {
    if (typeof text !== 'string' || !text) return fallback;
    const parts = text.split(',').map((part) => Number(part));
    return parts.length === fallback.length && parts.every((n) => Number.isFinite(n)) ? parts : fallback;
}

async function untilReady(baker: DiscBaker): Promise<void> {
    for (let i = 0; i < 240; i += 1) {
        baker.pump();
        if (baker.ready()) return;
        await new Promise<void>((resolve) => { nextFrame(() => resolve()); });
    }
    throw new Error('The disc program did not link.');
}

async function paint(canvas: HTMLCanvasElement, item: World, radius: number, light: [number, number], spin: number, city: boolean, before: boolean, map: MapStage | null, time: number): Promise<void> {
    canvas.width = 32;
    canvas.height = 32;
    const baker = createDiscBaker(canvas);
    await untilReady(baker);
    mountDiscProgram(baker, 'enhanced', ENHANCED_CITY_VERSION, before);
    const profile = enhancedProfile(item.body, 'planet-sheet/' + item.slug) as ShadeProfile;
    const request: ShadeRequest = {
        key: item.slug, profile, radius, spin, cloudSpin: spin * 0.35, sweep: 0, samples: 1, ring: null,
        tilt: 12, light, sun: [1, 0.96, 0.9], casters: [], lightMode: false, uTime: time,
        cityOn: city, diag: 0, cssDiameter: radius * 2, cityLook: cityLook().index,
    };
    if (map) {
        const world = hybridWorld('planet-sheet/' + item.slug, 'w0', item.body, { continental: CONTINENTAL_DEFINITION, coastline: COASTLINE_COMPLEXITY });
        if (world) {
            const texture = mapDiscTexture(buildHybridModel(world), map, 'map|' + map + '|' + item.slug);
            baker.setPaint(texture.key, { width: texture.width, height: texture.height, pixels: texture.pixels });
            request.paintKey = texture.key;
            request.paintLon = world.locked ? LOCKED_NIGHT_CENTRED_LON * Math.PI / 180 : 0;
            request.paintMap = true;
        }
    }
    baker.renderBatch([request]);
    if (!baker.tiltIsWarm()) baker.warmTilt();
    baker.renderBatch([request]);
    for (let i = 0; i < 120 && baker.jobPending(profile.id); i += 1) {
        await new Promise<void>((resolve) => { nextFrame(() => resolve()); });
        baker.renderBatch([request]);
    }
}

onMounted(async () => {
    publishAutomationResult(RESULT_KEY, { status: 'running', ok: false });
    try {
        const only = typeof route.query.only === 'string' ? route.query.only : '';
        const all = route.query.set === 'kin' ? KIN : WORLDS;
        const list = only ? all.filter((item) => item.slug === only) : all;
        const radius = Number(route.query.radius) > 0 ? Number(route.query.radius) : only ? 300 : 150;
        const light = numbers(route.query.light, [-0.75, 0.3]) as [number, number];
        const spin = Number.isFinite(Number(route.query.spin)) && route.query.spin != null ? Number(route.query.spin) : 0.6;
        const city = route.query.city !== '0';
        const before = route.query.look === 'before';
        const time = Number.isFinite(Number(route.query.time)) && route.query.time != null ? Number(route.query.time) : 0;
        const map: MapStage | null = route.query.map === '0' ? null : route.query.map === 'quick' ? 'quick' : 'full';
        look.value = (before ? 'before the look passes' : 'look passes 1 and 2') + ' · ' + (map ? 'globe from the hex map (' + map + ')' : 'globe from the bake');
        size.value = radius;
        shown.value = list;
        await nextTick();
        for (let i = 0; i < list.length; i += 1) {
            status.value = 'Painting ' + list[i].label + '.';
            if (canvases[i]) await paint(canvases[i], list[i], radius, light, spin, city, before, map, time);
            await new Promise<void>((resolve) => { nextFrame(() => resolve()); });
        }
        status.value = 'ready';
        publishAutomationResult(RESULT_KEY, { status: 'done', ok: true, worlds: list.length });
    } catch (err) {
        status.value = err instanceof Error ? err.message : 'The sheet failed.';
        publishAutomationResult(RESULT_KEY, { status: 'error', ok: false, message: status.value });
    }
});
</script>

<template>
  <main class="psheet" :data-status="status">
    <p class="psheet-status">{{ status }} · {{ ENHANCED_CITY_VERSION }} · {{ look }}</p>
    <div class="psheet-grid">
      <figure v-for="(item, index) in shown" :key="item.slug" class="psheet-cell" :data-world="item.slug">
        <canvas :ref="(el) => keep(el, index)" class="psheet-disc"></canvas>
        <figcaption>
          <b>{{ item.label }}</b><code>{{ item.uwp }}</code>
          <span>{{ item.note }}</span>
        </figcaption>
      </figure>
    </div>
  </main>
</template>

<style scoped>
.psheet {
  width: max-content;
  min-height: 100vh;
  margin: 0;
  /* The app's search row stands over the top of every page. */
  padding: 84px 16px 16px;
  background: var(--bg-0);
  color: var(--text-1);
}

.psheet-status {
  margin: 0 0 12px;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-code);
}

.psheet-grid {
  display: grid;
  grid-template-columns: repeat(4, max-content);
  gap: 18px 14px;
}

.psheet-cell {
  display: grid;
  justify-items: center;
  gap: 6px;
  margin: 0;
}

.psheet-disc {
  display: block;
}

.psheet-cell figcaption {
  display: grid;
  grid-template-columns: auto auto;
  justify-content: center;
  gap: 0 8px;
  text-align: center;
  font: 400 12px/1.4 var(--font-text);
}

.psheet-cell figcaption b {
  color: var(--text-0);
  font-weight: 600;
}

.psheet-cell figcaption code {
  color: var(--signal);
  font: 600 12px/1.4 var(--font-code);
}

.psheet-cell figcaption span {
  grid-column: 1 / -1;
  color: var(--text-muted);
}
</style>
