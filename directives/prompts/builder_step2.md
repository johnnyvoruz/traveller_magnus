# Builder, step 2: editing a system, as a draft you Keep

Issued 2026-10-08 by the orchestrator. Do this when step 1 is joined
(`prompts/builder_step1_close.md` reported by all three). Common rules:
`directives/swarm_restart.md`. The design is `findings/builder_system_design.md`
section 3 and its `kb_*` mockups; Johnny's rulings are at the foot of
`prompts/builder_step1.md`.

## The rulings that shape this step

- **A draft you Keep.** Editing changes nothing stored until Keep; Discard throws it
  away; leaving with a draft asks in the app's own pattern, never a native dialog.
- **Not live.** One person, one draft, one save with a `rev`; a newer copy on the server
  is a conflict shown to the person.
- **Nothing checks a rule.** Every value is the referee's to type. The seven "needs the
  rule" slots (R1 to R7) are designed places that stay empty and say nothing.
- **Nothing outside the generation code reads a tree.** The generator will be rebuilt.
  So the editor never touches the engine's tree shape: it is given a **form**.

## The form (this is the whole idea of the step)

The server turns a stored system into an **edit form**: an ordered list of sections
(the stars, each world, each moon, the mainworld's profile, names, notes), each a list
of fields with an id, a label, a kind (text, number, one of a list, a switch), its value,
and whether the referee may type it, may roll it again, or may only read it. The browser
draws the form and sends back changed values by field id. The server puts them into the
tree, and may answer that other fields changed because of it. **The two functions that
do this, tree to form and form to tree, live in `packages/generation` beside
`generateHex`, one pair per engine, and are the only code that knows a tree's shape.**
When the generator is rebuilt, those two are rewritten and nothing else moves.

What goes in the form is what the legacy system editor let a referee change, engine by
engine, as Agent A's audit lists it (`findings/builder_web_audit.md`, section 2), and
no more. No field, label, list of legal values or default from memory: where the legacy
editor offered a list, the list comes from `rules/` or from the legacy code, named in a
comment; where it offered free text, it is free text.

## Agent B

1. In `packages/shared`: the form's schema (sections, fields, kinds, the three
   permissions), the draft request (changed values by field id, an optional "roll this
   again" by field or section), its answer (the new form, the ids that changed because
   of the draft and why in plain words from the engine's own trace, and any message the
   engine itself raises: its words, not ours), and Keep. Then the ready note.
2. In `packages/generation`: `formOf(envelope)` and `applyForm(envelope, changes, roll)`
   for the two ready engines. `applyForm` reuses the engine's own functions for
   whatever the legacy editor re-ran after an edit (A's audit names them); it invents no
   step. Golden tests: `formOf` then `applyForm` with no changes returns the same bytes;
   each editable field changed alone changes what the legacy editor changed, checked
   against `tests/oracle/legacy.js` for five hexes of each engine.
3. Routes: read a hex's form; a draft (stateless: the envelope's hash in, a form out,
   nothing stored); Keep (the changes and `baseRev`; one object, one row, the chart
   `entry` rebuilt; Undo exact). A blank system if the legacy app could make one and A's
   audit says how; otherwise not in this step.
4. Tests, a round trip on your own port, `data_model.md` and `api.md`. Gates.

## Agent A

In `apps/web/src/builder/`: `openDraft(hexKey)` giving a handle (the form, `dirty`,
`changedByEngine`, `messages`, `set(fieldId, value)`, `rollAgain(id)`, `keep()`,
`discard()`), a draft being local until Keep, the draft call debounced and never out of
order (the answer to an older draft is dropped), Keep through the in-flight queue, a
conflict surfaced with the server's copy offered. Tests against a fake transport. Not
the screen.

## Agent D

The dossier editable in place, as designed: "Edit" in the build bar opens the draft on
the selected system; each field is typed, rolled again or locked, and looks it; amber
marks what the engine changed because of your change, with its words beneath; Keep and
Discard always in view, with their keys; the Undo toast after Keep; the conflict state;
the seven rule slots present and empty. It is drawn from the form, so a new field on the
server appears without a change to the screen. Column, half, full, 520 px; keyboard
through every field; reduced motion; contrast pairs. A browser pass on your own ports:
edit a star, a world's profile, a name and a note on a Mongoose system and on an
Architect of Worlds one; roll one field again; Keep, reload, find it; Discard; Undo; a
conflict from a second tab. `kb_edit_*` beside the mockups.

**A known oddity, left as it is (Johnny, 2026-10-08: "leave it"):** the
dossier shows every Architect of Worlds star as "Star" with age 0, though the engine has
both. That is the dossier's own reading of that engine's tree and is not fixed here; the
form, coming from the server, will show the name and the age correctly in the editor.

## Everyone

Gates pasted, what you built, stubbed, skipped, your questions. Stop and report.

## Added 2026-10-08, after Agent A's draft handle and Agent D's pass on the real store

- **A's handle is on disk:** `openDraft(hexKey)` from `apps/web/src/builder`: `form`,
  `dirty`, `changedByEngine`, `messages`, `conflict`, `set(fieldId, value)`,
  `rollAgain(id)`, `keep()`, `discard()`. `discard()` does not toast; asking before
  leaving a hex with a draft is the screen's. A blank system is not on the handle.
- **Ruling on A's question, "Keep mine" after a conflict:** yes, as A proposes. When the
  server holds a newer tree, "Keep mine" re-reads the form of the new stored system and
  applies the person's own changes onto it by field id (a field that no longer exists
  is dropped and named to them), shows that draft, and Keeps only when they press Keep
  again. It never resends against a hash that is gone. **Agent A builds it; Agent D
  draws the conflict state with two choices: "Take theirs" and "Keep mine".**
- **Agent A, also:** `shell/pane.ts:95` (`dossierDefault`) opens the dossier pane on a
  sector's and a subsector's address for everyone, so with Build off it showed an empty
  pane titled "World". D guarded it in `PanelHost.vue`; fix it at the source and tell D
  to drop the guard. And a blank system on the handle (B's `POST …/blank`).
- **Agent D:** the editor's screen starts now.
