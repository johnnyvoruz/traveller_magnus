/**
 * The Player Pack download: a safe file name and the HTML. The journal button
 * is the only caller. Nothing here writes the campaign.
 */
import { renderPack } from './html.ts';
import type { PackPaint } from './paint.ts';
import { planPack, type PackInput, type PackPlan } from './plan.ts';

export type PackFile = {
    plan: PackPlan;
    html: string;
    fileName: string;
    bytes: number;
};

function safePart(value: string): string {
    const clean = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '');
    return clean || 'Campaign';
}

/** `<campaign name> - Player Pack - <clock day or no date>.html` */
export function packFileName(name: string, clockLabel: string): string {
    return safePart(name) + ' - Player Pack - ' + safePart(clockLabel) + '.html';
}

export function buildPlayerPack(input: PackInput, paint: PackPaint): PackFile {
    const plan = planPack(input);
    const html = renderPack(plan, paint);
    return {
        plan,
        html,
        fileName: packFileName(plan.name, plan.clockLabel),
        bytes: new TextEncoder().encode(html).length,
    };
}
