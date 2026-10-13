# Username and passkey sign-in

Written 2026-10-12. The screens lane builds from this file. Server code is in `apps/api/src/auth/`. Migration `apps/api/src/db/migrations/0012_passkey.sql`.

An account is a username and a passkey. No email is asked for, there is no password, and there is no two-factor step. Recovery is ten one-time codes, shown once. Linking Google, Discord, or X is optional.

The screen shows this sentence at sign-up, in the screen's own copy. The server does not return it:

> If you lose the passkey, the recovery codes, and every linked provider, this account cannot be recovered.

When the account has exactly one passkey, the screen asks the person to add a second one.

## Packages

`apps/web` depends on `better-auth` at `1.7.7` and `@better-auth/passkey` at `1.7.7`, both exact. `apps/api` depends on `@better-auth/passkey` at `1.7.7`. No two-factor package and no captcha package.

```ts
import { createAuthClient } from 'better-auth/client';
import { passkeyClient } from '@better-auth/passkey/client';

export const authClient = createAuthClient({
    baseURL: window.location.origin,
    plugins: [passkeyClient()],
});
```

The default base path is `/api/auth`. The browser sends cookies (`credentials: 'include'`). The page origin has to be the origin of `BETTER_AUTH_URL`. Production is `https://traveller.voyage`. A local browser passkey needs `BETTER_AUTH_URL` set to the page's origin (for example `http://localhost:8787`) in `apps/api/.dev.vars`. The hostname is `localhost`, not `127.0.0.1`. No new variable in `wrangler.toml`.

Start the local Worker with `wrangler dev --host localhost:<port> --local-upstream localhost:<port>`, and use that same port as the page. Without `--local-upstream`, wrangler rewrites the request `Origin` to the route's zone. `originCheckMiddleware` in `better-auth` (`dist/api/middlewares/origin-check.mjs`, `validateOrigin`) compares that header with the origin of `baseURL`. A mismatch is 403 `{ code: "INVALID_ORIGIN", message: "Invalid origin" }`. The log line is `Invalid origin: <the header value>`.

`apps/api/wrangler.toml` sets `BETTER_AUTH_URL = "https://traveller.voyage"`. `authOptions` passes that string as `baseURL`. `relyingParty` (`apps/api/src/auth/options.ts`) sets `rpID` to the hostname `traveller.voyage` and `origin` to `https://traveller.voyage`. The passkey plugin receives those two values. Verify uses `options.origin` as `expectedOrigin` (`@better-auth/passkey` `dist/index.mjs`), not the request `Host`. No `trustedOrigins` list is set, so the trusted origin is that base URL alone. A page at `https://traveller.voyage` matches both checks. The Worker does not choose `rpID` from the incoming host. A page on any other origin fails the origin check, and a ceremony whose client data origin is not `https://traveller.voyage` fails verify.

Do not call `POST /api/auth/sign-in/username`. That route expects a password, and this product has none. Do not call `POST /api/auth/is-username-available`. Its errors are the plugin's own sentences, and it does not use the reserved-name check below. Start the ceremony, or call `POST /api/auth/username`.

## POST bodies

Every better-auth POST expects `Content-Type: application/json`. The router allows only that type (`better-auth` `dist/api/index.mjs`, `allowedMediaTypes`). A request that carries a body and any other type, or no type, is 415 `{ code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type is required. Allowed types: application/json" }`. Send `{}` when the route's body is empty. `POST /api/auth/sign-out` is the exception: the Worker turns a missing or non-JSON content type into that empty JSON body before Better Auth sees it, so a cached page that posts no body still signs out. Success is still `{ success: true }`. A JSON body is left as it was.

## Two answer shapes

Routes under `/api/auth/*` answer in the better-auth shape: `{ message, code }` with the HTTP status of the error. A success body is the object named on that route. There is no `{ ok }` wrapper.

`GET /api/me`, `GET /api/providers`, and the recovery gate on every other `/api/*` path use the app envelope. Success is `{ ok: true, data }`. Failure is `{ ok: false, error: { code, message } }`.

## Username

One public handle. 3 to 24 characters, letters, digits, and underscore. Case is ignored and the stored value is lowercase. `profile.handle` is that value. Accounts that already exist keep the handle they have until they set a username.

| Code | Status | Sentence |
|---|---|---|
| `username_invalid` | 400 | Use 3 to 24 letters, digits, or underscores. |
| `username_reserved` | 400 | That username is reserved. |
| `username_taken` | 400 | That username is taken. |

Reserved names: `admin`, `api`, `support`, `user`.

## Relying party

`rpID` is the hostname of `BETTER_AUTH_URL`. `origin` is that URL's origin. The WebAuthn ceremony has to use that origin. `rp.name` is `Traveller.voyage`.

## Sign-up

Call this while signed out. `name` is the username.

1. `authClient.passkey.addPasskey({ name, createSession: true })`.
2. The client calls `GET /api/auth/passkey/generate-register-options?name=<username>`.
3. The browser runs the passkey ceremony.
4. The client calls `POST /api/auth/passkey/verify-registration` with `{ response, name, createSession: true }`.
5. `POST /api/auth/recovery/reveal` on that new session, then show the ten codes once.

The user row, the profile, the allowance row, and the recovery codes are written only after the ceremony verifies. Stopping after step 2 leaves no user row. `createSession: true` is required for a new account. Without it the verify call is 400 `session_required`: "Sign-up has to create a session after the passkey is verified." and no user row is written.

The stored email is `<user id>@users.invalid` and it is not verified. The screen does not display email.

A signed-out `GET /api/auth/passkey/generate-register-options` counts as one sign-up ceremony for that address, even when verify never runs. Five are allowed in a rolling hour. The sixth is 429 `signup_limit`: "You can start 5 passkey sign-ups an hour from this network. Try again later." A taken or reserved name is refused before that count. A signed-in add, a sign-in, and a recovery ceremony do not count. The address is `cf-connecting-ip` when Cloudflare sets it.

## Sign-in

`authClient.signIn.passkey()`.

1. `GET /api/auth/passkey/generate-authenticate-options`.
2. The browser runs the ceremony.
3. `POST /api/auth/passkey/verify-authentication` with `{ response }`.

Success is `{ session, user }`. `user.username` is the handle. The session cookie is set.

## Recovery

Codes are 12 characters from `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, shown as `XXXX-XXXX-XXXX`. The redeem call accepts the dashed form or the same characters without dashes. Each code works once. Five incorrect codes for that username in 15 minutes returns 429. The fifth incorrect response is the 429. A valid code clears that count.

1. `POST /api/auth/recovery/redeem` with `{ username, code }`.
2. Success is `{ mustAddPasskey: true }` and a session cookie.
3. `authClient.passkey.addPasskey({ name, createSession: true })` on that session. `name` here is a label for the new passkey, such as `Phone`. `createSession: true` is required so the recovery flag clears in the same transaction as the new passkey.

Until that verify succeeds, the session can call only:

- `GET /api/auth/passkey/generate-register-options`
- `POST /api/auth/passkey/verify-registration`
- `POST /api/auth/sign-out`

`POST /api/auth/sign-out` answers `{ success: true }` and ends the session. Every other `/api/auth/*` path, including `GET /api/auth/get-session`, is 403 `passkey_required`: "Add a passkey before you use the rest of this account." Any `/api/*` path that loads the session, including `GET /api/me`, is the same sentence in the app envelope, status 403, `error.code` `passkey_required`. The flag is a column on that session lookup. There is no second read. `GET /api/health` and `GET /api/providers` do not load a session, so they stay open. The screen learns that it must add a passkey from the redeem body, not from `GET /api/me`.

Reveal the codes on the sign-up session before any redeem. A recovery session cannot reveal or regenerate them.

| Route | Body | Success | Errors |
|---|---|---|---|
| `POST /api/auth/recovery/reveal` | none | `{ codes: string[10] }` once | 400 `recovery_shown`: These recovery codes have already been shown. |
| `POST /api/auth/recovery/regenerate` | none | `{ codes: string[10] }` | Replaces the unused set and returns the new codes in this body. The reveal envelope is deleted, so a later reveal is `recovery_shown`. |
| `POST /api/auth/recovery/redeem` | `{ username, code }` | `{ mustAddPasskey: true }` | 400 `recovery_invalid`: That recovery code is not valid. 429 `recovery_limit`: Too many incorrect recovery codes. Try again in 15 minutes. An unknown username uses the same invalid sentence. |

Regenerate and reveal need a normal session. A missing session is the plugin's unauthenticated error.

## A second passkey, rename, and remove

These need a normal session (not a recovery session).

| Call | Route | Body | Success | Refusal |
|---|---|---|---|---|
| Add | `addPasskey({ name, createSession: true })` | query `name` on generate; `{ response, name, createSession: true }` on verify | the new passkey | Same username errors when the caller is signed out. Signed in, `name` is only the passkey label. |
| List | `GET /api/auth/passkey/list-user-passkeys` or `authClient.passkey.listUserPasskeys()` | none | a JSON array. Use `id`, `name`, and `createdAt`. `createdAt` is the ISO 8601 time the row was stored. |  |
| Rename the label | `POST /api/auth/passkey/update-passkey` | `{ id, name }` | `{ passkey }` | `name` is required. |
| Remove | `POST /api/auth/passkey/delete-passkey` | `{ id }` | `{ status: true }` | 400 `last_passkey`: This passkey is the only way to sign in. Add another passkey, or link Google, Discord, or X, before you remove it. |
| Rename the username | `POST /api/auth/username` | `{ username }` | `{ username }` stored lowercase. `profile.handle` updates. The display name is left as it was. | The username table above. |
| Regenerate codes | `POST /api/auth/recovery/regenerate` | none | `{ codes }` | See the recovery table. |

The first passkey on a social account also writes recovery codes, the same way sign-up does. Call reveal once on that session.

## Linked providers

`POST /api/auth/sign-in/social` with `{ provider, disableRedirect: true }` starts a sign-in. `provider` is `google`, `discord`, or `twitter`. `twitter` is X. Success is `{ url, redirect }`. `url` is the provider's address. A provider that is not configured is 404 `PROVIDER_NOT_FOUND`.

That route does not read the session. Called while signed in, it still starts a sign-in. The callback signs the browser in as the provider's account. That can be a different account. It does not attach the provider to the account that is already signed in.

A signed-in person links a provider with `POST /api/auth/link-social` and `{ provider, disableRedirect: true, callbackURL }`. `callbackURL` is a page on this origin. Success is `{ url, redirect }`. The callback then adds the provider to the signed-in account and returns to `callbackURL`. A passkey account's email is synthetic, so linking allows a different email (`account.accountLinking.allowDifferentEmails`). Google, Discord, and X may link when the provider does not mark the email verified.

A provider account that is already linked to a different user is refused. The callback redirects to the error URL with `error=account_already_linked_to_different_user` and `error_description` set to "That provider is already linked to another account." An id-token link of the same case is 409 `{ code: "SOCIAL_ACCOUNT_ALREADY_LINKED", message: "Social account already linked" }`.

`GET /api/providers` is the app envelope. `data` is `{ twitter, discord, google }`, each a boolean.

`GET /api/auth/list-accounts` returns a JSON array, not an envelope. Each object has `id`, `providerId`, `accountId`, `userId`, `scopes` (an array of strings), `createdAt`, and `updatedAt`. Tokens are not included. `createdAt` and `updatedAt` are ISO 8601 strings. Reading `id` and `providerId` off each object is right. Unlink with `POST /api/auth/unlink-account` and `{ accountId }`, using the row `id`. Unlinking the only provider on an account that has no passkey is 400 `last_provider`: "This is the only linked provider on an account with no passkey. Add a passkey before you unlink it."

A signed-in Google, Discord, or X account sets a username with `POST /api/auth/username` and adds a passkey with `addPasskey`.

## GET /api/me

Same envelope as before. Previous fields stay: `id`, `email`, `role`, `profile`, `allowance`. Added:

| Field | Meaning |
|---|---|
| `username` | The handle, or `null` when the account has none yet. |
| `hasPasskey` | `true` when the account has at least one passkey. |
| `unusedRecoveryCodes` | How many recovery codes are still unused. |
| `linkedProviders` | `google`, `discord`, and `twitter` rows on the account. `twitter` means X. |

Do not display `email`. A passkey account's email is synthetic.

A recovery session does not receive this route. It receives 403 `passkey_required`.

## Other errors a screen can see

| Code | Status | Sentence | When |
|---|---|---|---|
| `session_required` | 400 | Sign-up has to create a session after the passkey is verified. | Verify of a new account without `createSession: true`. |
| `signup_limit` | 429 | You can start 5 passkey sign-ups an hour from this network. Try again later. | Sixth signed-out registration options call in an hour. |
| `passkey_required` | 403 | Add a passkey before you use the rest of this account. | Any route a recovery session is not allowed to call. |
| `last_passkey` | 400 | This passkey is the only way to sign in. Add another passkey, or link Google, Discord, or X, before you remove it. | Delete of the only passkey, and no Google, Discord, or X link. |
| `last_provider` | 400 | This is the only linked provider on an account with no passkey. Add a passkey before you unlink it. | Unlink of the only provider when there is no passkey. |
| `auth_unconfigured` | 500 | Sign-in is not configured. | `BETTER_AUTH_SECRET` is unset. |
| `session_failed` | 500 | The recovery session was not created. | Redeem verified the code and the session row was not created. |
| `passkey_unavailable` | 503 | Passkey sign-in is not available yet. | Migration 0012 is not on this database. Passkey, username, and recovery routes answer this. Social sign-in and the existing routes stay as they are. `GET /api/me` then carries `username: null`, `hasPasskey: false`, `unusedRecoveryCodes: 0`, and `linkedProviders: []`. |

A ceremony that fails inside the passkey plugin (a missing challenge cookie, a bad attestation) returns the plugin's own `code` and `message`. Those are not the sentences in the tables above.
