# Agent B — two things before the character server can be pushed

Issued 2026-10-08 by the orchestrator. Your server, the link's address and the push list
are accepted. Two defects stand between it and production. Common rules:
`directives/swarm_restart.md`.

## 1. A clean checkout does not build (this blocks every character push)

`packages/engines/src/generated/rules/mgt2e_character_sheet_fields.d.ts` is hand-made and
sits in a directory `.gitignore` excludes (`packages/engines/src/generated/`). It is in
your push list, but it can never be committed. Production and CI start from a clean
checkout and run `npm run rules:gen`, which writes the `.js` and no `.d.ts`. There, the
Worker's import of that module is untyped, and Agent D's `workspace/character_sheet.ts`,
which dropped its `@ts-expect-error` because your `.d.ts` exists locally, fails
`vue-tsc`. The build would break on push.

- **`scripts/gen_rules_esm.js` writes the declaration**, for this file at least, every
  time it writes the module: the generator is the only thing allowed to put a file in
  that directory. Say whether you emit one for every generated rules file or only this
  one, and why. If you emit for the ship sheet's too, `workspace/ship_sheet.ts` still has
  an `@ts-expect-error` that would become unused: that file is Agent D's; tell me, do
  not edit it.
- **Prove it on a clean tree:** in a scratch copy made with `git archive` plus your
  files (never in the repo), with no `generated/` directory at all, run `npm run
  rules:gen`, then `npx tsc --noEmit -p apps/api` and the web's `vue-tsc`. Paste all
  three. A test in `npm test` that fails if the generator stops writing the declaration.

## 2. A duplicate ignores the name it is given

Agent E's "Make pregens" asks for "Kite 1" to "Kite 4" and gets four characters all named
"Kite (copy)": `service.ts` calls `copiedName(source)` whenever `from` is set and drops
the request's `name`. With `from` and a `name`, the name given is the name. With `from`
and no name, `copiedName` as now. A test for both.

## Check

`npm test`, `npm run check`, `npx tsc --noEmit -p apps/api`, pasted, and `RUN_API_TESTS=1`
on `tests/api/characters.test.js` on your own port. Rewrite
`findings/push/characters_server_files.txt` as paths only, one a line, no prose (it is
fed to `git add --pathspec-from-file`), without the `.d.ts`, with the generator script;
put your notes on mixed files in `findings/push/characters_server_notes.md`. No deploy,
no production call, no git. Stop and report.
