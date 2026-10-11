# LOKI RELIABILITY & LEARNING CONTRACT — 2026-10-11

## Non-negotiable release gates
- Never declare mobile or desktop operational from CI alone: verify real login, audio permission, listening stop, playback, QR pairing, and server sync on actual devices.
- Never bypass failed checks or weaken authentication just to turn CI green. Separate guest and signed-in test paths; guest profile fields are deliberately read-only.
- Keep one canonical branch; preserve unrelated local agent work; merge only after checks pass.
- Each regression must have an error ID, reproducible steps, root cause, minimal fix, automated regression test, and proof of deployed version.
- Run desktop viewport and mobile viewport tests plus iOS native validation. No release claims without evidence.

## Approved delivery backlog
1. Authentication and Supabase reliability; CI and release gates; deploy/version proof.
2. Mobile/Desktop QR session pairing; shared account state and deduplication.
3. Microphone: local permission, explicit start/stop, resource release; single active device per session. Do not sync OS permissions or remotely activate microphones.
4. Recognition/playback latency and fallback; Solo/Battle audio and return; chat keyboard/autoscroll/reply; stories, notifications and payments.
5. Internationalize UI, bot, notifications, accessibility and RTL. Audit hardcoded strings.
6. Global music discovery: metadata index (including obscure historical recordings), deduplication and rights-cleared previews; do not equate metadata coverage with audio rights.
7. Artist studio: upload, cover, waveform excerpt, price/free choice, rights declaration, moderation and secure access.
8. Loki Pulse recommendations and bot contextual assistance, with opt-in feedback, quality metrics, privacy protection and rollback.

## Loki improvement loop (not self-modifying production code)
- Capture anonymized, consent-respecting signals: failure class, latency percentiles, user corrections, recognition confidence, duplicate count, support outcomes.
- Cluster recurring issues into a prioritized bug ledger; draft proposed changes and tests.
- Require CI + human approval for sensitive actions (payments, privacy, microphone, rights, production deployment).
- Measure before/after; roll back regressions. Never train on private audio, chat or identity data without explicit authorization.
- Record accepted decisions here and in the existing project error register; report validated, running, failed, deployed and still-open separately.

## Costs and limitations
- Prioritize existing/open infrastructure. No paid API, licensing, storage plan or subscription without explicit approval.
- Billions of indexed metadata records are not a guarantee of billions of playable excerpts; preview rights and API terms must be checked.

## Known regression 2026-10-11
- ERR-133: guest Discover shows a sign-in gate, not authenticated distance filters; CI must accept the correct guest screen.
- Follow-up: guest profile username is readonly; guest CI must validate lock, not attempt to edit. Authenticated profile persistence requires a separate signed-in test and remains OPEN until verified.
