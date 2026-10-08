import { supabase } from './supabaseClient';
import { AppState, Platform } from 'react-native';

export const PROFILE_PRESENCE_INTERVAL_MS = 5 * 60 * 1000;
let presenceOwner: string | null = null;
let lastPresenceAttempt = -Infinity;
let presenceInFlight = false;

export function resetProfilePresenceHeartbeat() {
  presenceOwner = null;
  lastPresenceAttempt = -Infinity;
}

export function isProfilePresenceForeground(): boolean {
  return Platform.OS === 'web'
    ? typeof document === 'undefined' || document.visibilityState === 'visible'
    : AppState.currentState === 'active';
}

export async function pingProfilePresence(): Promise<void> {
  if (!supabase || presenceInFlight || !isProfilePresenceForeground()) return;
  presenceInFlight = true;
  try {
    const { data } = await supabase.auth.getSession();
    const owner = data.session?.user?.id;
    if (!owner || !isProfilePresenceForeground()) return;
    if (presenceOwner !== owner) {
      presenceOwner = owner;
      lastPresenceAttempt = -Infinity;
    }
    if (Date.now() - lastPresenceAttempt < PROFILE_PRESENCE_INTERVAL_MS) return;
    // Même une panne ne doit pas relancer le réseau à chaque retour au premier plan.
    lastPresenceAttempt = Date.now();
    await supabase.rpc('keep_profile_presence_ping');
  } finally {
    presenceInFlight = false;
  }
}

export type ProfilePresence = {
  lastSeenAt: string | null;
  online: boolean;
  // Adel (29/09/2026) : « on le voit déconnecté alors qu'il est connecté ».
  // false = présence illisible (RPC en erreur, ex. migration de présence
  // pas encore appliquée) : on n'affiche RIEN plutôt qu'un faux « Hors ligne ».
  known: boolean;
};

export async function loadProfilePresence(profileId: string): Promise<ProfilePresence> {
  if (!supabase || !profileId) return { lastSeenAt: null, online: false, known: false };
  const { data, error } = await supabase.rpc('keep_public_profile_presence', { p_profile_id: profileId });
  if (error) return { lastSeenAt: null, online: false, known: false };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    lastSeenAt: row?.last_seen_at ?? row?.lastSeenAt ?? null,
    online: Boolean(row?.is_online ?? row?.online),
    known: Boolean(row),
  };
}

export function formatProfilePresence(lastSeenAt: string | null, online: boolean): string {
  if (online) return 'En ligne';
  if (!lastSeenAt) return 'Hors ligne';
  const elapsed = Math.max(0, Date.now() - new Date(lastSeenAt).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (!Number.isFinite(elapsed)) return 'Hors ligne';
  if (minutes < 60) return `vu il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vu il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vu il y a ${days} j`;
  return `vu le ${new Date(lastSeenAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`;
}
