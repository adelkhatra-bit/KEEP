import { supabase } from './supabaseClient';
import { APP_NAME } from '../config/brand';

export type KeepNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferences = {
  systemEnabled: boolean;
  djEnabled: boolean;
  socialEnabled: boolean;
  marketingEnabled: boolean;
};

// Adel (03/09/2026) : "le Marketing devrait tout le temps rester activé,
// hormis pour ceux qui payent au moins 9,99€" -- obligatoire par défaut pour
// un nouveau profil (formule gratuite) ; NotificationsScreen le déverrouille
// et laisse le choix uniquement à partir de Creator Pro/Venue Pro.
const DEFAULT_PREFS: NotificationPreferences = {
  systemEnabled: true,
  djEnabled: true,
  socialEnabled: true,
  marketingEnabled: true,
};

function mapNotificationRow(row: any): KeepNotification {
  return {
    id: String(row.id),
    type: String(row.type || ''),
    title: String(row.title || ''),
    body: String(row.body || ''),
    data: row.data && typeof row.data === 'object' ? row.data : null,
    readAt: row.read_at ?? null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function loadNotifications(profileId: string): Promise<KeepNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,data,read_at,created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(mapNotificationRow);
}

export async function loadUnreadNotificationCount(profileId: string): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Écoute Supabase Realtime pour que la notification arrive pendant Écouter,
 * Playlists, Soirées, Profil, etc. La table notifications est publiée dans
 * supabase_realtime : aucun polling écran par écran n'est nécessaire.
 */
export function subscribeToNotifications(
  profileId: string,
  onInsert: (notification: KeepNotification) => void,
): () => void {
  const client = supabase;
  if (!client || !profileId) return () => {};

  const channel = client
    .channel(`keep-notifications-${profileId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => {
        if (payload?.new) onInsert(mapNotificationRow(payload.new));
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * Écoute INSERT/UPDATE/DELETE pour synchroniser les badges de compteur. Cela
 * évite qu'un badge reste à l'ancien chiffre après lecture ou suppression.
 */
export function subscribeToNotificationChanges(profileId: string, onChange: () => void): () => void {
  const client = supabase;
  if (!client || !profileId) return () => {};

  const channel = client
    .channel(`keep-notification-count-${profileId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function requestSocialLink(targetProfileId: string, platform: string): Promise<void> {
  if (!supabase) throw new Error(`Connexion ${APP_NAME} indisponible.`);
  const { error } = await supabase.rpc('request_social_link', {
    target_profile_id: targetProfileId,
    requested_platform: platform,
  });
  if (error) throw error;
}

async function runNotificationAction(action: 'read' | 'read_all' | 'delete' | 'delete_all', notificationId?: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('keep_notification_action', {
    p_action: action,
    p_notification_id: notificationId ?? null,
  });
  if (error) throw error;
}

export async function markNotificationRead(_profileId: string, notificationId: string): Promise<void> {
  await runNotificationAction('read', notificationId);
}

export async function markAllNotificationsRead(_profileId: string): Promise<void> {
  await runNotificationAction('read_all');
}

export async function deleteNotification(profileId: string, notificationId: string): Promise<void> {
  if (!supabase) return;
  // La suppression directe s'appuie sur la policy RLS notifications_delete_own.
  // Elle est plus robuste côté client que de dépendre exclusivement du cache RPC
  // PostgREST. En cas d'indisponibilité de cette route, on garde le RPC en secours.
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', notificationId);
  if (!error) return;
  await runNotificationAction('delete', notificationId);
}

export async function deleteAllNotifications(profileId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('profile_id', profileId);
  if (!error) return;
  await runNotificationAction('delete_all');
}

export async function loadNotificationPreferences(profileId: string): Promise<NotificationPreferences> {
  if (!supabase) return DEFAULT_PREFS;
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('system_enabled,dj_enabled,social_enabled,marketing_enabled')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { error: insertError } = await supabase.from('notification_preferences').insert({
      profile_id: profileId,
      system_enabled: DEFAULT_PREFS.systemEnabled,
      dj_enabled: DEFAULT_PREFS.djEnabled,
      social_enabled: DEFAULT_PREFS.socialEnabled,
      marketing_enabled: DEFAULT_PREFS.marketingEnabled,
    });
    if (insertError) throw insertError;
    return DEFAULT_PREFS;
  }
  return {
    systemEnabled: data.system_enabled,
    djEnabled: data.dj_enabled,
    socialEnabled: data.social_enabled,
    marketingEnabled: data.marketing_enabled,
  };
}

export async function saveNotificationPreferences(profileId: string, prefs: NotificationPreferences): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('notification_preferences').upsert({
    profile_id: profileId,
    system_enabled: prefs.systemEnabled,
    dj_enabled: prefs.djEnabled,
    social_enabled: prefs.socialEnabled,
    marketing_enabled: prefs.marketingEnabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id' });
  if (error) throw error;
}
