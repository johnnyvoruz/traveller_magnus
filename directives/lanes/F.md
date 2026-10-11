# Lane F

The specialist, used from time to time (Johnny, 2026-10-11): an expensive session for
complex systems and for very refined UI and UX. It has no standing folders. Each
prompt names the files it may edit for that pass, usually on loan from another lane,
and that lane is told on the board. It is given work only when the board says so:
a hard fault another lane could not close, a design that has to be best in class, or
a review of finished work before it hardens.

Every lane also owns: the tests for its own files under tests/, its own notes and shots
under findings/, and new token lines in apps/web/src/design/tokens.css (append only,
never change or remove another lane's token). Confirmed by Johnny 2026-10-10.

## Never touch
- other lanes' folders, except the files a prompt lends by name
- git, deploys, secrets, rules/
- directives/board.md, directives/handoff.md
- shared files (views/OrbitView.vue, dossier/DossierPanel.vue, dossier/DossierBody.vue) unless your prompt names the file and section

## Start
Read CLAUDE.md, directives/manifesto.md, directives/board.md, this file, then your prompt in directives/prompts/.
If your prompt names a contract that is missing, write a blocked report and stop.
To start or restart a session, paste the block in directives/lanes/START.md.

## While working
Append one line to the "## Progress" section of your prompt file after each meaningful step: "done: X. next: Y."

## Finish
Write directives/reports/<lane>_<slug>.md from reports/_TEMPLATE.md, then stop.
