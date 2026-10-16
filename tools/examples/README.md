# Example packages

Six example packages on chart v10, published by the house account (handle `traveller_voyage` (the app stores handles in lowercase), user id
`e2b2245a-5260-4b91-8f33-1e02997fd9d5`). Override both with `EXAMPLE_HANDLE` and `EXAMPLE_USER_ID`.

| Pack | Folder | Kind | Imports |
| --- | --- | --- | --- |
| Free traders of the Marches | `packs/free-traders-of-the-marches` (Lane E) | ships | in place |
| Jewell patrons | `packs/jewell-patrons` (Lane C) | patrons | in place |
| Regina highport contacts | `packs/regina-highport-contacts` (Lane C) | people | in place |
| The Glass Hand | `packs/the-glass-hand` (Lane E) | organization | in place |
| Feri terraces | `packs_z/feri-terraces` | system | in place |
| Hollow Verge | `packs_z/hollow-verge` | sector piece | placed |

Each folder holds `campaign.json` (a campaign export) and `listing.json` (title, kind, description, tags).
Lane Z's folders also hold `pack.json`: how the pack is built.

- A records pack publishes the charted hexes its records name, unchanged, so the package page has an outline.
- Feri terraces publishes `Spinward_Marches/2005` unchanged, with records on the system and its bodies.
- Hollow Verge is six systems in an own sector, made by the Builder with engine generation only. A fresh run would
  make different systems (the engine seeds each hex from its key, and own sector ids are random), so the piece was
  generated once with `--record` and kept in `packs_z/hollow-verge/recorded/`. A normal run restores it.

## Files

- `lib.mjs`: shared helpers. Every wrangler call passes `--local`.
- `build_local.mjs`: builds all six packages in a fresh local state through the app's routes.
- `seed_production.mjs`: copies the packages from a built local state into a target.
- `seed_games.mjs`: seeds the example games from `games/` (Lane C's files) into a target.

Links travel with the records (F16): a package carries every link whose two ends are both in it.

## Build locally

```sh
node tools/examples/build_local.mjs --state findings/examples/local --fresh
```

The script:

1. Checks every pack. A file that fails CampaignExport parsing stops the run with the file and the field.
2. Applies the migrations, copies chart v10 metadata and the named charted systems from the public CDN (read only),
   and makes the house account.
3. Starts a local API, makes one universe per pack, and loads each campaign export through
   `PATCH /api/universes/:id/campaign/changes`.
4. Restores Hollow Verge: a hidden bootstrap package in the local state, imported placed, then deleted.
5. Publishes all six through `POST /api/packages` and `POST /api/packages/:id/versions`, and stops the API.
6. Writes `built.json` with each package id and a fingerprint. Two fresh runs give the same fingerprints; only ids
   and times differ.

To record Hollow Verge again (this changes its systems): `node tools/examples/build_local.mjs --record --state findings/examples/record --port 8835 --fresh`.

## Copy to production (Johnny)

**Order: push 1.2.1 first** (it carries F15, F16 and migrations 0017 and 0018). Then the package copy below, then the example games.

The copy writes D1 rows (the six packages, their versions, and the six universes they name) and R2 objects (the
manifests and every object they list). Install counts start at 0, and a rerun keeps them.

1. Build: `node tools/examples/build_local.mjs --state findings/examples/local --fresh`.
2. Rehearse on a stand-in state:
   ```sh
   node tools/examples/build_local.mjs --bare --state findings/examples/standin --port 8851 --fresh
   node tools/examples/seed_production.mjs --from findings/examples/local --to-local findings/examples/standin
   node tools/examples/seed_production.mjs --from findings/examples/local --to-local findings/examples/standin --apply
   ```
3. Sign in to wrangler with an account that can write the `voyage` D1 database and the `voyage-public` bucket.
4. Print the production plan. This reads only. It looks up the house account by id and handle and stops if it is
   missing:
   ```sh
   node tools/examples/seed_production.mjs --from findings/examples/local --production
   ```
5. Check the printout: the house account line, six `insert` lines, six universes, six manifests.
6. Apply: `node tools/examples/seed_production.mjs --from findings/examples/local --production --apply`.
7. Open `https://traveller.voyage/packages` signed out and check the six packages.

To take the packages away again: `--production --remove` prints, `--production --remove --apply` deletes the D1 rows.
R2 objects stay. Deleting a package never takes anything back from a campaign that imported it.
## Example games (Johnny, after the package copy)

Each file in `games/` becomes one account (the referee's handle; it can never sign in: no passkey, no session), one
public v10 game marked Example, and a public ship row and card per ship. The rows are written with the app's own
functions in `packages/shared/src/public_hex.ts`, so they match what a real game writes.

1. Rehearse on the stand-in (it needs 0017 and 0018, which `build_local.mjs --bare` applies):
   ```sh
   node tools/examples/seed_games.mjs --to-local findings/examples/standin
   node tools/examples/seed_games.mjs --to-local findings/examples/standin --apply
   ```
2. Print the production plan: `node tools/examples/seed_games.mjs --production`. It stops if 0018 is missing or a
   referee handle belongs to a real account.
3. Apply: `node tools/examples/seed_games.mjs --production --apply`.
4. Open the map signed out on the Spinward Marches and check the Example ships and their cards.

To take them all away: `--production --remove` prints, `--production --remove --apply` deletes every example
universe (and with it every ship row and card), then each example account and its profile.
## Covers (F17)

A `listing.json` may name `"cover": "covers/<pack-folder>.webp"`. `covers/<pack-folder>_640.webp` beside it is the thumbnail. The image is at most 1600 px and 2 MB, and the thumbnail at most 640 px and 200 KB. `build_local.mjs` uploads the cover after publishing. `seed_production.mjs` names each cover in the dry run and copies it with `--apply`. `--remove --apply` deletes each cover object that no other package names. Lane A made the four records-pack covers. The Feri terraces and Hollow Verge covers are 1600x900 headless shots of the local map, made with `sharp`.

