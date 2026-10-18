# Questions for Johnny

Open decisions that only you can make. Type your answer on the **Answer:** line under each question, save the file, and tell the orchestrator "answers are in". A few words is enough. Answered questions move to `decisions.md`.

Last updated: 2026-10-17 (the directives cleanup moved every answered question to `decisions.md`).

---

### 1. The legacy tree (asked 2026-10-17)

`CLAUDE.md` used to say the legacy single-file app (`hex_map.html`, `js/`, `style.css`) "is deleted
at milestone M2". The Builder is live and the legacy tree is still in the repo, read by the
parity tests (`tests/harness/legacy.js`) and as the reference for engine behaviour.

*Recommended: keep it frozen in the repo for now; decide its removal when the parity tests no
longer need it (the engines differ from it on purpose since e1.2 and every difference is listed).*

**Answer:**

### Older questions still without an answer (2026-10-04 to 2026-10-07)

No interim choice was written under these, so the cleanup left them open. Events may have overtaken them; "close it" is a fine answer.

#### G22. A claimed pregen: shared or given? (asked 2026-10-07)  (G. Jumps (from K12, parked))

A referee makes pregenerated characters for a convention and hands each to a player by a
link.

*Recommended: shared. The referee stays the owner and the player edits it live, so the
pregen can be handed fresh to the next table; a "give it to them" control makes the
player the owner when the referee wants that.*

**Answer:**

#### D2, asked again 2026-10-07  (G. Jumps (from K12, parked))

Players and convention tables need to sign in. Only X is switched on; the code already
supports Discord and Google once their keys are set. *Recommended: switch both on before
any player is invited.*

**Answer:**

#### D4. Three commits that include old-app files  (D. Direction)

Commits `089551d`, `595457c` and `0b96b80` (2 and 3 October) include files from the old app
alongside the new one. Were those your own pending old-app work being committed? (This is
the last open box on the slice 0 checklist that only you can close.)

**Answer:**
