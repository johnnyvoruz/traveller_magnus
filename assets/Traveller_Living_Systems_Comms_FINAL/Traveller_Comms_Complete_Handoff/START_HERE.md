# Traveller Living Systems Comms — Final implementation handoff

**This is the final, approved handoff.** The vertical **BARS** waveform is locked in; there is **no skip/next transmission control** and no waveform-style selector. Integrate the standalone receiver with the real Vue ticker scheduler; do not copy the preview's demo loop into production.

## Orchestrator: do this in order

1. Read `IMPLEMENTATION_BRIEF.md` **all the way through**. It is the sole authoritative implementation specification.
2. Locate the existing repo's ticker/composable, `@voyage/shared` ChatterLine schema, real `SystemFacts` source, campaign settings, visit transitions, and tests. The `reference/` files are snapshots to help navigate, NOT files to blindly overwrite.
3. `content/corpus.json` is the rewritten **1,178-line** corpus. The user may already have copied it. Confirm `lines.ts` resolves `./lines/corpus.json`, replace that file if needed, and do **not** concatenate it with the previous corpus or overwrite `sample.json`.
4. Port `engine/chatterProcedural.ts` (a standalone **prototype**, not an integrated scheduler) beside the actual `facts.ts`, then build a curated corpus adapter, event mixer, one-event-at-a-time playback controller, persistence, UWP gating, and arrival beacon.
5. Port `receiver/comms-receiver.html`, `.css`, and `.js` to the existing Vue UI. Preserve the approved lower-right design and motion. Do **not** use `runDemo()` or expose demo controls in the app.
6. Keep the original Beowulf transmission as an extremely rare one-time **archival recording**, outside the normal chatter pool; preserve its exact user-supplied text and four-fragment sequence. The preview has an explicit test trigger; the product must not.
7. Run the acceptance tests in `IMPLEMENTATION_BRIEF.md`, fix issues, and report changed paths, build/test commands, findings, and any remaining gaps. **Complete the integration; do not stop after planning.**

## Package map

- `IMPLEMENTATION_BRIEF.md` — exact implementation contract, editorial guardrails, architecture, sequencing, tests
- `receiver/` — approved final bars-only UI source, reusable renderer, demo-only preview and Susadi backdrop
- `Traveller_Comms_Final_Live_Preview.html` — self-contained visual preview you can open directly
- `engine/chatterProcedural.ts` — approximately 60 authored procedural conversation templates and arrival beacon, to integrate/adapt
- `content/corpus.json` — rewritten authored singletons, including disallowed-by-default categories requiring filtering
- `reference/{facts,chatter,lines,quiet,words}.ts` — user's current module snapshots; use to orient repo inspection
- `reference/scenario-preview.txt` — previously generated illustrative transcript samples
- `qa/test_receiver_final.py` — browser test of the final visual prototype (not a substitute for repo integration tests)

## Motion/design decision (final)

A compact glass instrument at the **lower-right of the system viewport**, above the planet navigation tabs. Cut-corner teal frame, amber local-comms antenna, fixed CH/channel/SRC/callsign/SIG row. Short one-at-a-time transmissions are revealed word by word, then the transcript fades gracefully. The vertical **bars** waveform simulates speech energy with spatially smooth noise, returns to low animated carrier hiss after the final word, and the playhead stays continuously smooth. Radio tower waves expand **independently of speech**. SIG indicators, mast lamp, and header brightness remain steady. No targeting line to a planet, no circular radar ornament, no skip button, no alternative waveform toggle.
