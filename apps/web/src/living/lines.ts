/**
 * The shipped chatter lines. The draft in findings/ stays where it is.
 */
import { ChatterFile, type ChatterLineData } from '@voyage/shared';
import corpus from './lines/corpus.json' with { type: 'json' };
import sample from './lines/sample.json' with { type: 'json' };
import { flavorLines } from './lines/flavor.ts';
import { broadcastLines } from './lines/broadcasts.ts';
import { reviseReceiverLine } from './lines/revisions.ts';
import { spaceLines } from './lines/space.ts';
import { imperialLines } from './lines/imperial.ts';
import { travellerLines } from './lines/traveller.ts';
import { nodLines } from './lines/nods.ts';
import { glitchedLines } from './lines/glitched.ts';

export function receiverLines(): ChatterLineData[] {
    return [...corpusLines().map(reviseReceiverLine), ...flavorLines, ...broadcastLines, ...spaceLines, ...imperialLines, ...travellerLines, ...nodLines, ...glitchedLines];
}

export function sampleLines(): ChatterLineData[] {
    return ChatterFile.parse(sample).lines;
}

/** The thousand-line pool. Kept apart from the sample so the sample stays a fixed set. */
export function corpusLines(): ChatterLineData[] {
    return ChatterFile.parse(corpus).lines;
}
