# Corpus replacement

The supplied `corpus.json` is the rewritten 1,178-row `ChatterFile` pool.

**Install:** replace the file resolved by `lines.ts` at `./lines/corpus.json`; if you already copied this exact version, do not duplicate it. Never overwrite `sample.json`.

**Safety filter for ambient chatter:** Allow curated `control`, `customs`, `market`, `weather`, and appropriate `ship` rows only. Do not allow `rumour`, `distress`, `news`, `advert` in the standard ticker. In-jump/internal ship lines are not external system radio. Also review each otherwise-allowed message for impossible situation claims and placeholder resolution.

This is intentionally a singleton pool. `engine/chatterProcedural.ts` generates full exchanges. A single mixer should combine both sources without interleaving lines inside an event.
