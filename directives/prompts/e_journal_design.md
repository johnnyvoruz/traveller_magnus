# Agent E — the journal's screens, on paper first

Issued 2026-10-06 by the orchestrator. Your liquid row and the ribbon are accepted and
pushed (`d4bb7e8`). This step is **design only: no file under `apps/` or `packages/`
changes.**

## Why

The journal is the next step of the campaign slice (`slice_2_campaign.md` K7): the
referee's sessions, notes, handouts and rumours, dated from the campaign clock and tied to
where the party is. Agent A is writing its data now (`prompts/a_journal_1.md`: read it for
the entry's exact fields); Agent B stores it next. When both are in, you build the screens
from the design you make here.

## Read first

- `campaign_manager_plan.md` §2.4 (the entry), §2.5 (text with links), §8 (the journal),
  §4 (where it sits in the workspace). That plan was written for the legacy app: take the
  behaviour, not the file names.
- `findings/campaign_workspace_design.md` and the built workspace in
  `apps/web/src/workspace/` (read only): the lists, the record page, the Party tab, the
  clock editor. **That is the design language. The journal is one more part of the same
  workspace, not a new style.** `design_reference.md` and `manifesto.md` for the rest.
- `shell/pane.ts` for how a pane is addressed, so the journal and one entry each have an
  address.

## Design, to `findings/journal_design.md`

1. **Where it lives.** A Journal tab in the campaign pane beside the ones there now. Show
   the pane at column, half and full width, and in a 520 px window.
2. **The list.** Newest first. A session shows its number, title, in-fiction date
   (`DDD-YYYY`) and the real date; a note, a handout and a rumour each read differently at
   a glance, by icon and tag, not by colour alone. A filter by kind. Empty state. What an
   untitled note shows (the entry's title may be empty: propose the rule).
3. **"New session", in one press.** It takes the next session number, the campaign date as
   the in-fiction date, today as the real date, and the party's place as its anchor, and
   opens ready to type. "New note" likewise, undated unless the referee dates it.
4. **The entry page.** Title, body (plain text, line breaks kept; the `[[…]]` tokens of
   §2.5 drawn as chips that open the record or system they name), kind, both dates, the
   anchor (shown as the place it is, and a press goes there, as a record's anchor does
   today), the referee/players switch as records have it, delete with the workspace's
   existing Undo toast. Saving follows what the record page does today: say which.
5. **Not in this step, but leave room and say where:** typing `@` to insert a token, the
   "Mentioned" rail, images on handouts, "Promote to job" on a rumour, players' notes and
   replies. One line each on where it would go.
6. **Mockups**, as static HTML rendered to PNG with the real `tokens.css`, in
   `findings/ui_design_shots/kj_*.png`: the list (with eight mixed entries), the empty
   list, a session open, a new note, each at column and half width, and the list at
   520 px. Keyboard order written out for the list and the entry page. Every colour pair
   named for the contrast test.
7. **Questions for Johnny**, at the end, each with your recommended answer first. Only
   what truly forks the design.

## Not yours, and the usual

No source edits. `workspace/`, `views/`, `orbit/`, `campaign/`, `packages/` are read only
in this step (Agents A and D are in them). No git. Stop and report: the design file, the
mockups, the questions.
