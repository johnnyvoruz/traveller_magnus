# Lane C — read-only: why does Regina read −84 °C, "Ethane", and desert?

Issued 2026-10-12 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md` (the Johnny Protocol binds here more than anywhere: no Traveller rule from
memory, engine output is pinned, `rules/` and the engines change only on Johnny's
word), `directives/manifesto.md`, `directives/board.md`, `directives/lanes/C.md`, then
this file. No git but read-only, no deploy. **Change no file but your note and your
report.** Your ice-cap second look is accepted and is out in 1.1.10.

## The finding (Lane D's first-visit review, `findings/first_run_review.md` finding 3)

Regina, Spinward Marches 1910, the best-known world in Traveller. Its profile says
atmosphere 8, hydrographics 8, "Fluid Oceans". Its cards say −84 °C. Its surface map
is captioned "Ethane" and drawn as desert. A player reads the page as broken.
Johnny, 2026-10-12: yes, find out why, read-only first, with the rules text cited.

## Do

1. **See it on the live page** (https://traveller.voyage, `/s/Spinward_Marches/1910`,
   the mainworld): shots of the profile, the temperature cards, the surface map and
   caption, the orbit disc. Then read the stored truth for that body (the object the
   page loads): every field the temperature, the liquid and the map are drawn from.
   Quote them.
2. **Trace each wrong-looking value to the line that made it**, backwards from the
   screen: the caption and the map (`apps/web/src/surface/`, yours), the dossier's
   cards (name the files; not yours), the stored fields, and the engine code that
   computed them (`packages/engines/src/mgt2e_world_engine.js` and whatever it calls:
   orbit, star luminosity, albedo, greenhouse, the liquid choice). For each step say
   what went in and what came out for Regina, by running the engine headless on the
   truth build's inputs for that hex if you can (the pinned seed and settings are in
   `tools/truth/`), not by reasoning alone.
3. **Say which kind of fault each one is**, and keep them apart:
   - the screen misreads a correct stored value (a browser fault: name the lane);
   - the stored value is what the engine's rule gives for the inputs, and the inputs
     are the problem (for one: the chart gives Regina's UWP, and the generated orbit
     or star puts the world outside where that UWP could be: say what the truth
     build does when a charted UWP and a generated orbit disagree, with the file);
   - the engine departs from the rules text: quote the table or paragraph in
     `rules/` and in `assets/` with the page, and the engine line, side by side;
   - the rules text itself gives this result, and the page is "right" by the book.
   State no rule you cannot quote from those files. Where the files are silent, say
   "not in rules/" and stop that thread.
4. **How wide is it.** Count, over the Spinward Marches' charted mainworlds in the
   stored truth, how many have a UWP atmosphere of 4 to 9 and hydrographics of 1 or
   more with a mean temperature below freezing or above boiling, or a liquid that is
   not water. A table of the twenty best-known (Regina, Efate, Jewell, Rhylanor,
   Mora, Trin, Glisten, Lunion, and others you can name from the data) with UWP,
   orbit, temperature, liquid.
5. **The held engine lines.** The working tree carries an uncommitted nine-line
   change in `mgt2e_world_engine.js` (water against ice, held by Johnny for the
   generator rebuild). Say whether it touches this at all. Do not edit or apply it.
6. **Options for Johnny**, each with what it would change, what it would cost (a
   truth rebuild, fixtures, a deviation entry, a version bump) and what it leaves
   wrong. Recommend one. Write the questions out in full.

## Owned files (this pass)

`findings/regina_temperature.md`, shots `kc_regina_*`,
`directives/reports/c_regina_temperature.md`. Nothing else.

## Gates

None (no product code). Say what you ran and how to run it again.

## Stop rule

Stop when the note and the report are written.

Write `directives/reports/c_regina_temperature.md` from `directives/reports/_TEMPLATE.md`.
Questions for Johnny written out in full, recommended answer first. After each
meaningful step append one line under Progress: "done: X. next: Y."

## Progress

done: the prompt is read. next: see Regina on the live page and read the stored body.
done: the live page and the v5 body are read. next: run the engine on the truth inputs.
done: the headless run matches the stored body. next: count the sector and take the shots.
done: the count and the shots are in. next: write the note and the report.
done: the report is written. next: stop.

