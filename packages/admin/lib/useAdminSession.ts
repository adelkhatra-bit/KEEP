import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface AdminSession {
  userId: string;
  email: string | null;
}

/**
 * Session Supabase du Super Admin courant. Ne dit PAS si ce compte a un
 * rôle `admin_users` (ça, seul le backend le sait -- voir lib/adminAuth.ts) :
 * une session ici prouve juste "connecté", pas "autorisé". Les appels
 * adminApi.* renvoient honnêtement 403 si le compte connecté n'est pas
 * admin, affiché tel quel par chaque page.
 */
export function useAdminSession() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setSession(user ? { userId: user.id, email: user.email ?? null } : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const user = s?.user;
      setSession(user ? { userId: user.id, email: user.email ?? null } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
