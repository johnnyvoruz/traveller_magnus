# Traveller.voyage — the end-to-end plan

**Status:** ADOPTED 2026-10-02 (Johnny). This is the master document. Every other directive
written after this date hangs off it. Read in this order: `manifesto.md` → this file →
`architecture.md` → `data_model.md` → `api.md` → `design_reference.md` → the slice recipe you
are executing.
**Domain:** traveller.voyage (owned). **Product name:** Traveller.voyage. The legacy name
"As Above, So Below" stays on the frozen single file only.

---

## 1. What we are building, in one paragraph

A hosted, account-based **mapping engine and orbit engine** for the Traveller RPG, running
on Cloudflare. Anyone can open the charted universe and fly through sectors, systems and
orbits with nothing to install. A signed-in builder creates universes pinned to a charted
version or from scratch, generates and edits systems with the five rule engines, draws
routes, borders and regions, and runs a campaign on top. Builders share homebrew as
versioned packages that others install at the same hex coordinates, and can propose their
work into the canonical universe. The posture is TravellerMap plus a dose of D&D Beyond,
within the same fair-use terms TravellerMap operates under.

## 2. What we are explicitly not doing

- Porting the legacy UI. The shell is rebuilt against `manifesto.md`; only engine logic is
  copied, and it is proven by golden tests.
- Payments, a paid marketplace, licences. Sharing is free.
- Relocating packages to different coordinates (stretch goal, after slice 5).
- Undo stacks, browser-side autosave rings, IndexedDB persistence. The server is the working copy.
- Obsidian export (deferred), approach and surface viewers (dropped, unreachable today).
- Live multi-user editing of one universe. One owner per universe until a later slice.

## 3. How the work is done

Three roles, one protocol.

| Role | Who | Does |
|---|---|---|
| Referee | Johnny | Owns rules (`rules/`), product decisions, Halt & Challenge answers, git, deploys, secrets |
| Orchestrator | the planning session | Writes recipes just-in-time from the specs here, reviews reports, raises Halt & Challenge items, keeps the directives true |
| Implementer | the lower-effort model | Executes one recipe at a time, exactly as written, and reports |

**The recipe protocol.** A recipe is numbered steps; each names the file, the function, the
exact code, and a one-line check. Recipes are written from the slice spec when the slice
starts, never in advance (line numbers drift), and never by the implementer. If a step
cannot be done as written, the implementer stops and reports; the orchestrator fixes the
spec or the recipe. The implementer never changes approach, never "cleans up", never
touches `rules/`, never edits the legacy tree, never runs git.

**Definition of done for any recipe.** `npm test` green, `npm run check` clean, every
verification box ticked, a report that lists what was created, what was stubbed or
skipped, and every Halt & Challenge item raised, verbatim.

**Reporting format.** Files created (paths). Checks run and their literal output. Items that
could not be done as written, each with the step number and the exact error. Questions for
Johnny, each as one specific question with the two or three plausible answers.

## 4. The slices

Each slice ships on its own and is useful on its own. The order is chosen so that nothing
users have today breaks while the new app grows beside it, and so the first visible thing
needs no database at all.

### Slice 0 — Foundation (recipe: `slice_0_foundation.md`)
Nothing visible. The safety net and the skeleton.
- **Ships:** headless harness over the legacy engines (test oracle only); golden fixtures;
  the monorepo (`packages/engines`, `packages/shared`, `apps/web`, `apps/api`); rules as ESM
  without touching `rules/`; core modules; every engine converted with byte-equal parity; a
  real TSV and metadata XML parser package with parity fixtures; the Worker (Hono, D1
  migrations, Durable Object schema, Queues, health, auth, stateless generation preview, the
  truth-build job) deployed to traveller.voyage behind a holding page; truth v1 built by the
  platform and served from the CDN; CI running tests and checks; the design tokens file.
- **Done when:** the verification list in the recipe is all ticked,
  `https://traveller.voyage/api/health` answers, and the Worker's generation preview returns
  the same hash as the Node golden fixture for every case.

### Slice 1 — Viewer
The charted universe, read-only, for anyone. The product for the ten thousand.
- **User story:** I open traveller.voyage, see the Spinward Marches, search "Regina", fly
  there, open its dossier, enter the orbit view, scrub time, and share the URL.
- **In:** map canvas (wrapped legacy renderer behind `MapRenderer`), pan/zoom/select with
  inertia and keyboard, sector and subsector chrome, omni-search as the command palette,
  inspector at three widths (dossier: mainworld, stellar, tree, world map lead), orbit view
  as a **2.5D WebGL orrery** (constrained tilt and rotate, real spheres from the cube-map
  bakes, HTML labels; the orrery model is a pure TS module with a 2D canvas fallback renderer;
  `architecture.md` §9), time controls, line-up, companions, planet imagery and projections,
  deep links for universe/sector/hex/body, the design system page, toasts and one panel
  system, shortcut registry and generated help.
- **Out:** sign-in, any mutation, campaign, filters UI (the filter engine runs for colouring
  only if trivially wired), exports.
- **Reads:** truth indexes and objects from `cdn.traveller.voyage` only. No API calls, no
  engine code in the viewer bundle.
- **Legacy to read for behaviour:** `renderer.js`, `canvas_input.js`, `input_init.js:371-531`,
  `system_inspector.js`, `system_viewer.js`, `planet_*.js`, `keyboard_shortcuts.js`.
- **Done when:** cold load to interactive map under one second on a laptop over broadband;
  every route renders from a cold URL; Lighthouse shows no layout shift; every pointer
  interaction has a keyboard route; zero native dialogs; `npm run check` clean.

### Slice 2 — Builder
Accounts and universes. The product for the two hundred.
- **User story:** I sign in with X, create "My Marches" pinned to truth v1, generate
  three empty hexes with Mongoose 2e, hand-edit Regina's notes, draw an X-boat network, define
  a border, and come back tomorrow on another machine to find it all there.
- **In:** OAuth sign-in (X first; Discord and Google when configured), universe CRUD, pinned-to-truth and own-map modes,
  platform generation (five engines in the Worker; inline for small selections, Queue jobs
  with live progress for sectors; staged Mongoose build), hex editor, system editor with the
  five adapters and server-side preview, routes (all four
  generators), borders, regions, allegiances, filters ledger UI, sector layout (insert and
  remove rows and columns as layout, not identity), settings schema, server history
  (snapshot before bulk actions and daily; restore), file export and import of the overlay
  v3 document for portability, TSV and XML export.
- **Out:** campaign, sharing, player views.
- **Storage:** each universe is its own Durable Object database; every tree is a
  content-addressed object in R2 written by the platform the moment it is generated
  (`architecture.md` §5).
- **Sync:** `markChanged` feeds an outbound queue flushed as one batched `PATCH` with `rev`;
  edited trees travel inline and are hashed server-side; the server is the truth; the client
  is in-memory. Signed-out users get the viewer plus "sign in to build".
- **Done when:** the user story runs end to end on production; a universe with a full
  generated sector (about 440 systems) round-trips through export and import byte-stable;
  a forced network drop mid-edit loses nothing after reconnect; the Durable Object holds
  pointer rows and R2 holds objects exactly as `data_model.md` says; a snapshot of that
  universe is under 1 MB.

### Slice 3 — Campaign
The referee's instrument, per `campaign_manager_plan.md` §2 data model v2.
- **In:** records with links, anchors to system, body or another record, dated events on
  the stardate axis, vessels, visibility (referee or players), images to R2 with the
  existing resize pipeline, the locator line, timeline at full width, the party.
- **Out:** sheets that need rules Johnny has not supplied (they degrade to free-form, never
  invent), player accounts.
- **Done when:** the sample campaign loads, every record type is created, linked, located
  and found by search; images survive a reload; a 10,000-record universe lists and searches
  without jank.

### Slice 4 — Sharing
Packages and the published player view.
- **User story:** I select a subsector and three NPCs, click Publish, name it, and a friend
  browses the catalogue, installs it into their universe at the same hexes, resolving two
  conflicts field by field. I publish a players' view of my universe and send my table the link.
- **In:** package = overlay subset at fixed hex ids with a manifest (edition, engine
  version, truth version, kinds); publish = immutable version to R2; catalogue with search
  and tags; install = merge transaction with conflict resolution (theirs, mine, per field)
  using the field compare from the legacy chart-revert; players' publish = fog-of-war
  filter at publish time to static files; report and takedown.
- **Done when:** publish, browse, install and player publish run on production; installing
  the same version twice is a no-op; a takedown removes the listing and the files.

### Slice 5 — Merge
The shared universe grows.
- **In:** propose a package against canonical; a diff view for the reviewer; accept
  produces truth version N+1 via the truth builder; builders pinned to N see a migration
  offer with a diff and migrate per hex.
- **Done when:** one real proposal has been reviewed and released as a new truth version
  and a pinned universe has migrated to it.

### After 5 (not planned in detail)
Relocation of packages; Obsidian export; live co-editing with Durable Objects; player
accounts and journals.

## 5. Order and milestones

| Milestone | Visible result |
|---|---|
| M0 Foundation | `traveller.voyage` holding page; `/api/health`; truth v1 built and hosted; all engines ESM with parity |
| M1 Viewer | public read-only universe; the legacy GitHub Pages app still serves builders |
| M2 Builder | accounts; the legacy app is retired for new work and left online as an archive |
| M3 Campaign | referee workspace |
| M4 Sharing | catalogue, install, player links |
| M5 Merge | first community contribution in canonical |

The bugfix pass on the legacy tree stopped after persistence v2 Step 2 (2026-10-02). The
legacy tree is frozen; it is deleted from the repo at M2.

## 6. Document map

| File | Holds |
|---|---|
| `manifesto.md` | the rules every session obeys and their checks |
| `plan.md` | this file |
| `architecture.md` | stack, topology, repo layout, Cloudflare configuration, sync model |
| `data_model.md` | D1 schema, R2 key schemes, truth, overlay and package formats |
| `api.md` | every endpoint by slice, envelope, auth, errors |
| `design_reference.md` | the sci-fi look: tokens, components, motion, with the legacy sources named |
| `feature_inventory.md` | every legacy feature and its verdict |
| `slice_0_foundation.md` | the slice 0 recipe |
| `slice_N_*.md` | written when slice N starts |
| `campaign_manager_plan.md` | campaign data model v2 and feel (still the source for slice 3) |
| `persistence_v2.md`, `bugfix_pass.md` | legacy; the overlay document §2.1 remains the contract |

## 7. Open items for Johnny

1. X OAuth 2.0 app credentials as Worker secrets (`TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`); Discord and Google later.
2. Cloudflare account: D1 database, the two R2 buckets (`voyage-public`, `voyage-private`),
   custom domains `traveller.voyage` and `cdn.traveller.voyage`.
3. Which sectors the first truth build includes (today: Spinward Marches; `fetch.js` can
   pull more).
