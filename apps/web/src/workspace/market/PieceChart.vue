<script setup lang="ts">
/**
 * The chart piece on a package's page (streams/D.md D4): the package's hexes drawn by the map's own
 * renderer (map/MapRenderer.ts), at a zoom where it writes the worlds' names, in a box the size of
 * what it holds. Nothing else is on it: only the piece's rows, at the places the map gives them
 * (piece_chart.ts). Still: no pan or zoom. A piece too spread out to fit at the zoom where the map
 * writes names keeps its dots and lists its systems under them. A manifest whose hexes carry no rows
 * emits `empty`, and the page keeps its outline.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { MapRenderer } from '../../map/MapRenderer.ts';
import { readTheme } from '../../map/theme.ts';
import { PPP_GRID, PPP_NAMES } from '../../map/tiers.ts';
import { TruthClient } from '../../map/truth_client.ts';
import { cancelFrame, devicePixelRatio, nextFrame, observeSize, pageOrigin } from '../../platform/browser.ts';
import { pieceFrom, pieceIndex, pieceManifest, pieceView, type Piece } from './piece_chart.ts';

const props = defineProps<{ packageId: string; version: number; truthVersion: string | null; cdn: string; title: string }>();
const emit = defineEmits<{ empty: [] }>();

/** The zoom the piece is drawn at: past the map's names threshold (63.75), so every name is written. */
const PPP = 84;
const MAX_HEIGHT = 480;
const MARGIN = 14;

const box = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const piece = ref<Piece | null>(null);
const size = ref<{ width: number; height: number } | null>(null);
/** The drawing is at a zoom where the map writes names; when not, the systems are listed under it. */
const namesDrawn = ref(true);
let renderer: MapRenderer | null = null;
let frame = 0;
let stopSize: (() => void) | null = null;

const names = computed(() => {
    const list: string[] = [];
    if (piece.value) for (const rows of piece.value.rows.values()) for (const row of Object.values(rows)) if (row.name) list.push(row.name);
    return list;
});
/** The piece's systems in hex order, for the list under a drawing too spread out for names. */
const systems = computed(() => {
    const out: { key: string; hex: string; name: string; uwp: string }[] = [];
    if (piece.value) for (const [slug, rows] of piece.value.rows) for (const [hex, row] of Object.entries(rows)) out.push({ key: slug + '/' + hex, hex, name: row.name, uwp: row.uwp });
    return out.sort((a, b) => a.key.localeCompare(b.key));
});
const label = computed(() => props.title + ' on the map' + (names.value.length ? ': ' + names.value.slice(0, 12).join(', ') + (names.value.length > 12 ? ', and ' + (names.value.length - 12) + ' more' : '') : ''));

async function read(): Promise<Piece | null> {
    const base = props.cdn.replace(/\/$/, '');
    let manifest: unknown;
    try {
        const res = await fetch(base + '/packages/' + encodeURIComponent(props.packageId) + '/' + props.version + '/manifest.json');
        if (!res.ok) return null;
        manifest = await res.json();
    } catch {
        return null;
    }
    const slots = new Map<string, { x: number; y: number; name: string }>();
    const keys = manifest && typeof manifest === 'object' && (manifest as { hexes?: unknown }).hexes ? Object.keys((manifest as { hexes: object }).hexes) : [];
    if (props.truthVersion && keys.some((key) => !key.startsWith('~'))) {
        try {
            const chart = await new TruthClient({ cdnBase: base, apiBase: pageOrigin(), fetch }).manifest(props.truthVersion);
            for (const sector of chart.sectors) slots.set(sector.slug, { x: sector.x, y: sector.y, name: sector.name });
        } catch {
            // The chart could not be read: its sectors are left out, the own ones still drawn.
        }
    }
    return pieceFrom(manifest, (slug) => slots.get(slug) ?? null);
}

function draw(): void {
    const el = canvas.value;
    const holder = box.value;
    const p = piece.value;
    if (!el || !holder || !p || !p.box) return;
    const view = pieceView(p.box, PPP, PPP_GRID, Math.max(120, holder.clientWidth), MAX_HEIGHT, MARGIN);
    size.value = { width: view.width, height: view.height };
    namesDrawn.value = view.cam.ppp >= PPP_NAMES;
    if (!renderer) {
        renderer = new MapRenderer(el, readTheme(el));
        const truth = props.truthVersion ?? '';
        renderer.setChart(pieceManifest(p, truth), { truthVersion: truth, sectors: [] }, 'all');
        renderer.setIndexSource((slug) => pieceIndex(p, slug, truth));
    }
    renderer.resize(view.width, view.height, devicePixelRatio());
    if (frame) cancelFrame(frame);
    let left = 120;
    const paint = () => {
        frame = 0;
        if (!renderer) return;
        const drawn = renderer.draw(view.cam);
        left -= 1;
        // Names wait on the fonts; the renderer says when it still has work, as on the map.
        if (drawn.animating && left > 0) frame = nextFrame(paint);
    };
    frame = nextFrame(paint);
}

onMounted(async () => {
    const got = await read();
    if (!got || !got.count) {
        emit('empty');
        return;
    }
    piece.value = got;
    if (box.value) stopSize = observeSize(box.value, draw);
    draw();
});

onBeforeUnmount(() => {
    if (frame) cancelFrame(frame);
    if (stopSize) stopSize();
    renderer = null;
});
</script>

<template>
  <div class="mk-piece-wrap">
    <div ref="box" class="mk-piece" :aria-busy="piece ? undefined : 'true'">
      <canvas
        ref="canvas"
        class="mk-piece-canvas"
        role="img"
        :aria-label="label"
        :style="size ? { width: size.width + 'px', height: size.height + 'px' } : undefined"
      ></canvas>
    </div>
    <ul v-if="piece && !namesDrawn" class="mk-piece-list" aria-label="Systems">
      <li v-for="system in systems" :key="system.key"><code>{{ system.hex }}</code> <b>{{ system.name }}</b> <code>{{ system.uwp }}</code></li>
    </ul>
  </div>
</template>

<style>
/* As wide as its column, as tall as the piece: the canvas is the piece's own size, centred. */
.mk-piece {
  display: flex;
  justify-content: center;
  min-height: 120px;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-0);
}

.mk-piece-canvas {
  display: block;
  max-width: 100%;
}

/* Under a drawing too spread out for names: hex, name and UWP, as the map writes them. */
.mk-piece-list {
  display: grid;
  gap: 2px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  color: var(--text-1);
  font: 400 13px/1.5 var(--font-text);
}

.mk-piece-list code {
  color: var(--text-muted);
  font: 400 12px/1.5 var(--font-data);
}

.mk-piece-list b {
  color: var(--text-0);
  font-weight: 600;
}
</style>
