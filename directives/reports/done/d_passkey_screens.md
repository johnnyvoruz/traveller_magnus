# D passkey_screens report
Prompt: prompts/d_passkey_screens.md
Status: done. Parts 1 and 2 are built and passed in a browser with a virtual authenticator. Lane A's client arrived while I worked, so the screens now call `account/passkey.ts` and `session.gate`, and my stub is deleted. Two gaps in A's lent files are under Needs: sign-out never reaches the server, and a closed prompt isn't recognised.

## Changed files
- `findings/passkey_screens_design.md` (new): each screen and state, with every sentence a person reads.
- `apps/web/src/workspace/SignInCard.vue`: now a thin wrapper. The card body is its own chunk, loaded when a card is first shown. A focus asked for before it arrives is handed on.
- `apps/web/src/workspace/passkey/SignInBody.vue` (new): the card.
  - "Sign in with a passkey" first, with the one-line explainer.
  - "Create an account" opens a username field. The rule sits beside it and is checked as typed, on the browser only, because the contract forbids the availability route. The server's username sentences show at the field.
  - "I lost my passkey" opens the recovery-code form.
  - The providers sit below "Or sign in with another account".
  - No WebAuthn: one sentence.
  - Esc in a form returns to the card.
- `apps/web/src/workspace/passkey/AccountPage.vue` (new), the `/account` page:
  - signed out: the card;
  - after sign-up: the codes, then the second-passkey nudge;
  - a recovery session: the recovery screen;
  - signed in: the username (or "Choose a username"), passkeys (rename, remove, the last-way-in rule said before pressing, add), recovery codes (count, make new ones), linked accounts (link, unlink, the same rule), and sign out.
- `apps/web/src/workspace/passkey/RecoveryScreen.vue` (new), part 2:
  - before: what happened, what to do, "Add a passkey", and "Sign out" as the quiet second choice;
  - after: how many codes are left, and the offer to make new ones.
- `apps/web/src/workspace/passkey/CodesBlock.vue` (new): the ten codes in two columns, Copy, Download (a text file), and the lost-means-lost sentence.
- `apps/web/src/workspace/passkey/PasskeyAdd.vue` (new): "Name this passkey" and its ceremony. It is used by the nudge, the page and the recovery screen.
- `apps/web/src/workspace/passkey/words.ts` (new): every string, the username check, the last-way-in rules, the codes file, and the in-memory hand-off of a new account's codes from the card to the page.
- `apps/web/src/workspace/passkey/recovery.ts` (new): the route guard on `session.gate`.
- `apps/web/src/views/Account.vue`: the holding page is replaced by a thin view that loads `AccountPage` as its own chunk.
  - It puts the recovery guard on the router when the router loads it at start, through a dynamic import of `router.ts`. That line belongs in `router.ts` (see Needs).
  - I kept its two global rules (`h1`, `p`) as they were. The view is in the first chunk, so they have styled every screen until now.
- `tests/web/passkey_screens.test.js` (new), 10 tests:
  - the username rule as typed;
  - which refusals go to the field;
  - the last way in, both ways;
  - the count sentence;
  - the codes file;
  - the hand-off, used once;
  - the guard on `session.gate`, for a new route and for the open one;
  - the closed-prompt and no-WebAuthn words;
  - no email in any template.
- Deleted: my stub `workspace/passkey/client.ts` and its test, once A's report existed.
- Shots: `findings/ui_design_shots/kb15_*` (27). Pass scripts: `findings/passkey_pass_src/`.

## Gates
npm test:      1554 tests, 1530 pass, 1 fail, 23 skipped. The one failure is `vanilla flat map matches oracle pixel fixtures` (`tests/web/surface_map.test.js`, regina-w7 band-west-bot). It's in `surface/`, which is Lane C's ice-cap work in progress, not mine.
npm run check: pass (manifesto: clean)
typecheck:     pass. `npm run build` passes.

First chunk, the same build with and without my two screens (A's bundle fix is in both):

| Chunk | Before (`SignInCard.vue`, `Account.vue` as at the last push) | After |
|---|---|---|
| `index` js | 171.53 kB (gzip 57.88) | 171.25 kB (gzip 57.80) |
| `index` css | 24.70 kB | 23.42 kB |
| `SignInBody` | none | 15.89 kB, loaded when a card is first shown |
| `AccountPage` | none | 18.22 kB, loaded when `/account` opens |
| the passkey libraries (A's) | none | 12.53 + 32.09 kB, loaded at the first ceremony |

In the browser: the first page loads nothing of sign-in. Opening the pop-up loads `SignInBody` only. The first ceremony loads `better-auth` and `@better-auth/passkey`.

fourth gate:   pass, with the gaps below. Edge headless with the CDP virtual authenticator, on `http://localhost:5197` (my Vite, my cache), my API on 8797 with its own state, CDP 9397, inspector 9247. All are stopped.

**Local setup.** A passkey needed two things beyond the contract:
- `BETTER_AUTH_URL` set to the page's origin (`http://localhost:5197`), with the proxy keeping the page's Origin.
- `wrangler dev --host localhost:5197 --local-upstream localhost:5197`. Without it, wrangler rewrites the Origin to the route's zone, and the verify call answers "Invalid origin: http://traveller.voyage".

**On my stub** (pk1 to pk7), then **again on A's client** (pk8, pk9):
- **Sign up:** "kb15_Ranger", then "kb15_Bosun" on A's client.
  - While the ceremony runs, the button says "Waiting for your passkey…".
  - The page then shows the ten codes, with focus on the heading.
  - Continue is off until "I saved these codes" is ticked.
  - Nothing goes in storage.
  - On A's client, the session read that follows sign-up doesn't push the codes off the page.
- **The codes:** Copy says "Copied." Download saves `traveller-voyage-recovery-codes.txt` with the username, the date, the ten codes, what they're for, and the lost-means-lost sentence.
- **The nudge:** "Not now" goes on to the account page.
- **The username checks:**
  - "ad" isn't refused while typing.
  - "kb15-x": "Use 3 to 24 letters, digits, or underscores."
  - "Admin": "That username is reserved." Create is off.
  - A taken name: "That username is taken." at the field, in the alert colour, with focus back in the field.
- **Sign out, then sign in** with a passkey: works.
- **A second passkey:** "Phone" from the page. Both rows show, and Remove is on for both.
- **Rename:** the field opens with the name selected. Save, and focus returns to Rename.
- **Remove:** the row asks "Remove Laptop? You can't sign in with it after this.", with focus on "Keep it". After Remove, one is left and focus is on "Add a passkey".
- **The last one:** Remove is off and the row says "This is your only way to sign in. Add another passkey before you remove it." The server, asked directly anyway, answered 400 `last_passkey`.
- **Make new codes:** asks first, then shows ten with focus on the heading. Done shows "10 of 10".
- **Recovery:**
  - A bad code: "That recovery code is not valid."
  - A good code: the recovery screen, also when redeemed from the card on `/account` itself.
  - A reload on `/s/Spinward_Marches/1910`, or on `/packages`, lands on `/account` with the recovery screen. On A's client this comes from `GET /api/me` answering 403.
  - Adding "Desk" finishes it: "Passkey added. 9 of 10 recovery codes are unused." Then "Make new codes" and "Go to the map" both work.
- **Sign-out from a recovery session:** the screen leaves and shows the card. But see Needs: the server still holds the session.
- **A closed prompt:** on my stub, the muted "You closed the passkey prompt." On A's client it is "Auth cancelled" in the alert colour (see Needs). I simulated it with an authenticator that holds nothing for the site, which gives the same `NotAllowedError` as a person closing the prompt.
- **No WebAuthn:** "This browser can't use passkeys. Open this page in a browser that can." No providers are configured locally, so the providers row and Linked accounts didn't show, and I couldn't try link or unlink.
- **The sign-up limit:** the sixth options call in an hour answers 429. The card says "You can start 5 passkey sign-ups an hour from this network. Try again later." under the button, not at the field.
- **Keyboard:** Tab goes Sign in with a passkey, then Create an account, then I lost my passkey. Opening a form focuses its first field, and Esc returns focus to the button that opened it.
- **Widths:** the card in the Campaign panel at column, half and full, and at 520 px (no sideways scroll); the account page at 520 px.

## Contract published
none

## Needs from others
- **Lane A (`account/session.ts`, lent): sign-out never reaches the server.**
  - `signOut()` posts `/api/auth/sign-out` with no body, and better-auth answers **415**. My API's log shows four for four.
  - The screen shows signed out, but the cookie's session stays: `GET /api/me` still answered 200. For a recovery session it still answers 403, so the next load returns to the recovery screen.
  - The same call is in `session.ts` at the last push, so production sign-out is probably not ending sessions either.
  - Suggest `body: '{}'`, so `apiFetch` sends `content-type: application/json`. My stub did that and its sign-out passed.
- **Lane A (`account/passkey.ts`): a closed prompt isn't recognised.**
  - `signInWithPasskey()` returned `{ ok: false, code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'Auth cancelled' }`.
  - That is how `@simplewebauthn/browser` wraps Chromium's `NotAllowedError` (a closed prompt, or a timeout). better-auth's sign-in drops the `cause`, so A's check never sees it.
  - Suggest adding that code to the cancelled set. Until then, the card shows the library's "Auth cancelled" as an alert. The card already handles `ceremony_cancelled` quietly.
- **Lane A:** the passkey list has no date. If the "Added 12 October 2026" line is wanted, `listPasskeys()` would need to pass `createdAt`. The design note says the row has no date for now.
- **Orchestrator (`router.ts` owner):** the recovery guard belongs in `router.ts`, as one line: `guardRecovery(router)` from `workspace/passkey/recovery.ts`. Until it's lent, `views/Account.vue` installs it through a dynamic import of `router.ts` when the router loads the view at start. It works (a reload on any address lands on `/account`), but it's a workaround.
- **Lane B:**
  - Linking a provider. The contract names only `POST /api/auth/sign-in/social`, which A wraps as `startSocial`. It doesn't say whether, called while signed in, it links to that account or signs in as a new one. The Link button uses it, and I couldn't try it (no providers locally).
  - The local passkey recipe needs the wrangler flags above, added to the contract's note on `BETTER_AUTH_URL`.
- **Lane C:** `tests/web/surface_map.test.js` fails on one pixel band (regina-w7 band-west-bot).

## Questions for Johnny
none
