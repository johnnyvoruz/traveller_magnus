# Living Systems Comms: the receiver, the event engine, the scheduler (Lanes Z and C)

Issued 2026-10-17 23:50 by the orchestrator from Johnny's word (below) and the package he supplied:
`assets/Traveller_Living_Systems_Comms_FINAL/Traveller_Comms_Complete_Handoff/`.

Johnny, 23:45: "Implement the complete Traveller Living Systems Comms feature using the attached
`Traveller_Comms_Complete_Handoff` package. Read `START_HERE.md` first, then `IMPLEMENTATION_BRIEF.md` in full. These
are the authoritative instructions and supersede all earlier prototypes. The visual design is approved and locked. Use
the supplied **bars-only** receiver, preserve its animations, and do not reintroduce a skip button or waveform
selector. Integrate the 1,178-line corpus, procedural conversation generator, UWP-based traffic behavior, arrival
beacons, persistent repetition prevention, multi-turn scheduling, and Beowulf Easter egg into the existing
application. Inspect the real repository and follow its architecture. The supplied source modules are references, not
files to blindly overwrite. Complete the implementation, run the required tests, and report the actual code changes
and results. Do not stop at planning or redesign the approved UI."

**Both lanes read `START_HERE.md` and `IMPLEMENTATION_BRIEF.md` in full before anything else.** The brief is the
product contract; this file only splits the work, names the repo's real paths, and lists what the brief supersedes.

## What it supersedes (decisions.md 23:50)
- The 20:27 answers 43 (ticker strip at the orbit view's lower left and under the dossier header) and 45 (all nine
  categories in the ticker): the receiver sits at the **lower right of the system view, above the planet tabs**, one
  transmission at a time, and **`rumour`, `distress`, `news`, `advert` are off by default** (positive allowlist:
  `control`, `customs`, `market`, `weather`, vetted `ship`, gated by UWP).
- Answer 47 (E writes the 1,000 lines): the supplied **1,178-row `content/corpus.json` replaces**
  `apps/web/src/living/lines/corpus.json` whole (no concatenation; `sample.json` untouched).
- C's queued LS4 (the ticker) is withdrawn; this is it. C's LS5 (background ships) is unchanged and separate.
- Still standing: the switches (`living` in campaign settings, D's LS3), "Quiet on this device", the seed rules,
  "no line restates a rule", the AI-chatter hook later (LS7), nothing stored on the server.

## The repo's real paths (checked 23:50)
`apps/web/src/living/`: `facts.ts` (A's `systemFacts`), `chatter.ts` (`eligible`, `sequenceFor`, `nextLine`,
`clearSequence`), `lines.ts` (`corpusLines`, `sampleLines`), `quiet.ts` (`livingShown`), `words.ts` (E's words),
`lines/corpus.json`, `lines/sample.json`; `packages/shared/src/schemas/chatter.ts` (`ChatterFile`, `ChatterLine`);
`packages/shared/src/seed.ts` (`hashString`, `mulberry32`); the orbit view `views/OrbitView.vue` and its planet tabs
(`orbit/BodyChips.vue`); browser access only through `apps/web/src/platform/browser.ts` (timers, `matchMedia`,
storage, visibility: the manifesto's no-globals rule; the prototype's `window.*` calls and its global constructor must
go through it); colours only as tokens in `design/tokens.css` (the receiver CSS has 22 hex colours: each becomes a
token or an existing one; `npm run check` fails otherwise).

## Lane Z: ZC1, the engine, the corpus adapter, the mixer, the scheduler, Beowulf, the audit
Files (new unless named): `living/comms/events.ts` (port of `engine/chatterProcedural.ts`, importing the real
`facts.ts`; `RadioTurn`, `RadioEvent`), `living/comms/corpus_events.ts` (the reviewed allowlist adapter over
`corpusLines()` and `eligible()`, re-checking `party`), `living/comms/mixer.ts`, `living/comms/controller.ts` (the one
timer authority: the state machine of brief §5C, cancellation tokens, tab-hidden pause, per-system history persisted on
the device through `platform/browser.ts` storage, wrapped in try/catch), `living/comms/beowulf.ts` (§5D: verbatim text
and four fragments from the receiver JS's `TravellerCommsEasterEgg`, 1/2048 per `(campaignKey, hexKey)`, played-once
flag, no button), `living/comms/roster.ts` (stable callsigns by `(hexKey, truthVersion)`). Replace
`living/lines/corpus.json` with the package's file. Tests with fake timers for every §7 item that is logic:
determinism, ordering, no cut-off speech, cancellation on route/quiet/jump/unmount/truth change, no repeats on revisit,
no starvation, gating (no jump/away chatter, no X tower, no E formal ATC, no highport ops when `highport` is null, no
vacuum weather), the four categories never leak, the beacon once per real arrival, Beowulf rarity and once-only.
**The controller talks to the screen only through an interface you define first and write at the top of your entry**:
`{ transmit({ ch, type, from, text }), idle({ keepLast? }), onTranscriptComplete(callback), destroy() }` (as the
brief's §2), so C can build against it in parallel. The content audit (§6 step 6, §7: six contrasting worlds, 30-minute
transcripts, ~100 events reviewed) goes in `findings/living_systems/comms_audit.md`. Claim `living/*` files per item
(A wrote them; A is on the players work and not in them).

## Lane C: CC1, the receiver in Vue, mounted, wired
Files: `living/CommsReceiver.vue` (a thin lifecycle-safe wrapper around the ported renderer, or a Vue port; the bars
waveform, the antenna arcs, the word reveal, the fades, the stable metadata columns exactly as `receiver/` has them;
SVG gradient ids unique per instance), `living/comms/receiver_render.ts` (the renderer as an ES module, no globals,
through `platform/browser.ts`), the CSS (tokens only), one mount line in `views/OrbitView.vue` at the lower right above
the planet tabs, `tests/web/comms_receiver.test.js`. **Never** the preview's demo loop, test inputs, Beowulf button, skip
or waveform toggle. Start now on the receiver against the interface in this file; wire it to Z's controller when ZC1's
entry gives the interface (it must match). Reduced motion, contrast, the screen-reader rule (announce completed
transmissions only, politely; nothing per word). Screenshots of the real orbit view at 1600 and 390, with and without a
GPU, idle and mid-transmission, against `qa/final-receiver-on-susadi.png`.

## Done
Both entries list changed paths, the commands and results (`npm test`, `npm run check`, `npm run typecheck`,
`npm run build`, the new tests), the §7 checklist with pass/fail per item, sample transcripts (Z), shots (C), and
anything deferred. That evidence is **for the orchestrator** (to review and to fix from later), not a report for Johnny (Johnny, 2026-10-18: "would really be just for you in case we need to fix anything, I'm not using that other agent moving forward"); the package's §8 "report back to the author" does not apply. Johnny gets a short summary in the orchestrator's reply.
