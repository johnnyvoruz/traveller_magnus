# Agent E — audit: colour literals the manifesto checker cannot see

Issued 2026-10-10 by the orchestrator. Common rules: `directives/swarm_restart.md`.
Read-only: you change no file but your findings note.

Agent C found that `scripts/check_manifesto.js` looks for hex colours only in CSS files
and in Vue `<style>` blocks. A colour literal in a `.ts` file, or in a Vue `<script>` or
`<template>`, passes `npm run check`. The rule is "no hex colours outside `tokens.css`".

Write `findings/checker_colour_audit.md`:
1. Every colour literal under `apps/*/src` and `packages/*/src` outside `tokens.css`
   that the checker misses: hex (`#rgb`, `#rrggbb`, with alpha), `rgb(`, `rgba(`,
   `hsl(`, and named colours passed to a canvas or a style. One line each: file, line,
   the literal, what it paints. Leave out anything that is not a colour (an id, a hash,
   an anchor, a test fixture).
2. A count per folder, and per owner: A (`builder/`, `campaign/`, `characters/*.ts`,
   `orbit/`), C (`surface/`), D (`workspace/`), E (`workspace/journal/`,
   `characters/screens/`), other.
3. Which of them are data and must stay literals (a palette table the Vanilla parity
   test pins by checksum, for example): name them and say why.
4. The exact change `scripts/check_manifesto.js` would need to catch the rest, as a
   patch in the note, **not applied**, with the list of files it would fail today.

Nothing is fixed in this pass. Stop and report with the counts.
