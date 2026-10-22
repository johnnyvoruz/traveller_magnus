/**
 * The shipped chatter lines. The draft in findings/ stays where it is.
 */
import { ChatterFile, type ChatterLineData } from '@voyage/shared';
import corpus from './lines/corpus.json' with { type: 'json' };
import sample from './lines/sample.json' with { type: 'json' };

export function sampleLines(): ChatterLineData[] {
    return ChatterFile.parse(sample).lines;
}

/** The thousand-line pool. Kept apart from the sample so the sample stays a fixed set. */
export function corpusLines(): ChatterLineData[] {
    return ChatterFile.parse(corpus).lines;
}
