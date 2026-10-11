# Lane F

Parked.

Johnny: confirm exact folders, the never-touch list, and any lane-specific gates.

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
