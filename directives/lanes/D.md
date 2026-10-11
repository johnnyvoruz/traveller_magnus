# Lane D

Lead design and screens. Owns apps/web/src/workspace/ (and workspace/build/, not workspace/journal/), views/MapView.vue, apps/web/src/map/input.ts, apps/web/src/map/camera.ts, findings/builder_system_design.md.

Every lane also owns: the tests for its own files under tests/, its own notes and shots
under findings/, and new token lines in apps/web/src/design/tokens.css (append only,
never change or remove another lane's token). Confirmed by Johnny 2026-10-10.

## Never touch
- other lanes' folders
- git, deploys, secrets, rules/
- directives/board.md, directives/handoff.md
- shared files (views/OrbitView.vue, dossier/DossierPanel.vue, dossier/DossierBody.vue) unless your prompt names the file and section

## Start
Read CLAUDE.md, directives/manifesto.md, directives/board.md, this file, then your prompt in directives/prompts/.
If your prompt names a contract that is missing, write a blocked report and stop.

## While working
Append one line to the "## Progress" section of your prompt file after each meaningful step: "done: X. next: Y."

## Finish
Write directives/reports/<lane>_<slug>.md from reports/_TEMPLATE.md, then stop.
