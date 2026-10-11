# E campaign nav avatar report
Prompt: prompts/e_campaign_nav_avatar.md
Status: done

## Changed files
- apps/web/src/workspace/crumb.ts: the trail, the list label, and circle or square by kind.
- apps/web/src/workspace/CampaignCrumb.vue: the dossier crumb in the panel eyebrow. Middle ellipsizes. The page name does not.
- apps/web/src/workspace/RecordAvatar.vue: one avatar at head, row, and chip.
- apps/web/src/workspace/CampaignPanel.vue: the crumb, and Escape one level up. The key stops so the pane does not also close.
- apps/web/src/workspace/list_state.ts: record and journal filter and search survive opening a page.
- apps/web/src/workspace/RecordPage.vue: the avatar is the head. "All records" is gone. Undo the delete stays.
- apps/web/src/workspace/RecordGallery.vue: avatar add, change, remove, and "Make this the avatar" on the strip.
- apps/web/src/workspace/images.ts: `withImageFirst` for the reorder test. The screen calls `makePrimary`.
- apps/web/src/workspace/CampaignList.vue, PartyPanel.vue, PersonCard.vue, RecordPicker.vue: the avatar in the list, the party, the card, and the picker.
- apps/web/src/workspace/journal/EntryPage.vue, MentionList.vue, JournalList.vue: mention chips and the @ list use the avatar. "All entries" is gone. The journal search is kept.
- tests/web/campaign_nav_avatar.test.js: crumb parts, shape, and reorder.
- findings/campaign_nav_avatar.md: the choices.

## Gates
npm test:      pass (1363 pass, 0 fail, 15 skipped)
npm run check: pass (manifesto: clean)
typecheck:     pass
fourth gate:   pass. `npm run build` passed (vue-tsc and vite). Own API on 127.0.0.1:8835 (persist `.tmp/e-mention-8833`) and own Vite on 127.0.0.1:5193 (cache `.tmp/e-avatar-vite`), both stopped after. Column, half, full, and 520. Crumb, browser Back, and Escape return to the list. Empty place avatar accepted an image, Change replaced the avatar, a second image became the avatar, and the image showed in the list, the party, and an @ mention. A place is a square. A person is a circle. Offline shows the image and hides Add and Change. Opening Captain Voss with 12 images: 7 ms, 7 ms, 8 ms. Worst is 8 ms. Shots: `findings/ui_design_shots/kc2_crumb_column.png`, `kc2_crumb_half.png`, `kc2_crumb_full.png`, `kc2_crumb_520.png`, `kc2_avatar_person.png`, `kc2_avatar_place.png`, `kc2_list.png`, `kc2_mention.png`, `kc2_offline.png`.

## Contract published
none

## Needs from others
none

## Not this pass
Map vessel marks and the orbit view do not use RecordAvatar.

At 12 images, Change stays disabled. A new file would be a thirteenth image. There is no replace-in-place.

A character sheet opened from a person is that person's page. The crumb is the person's.

## Questions for Johnny
1. The separator is `/`, the same as the dossier. Suggested answer: keep `/`.
2. At full width the middle part is left off, because the list is on screen. Suggested answer: keep that.
3. Change does nothing once a record has 12 images. Suggested answer: leave it. Add replace-in-place only if Change should swap the file.
4. People in the party use the chip (22 px). The ship uses the row (38 px). Suggested answer: keep the chip for people.
5. Change and Remove stay visible under the avatar, so a keyboard and a touch screen can reach them. Suggested answer: keep them visible.
