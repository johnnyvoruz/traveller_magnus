# Traveller Living Systems: Procedural Radio Chatter — Final Orchestrator Assignment

> **Authority:** This document supersedes the older V2 handoff and earlier V3.x UI prototypes. Follow the *actual repository* for code paths and existing domain models. Follow this handoff for product behavior and the locked-in visual design. Implement and test, don't deliver another plan.

## 1. Desired experience

Build system-local **mundane operational chatter** for a Traveller TTRPG system viewer. It should feel like overhearing a busy starport, or a nearly empty remote field, depending on the system's UWP and established world data. It's a background **ticker/receiver**, not a chat application, mission generator, cinematic cutscene, dynamic quest source, or a news feed.

The approved receiver appears **bottom-right of the orbit/system map above the planet tabs**, small enough not to obscure the orbit view. It shows **exactly one transmitter and one current message at a time**. Successive messages from the same event are heard sequentially in the same region, with preserved callsigns, short gaps, then silence before the next event. The interface has no "next" or "skip" control and should never expose the preview's debug controls.

The tone: clipped, workmanlike, specific, sometimes imperfect professional communication. Docking vectors, transponder checks, radio checks, cargo weight, customs manifests, fuel availability, service-shift handovers, arrival advisories, appropriate local security traffic, mundane intrasystem transit. A joke may occur naturally. No explanatory narration, lore exposition, invented jeopardy, foreshadowing, sensational incidents, or generic AI copy.

## 2. Available files and verified contracts

**Source snapshots** under `reference/`:

- `facts.ts`: `SystemFacts` includes `hexKey,name,sector,subsector,starport,size,atm,hydro,pop,gov,law,tl,tradeCodes,zone,bases,highport,gasGiants,belts,moons,otherBodies,xboat,party,day,bodies`. `party` is `'inSystem' | 'docked' | 'inJump' | 'away'`. `highport` can be `null`.
- `chatter.ts`: `eligible()`, `sequenceFor()`, `nextLine()`, `clearSequence()` select single existing corpus records. **They do NOT manage event conversations or asynchronous playback.** `clearSequence()` resets per-visit cursor, which makes revisits repeat content; do not simply call it for the new scheduler.
- `lines.ts`: `corpusLines()` uses `ChatterFile.parse(corpus).lines` and imports `./lines/corpus.json`. `sampleLines()` must remain unaffected.
- `quiet.ts`: campaign's `living` flags and device `quiet`; keep `livingShown()` semantics. Preserve the independent *traffic* toggle.
- `words.ts`: UI text for existing settings.

**New content:** `content/corpus.json` is the 1,178-row rewritten ChatterFile-compatible singleton pool. There are `control`, `customs`, `market`, `weather`, `ship`, `news`, `advert`, `rumour`, and `distress` categories; only a *reviewed positive allowlist* belongs on the default ticker. It includes some `inJump` ship entries that are NOT external radio traffic.

**Procedural prototype:** `engine/chatterProcedural.ts` imports `SystemFacts` from `./facts.ts` and exports `RadioTurn`, `RadioEvent`, `ChatterContext`, `welcomeFor()`, `nextProceduralEvent()`, `suggestedGapSeconds()`, and `scenarioCount()`. It has around 60 authored routine scenarios. **This is content-generation source, not a complete orchestrator, not a built component, and not a replacement for the ChatterFile schema.** Integrate and improve it against the real repository. It was written to sit beside `facts.ts`; fix its import when porting.

**Approved visual source:** `receiver/comms-receiver.html`, `receiver/comms-receiver.css`, `receiver/comms-receiver.js`. This is a tested *standalone DOM renderer*, with API:

```js
const receiver = new TravellerCommsReceiver(rootElement, {
  onTranscriptComplete: () => { /* current turn's last word has completed */ }
});
receiver.transmit({
  ch: 'CH 03', type: 'LOCAL TRAFFIC', from: 'SUSADI PORT CONTROL',
  text: 'Kestrel, hold your approach vector.'
});
receiver.idle({ keepLast: true });  // message remains readable; speech energy settles
receiver.idle();                   // softly dissolve text into 'Awaiting transmission'
receiver.destroy();                // unmount and cancel timers / RAF
```

`receiver` is a browser-global constructor in the prototype. For the Vue app, implement a component/composable or an equivalent lifecycle-safe adapter. The renderer owns the **word reveal and micro-animation only**. Your event scheduler owns **which transmission and when**. `onTranscriptComplete` is the reliable completion signal; never cut off a sentence using an unrelated fixed timer. Use actual repo paths and conventions; don't assume the five snapshots include the full app.

## 3. Locked visual/motion contract — DO NOT regress

- **Bars-only waveform** (middle style of the provided reference). No fine-line mode, stacked wave layers, or style-toggle API; no fake audio file needed. `draw()` uses smooth seeded 2D field and procedural per-word energy, not per-frame `Math.random()`.
- **Idle state is alive:** almost-flat low-level animated carrier hiss. The waveform never disappears or hard switches to a different renderer. After the final word completes, speech energy eases back down while the completed message remains visible briefly.
- **Only waveform follows speech energy.** Do *not* pulse/recolor/brighten the surrounding card, SIG bars, mast, or indicator light in time with words. SIG bars are a stable received-strength readout, *not* a VU meter.
- **Antenna:** three restrained expanding amber SVG arc pairs, a perpetual loop during reception AND silence, **fully independent of speech**; antenna mast and center light steady. Reduced-motion disables animated arcs.
- **Graceful text motion:** words resolve one by one with subtle blur/translate; the completed message fades away (existing ~440ms swap) instead of being removed suddenly. Metadata crossfades while CH, channel, SRC, callsign and SIG occupy stable columns. Source name ellipsizes if long; SIG remains pinned right.
- **Playhead:** continuous unobtrusive motion, smooth wrapping hidden by fading at either edge; no jumping on new messages, idle transitions, or speaking events.
- **Position:** small panel at lower right, above nav pills; no target wire to a planet; no circular radar decoration.
- **No skip/next transmission button**, either inside the receiver or in the released ticker; no production test triggers, Beowulf button, “line/bars” toggle, or demo background scene.
- Responsive layout, contrast, legible natural sentence case, `prefers-reduced-motion`, readable accessible text. Avoid screen-reader chatter flood; follow app conventions and allow quiet switch to win.

## 4. Editorial/lore correctness

1. Default traffic is *routine*. It is acceptable to hear informal, terse exchanges, but not rumours, distress, missing persons, criminal hooks, enigmatic signals, mysterious cargo, conspiracies, dramatic warnings, or adventure pitches. Keep the world alive, not the plot active.
2. **Block `rumour`, `distress`, `news`, `advert` by default.** The rewritten corpus contains 135 rumour, 42 distress, 182 news and 124 advert rows. Start with a reviewed positive allowlist of `control`, `customs`, `market`, `weather`, and vetted `ship` lines, gated by UWP. Review for inappropriate implications rather than trusting category alone. Distress is *not* made “rare” by weighting; it is excluded altogether except for the dedicated archival Easter egg.
3. The default receiver must not display normal external radio chatter while party=`away` or `inJump`. Traveller jump travel precludes normal-space radio. External traffic is local to the visited system; large separation implies real light-speed delay, no instant conversations across several light-minutes. X-boat mail is carried physically, not FTL radio.
4. **Starports:** X means no functioning official port tower; E fields generally rely on self-announced traffic, not formal ATC. Use highport operations only when `highport === true` (not when `null`). Mainworld UWP doesn't establish every other body's conditions. Pop=0 doesn't automatically imply no ships passing through the hex but doesn't support populated port crews without verified facilities.
5. Weather must respect atmosphere/hydro/climate context (no rain or crosswind in vacuum). Law level affects **frequency/formality** of mundane checks, not invented local bans or explicit legal claims. High TL suggests institutional habits, not that every local transmitter or visiting ship shares one exact technology.
6. Don't invent the system's government name, allegiance, species, or language from UWP. If the app really provides a grounded alien/polity tag, you may choose that style; otherwise an occasional translated, slightly alien *visiting* caller is fine. Alien English should have believable operational intent, not become cryptic mystical poetry.
7. If part of a safety-critical navigation instruction is garbled, require an explicit repeat. Safest initial version applies garble only to low-consequence background banter or minor noncritical data.

## 5. Implement one event engine, mixer, scheduler, receiver

### A. Normalize *complete events*

Preserve the prototype's basic model, or adapt it to shared app types:

```ts
type RadioTurn = { speaker: string; text: string; quality?: 'clear'|'weak'|'broken' };
type RadioEvent = {
  id: string; family: string; channel: string;
  turns: RadioTurn[]; allowSignalNoise?: boolean;
};
```

Procedural `nextProceduralEvent(facts, context)` emits coherent 1–4-turn events; entire event and actors must be selected *before* any message displays. Persistent stable callsigns must be seeded by `(hexKey, truthVersion)`, with daily scenarios/parameters by `(hexKey, truthVersion, day, eventIndex)`. Do NOT reseed on every Vue render or on a clock animation frame.

A curated corpus line can become a **one-turn** event using `eligible()` plus `SystemFacts`, existing app placeholder resolver, and deterministic selection. Provide mapped values only when grounded; no `{ship}` or `{world}` must ever appear raw in the UI. Consider the same stable local roster for `{ship}` substitutions. The corpus adapter must recheck `party` and category eligibility: the source file also contains in-jump recordings.

Use one deterministic mixer for two content sources (start with something like ~60% procedural, 40% vetted singleton on busy ports, then tune against available pools). Pick family and eligibility before applying weights. Recent-ID cooldowns should include source + ID to avoid collisions. Don't concatenate raw array rows to fake variety.

### B. UWP governs audible activity, not just word choices

- Busy, high-pop A/B worlds: frequent approach, dock, freight, manifests, scheduled traffic, professional channel discipline.
- C airless: pressure seals, closed access, external handling, controlled approach, no ordinary outdoor wind chatter.
- D agricultural: local cargo, fields, hauliers, landing logistics, smaller workforce.
- E frontier: self-announced arrivals, ad hoc procedures, long silence; no well-staffed tower impersonation.
- X / pop 0: passing ship position calls if any, almost no traffic, no functioning official arrivals greeting.
- High law: more identity / manifest / credential confirmations, not invented blanket bans.
- Highport true: upper berths, lighter runs, docking collars/tugs; `null` is **unknown**.
- Gas giant / belt / moons / Xboat / bases: use only explicitly present assets. Don't infer a staffed station from a celestial body count.

A welcome/advisory beacon happens **once per actual in-system arrival** when the facts support it, not once per rerender or day change. The prototype `welcomeFor()` is a starting point only; don't declare an imaginary tower on an unknown world. Greeting can state world/port, local approach channel and mundane arrival protocol. No ads or lore exposition.

### C. Playback state machine (CRITICAL for ticker)

Single shared controller per active system ticker, **one timer authority**:

```
(no active event) -> arrival beacon if eligible -> choose complete RadioEvent
    -> turn[0] -> await receiver transcript completion -> readable dwell
    -> short between-turn wait -> turn[1] -> ... -> turn[N]
    -> receiver.idle({ keepLast: true }) -> quiet signal with fading intensity
    -> receiver.idle() -> longer inter-event dead air -> choose next event
```

- **One turn at a time.** No text stack, no history pane, no simulated chat bubbles. In a multi-turn exchange, preserve actors/channel and reserve the *whole* exchange until the last reply. A different corpus singleton must never interrupt it.
- Next turn scheduled after `onTranscriptComplete`, allowing a reasonable readable dwell (e.g. 1–3s), not fixed 6s from turn start. Let the text softly fade and metadata crossfade; no hard clear.
- Busy A/B high pop: start with roughly **15–45s silence between complete events**; ordinary: **40–115s**; quiet X/low pop: **125–360s**. Calibrate to real gameplay/UI timing. **Do not shorten idle merely to keep the ticker busy.** Intra-event reply gaps much shorter than inter-event gaps.
- Use `suggestedGapSeconds()` as a suggestion, not an authority. It is seeded to day+eventIndex. Keep eventIndex monotonic, store recent played content per system across revisits. Evict oldest when history is full; `nextProceduralEvent()` returns null if all available scenarios are in `avoidIds`, and the scheduler must not get stuck forever. Silence/fallback/expire oldest are acceptable.
- Maintain a stable per-system identity and avoid immediate repeated scenarios, lines and identical text across navigation away/back. No quick replay caused by `clearSequence()`.
- Cancel scheduled jobs, pending turns and receiver timers cleanly when route/system changes, `livingShown().chatter` becomes false, device quiet wins, party jumps/away, component unmounts, or truth version changes. When reentering system after a real visit, start a new arrival greeting only if appropriate. Leave other app background traffic feature unaffected.
- Avoid replay during reactive rerenders; timers are not coupled to visual 60fps renderer. If browser tab hidden, pause scheduled delivery/word reveal as appropriate, don't dump an accumulated backlog on return. Avoid duplicate timers from multiple Vue watchers.
- Channel labels and source names should be mapped from event's family/channel and current speaker; `ch`, `type`, `from`, `text` are the receiver's only required input. Cap utterances to a sensible length or split long messages at sentence boundaries **within the same event**; do not visibly crop safety info.

### D. Beowulf special-case (exception to ordinary chatter)

The original *Free Trader Beowulf* user-provided transmission lives in the receiver JS as `TravellerCommsEasterEgg`, with the preserved verbatim `quote` and 4 ordered `transmissions`. **Do not** allow it through the normal corpus `distress` filter. It is a **recorded archive relay**, not an active incident, current SOS, ship in-system, or quest. If included at all, keep it extraordinarily rare: prototype's deterministic 1/2048 per eligible system `(campaignKey, hexKey)`, inSystem/docked and A–E with a receiver; persist an `alreadyPlayed` campaign flag through session/revisit/device as appropriate to repo rules. Reserve all four segments as one uninterruptible event, finish them before anything else. Preserve the exact quote and punctuation. Do not duplicate in singleton corpus and don't expose a normal UI button. The *preview only* has a manual Beowulf trigger.

### E. Browser/UI integration

- Convert the renderer's standalone DOM/CSS into Vue idioms if appropriate. A thin wrapper around the tested renderer is also acceptable: render markup into Vue component, initialize in `onMounted`, hold ref, call `.transmit`, `.idle`, `.destroy` in appropriate lifecycle hooks. Import CSS locally and account for the SVG gradient IDs if multiple receivers could appear.
- Preserve visual positions and animations; do not replace it with a generic toast or full-width bottom banner. Responsive positions should avoid the existing lower nav and overlapping info overlays; screenshot the actual system map at common viewport sizes.
- **Never run `TravellerCommsDemo.runDemo()` in production**; demo controls (test input, Beowulf manual trigger, Resume, Monitor) live *only* in the standalone preview, not application UI. `receiver/preview.html` and the all-in-one preview are demos; not production mounting instructions.
- The user explicitly rejected skip/next. No such element exists in the final `comms-receiver.html`; do not reintroduce it by reusing earlier V3.x snapshots or old ticker actions. No waveform-style toggle: bars are final.
- If you need status/SIG values, do not animate their brightness with speech. Use metadata indicating stable receiver condition. The antenna wave CSS is independent and continuously loops during idle.
- Accessibility: only announce completed transmissions if appropriate; avoid re-announcing each word. Reduce motion gracefully while keeping message content instant and legible.

## 6. Suggested integration phases / agent workflow

1. **Inspect before editing:** identify `lines.ts` location, ticker/component, current cadence, route and party change hooks, `SystemFacts` provider, shared Zod `ChatterLineData`, app storage persistence, arrival logic, theme classes, test harness. Record exact paths. Compare existing corpus with supplied file and copy only if needed.
2. **Add typed event layer:** adapt engine code beside facts; add reviewed singleton adapter; define stable actor roster and placeholders, categories, UWP eligibility, source metadata. Preserve shared schemas and existing sample loader.
3. **Build scheduler:** deterministic event mixer, per-system cooldown/history, welcome once per actual arrival, multi-turn queue, completion-driven timing, cancellation tokens, gap after events. Ensure no multiple clocks or split ownership.
4. **Install final UI:** bars-only receiver with tower micro-animation and calm chrome, mounted in lower-right over system map above planet nav. Remove legacy ticker/skip control where it conflicts; preserve referee/quiet toggles.
5. **Wire Beowulf:** archival, gated, single campaign discovery, deterministic and persistent, not an active distress plot hook.
6. **Run a content audit:** sample lots of worlds; tighten logic that assumes things UWP doesn't establish. Spot-check the bad categories never leak. Verify natural jargon and variation.
7. **Test, fix, report:** type checks, unit tests, fake timer tests, interaction/browser responsive screenshots and build. Do not claim integration merely because demo renders.

## 7. Acceptance criteria & required evidence

- [ ] `content/corpus.json` (1,178 rows) is parsed by existing ChatterFile parser; `sample.json` unchanged; no duplicate corpus concatenation.
- [ ] Final ticker has exactly **one** visible transmitter and one current utterance. No skip button, waveform toggle, chat log or overlay linking to a planet.
- [ ] Only vertical bars are rendered; word-by-word text timing drives energy, idle keeps quiet animated hiss, after final word activity relaxes gradually, playhead wraps imperceptibly.
- [ ] Tower waves visibly expand independently in idle and during speech; no speech-linked brightness change to SIG, lamp, header, or mast; reduced-motion works.
- [ ] Long source names never cause metadata chips to shift; SIG is anchored right; panel stays over system view without obscuring nav/controls.
- [ ] One procedural event's turns maintain callsigns and channel and complete in order before an unrelated event; speech is never cut off by scheduler timeouts.
- [ ] Same `(hexKey,truthVersion,day,eventIndex)` reproduces the event (barring documented history filtering); resident callsigns stable across days and revisits.
- [ ] Recent content doesn't immediately repeat on revisit; stable bounded history; no event-source starvation after cooldown exhaustion.
- [ ] No normal chatter in jump or away, no X-port tower, no E-port formal ATC, no highport ops when `highport` unknown; no vacuum wind/weather; no fabricated FTL comms or local laws.
- [ ] `rumour`, `distress`, `news`, `advert` excluded from default; no unreviewed plot hooks even if category is otherwise allowed. Manual Beowulf demo must not ship as a normal button.
- [ ] Arrival beacons only on supported *arrival events* once per visit, not on every mount, rerender or navigation click.
- [ ] Device quiet and campaign chatter-off stop ticker and clear all pending events; independent traffic toggle continues to behave as before.
- [ ] At least 6 contrasting worlds (A busy/highport/high pop, C vacuum, D Ag, E frontier, X barren, high-law) yield clearly different 30-minute sample transcripts; add belt/gas giant/Xboat where grounded. Review at least ~100 events/lines for tonal quality and leaks.
- [ ] Rapid switch between worlds and pause/unmount produce zero stale callbacks, timers or inaccessible stale text; screen-reader behavior is acceptable.
- [ ] Tests/build run in the *actual repo*; report exact commands/results and any deferred work. If missing source/modules block integration, identify blocker precisely; do not claim production-complete.

## 8. Completion report format

Provide a concise implementation report including real file paths changed, use of corpus and procedural generator, event/ticker lifecycle, sample UWP-based transcripts, screenshots or links to test snapshots, build/test results (pass/fail and commands), and any unresolved integration concerns. Do **not** ask the user to solve repo structure problems without first inspecting repository sources.

**Success:** Crowded systems sound operationally busy; frontier systems sound sparse. Chatter feels human, local, and unscripted. The receiver is beautiful but never flickers or begs for attention. The player gets one transmission at a time, and everything fades rather than snapping.
