# Agent A — three small changes: the journal's order, session numbers, typed hours on a leg

Issued 2026-10-07 by the orchestrator. K7c is **accepted and called for push** (the
journal in the store, the commit path, the index, the drafts). The check and build
failures you saw were Agent C's dev harness in mid-edit, not yours.

## 1. The journal list's order follows the design

Agent E's design (`findings/journal_design.md` §2, accepted) lists entries **newest by
`updatedAt`**, so a note just written sits at the top. Your `entriesNewestFirst` orders
by the in-fiction date with undated entries last, which is what my prompt said and what
the timeline (K8) will want, but it buries a fresh note under every dated session.

- `entriesNewestFirst(kind?)`: by `updatedAt`, latest first, ties by id.
- Keep today's order under a new name, `entriesByDate(kind?)`, for the timeline.
- Tests for both.

## 2. A session number is never reused

`nextSessionNumber()` skips only live sessions, so deleting session 14 and adding a new
one makes a second 14, and Undo then shows two. Rule (E's question to Johnny, taken at
its recommended answer until he says otherwise): **one more than the highest sequence on
any session in the store, deleted ones included.** A test: delete the highest, add one,
restore the deleted, and the numbers differ.

## 3. A leg records that its hours were typed

Agent D re-times a stored route when a waypoint moves, and cannot tell a leg whose hours
the referee typed from one the console estimated, so typed hours are lost on any edit.
Ruling: the leg records it.

- `packages/shared/src/schemas/campaign.ts`, `TrackLeg`: an optional `hoursTyped:
  z.literal(true).optional()` (absent means estimated; never `false`). Additive: every
  stored leg still parses.
- `campaign/track.ts`: `appendLeg` and `replaceLegsFrom` carry it through untouched.
  Nothing else reads it in this step; D's console sets and honours it next.
- Tests: a leg with and without the field; `hoursTyped: false` refused; a track round
  trip keeps it.
- Tell me if the server strips unknown keys from a leg anywhere (`apps/api` is Agent B's:
  read, do not edit); the leg is validated by the same schema there, so it should pass.

## Check

`npm test`, `npm run check`, `npm run typecheck`, `npm run build`, pasted. Agent D may be
changing one comparison in `campaign/track.ts` (`replaceLegsFrom`, `<=` to `<`) at the
same time: re-read the file before each edit and leave that line as you find it. Not
yours: `orbit/`, `workspace/`, `views/`, `surface/`, `apps/api`. No git. Stop and report.
