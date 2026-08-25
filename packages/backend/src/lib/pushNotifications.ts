/**
 * Envoi réel des notifications push (demande explicite du 26/08/2026 -- "branche
 * la boucle complète"). `notifications`/`notification_preferences` existaient déjà
 * et alimentent le centre in-app réel (voir notificationService.ts côté mobile) --
 * ce module ajoute la partie qui manquait vraiment : la livraison push effective
 * via l'API Expo Push, à partir des tokens enregistrés dans `push_tokens`
 * (migration 0024).
 *
 * `pushed_at` (colonne ajoutée par la même migration) distingue "notification
 * créée" (toujours vrai, via le trigger `notify_on_follow` ou un futur appel
 * direct) de "réellement livrée en push" -- une notification sans token
 * enregistré reste simplement non poussée, jamais une erreur.
 */
import { getSupabaseAdminClient } from './supabaseAdmin';

interface PendingNotification {
  id: string;
  profile_id: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * API publique Expo -- aucune clé requise, l'authentification se fait par les
 * tokens push eux-mêmes (obtenus côté client via expo-notifications, liés au
 * projet Expo de l'app). Voir https://docs.expo.dev/push-notifications/sending-notifications/
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_PATTERN = /^ExponentPushToken\[.+\]$/;

async function sendExpoPush(tokens: string[], title: string, body: string, data: Record<string, unknown> | null): Promise<ExpoPushTicket[]> {
  const validTokens = tokens.filter((t) => EXPO_TOKEN_PATTERN.test(t));
  if (validTokens.length === 0) return [];

  const messages = validTokens.map((to) => ({ to, title, body, data: data ?? {}, sound: 'default' }));
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`Expo Push API a répondu ${res.status}`);
  }
  const json = (await res.json()) as { data: ExpoPushTicket[] };
  return json.data ?? [];
}

/**
 * Une passe : cherche les notifications pas encore poussées, envoie ce qui peut
 * l'être (token(s) enregistré(s) pour le profil concerné), marque `pushed_at`.
 * Jamais bloquant pour la création de la notification elle-même (déjà faite,
 * voir trigger SQL) -- une erreur d'envoi ici est loguée, jamais fatale pour
 * le reste du backend.
 */
export async function processPendingPushNotifications(): Promise<{ processed: number; sent: number; errors: number }> {
  const client = getSupabaseAdminClient();
  if (!client) return { processed: 0, sent: 0, errors: 0 };

  const { data: pending, error: pendingError } = await client
    .from('notifications')
    .select('id, profile_id, title, body, data')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(50);
  if (pendingError || !pending || pending.length === 0) return { processed: 0, sent: 0, errors: pendingError ? 1 : 0 };

  let sent = 0;
  let errors = 0;

  for (const notif of pending as PendingNotification[]) {
    try {
      const { data: tokenRows } = await client.from('push_tokens').select('token').eq('profile_id', notif.profile_id);
      const tokens = (tokenRows ?? []).map((r: { token: string }) => r.token);
      if (tokens.length > 0) {
        const tickets = await sendExpoPush(tokens, notif.title, notif.body ?? '', notif.data);
        const anyOk = tickets.some((t) => t.status === 'ok');
        if (anyOk) sent += 1;
      }
      // Marqué "poussée" même sans token (rien à livrer -- pas une erreur, juste
      // aucun appareil enregistré) -- jamais retenté en boucle indéfiniment.
      await client.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', notif.id);
    } catch (e: any) {
      errors += 1;
      console.warn('[KEEP][push] échec envoi notification', notif.id, e?.message);
    }
  }

  return { processed: pending.length, sent, errors };
}
