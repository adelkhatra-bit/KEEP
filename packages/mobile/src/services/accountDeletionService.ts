import { getSupabaseAccessToken, supabase } from './supabaseClient';

export async function deleteOwnKeepAccount(): Promise<void> {
  if (!supabase) throw new Error('Supabase indisponible.');
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error('Reconnecte-toi avant de supprimer ton compte.');

  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: {},
  });

  if (error || data?.ok !== true) {
    throw new Error(data?.message || error?.message || 'Impossible de supprimer le compte pour le moment.');
  }

  // Le jeton n'est plus valide après suppression côté serveur. Nettoyer la
  // session locale explicitement évite qu'un vieux refresh token réapparaisse
  // dans AsyncStorage au prochain lancement.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}
