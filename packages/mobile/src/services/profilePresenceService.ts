import { supabase } from './supabaseClient';

export type ProfilePresence = {
  lastSeenAt: string | null;
  online: boolean;
};

export async function loadProfilePresence(profileId: string): Promise<ProfilePresence> {
  if (!supabase || !profileId) return { lastSeenAt: null, online: false };
  const { data, error } = await supabase.rpc('keep_public_profile_presence', { p_profile_id: profileId });
  if (error) return { lastSeenAt: null, online: false };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    lastSeenAt: row?.last_seen_at ?? row?.lastSeenAt ?? null,
    online: Boolean(row?.is_online ?? row?.online),
  };
}

export function formatProfilePresence(lastSeenAt: string | null, online: boolean): string {
  if (online) return 'En ligne';
  if (!lastSeenAt) return 'Hors ligne';
  const elapsed = Math.max(0, Date.now() - new Date(lastSeenAt).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 2) return 'Actif à l’instant';
  if (minutes < 60) return `Actif il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Actif il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Actif il y a ${days} j`;
  return `Actif le ${new Date(lastSeenAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`;
}
