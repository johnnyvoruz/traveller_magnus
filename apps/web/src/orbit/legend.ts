/**
 * The orbit picture's legend: what the coloured marks on the picture mean, said once at the
 * stage's edge instead of written across the picture. The legacy view wrote "HABITABLE ZONE"
 * on the band itself (js/system_viewer.js:3390-3412), where it sat over the worlds; Johnny
 * asked for it to move here (2026-10-04). An entry is listed only while its mark is on the
 * picture, so the legend follows the layer switches and the layout. Pure.
 */
import type { Plan } from './layout.ts';
import type { Layers, Picture } from './picture.ts';

export type LegendKind = 'band' | 'panel' | 'jump' | 'mainworld';

export type LegendEntry = {
    /** Which swatch to draw: the habitable band, a line-up's habitable panel, the jump circle, the mainworld star. */
    kind: LegendKind;
    label: string;
};

export const LEGEND_BAND = 'Habitable zone';
export const LEGEND_BANDS = 'Habitable zones';
export const LEGEND_PANEL = 'In the habitable zone';
export const LEGEND_JUMP = '100D jump limit';
export const LEGEND_MAINWORLD = 'Mainworld';

/** True when the plan holds a mainworld the picture can mark: a world, a belt or a moon. */
function hasMainworld(plan: Plan): boolean {
    return plan.worlds.some((w) => w.mainworld || w.mainworldBelt || w.moons.some((m) => m.mainworld));
}

/** The entries for one picture, in the order they are listed. */
export function legendFor(plan: Plan | null, picture: Picture | null, layers: Layers): LegendEntry[] {
    if (!plan || !picture) return [];
    let bands = 0;
    let bandAlpha = 0;
    let panelAlpha = 0;
    let jump = false;
    for (const layer of picture.layers) {
        for (const band of layer.bands) {
            if (!(band.alpha > 0)) continue;
            bands += 1;
            bandAlpha = Math.max(bandAlpha, band.alpha);
        }
        for (const panel of layer.panels) panelAlpha = Math.max(panelAlpha, panel.alpha > 0 ? panel.alpha : 0);
        if (!jump) jump = layer.jumps.some((ring) => ring.alpha > 0);
    }
    const entries: LegendEntry[] = [];
    // While one layout travels to the other both marks are on the picture; the stronger one is named.
    if (bandAlpha > 0 && bandAlpha >= panelAlpha) entries.push({ kind: 'band', label: bands > 1 ? LEGEND_BANDS : LEGEND_BAND });
    else if (panelAlpha > 0) entries.push({ kind: 'panel', label: LEGEND_PANEL });
    if (jump) entries.push({ kind: 'jump', label: LEGEND_JUMP });
    if (layers.markMainworld && hasMainworld(plan)) entries.push({ kind: 'mainworld', label: LEGEND_MAINWORLD });
    return entries;
}

/** A string that changes only when the listed entries do, so the view can skip a frame's update. */
export function legendSignature(entries: LegendEntry[]): string {
    return entries.map((entry) => entry.kind + ':' + entry.label).join('|');
}
