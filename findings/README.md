# Findings — review of 2026-10-03

Written by **Agent M** (project review: technical state and required features for the
"sci-fi D&D Beyond" goal). **Agent X** (legacy bloat hunt) adds its own file here.

| File | Holds |
|---|---|
| `agent_m_technical.md` | 20 technical findings, most severe first, each with evidence and a fix |
| `agent_m_features.md` | what a Traveller campaign platform needs, what the plan already covers, what is missing, and a sequencing recommendation |
| `agent_x_*.md` | (Agent X) code and document bloat left from earlier iterations |

Nothing outside this folder was changed. No git commands were run. Production was only read
(public URLs and three read-only D1 queries).

## How each finding is marked

- **Confirmed** — I ran it or read it in production today; the command or file line is given.
- **Read** — follows directly from the code or the directive cited.
- **Inferred** — my judgement; say no if you disagree.

## The ten things that matter most

1. **The viewer cannot read the CDN yet.** `cdn.traveller.voyage` sends no CORS header, and
   the SPA is on a different origin. Slice 1 is blocked until the bucket has a CORS policy.
   (Technical T1, confirmed.)
2. **The CDN is not caching.** Objects come back `cf-cache-status: DYNAMIC`; every read goes
   to R2. One Cache Rule fixes it. (T2, confirmed.)
3. **Truth v1 right now: 298 done, 204 failed, 10 stale `building`, not released.** The new
   dead-letter consumer drained the queue at 15:16Z. The retry has not been run. The root
   cause of the stall is still a guess; get the Workers Logs outcome before retrying. (T4.)
4. **The dead-letter consumer destroys evidence.** It overwrote the two real R2 error
   messages with its generic text. Confirmed on `Veg_Fergakh` and `Far_Frontiers`. (T3.)
5. **Every push to `campaign` deploys to production with no test gate.** There is no CI
   workflow, and Workers Builds runs build and deploy only. (T9.)
6. **Search does not do prefixes and leaks the unreleased build.** `q=Regi` returns nothing;
   `q=Regina` returns a row from unreleased `v1`. (T5, confirmed.)
7. **The sector index shape is about to be frozen with a defect in it.** Every hex entry
   carries its fields twice, and has no stellar data. Indexes are immutable once released.
   Decide before the release, not after. (T6.)
8. **Players are the product, and they are scheduled last.** Player accounts are "after
   slice 5". A D&D Beyond for Traveller is a referee plus players in one campaign with
   accounts. The data model has one owner per universe and no campaign entity. (Features §2.)
9. **The campaign plan is written for the legacy app.** `campaign_manager_plan.md` is named
   as the source for slice 3, but about two thirds of it describes IndexedDB, `js/` files and
   an offline Player Pack. Its data model also lost fields on the way into `data_model.md`.
   (Features §4.)
10. **Sheets need rules data and a licence position.** `rules/` holds world generation only.
    Characters, ships, equipment and trade need files only Johnny can supply, and Mongoose
    content is not covered by the Far Future fair-use text the plan cites. (Features §5.)

## Decisions only Johnny can make

| # | Decision | Where it is argued |
|---|---|---|
| D1 | Release v1 with the current index shape, or fix the shape and release as v2? | T6 |
| D2 | Keep fighting the Worker truth build, or build locally and upload (offered 2026-10-03)? | T4 |
| D3 | Does production deploy from `campaign`, or from `main` with `campaign` as preview? | T9 |
| D4 | Move a thin campaign slice with player accounts ahead of the Builder? | Features §6 |
| D5 | Is a campaign its own thing, or is it the universe? (Two tables in one universe.) | Features §2 |
| D6 | Which sign-in providers before anyone outside is invited? X alone is a wall. | Features §3 |
| D7 | What Mongoose content may the site hold, and under which licence? | Features §5 |
