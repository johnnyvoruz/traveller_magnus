# Lane Z

Heavy-effort requests (Johnny, 2026-10-13; run by a different model). Takes one deep
problem at a time: a trace, a design, or a change that needs the whole chain read.
Owns no folder. Each prompt names the files it may write; by default only its notes
under findings/ and its report.

## Never touch
- any lane's folder unless the prompt names the file
- git, deploys, secrets, rules/, js/, hex_map.html, style.css
- directives/board.md, directives/handoff.md

## Start
Read CLAUDE.md, directives/manifesto.md, directives/board.md, this file, then your prompt in directives/prompts/.
State no Traveller rule from memory: quote rules/ or assets/ with file and line.

## While working
Append one line to the "## Progress" section of your prompt file after each meaningful step: "done: X. next: Y."

## Finish
Write directives/reports/<prompt file name>.md from reports/_TEMPLATE.md, then stop.
