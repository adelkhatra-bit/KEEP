# KEEP username authentication

Source unique: `adelkhatra-bit/KEEP` / `reconcile/claude-main-20260825`.

KEEP's main test login uses a public username plus password. No authentication e-mail is required for normal sign-up/sign-in. Supabase Auth remains the session/token authority; the private synthetic `@keep.local` e-mail is an implementation detail and must never be displayed as the user's public identity.

`Essayer gratuitement` remains device-local and must not call `signInAnonymously()` or create `auth.users` records. Sharing, QR and follow are account-only features.

Legacy anonymous profiles may be upgraded only when the request carries the original anonymous JWT for the same profile id. A username by itself must never be sufficient to claim an existing profile.

A public-profile `+ Suivre` click by a logged-out visitor must send the visitor to the single KEEP root with `__keep_auth=create&__keep_follow=<username>`. After successful sign-up or sign-in, KEEP inserts the follow once and clears the intent. Do not route logged-out follow through dynamic `/profile/...` pages.
