<script setup lang="ts">
import { createCanvas, now, observeLongTasks, publishAutomationResult } from '../../platform/browser.ts';
import { disposeSurfaces, requestMap } from '../../surface/service.ts';
import { drawMapOverlay } from '../../surface/vanilla/map.ts';

const RESULT_KEY = '__surfaceSheet';

type SheetReport = {
    status: 'running' | 'done' | 'error';
    ok: boolean;
    message?: string;
    workerStartMs: number | null;
    sheetMs: number | null;
    longestTaskMs: number;
    overlayMs: number | null;
    fromCache: boolean;
    width: number;
    height: number;
    chunkTasks: number;
};

const flags = {
    seasonalIce: false,
    paletteVariants: false,
    movingClouds: false,
    lightning: false,
};

publishAutomationResult(RESULT_KEY, {
    status: 'running',
    ok: false,
    workerStartMs: null,
    sheetMs: null,
    longestTaskMs: 0,
    overlayMs: null,
    fromCache: false,
    width: 0,
    height: 0,
    chunkTasks: 0,
} satisfies SheetReport);

async function run(): Promise<void> {
    disposeSurfaces();
    let longestTaskMs = 0;
    const stop = observeLongTasks((duration) => {
        if (duration > longestTaskMs) longestTaskMs = duration;
    });
    try {
        const ticket = requestMap({
            mode: 'vanilla',
            hexKey: 'Spinward_Marches/1910',
            dossierKey: 'w0',
            body: {
                type: 'Planet',
                name: 'Regina',
                uwp: 'A788899-C',
                size: 7,
                atmCode: 8,
                hydroCode: 8,
                tempBand: 'Temperate',
                meanTempK: 0,
            },
            resolution: { width: 800, height: 400 },
            options: { continentalDefinition: 0.55, coastlineComplexity: 0.45, flags },
        });
        const sheet = await ticket.done;
        if (!sheet) throw new Error('Regina produced no sheet.');
        const canvas = createCanvas(sheet.width, sheet.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2d context is missing.');
        ctx.putImageData(new ImageData(sheet.pixels as Uint8ClampedArray<ArrayBuffer>, sheet.width, sheet.height), 0, 0);
        const overlayStarted = now();
        drawMapOverlay(ctx, { size: 7, atmosphere: 8, hydrographics: 8, temperature: 'Temperate', temperatureK: 0 });
        const overlayMs = now() - overlayStarted;
        stop();
        publishAutomationResult(RESULT_KEY, {
            status: 'done',
            ok: sheet.fromCache === false && sheet.width === 800 && sheet.height === 400,
            workerStartMs: sheet.workerStartMs,
            sheetMs: sheet.sheetMs,
            longestTaskMs,
            overlayMs,
            fromCache: sheet.fromCache,
            width: sheet.width,
            height: sheet.height,
            chunkTasks: sheet.chunkTasks,
        } satisfies SheetReport);
    } catch (err) {
        stop();
        publishAutomationResult(RESULT_KEY, {
            status: 'error',
            ok: false,
            message: err instanceof Error ? err.message : String(err),
            workerStartMs: null,
            sheetMs: null,
            longestTaskMs,
            overlayMs: null,
            fromCache: false,
            width: 0,
            height: 0,
            chunkTasks: 0,
        } satisfies SheetReport);
    }
}

void run();
</script>

<template>
  <main class="sheet">
    <h1>Surface sheet</h1>
    <p>Regina cold paint.</p>
  </main>
</template>

<style scoped>
.sheet {
  color: var(--text-1);
  background: var(--bg-0);
  padding: 1rem;
}
.sheet h1,
.sheet p {
  font: 1rem/1.4 var(--font-ui, sans-serif);
}
</style>
