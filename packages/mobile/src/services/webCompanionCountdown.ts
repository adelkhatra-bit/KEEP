export const WEB_COMPANION_DURATION_MS = 24 * 60 * 60 * 1000;

export function webCompanionRemainingMs(createdAt: string, now: number): number {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, created + WEB_COMPANION_DURATION_MS - now);
}

export function formatWebCompanionRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  return [hh, mm, ss].map((v) => String(v).padStart(2, '0')).join(':');
}
