# Agent B — one fix to the hardening before it ships, and a way for Johnny to look at v6

Issued 2026-10-07 by the orchestrator. All three of your reports are read.
- **K7b: accepted and called for push** (the table, paging, apply with conflicts, the
  server's own `mentions`, the limit, the export; your item 6 and item 7 are in the
  log). `campaign_logic`, `truth_build` and `reconcile_derived` ran here: 15 pass, 0 fail.
- **`findings/v6_open_cases.md`: accepted.** Eighteen cases that sum to the totals, each
  with its question and the file an answer would edit, and no recommendation. Johnny has
  the large ones in front of him.
- **The hardening: accepted, with one thing to settle before it is pushed.**

## 1. A released version's sector indexes must be immutable again

Your table has `truth/<version>/sectors/<slug>/index.json` at `public, max-age=60`,
where it was `immutable` for a year. Right while a version is being built: the key can
be rewritten. **Wrong once it is released**: those files are what every visitor's map
loads, a released version never changes, and `architecture.md` §10.1 ("why the map is
fast") stands on them being cached for good. With this change every version built from
now on would be re-fetched or re-validated by every visitor every minute.

- Say first how the web reads a sector index today (the URL, any version or hash in it,
  what the service worker or the HTTP cache does with it), so the cost is stated, not
  assumed.
- Then make a released version's files immutable again. The release route is the place
  that knows the version is final: at release, each sector index (and the per-sector
  reconciliation reports and the total, if they are to stay public) is given the
  immutable header, by a copy in place or however R2 allows, before the manifest is
  written, and the release fails cleanly if any cannot be. Or propose something better
  (an index addressed by the `indexHash` the manifest already carries) and say what it
  would change in the web. Choose, build, test: a built-and-released fixture version
  ends with immutable indexes; an unreleased one stays at 60 seconds.
- The two things you measured are not pinned: add the test that fails if a slice goes
  back to one hex at a time (count the concurrent R2 calls in the fake), so the gain
  cannot quietly be lost.

## 2. The smallest safe preview of an unreleased version

Johnny has to rule on v6's open cases, and your report says there is no way to open the
site on v6. Build the one you described, and no more: **an admin-only page that takes a
version name, a sector and a hex, reads that version's public sector index and the one
tree object, and shows the system through the existing dossier** (and, if it falls out
for nothing, beside the same hex on the released version). It writes nothing, releases
nothing, and cannot be used to pin a universe to that version. The API side is yours;
for the page, the least in `apps/web` under a dev or admin route, reusing the dossier's
own components unedited (`dossier/` is Agent E's lane: read, do not edit; say what you
needed). If a web page is more than a small step, stop at an admin JSON route that
returns the dossier model for that hex and say so.

## 3. Your own API port

A stuck process holds local port 8787. Start your own local API on a free port with its
own state directory for any `RUN_API_TESTS` run, say how in the report, and stop it when
done. Then run the whole `tests/api` suite with `RUN_API_TESTS=1` once (you ran two files
of it for K7b) and paste it.

## Check

`npm test`, `npm run check`, `npx tsc --noEmit -p apps/api`, pasted. No deploy, no
production write, no admin call, no git. `packages/shared`, `apps/web` beyond the one
preview page, `packages/engines` are not yours. Stop and report. After this: the flight
log's paper design (`slice_2_campaign.md` follow-up 31), which gets its own prompt.
