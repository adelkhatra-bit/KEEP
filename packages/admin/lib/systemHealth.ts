export type HealthService = {
  provider: string;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
  metadata?: Record<string, unknown>;
};
export type SystemHealth = {
  services: HealthService[];
  daily: { new_reports: number | null; failed_emails: number | null; push_no_device: number | null; waiting_qr: number | null };
  notifications: Array<{ id: string; title: string; created_at: string; read_at?: string | null }>;
};

export function healthState(service: HealthService, now = Date.now()) {
  if (service.status === 'ERROR') return 'ERROR';
  const checked = Date.parse(service.last_checked_at ?? '');
  if (!Number.isFinite(checked) || checked > now + 60000 || now - checked > 10 * 60000) return 'UNKNOWN';
  return service.status === 'OK' ? 'OK' : 'UNKNOWN';
}

export function healthIntegrationHref(provider: string) {
  const keys: Record<string, string> = {
    ACRCLOUD: 'ACRCLOUD_ACCESS_KEY', BREVO: 'BREVO_API_KEY', YOUTUBE: 'YOUTUBE_API_KEY',
    GOOGLE_TRANSLATE: 'GOOGLE_TRANSLATE_API_KEY', APPLE_MUSIC_TOKEN: 'APPLE_MUSICKIT_PRIVATE_KEY',
  };
  return keys[provider] ? `/integrations#integration-${keys[provider]}` : '/operations';
}

export function parseSystemHealth(value: unknown): SystemHealth {
  const data = value as SystemHealth | null;
  if (!data || !Array.isArray(data.services) || !data.daily || !Array.isArray(data.notifications)) throw new Error('Santé indisponible · réponse invalide');
  for (const row of data.services) {
    if (typeof row.provider !== 'string' || typeof row.status !== 'string' ||
      !(row.last_checked_at === null || typeof row.last_checked_at === 'string') ||
      !(row.last_error === null || typeof row.last_error === 'string')) throw new Error('Santé indisponible · service invalide');
  }
  for (const row of data.notifications) {
    if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.created_at !== 'string') throw new Error('Alertes indisponibles · réponse invalide');
  }
  for (const key of ['new_reports', 'failed_emails', 'push_no_device', 'waiting_qr'] as const) {
    const count = data.daily[key];
    if (count !== null && (!Number.isSafeInteger(count) || count < 0)) throw new Error('Résumé indisponible · compteur invalide');
  }
  return data;
}
