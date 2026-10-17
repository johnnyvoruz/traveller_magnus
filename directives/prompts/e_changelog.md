# Lane E — what's new: a changelog behind the version number

Issued 2026-10-17 by the orchestrator. You may be a fresh session with no memory. Read `CLAUDE.md`,
`directives/manifesto.md`, `directives/board.md`, `directives/lanes/E.md`, then this file. No git but
read-only (`git log` is allowed), no deploy, no `rules/`.

## Johnny's words (2026-10-17)
"I want to create a changelog document that we can open from a modal on the version number."

## Today
"Version 1.2.5" is plain text in three places:
- `workspace/AccountMenu.vue` 558 (`.account-version`);
- `workspace/passkey/AccountPage.vue` 541 (`.pk-version`);
- `workspace/passkey/SignInBody.vue` 311 (`.signin-version`).

## Decided (orchestrator; build it)

### 1. The data: `apps/web/src/changelog.ts` (new)
- `export const CHANGELOG: readonly Release[]`, newest first;
  `Release = { version: string; date: string; title: string; items: readonly string[] }`
  (`date` as `YYYY-MM-DD`).
- **Backfill every app version** from `git log --format='%ad %s' --date=short` (commit subjects start
  with the version) and, where one exists, `versionvideo/releases/<version>.json` (`headline`,
  spotlight `title` and `text`). Where two commits carry one version, the later wins.
- **The words are for players and referees, not for us:**
  - Google developer style (`directives/instructions_google_style.md` if present, else
    developers.google.com/style): present tense, second person, sentence case, no exclamation marks.
  - No lane names, file names, migrations, tests, "orchestrator", issue numbers or internal terms
    ("truth", "overlay", "manifest"). Name what someone sees: "The marketplace has filters in a
    column on the left."
  - A title of a few words, then 2 to 6 items. Fixes are worded as what now works: "The store
    scrolls on every screen."
  - A version with nothing a user would notice gets one item: "Behind-the-scenes improvements."
- From now on the orchestrator adds each push's entry with the push list. A test (below) makes that
  impossible to forget.

### 2. The window
- "Version 1.2.5" becomes a button in all three places, reading "Version 1.2.5 · What's new", styled
  as the store's text links (`.mk-link` look, from the design system or the tokens; don't import a
  market file into the account files).
- It opens the changelog in **the app's one modal frame** (the one the store and the plan use; find
  it, don't make a second). Heading "What's new"; each release a section headed with its version and
  date ("1.2.5 · 16 October 2026") and its title, then its items as a list. Newest first; the
  current version is open, older ones in a list that reads well at 390 px.
- **Not a modal on a modal:** where the version sits inside a modal already (sign-in), the changelog
  replaces that modal's body, with Back returning to sign-in. Say what you found.
- `changelog.ts` and the window load only when first opened (`defineAsyncComponent` / dynamic import),
  so the sign-in bundle doesn't grow.
- **A URL:** `/changes` opens the same window over the map on a cold load (manifesto: Connected), and
  closing it leaves `/`.
- Escape, the close button and the scrim close it; focus returns to the version button.

### 3. Tests
- `CHANGELOG[0].version === APP_VERSION` (from `version.ts`): **a push that bumps the version without
  an entry fails `npm test`.**
- Every version is unique and in descending order; every date is valid; every release has a title and
  at least one item; no item contains a backtick, a path (`/src/`, `.ts`, `.vue`) or a lane name.
- The window renders from a cold load at `/changes`.

## Gates
- `npm test`, `npm run check`, the typecheck and `npm run build`.
- Shots `findings/ui_design_shots/kb30_changes_*`: the account menu's button, the window at 1600 and
  390, the sign-in body swapped to the changelog and back.
- In your report, the full text of the five newest entries, so Johnny can read them without opening
  the app.

## Report
Write `directives/reports/e_changelog.md` from the template.

**Owned:** `apps/web/src/changelog.ts` and the window's component (new files; name them); the version
lines and their styles in `AccountMenu.vue`, `passkey/AccountPage.vue` and `passkey/SignInBody.vue`
(those lines only: shared files); the router line for `/changes`; tests under `tests/web/`; your shots
and report.

After each meaningful step, append one line under Progress: "done: X. next: Y."

## Progress
