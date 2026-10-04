<script setup lang="ts">
import { ref } from 'vue';
import { createCanvas, now, publishAutomationResult } from '../../platform/browser.ts';
import { paintDiamondMap, renderFlatMapPixels, type DiamondMapInputs } from '../../surface/vanilla/map.ts';
import { legacyRealmRenderer } from './candidate.ts';
import { canvasCoverage, compareCanvases } from './compare.ts';
import type { ParityResult, SurfaceMapInputs, WorldParity } from './types.ts';
import { PARITY_WORLDS } from './worlds.ts';

const REALM = '/dev/surface-parity/realm.html';
const RESULT_KEY = '__surfaceParity';
const NEGATIVE_SEED = 'not-the-same-seed';

const legacyFrame = ref<HTMLIFrameElement | null>(null);
const report = ref<ParityResult>({ status: 'running', ok: false, worlds: [] });

function publish(value: ParityResult): void {
    report.value = value;
    publishAutomationResult(RESULT_KEY, value);
}

function toDraw(inputs: SurfaceMapInputs, masterSeed = inputs.masterSeed): DiamondMapInputs {
    return {
        worldData: inputs.worldData,
        imageSeed: inputs.hexId,
        masterSeed,
        continentalDefinition: inputs.continentalDefinition,
        coastlineComplexity: inputs.coastlineComplexity,
        printMode: inputs.printMode,
    };
}

function paint(inputs: SurfaceMapInputs, pixels?: Uint8ClampedArray, masterSeed?: string): HTMLCanvasElement {
    const canvas = createCanvas(800, 400);
    paintDiamondMap(canvas, toDraw(inputs, masterSeed), pixels);
    return canvas;
}

function run(): void {
    try {
        const legacy = legacyRealmRenderer(legacyFrame.value);
        const regina = PARITY_WORLDS[0];
        const started = now();
        const reginaPixels = renderFlatMapPixels(toDraw(regina));
        const reginaPixelsMs = now() - started;
        const worlds = PARITY_WORLDS.map((inputs): WorldParity => {
            const legacyCanvas = legacy(inputs);
            const coverage = canvasCoverage(legacyCanvas);
            const portCanvas = inputs.id === regina.id
                ? paint(inputs, reginaPixels)
                : paint(inputs);
            return { ...compareCanvases(inputs.id, legacyCanvas, portCanvas), ...coverage };
        });
        const legacyRegina = legacy(regina);
        const negativeControl: WorldParity = {
            ...compareCanvases(regina.id + ' negative', legacyRegina, paint(regina, undefined, NEGATIVE_SEED)),
            ...canvasCoverage(legacyRegina),
        };
        const framesOk = worlds.every((item) => item.mismatches === 0
            && item.width === 800
            && item.height === 400
            && item.legacyDistinctColours > 1
            && item.legacyAlpha);
        const ok = framesOk && negativeControl.mismatches > 0;
        publish({ status: 'done', ok, worlds, negativeControl, reginaPixelsMs });
    } catch (err) {
        publish({
            status: 'error',
            ok: false,
            message: err instanceof Error ? err.message : String(err),
            worlds: [],
        });
    }
}

publish(report.value);
</script>

<template>
  <main class="parity">
    <h1>Surface parity</h1>
    <p v-if="report.status === 'running'">Rendering the diamond sheet against the legacy renderer.</p>
    <p v-else-if="report.status === 'error'">{{ report.message }}</p>
    <p v-else>{{ report.ok ? 'Match' : 'Mismatch' }}</p>
    <p v-if="report.reginaPixelsMs !== undefined">Regina pixels {{ report.reginaPixelsMs }} ms.</p>
    <section v-for="world in report.worlds" :key="world.id">
      <h2>{{ world.id }}</h2>
      <p>{{ world.mismatches }} mismatched bytes. Max channel error {{ world.maxChannelError }}. Mean channel error {{ world.meanChannelError }}. Legacy colours {{ world.legacyDistinctColours }}. Alpha {{ world.legacyAlpha }}.</p>
      <img :src="world.differenceImage" :alt="world.id + ' difference'" width="800" height="400" />
    </section>
    <section v-if="report.negativeControl">
      <h2>Negative control</h2>
      <p>{{ report.negativeControl.mismatches }} mismatched bytes. Max channel error {{ report.negativeControl.maxChannelError }}. Mean channel error {{ report.negativeControl.meanChannelError }}.</p>
      <img :src="report.negativeControl.differenceImage" alt="Negative control difference" width="800" height="400" />
    </section>
    <div class="realms">
      <iframe ref="legacyFrame" title="Legacy surface realm" :src="REALM" @load="run"></iframe>
    </div>
  </main>
</template>

<style scoped>
.parity {
  color: var(--text-1);
  background: var(--bg-0);
  padding: 1rem;
}
.parity h1,
.parity h2,
.parity p {
  font: 1rem/1.4 var(--font-ui, sans-serif);
}
.realms {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.realms iframe {
  width: 800px;
  height: 400px;
}
</style>
