# Lane D — a first-visit review of the live site; then the passkey screen follow-ups

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/D.md`,
`directives/agent_d_brief.md`, then this file. No git but read-only, no deploy, no
`rules/`, no Traveller rule from memory. Your passkey screens are accepted; they go
out with Lane A's two client fixes, in the push after 1.1.10.

## 1. Now, read-only: the first ten minutes of a new visitor (live, version 1.1.9 or later)

Passkey sign-in is about to make accounts easy, and public games come next, so
strangers will arrive. Nobody has reviewed the site as one of them. On
https://traveller.voyage, in a fresh browser profile with WebGL (the sector in a URL
is `Spinward_Marches`), signed out and then signed in with whatever account your
tools allow (if none, say so and do the signed-in part on your own local build),
walk it as a person who knows Traveller and has never seen this app:

- landing: what the page is, what can be done, where to click first;
- the map: find a world, open it, read its dossier, the orbit view, the surface map;
- the rail: what Campaign and Build promise while switched off; the sign-in card;
- signed in: make a map of your own, generate a subsector (the density prompt, the
  toast, the dots zoomed out, the allowance when it shows), open a generated system,
  keep it, design one by hand, undo;
- Campaign: a record, a journal entry with an image, the timeline;
- the account page; signing out (a known live fault: sign-out does not end the
  session until Lane A's fix is deployed; do not report it again);
- the same at 520 px wide and by keyboard alone for the first three items.

Write `findings/first_run_review.md`: every place a new person stalls, is misled,
sees jargon, loses their place, or sees something that looks unfinished beside the
legacy app's polish. Each finding: where (address and control), what happens, what
they expected, one shot (`kb16_*`), severity (blocks, misleads, rough), the lane that
owns the file, and your proposed fix in one or two sentences. Rank them. Say the ten
you would fix first. Change no product code in this part.

## 2. Passkey screen follow-ups

**Start when `directives/reports/a_signout_fix.md` (or its copy in done/) exists**; if
it does not when part 1 is done, report part 1 and say part 2 waits.

- A closed prompt now arrives as `ceremony_cancelled` on every ceremony: confirm the
  quiet line shows and no library sentence can reach any of your screens.
- Each passkey row says when it was added (`createdAt` from `listPasskeys()`), in the
  house date form.
- Sign-out: A's `signOut` now reports failure; say so on the page in one sentence and
  leave the person signed in on screen when the server did not end the session.
- Remove the router workaround in `views/Account.vue` once A's line is in
  `router.ts` (A's report says so).
- The Link button: read "Linked providers" in `directives/contracts/b_auth.md` (Lane B
  is rewriting it this turn; if it does not yet name the route for linking while
  signed in, leave the button as it is and say so).
- `views/Account.vue` keeps two global rules (`h1`, `p`) that style every screen: say
  what relies on them, and scope them if nothing should.
- The modal frame: `workspace/Lightbox.vue` and your picker each carry a copy of the
  frame styles; lift one shared frame into `design/base.css` (owed since the picker)
  if it is a small, safe move; if not, say why.

## Copy

Every sentence follows the Google developer documentation style guide.

## Owned files (this pass)

Part 1: `findings/first_run_review.md` and shots only. Part 2:
`apps/web/src/workspace/passkey/`, `workspace/SignInCard.vue`, `views/Account.vue`,
`design/base.css` (the frame), tests in `tests/web/`.
`directives/reports/d_first_run_review.md`. Not yours: `apps/web/src/account/`,
`router.ts` (Lane A this turn), `apps/web/src/surface/` (Lane C),
`workspace/journal/`, `apps/web/src/pack/` (Lane E).

## Gates

Part 1: none. Part 2: `npm test`, `npm run check`, `npm run typecheck`,
`npm run build`, pasted, and the browser pass with the virtual authenticator for the
changed states, on your own ports, stopped after.

## Stop rule

Stop when the review is written and part 2 is done or reported as waiting.

Write `directives/reports/d_first_run_review.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: part 1, findings/first_run_review.md (19 findings ranked, the ten first; kb16_* shots; signed out on live, signed in on my local build). next: part 2, A's report exists.
done: part 2 (added date, sign-out refusal by the button, link-social, router workaround removed, closed prompt and failed add checked; the global rules measured and kept; the frame lift not done and why); gates; browser pass pk10. next: the report.
done: report directives/reports/d_first_run_review.md; servers and browser stopped. next: wait for the next prompt.
