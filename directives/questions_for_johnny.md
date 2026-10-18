# Questions for Johnny

Open decisions that only you can make. Type your answer on the **Answer:** line under each question, save the file, and tell the orchestrator "answers are in". A few words is enough ("yes to all" works). Answered questions move to `decisions.md`.

Last updated: 2026-10-18 09:40.

---

## The trade procedure (Lane Z's ZT5, `apps/web/src/campaign/trade.ts`, from `rules/mgt2e_trade.json` and `assets/trade.txt`)

These are readings of the rules text; nothing is decided until you answer. Each is built to the recommendation for now and is one line to change.

84. **Starport D, E and X:** the text gives a supplier DM only for A (+6), B (+4) and C (+2) (lines 333 to 335). Are D, E and X DM+0? *Recommended: yes.*
**Answer:**

85. **Does the starport DM also apply to black market and online supplier searches,** or only the ordinary supplier? Line 331 says "finding a supplier". *Recommended: all three.*
**Answer:**

86. **The Population DM on quantity:** on the dice before the multiplier, (2D-3) x 10, or on the final tons? *Recommended: on the dice, (2D-3) x 10.*
**Answer:**

87. **A black market supplier:** only illegal goods (no Common Goods), with as many random 1D rolls as the Population code? Line 404 says "any randomly rolled" with no count. *Recommended: yes to both.*
**Answer:**

88. **A local broker's skill "2D/3"** (lines 357 and 364): round down or up? *Recommended: down.*
**Answer:**

89. **"Use only the largest" when the DM is negative** (for example Common Consumables at an Asteroid, -4): the largest DM that applies, even if negative? *Recommended: yes.*
**Answer:**

90. **A local ban's Law Level Sale DM:** on the sale only, not inside the purchase roll's "minus Sale DM"? Lines 444 to 452 speak of selling on the banned world. *Recommended: yes, sale only.*
**Answer:**

91. **The text's Industrial example** (lines 409 to 419) leaves out Vehicles (D66 56), which the table says is available on Industrial worlds. Does the table win? *Recommended: yes.*
**Answer:**

92. **The printed-name-to-trade-code table** (your 20:27 answer to question 12 asked for one, for you to approve). Z's: Agricultural = Ag; Asteroid = As; Desert = De; Fluid Oceans = Fl; Garden = Ga; High Pop or High Population = Hi; High Tech or High-Tech = Ht; Ice Capped or Ice-Capped = Ic; Industrial = In; Low Pop or Low Population = Lo; Low Tech = Lt; Non-Agricultural = Na; Non-Industrial = Ni; Poor = Po; Rich = Ri; Water World = Wa. "All", "Amber Zone" and "Red Zone" are not trade codes. *Recommended: approve.*
**Answer:**

## Living Systems Comms (Lane Z's ZC1; Z wrote these as 92 to 94)

93. **Three terse high-law customs lines** (customs-085, 089, 098): keep them? They are procedural inspector lines, not threats. *Recommended: keep.*
**Answer:**

94. **Five alien-flavoured lines** (market-156, 157, 158; ship-116, 141): traders and crews with an alien flavour, naming no species or polity. Keep them? *Recommended: keep.*
**Answer:**

95. **The mix:** 60% made-up conversations and 40% lines from the 1,178-line corpus, when both have something not yet heard. Right for now? *Recommended: yes; tune it once you have heard it.*
**Answer:**

## Freight, passengers and mail (Lane Z's ZT6, `campaign/traffic_lots.ts`; Z wrote these as 95 to 101)

96. **Mail's "Freight Traffic DM":** each of the three freight rolls has its own size DM (Major -4, Incidental +2). Is the DM for mail only the shared part (the check, both worlds, the distance)? *Recommended: yes, the shared part.*
**Answer:**

97. **"World is TL of 5 or less"** (`assets/trade.txt` line 282): the world the mail leaves from? *Recommended: yes.*
**Answer:**

98. **"Each parsec of destination past the first"** (lines 112, 191): applied once per roll, not once per world, although it sits under "for both source and destination worlds"? *Recommended: once.*
**Answer:**

99. **Steward levels:** counted per passage class, each rounded up, then added (11 High and 3 Middle need 2 + 1 = 3)? *Recommended: yes.*
**Answer:**

100. **"Cannot usually exceed the number of people resident"** (lines 122 to 128): leave it to the referee rather than cap it? A screen could warn when the source world's Population code is 1 or less. *Recommended: don't cap.*
**Answer:**

101. **Fares past 6 parsecs:** none, since the table stops at 6? *Recommended: yes.*
**Answer:**

102. **A Chief Steward check with no Steward skill aboard:** DM+0, not the untrained -3? *Recommended: yes.*
**Answer:**

## The look and the players screens

103. **Neon city lights at tech level 15:** about 36% of districts take the neon accent; the rendering notes say most districts are neon at 15. Keep neon a minority? *Recommended: yes, keep it an accent (as you saw it), and the notes change to match; more colour in a second round if you want it.*
**Answer:**

104. **The invite link after a reload:** the referee's Players section can't show whether a link is live after a reload (no route reads it); it works, with one extra press. Add a small read of the live link? *Recommended: yes (Lane B, small).*
**Answer:**

## The referee's AI (105 to 108 answered 10:00; paste door added 10:15)

109. **When agent access (the token door) turns on.** Pasting your AI's reply needs only your sign-in, so it can ship while agent access is off. The token door lets your AI send proposals itself (MCP or HTTPS with a token you make on an Agent access page). 1.2.7 ships it off, and the Agent access page and the Proposals list aren't built yet. Turn it on when those screens ship (the release after 1.2.7 at the earliest), with the cost alert from the spec in place? *Recommended: yes, on with the screens, not before.*
**Answer:**
