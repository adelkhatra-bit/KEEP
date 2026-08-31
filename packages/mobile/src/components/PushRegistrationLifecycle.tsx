import React from 'react';
import { registerForPushNotifications } from '../services/pushNotificationService';
import { supabase } from '../services/supabaseClient';

/**
 * Keeps the native device registered without routing through an external API.
 * Mounted outside Navigation/App so it cannot affect the validated mobile UI.
 */
export default function PushRegistrationLifecycle() {
  React.useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const register = async () => {
      if (!alive) return;
      const result = await registerForPushNotifications().catch(() => ({ ok: false, reason: 'unexpected_error' }));
      if (!alive || result.ok) return;
      if (result.reason === 'permission_denied' || result.reason === 'simulator_no_push') return;
      retry = setTimeout(() => { void register(); }, 15000);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) void register();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user?.id) void register();
    });

    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      listener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
