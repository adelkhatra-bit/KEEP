import { supabase } from './supabaseClient';

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

const DEFAULT_PREFS: NotificationPreferences = {
  systemEnabled: true,
  djEnabled: true,
  socialEnabled: true,
  marketingEnabled: false,
};

export async function loadNotifications(profileId: string): Promise<KeepNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,title,body,data,read_at,created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  }));
}

export async function markNotificationRead(profileId: string, notificationId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(profileId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('read_at', null);
  if (error) throw error;
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
