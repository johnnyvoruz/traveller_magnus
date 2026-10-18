# Lane B — four number fields on a hand-made star; codes for three answers

Issued 2026-10-11 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/B.md`,
then this file. No git but read-only, no deploy, no `rules/`, no Traveller rule from
memory. Your marketplace server report is accepted (gates green in the orchestrator's
run: 1380 pass, checker clean, typecheck and build pass).

## 1. Luminosity, mass, diameter, temperature (Johnny: yes, 2026-10-11)

Your own finding (`directives/contracts/b_builder.md`, "Luminosity, mass, diameter,
temperature"): the profile roll looks a hand-made star's four numbers up with
`generateStarObject` from its type, subtype and class; they are not a closed list, so
they cannot be a dropdown. Johnny's ruling: **four number fields that show the lookup
until the person types, store a number only when one is typed, and the roll reads the
stored number where there is one.**

Contract first, then code:

1. In `b_builder.md`, write the section: the four field ids on a star (follow the id
   pattern the star's other fields use), their type (`number`), their units as the
   engine holds them (cite the engine line for each unit; do not state a unit from
   memory), what the form carries so the browser can show the lookup while the field
   is empty (a `lookup` value beside the field, or the name you choose; say which),
   what `unset` does (back to the lookup), the bounds (finite and above zero, unless
   the engine line you cite needs another bound), and the refusal sentence for a bad
   number, in the Google developer documentation style.
2. Build it in `packages/generation` (`hand.ts`, `form.ts`) and the routes that carry
   the form. A star with no type, subtype or class and all four numbers typed can be
   rolled against; say in the contract what the roll does when only some are typed
   and the lookup is not possible (your recommendation: refuse with one sentence that
   names the fields still to set).
3. The roll: `rollBodyProfile` reads a stored number in place of the looked-up one.
   **This touches `packages/engines/src/mgt2e_roll_body.js`.** Johnny's word for the
   one-body roll covers it only while every golden fixture and the parity test stay
   byte-identical and the engine version stays 1.1.0. If you can pass the stored
   numbers in from `packages/generation` without an engine edit, do that instead and
   say so. If any fixture moves, stop and report; do not regenerate a fixture.
4. Luminosity: the lookup computes it from diameter and temperature. Say in the
   contract what is shown when the person types a diameter or a temperature and no
   luminosity (your recommendation: the shown luminosity follows the typed numbers,
   through the same engine function, and nothing is stored for it).
5. AoW and blank systems: the same four fields; the lookup is whatever that edition's
   path already gives, or none. Say which, from the code.

## 2. Codes for three answers the browser reads by their sentence

Lane A's messages report named three places where the browser tells answers apart by
matching the sentence: a bare 400 with no field id; `details.current` on the
slot-in-use 409; the conflict on blank. Give each a stable `code` in the error
envelope (follow the envelope's existing pattern in `packages/shared`), write the three
in `b_builder.md` under one heading with the exact shape, and keep the sentences as
they are. The browser side is Lane A's, later; do not edit `apps/web`.

## Owned files (this pass)

`packages/generation/`, `packages/shared/`, `apps/api/`, `tests/api/`, `tests/generation/`,
`tests/shared/`, `directives/contracts/b_builder.md`, `directives/reports/b_star_numbers.md`.
`packages/engines/src/mgt2e_roll_body.js` only under item 3's condition. Not yours:
`apps/web`, the held engine lines in `mgt2e_world_engine.js`, the five held fixtures.

## Gates

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Fourth gate:
`RUN_API_TESTS=1` on the Builder suites, on your own ports, server stopped; tests for:
a typed number stored and read by the roll; unset returns to the lookup; a bad number
refused with its sentence; a star with no class and four typed numbers rolled against;
the three codes present. Golden and parity green with no fixture touched.

## Stop rule

Stop when both parts pass and the report is written, or at once if a fixture moves.

Write `directives/reports/b_star_numbers.md` from `directives/reports/_TEMPLATE.md`.
Under "Needs from others" give Lane D the field ids and the lookup's name in three
lines. Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress
done: read the hand form, the roll, and the three sentence matches. next: write the contract, then the fields and the codes.
done: wrote the contract, the four fields, and the three codes. next: run the gates.
done: generation tests cover a stored number, an unset field, a bad number, and a classless star. next: run the gates.
done: confirmed the contract, fields, codes, and tests are in the working tree. next: run npm test, check, typecheck, and build.
done: gates passed (1387 tests, checker, typecheck, build, 24 Builder API tests). next: write the report.
