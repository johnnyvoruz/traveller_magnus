# Stream N — the campaign, connected

Read `streams/README.md` first; it is the loop. Today only (Johnny, 2026-10-17), until he stops you.

**Area:** behaviour in `apps/web/src/workspace/` (records, the records list, party, timeline, journal,
links; not `market/`: Lane D's), `apps/web/src/campaign/`, command and shortcut registrations for the
campaign, tests under `tests/web/`. No new server route, no stored-data change, no migration: those
are proposals. The manifesto's Connected rule is the theme: "Universe, sector, hex, body, record,
package: each has a route. The back button works. If two things are related, the relation shows on
both pages." Use Lane M's shared look classes for anything new.

Lane M restyles some of the same files: the claims file keeps you apart.

## Queue
- [x] N0 **Finish "On the timeline" (your `n_record_page` "Needs from others"):** claim
  `CampaignPanel.vue` and `TimelineList.vue` (Lane M restyled TimelineList: apply on top of its
  version) and make a row open the timeline at that row, as your report sets out. Decided
  2026-10-17: legs stay off the timeline (your question 1, no); `WhereBlock`'s heading becomes a
  kicker everywhere (your question 2, yes; M's journal has kickers now).
- [x] N1 **A hex knows its campaign:** the dossier shows "In your campaign": the records placed at this
  hex or its worlds, and the journal entries that mention it (`mentions` holds hex keys too), each a
  link; hidden when empty. A new component; one mount line in `dossier/DossierBody.vue` (shared:
  name the line).
- [x] N2 **Record hover cards** (gap audit §4.4): hovering or focusing a record link (journal body,
  "Mentioned in", the links block, the records list) shows a small card: avatar, type, one line,
  where it is, "Open". One component, mounted once; Escape and leaving close it; on touch, a tap opens
  the record as today.
- [x] N3 **The records list grouped:** group by type with counts, groups collapse and remember it per
  campaign on this device; chips, search and sort still work; virtualize past 200 rows (§4.1).
- [x] N4 **The command palette for the campaign:** "New person", "New ship", … one per record type
  from the registry; "Find a record…" (by name); "Open the journal"; "Open the timeline"; "Go to the
  party". The registry pattern of `market/command.ts`; name the one hookup line.
- [x] N5 **Lists by keyboard:** the records list, the journal list and the timeline: arrow keys move,
  Enter opens, `/` goes to search; through the one shortcut registry, listed in the palette.
- [x] N6 **Links both ways:** if record A links to B with a role, B shows A with the reverse wording,
  computed, not stored. If it is already so, write "already built" and move on; if the reverse words
  need a rule or a decision, propose.
- [ ] (waiting on CampaignPanel.vue, E) N7 **The timeline narrowed:** by record type and "only this ship"; each row opens its record;
  the narrowing is in the URL.
- [ ] (record, entry, party, characters done; the timeline row waiting on CampaignPanel.vue, E) N8 **Every campaign thing has a URL that works cold:** a record, an entry, a timeline row, the
  party, a character sheet. A test per route renders it from a cold load; fix what doesn't.

- [ ] N12 **The scoped shortcut registry** (your N5 proposal, decided 15:40: yes, yours): a command may
  declare a `scope`; the Campaign panel says which scope has the keyboard; `handleKey` tries the active
  scope before the global commands; the palette lists the active scope's keys. Move the records list,
  journal list and timeline handlers over; `/` keeps the palette outside a list. `OmniBox.vue`: claim
  when Lane D has released it. Lane E's Help shortcut list (UX backlog U13) will read the same scopes.
  If your session ends first, leave it `[ ]`: another lane takes it.

## Found by me
- [x] N9 (found) **Hover cards where records are still bare:** (timeline done) the dossier's "Your records here" rows
  (`RecordsHere.vue`) and the timeline's record rows (`TimelineList.vue`) get `v-record-card`.
- [ ] (waiting on CampaignPanel.vue, E) N9b (found) **Hover cards in the dossier:** move the one `<RecordCard />` from `CampaignPanel.vue` to `shell/PanelHost.vue`, then `v-record-card` on `RecordsHere.vue`'s rows.
- [x] N10 (found) **The hover card names up to three connections** (plan §4.4 "2–3 relationships"),
  worded from the record's side, read from `links.ts`; nothing when it has none.
- [ ] (waiting on CampaignPanel.vue, E) N11 (found) **A missing entry is titled "New session":** `CampaignPanel.vue` `title` and `crumb` use `entryHeading(null)` for an entry id not in the journal; word it as a missing entry, as a missing record is.
- [x] N12 (found) **The journal mention filter's timing test flakes under the full run:** one cold timing of `filterMentions` over 2,000 records against 50 ms; warm once and take the best of five, same budget.
