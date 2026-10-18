/**
 * The mixer (ZC1; brief 2). Chooses between a procedural scene and a vetted corpus
 * line, deterministically by (hexKey, truthVersion, day, eventIndex). Procedural
 * scenes carry the radio; corpus lines are the colour. When one source has
 * nothing unheard, the other plays; when neither has, the result is null and the
 * controller keeps dead air.
 */
import type { ChatterLineData } from '@voyage/shared';
import type { SystemFacts } from '../facts.ts';
import { nextCorpusEvent } from './corpus_events.ts';
import { nextProceduralEvent, type ProceduralContext, type RadioEvent } from './events.ts';
import { seeded } from './roster.ts';

/** Share of events drawn from the procedural scenes when both sources have one. */
export const PROCEDURAL_SHARE = 0.6;

export function mixEvent(f: SystemFacts, ctx: ProceduralContext, pool: readonly ChatterLineData[]): RadioEvent | null {
    const r = seeded(`${f.hexKey}|${ctx.truthVersion}|${ctx.day}|${ctx.eventIndex}|mix`);
    const procFirst = r() < PROCEDURAL_SHARE;
    const proc = () => nextProceduralEvent(f, ctx);
    const line = () => nextCorpusEvent(pool, f, ctx);
    return procFirst ? proc() ?? line() : line() ?? proc();
}