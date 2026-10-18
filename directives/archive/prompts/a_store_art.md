# Lane A — marketplace cover art: the brief, the prompts and the images

Issued 2026-10-15 by the orchestrator. You may be a fresh session with no memory. Read
`CLAUDE.md`, `directives/manifesto.md`, `directives/board.md`, `directives/lanes/A.md`,
then this file. Also read `directives/prompts/z_package_covers.md` (how covers are stored)
and `directives/prompts/d_storefront.md` (where they show). No git but read-only, no
deploy, no `rules/`.

This pass is art, not code. You are a Grok model, and Johnny expects you to make the
images with your own image generation.

## Johnny's words (2026-10-15)

- The marketplace "needs to be like an ecommerce storefront", with art made by the Grok
  agents, "will need art prompts".
- "If an image exists for a campaign item, use that art for the store." Sectors: "probably
  need a generic art or a screenshot of the sector"; publishers upload a screenshot for now.
- "Our Grok agents should just be able to do it normally. If not, let me know."
- Style: "a RPG concept art style. Don't focus on colours or everything feels too same-y."

## What the art is for

A package's cover is chosen in this order (Z builds it): the publisher's upload, then the
first image of the package's records, then **a default cover for its kind**. Your images
are those defaults, plus covers for four of the six example packages, whose records have
no images.

## Do

1. **Write the brief and every prompt first,** in `findings/art/store_art.md`:
   - **The house brief:** tabletop RPG concept art. Digital painting, visible brushwork,
     the look of a sourcebook's chapter-opening illustration. One clear subject that reads
     at 320 px wide. Grounded, used, lived-in science fiction: hard surfaces, working
     ships, people in practical clothes. 16:9, nothing important within 6% of an edge
     (cards crop slightly).
   - **Colour is not part of the brief.** Choose the light and palette for each subject
     from its scene (a dusty desert port at noon, a cold moon under a blue giant, a smoky
     bar under strip lights, a hull in a dock's sodium glow). Do not share one palette or
     one accent across the set, and do not use the app's cyan and red as a theme. Johnny's
     point is that a shared palette makes the store "feel too same-y".
   - **Never:**
     - text, letters, numerals, logos, insignia that read as words, or watermarks;
     - the Traveller logo or trade dress, or a copy of any official Traveller
       illustration, ship design or character;
     - a named artist's style ("in the style of ...");
     - real people or recognisable actors;
     - gore or sexual content.
   - **One prompt per image,** each with the subject, setting, light, framing and what
     must stay out. Write it so a person could paste it into Grok and get the same kind of
     picture.
2. **The default covers, one per family of kinds** (kind is free text; D maps it to a
   family by keyword, and you give D the list):
   - `map`: a star chart or sector seen as concept art (sector, subsector, sector piece,
     map, region). Not a hex grid with labels; no text.
   - `system`: one star system: a world, its moons or a gas giant, a station.
   - `ship`: a starship (ships, ship, vessel, fleet).
   - `people`: a few characters (people, contacts, NPCs, crew, characters).
   - `patrons`: a patron and a job being offered (patrons, jobs, missions, hooks).
   - `organization`: a faction, corporation or house (organization, faction, corporation,
     noble house).
   - `adventure`: a scene of action or discovery (adventure, scenario, event, campaign).
   - `other`: a starport concourse with travellers and cargo, the fallback.
3. **Covers for four example packages** (read each `listing.json` and `campaign.json`
   under `tools/examples/packs/` so the picture fits what is inside):
   - Free traders of the Marches (`ships`);
   - Jewell patrons (`patrons`);
   - Regina highport contacts (`people`);
   - The Glass Hand (`organization`).
   Z takes screenshots of the map for the other two (Feri terraces and Hollow Verge).
4. **Make the images.** For each prompt, make at least two and keep the better one. Lay
   all the kept images out on one contact sheet,
   `findings/art/store_art_contact_sheet.png`, with the file names under them. Check the
   set as a whole: if two read as the same colour or the same scene, redo one.
5. **Save them in two forms:**
   - the originals in `findings/art/originals/<name>.png` (these never ship);
   - the shipped WebP files, made with `sharp` (already in `node_modules`; add no
     dependency) from a script of yours under `findings/art/`:
     - defaults: `apps/web/public/covers/<family>.webp` (1280×720) and
       `apps/web/public/covers/<family>_640.webp` (640×360);
     - examples: `tools/examples/covers/<pack-folder>.webp` (1600×900) and
       `<pack-folder>_640.webp` (640×360).
   - Size caps: 1280 and 1600 px versions at most 220 KB, 640 px versions at most 60 KB
     (lower the quality until they fit). Strip all metadata.
6. **Check each image by eye at 640 px for hidden text** (generators sneak in signs,
   hull lettering and signatures). An image with any legible or near-legible lettering is
   redone, not kept.

## If you cannot make images

If this session cannot make an image, or can make one but cannot save it as a file on
disk, **do not work around it**: do not install packages, call web services, or ask for
or write any API key. Write step 1 in full, write the report as **blocked**, and say
exactly what is missing (for example "no image tool in this session" or "images appear
in chat but cannot be written to disk"). The orchestrator takes that to Johnny, as he
asked.

## Owned files (this pass)

`findings/art/` (new), `apps/web/public/covers/` (new), `tools/examples/covers/` (new, the
image files only), `directives/reports/a_store_art.md`. Nothing else, including
`listing.json` (Z adds the cover line).

## Gates

- The contact sheet, and every shipped file listed in the report with its pixel size and
  bytes (a script prints them).
- `npm test` and `npm run check` still pass (you add no code under `apps/*/src`).
- The report says, for each image: the prompt's name, how many tries, and why you kept
  this one.

## Stop rule

Stop when the images are saved and the report is written. Johnny reviews the contact
sheet before D's storefront shows any of them. Write `directives/reports/a_store_art.md`
from `directives/reports/_TEMPLATE.md`. After each meaningful step append one line under
Progress: "done: X. next: Y."

## Progress

done: house brief and twelve prompts in findings/art/store_art.md. next: generate two takes of each cover.
done: twelve covers chosen after text and subject checks. next: export WebP, the contact sheet, and the gates.
done: export, contact sheet, 640 check, and gates. next: the report.
done: report written at directives/reports/a_store_art.md. next: stop.
