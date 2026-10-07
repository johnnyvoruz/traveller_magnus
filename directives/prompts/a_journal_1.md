# Agent A — the journal's data (K7a), after one thing on the route

Issued 2026-10-06 by the orchestrator. Route editing is **accepted**: `replaceLegsFrom`,
the `route` on the draw state, `waypointAt`, `waypoints()` and the stand-in. It is not
pushed yet: nothing shows until Agent D wires `route` (`d_nav_console.md` 0c), so it rides
with D's push.

## First: the route's old tail under a preview

In `findings/ui_design_shots/k30_route_with_preview.png` the preview parts from the stored
route at A-II, and the picture shows **two amber arrival tags for the same waypoint**, one
on the other ("A-II · 035-1105" from the route, "A-II · 024-1105" from the preview). That
is exactly what a drag will look like: D feeds a preview with the moved waypoint while the
stored route is still drawn.

Rule: **from the parting waypoint on (`previewPart`), the route is "what was".** Its
waypoints and line from there are drawn dimmer than the settled style, with no tag and no
number; the preview carries the tags. Before the parting waypoint, and with no preview,
nothing changes. `waypoints().route` still lists every route waypoint (a drag may start on
one under the preview). A test for the tag count with and without a parting preview, and
the frame again as `k31_route_parting.png`. `OrbitRenderer.ts` only; Agent C is still in
the ring code, leave those lines.

## Then: K7a, the journal in the shared schemas

The journal is the next step of the slice (`slice_2_campaign.md` K7; the entry's shape is
`campaign_manager_plan.md` §2.4, its behaviour §8). This step is the schema only, additive
and optional, so it can be pushed before the server stores anything. The Durable Object
(K7b, Agent B) and the browser's store (K7c, yours) follow, each with its own prompt.

In `packages/shared/src/schemas/campaign.ts`, in the file's own style:

1. **Limits.** `CAMPAIGN_LIMITS` gains `journal: 20_000`, `entryTitle: 200`,
   `entryBody: 100_000`, `mentions: 200`.
2. **Ids and kinds.** `JOURNAL_ID`: `cj_` and a UUID, as `RECORD_ID` is written.
   `CAMPAIGN_ENTRY_KINDS = ['session', 'note', 'handout', 'rumor'] as const`, exported with
   its type.
3. **`CampaignEntry`**, strict, exported with its type:
   - `id` (`JOURNAL_ID`), `kind` (the enum), `title` (a string up to `entryTitle`; **may be
     empty**, a quick note need not be named), `body` (up to `entryBody`);
   - `when`: the file's `Day`, nullable (the in-fiction date, as a record's `when.start`);
   - `realDate`: `YYYY-MM-DD` as a string, nullable (the day the session was played);
   - `sequence`: an integer of at least 1, nullable. **A session has one; any other kind
     has null** (a `superRefine`, each way). The numbering itself is the store's (K7c);
   - `author`: `'referee' | 'players'`; `visibility`: the file's `Visibility`;
   - `anchor`: `CampaignAnchor`, unchanged (null, a system with or without a body or a
     point, or a record);
   - `mentions`: an array of up to `mentions` strings, each a record id (`RECORD_ID`) or
     `hex:` followed by a hex key (`HEX_KEY`);
   - `rev`, `createdAt`, `updatedAt`, `deleted`, as on a record.
   The schema does **not** force a handout to be player-visible (the plan says handouts are
   player-visible "by definition"; the screen will default it, and a referee may draft one
   first. Orchestrator's call; say so in the report so Johnny sees it).
4. **`mentionsOf(text: string): string[]`**, a pure function beside the schema. It reads
   the plan's tokens (§2.5) in the new platform's ids: `[[cr_<uuid>|Captain Voss]]` and
   `[[hex:Spinward_Marches/1910|Regina]]`, the label optional (`[[cr_<uuid>]]`). It returns
   the distinct targets in the order first seen, at most `CAMPAIGN_LIMITS.mentions`.
   Anything else between double brackets is not a mention and is left alone. No other
   token (`#tag`, `@`) in this step.
5. **Changes, page, result.** `EntryChange`, written as `RecordChange` is (the full row
   with `baseRev`, or `{ id, baseRev, deleted: true }`). `CampaignChanges.journal?:
   EntryChange[]`, counted with the other rows against `patchRows`.
   `CampaignPage.journal`: `z.array(CampaignEntry).optional()` (**optional**, so today's
   server, which sends none, still parses). `CampaignChangesResult`: the `applied` table
   enum gains `'journal'`, and `conflicts` gains `{ table: 'journal', id, current:
   CampaignEntry }`.
6. Export what is new from `packages/shared/src/index.ts`, as the neighbours are.

Tests, beside the existing campaign schema tests: a valid entry of each kind; a session
with no sequence and a note with one, both refused; an empty title accepted; a body one
character over the limit refused; a bad `realDate`; each anchor form; `mentionsOf` on a
body with two record tokens, one hex token, a repeat, a token with no label, and
`[[something else]]`; a `CampaignChanges` with only `journal`; a page with and without
`journal`.

## Check

`npm test`, `npm run check`, `npm run typecheck` (web and api: the api must still compile
with the wider result table; if a `switch` over the table there is exhaustive and now
fails, **stop and say so**, that file is Agent B's), `npm run build`, pasted.

Do not touch `apps/api`, `apps/web/src/campaign/` (K7c is next, not now), `views/`,
`workspace/`, `orbit/` beyond the one renderer change above, `surface/`, `dossier/`.
No git. Stop and report.
