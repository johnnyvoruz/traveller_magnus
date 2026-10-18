# Traveller Comms: the emergency red theme (Lane C, CC3)

Issued 2026-10-18 11:17 by the orchestrator from Johnny's brief ("Note for traveller comms work", pasted 11:15),
which is below **unchanged** and is the contract. Read the orchestrator's notes first; they only name the repo's
real paths and the manifesto's rules.

## Orchestrator's notes
- **Added by Johnny 11:28: `mayday` in the address** triggers Beowulf 3 seconds after the receiver mounts; the rules are in C's CC3 item (`streams/C.md`).
- **When:** in 1.2.7 (Johnny 11:28: "I want comms working before the push"), right after CC2.
- **Files** (claim each; Z wrote the controller files and is not in them): `apps/web/src/living/comms/controller.ts`,
  `living/comms/beowulf.ts`, `living/comms/events.ts` (only if the event type needs the field),
  `living/comms/receiver_render.ts`, `living/CommsReceiver.vue`, `design/tokens.css`, tests.
- **Explicit metadata, never text:** give the event an optional `theme?: 'normal' | 'emergency'`; `beowulfEvent()`
  sets `'emergency'`. The controller is the one timer authority, so it switches the theme: add an optional
  `theme(mode)` to the `CommsScreen` interface (`controller.ts:30`), called **before the first fragment** of an event
  whose theme is emergency, kept through every fragment and pause, and set back to `'normal'` **after the last
  fragment's fade**, and on **every** cancel path the controller already has (route, quiet, System Comms off, jump,
  unmount, truth change, `destroy()`). The receiver sets `data-comms-theme` on its root.
- **The label:** the archive channel's `type` (`controller.ts:75`, "ARCHIVE RELAY") shows **EMERGENCY** while the
  theme is emergency; the rest of that row as it is.
- **Colours are tokens:** the three values in the brief become `--comms-emergency`, `--comms-emergency-hi`,
  `--comms-emergency-glow` in `design/tokens.css` (`npm run check` refuses a hex colour anywhere else). The receiver's
  accents read custom properties that `[data-comms-theme="emergency"]` re-points, with transitions on colour,
  border, background, fill, stroke and shadow (700 ms in, 900 ms out). If the bars are drawn in script, they read the
  current colour each frame (or interpolate) so they fade too.
- **Reduced motion:** with `prefers-reduced-motion` the theme changes without the long fade (as the receiver already
  treats its other motion), never a flash.
- **Tests:** with fake timers: the theme is emergency before Beowulf's first transmit, stays emergency across every
  fragment and pause, returns to normal after the last fade, and returns to normal on each cancel path; ordinary
  chatter never calls emergency; no code path matches Beowulf's text. Shots for the orchestrator: the receiver
  normal, mid-fade, emergency mid-transmission, at 1600 (force the event in a test page or through the controller's
  test hook, not by a button in the app).
- **The entry** (files, commands and results, the acceptance list ticked, shots) is for the orchestrator; Johnny gets
  a short summary.

---

# Task: Traveller Comms — Emergency Red Theme

The Traveller Living Systems Comms feature is already implemented and working. This task is a focused visual enhancement to the existing Beowulf Easter egg.

**Do not rebuild the receiver, change the procedural chatter engine, or alter the approved animations.**

## Desired behavior

When the rare **Free Trader Beowulf** transmission begins, the comms receiver should gracefully transition from its normal teal/cyan appearance into a dramatic **Traveller Red emergency appearance**.

The sequence should be:

1. The Beowulf event is selected for playback.
2. The comms receiver smoothly transitions from teal/cyan to Traveller Red over approximately **700 ms**.
3. The channel/category label changes from `ARCHIVE` (or its current archival designation) to **`EMERGENCY`**.
4. The complete Beowulf transmission plays using the existing live transcription, waveform, and multi-part sequencing.
5. The receiver **remains red throughout the entire Beowulf sequence**, including pauses between fragments. Do not flicker back to teal between messages.
6. After the final transmission finishes and its text gracefully fades away, transition the receiver back to its normal teal/cyan theme over approximately **900 ms**.
7. Normal system chatter resumes.

The result should feel like the ship's communications equipment has switched into an emergency operating mode, not like an animated warning advertisement.

## Visual changes

Every element currently using teal/cyan within the **comms receiver only** should transition to Traveller Red:

- Angular frame outlines and illuminated corners
- Teal headers, labels, and metadata-chip outlines
- SIG meter bars that are normally teal
- Waveform bars and baseline
- Waveform playhead and glow
- Radio tower SVG and its outward-moving signal waves
- Cyan decorative details, dividers, and accents

Use an appropriate rich Traveller-inspired red palette, approximately:

- Primary red: `#E32D3F`
- Bright red highlight: `#FF5360`
- Deep red glow: `rgba(227, 45, 63, 0.35)`

Keep white text white. Existing amber accents may remain amber where appropriate, provided they look cohesive against the red treatment.

**Important:** The color change must be gradual. Do not make any element instantly switch from cyan to red.

Use CSS transitions on the relevant color, border-color, background-color, fill, stroke, and shadow properties. SVG elements and waveform rendering must participate in the theme change.

Do not introduce flashing, strobing, global brightness pulsing, or a red screen overlay.

## Implementation approach

Inspect the existing receiver and Beowulf playback implementation first. Reuse the current architecture.

Prefer a reusable theme state:

`normal | emergency`

Use one root-level class or data attribute, such as:

`data-comms-theme="emergency"`

Where practical, use CSS custom properties for the receiver's accent colors and glow treatments, rather than hardcoding red into individual components.

If the waveform is drawn programmatically, make sure its renderer reads the current theme and transitions its colors smoothly.

**Do not detect the Beowulf event by searching its text.** Use its existing event identifier or explicit metadata to activate emergency mode.

Activate emergency mode before the first Beowulf fragment. Maintain it across every fragment and pause. Restore normal mode only after the complete event has finished, not after an individual message.

Handle cancellation, navigation away, unmounting, and quiet-mode changes safely so the receiver does not get stuck in emergency mode.

## Future compatibility

Make the emergency color treatment reusable.

Later, ordinary procedural chatter might include actual emergency transmissions. We should be able to activate the same red theme through an explicit event type or metadata without duplicating the styling.

**Do not implement additional emergency scenarios or modify chatter probabilities in this task.** Just make the theme reusable.

## Preserve existing functionality

Do not change:

- Bars-only speech waveform
- Word-by-word transcription
- Organic waveform speech response
- Continuously animated idle carrier hiss
- Independent radio tower signal-wave animation
- Graceful text transitions
- Existing timing and Beowulf wording
- Fixed metadata layout
- Compact lower-right positioning
- Current procedural chatter generation

No skip button, waveform selector, or additional UI controls.

## Acceptance criteria

Verify the following:

- Normal chatter remains teal.
- Beowulf activates the red theme and displays `EMERGENCY`.
- All normally teal receiver accents change to red smoothly.
- White text stays readable.
- The receiver stays red between all Beowulf fragments.
- The waveform continues responding to speech exactly as before.
- The radio tower continues its independent micro-animation.
- After Beowulf finishes, the receiver fades back to teal.
- Normal chatter resumes with no stuck state.
- Interrupted playback or navigation cannot leave the receiver permanently red.
- Reduced-motion preferences remain respected.

Run the relevant existing tests and type checks.

**Keep this implementation surgical.** Make the smallest maintainable changes necessary. Do not redesign the component or rewrite the chatter system.

When finished, summarize the files changed and confirm that the theme transition, Beowulf sequencing, and restoration work correctly.
