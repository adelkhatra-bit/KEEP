import React from 'react';
import { AppState } from 'react-native';
import { cancelPushRegistration, listenForExpoPushTokenChanges, registerForPushNotifications } from '../services/pushNotificationService';
import { supabase } from '../services/supabaseClient';
import { isProfilePresenceForeground } from '../services/profilePresenceService';

let pushLifecycleOwnerActive = false;

/**
 * Keeps the native device registered without routing through an external API.
 * Mounted outside Navigation/App so it cannot affect the validated mobile UI.
 */
export default function PushRegistrationLifecycle() {
  React.useEffect(() => {
    if (!supabase || pushLifecycleOwnerActive) return undefined;
    pushLifecycleOwnerActive = true;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let registering = false;
    let owner: string | null = null;
    let generation = 0;
    let retryUsed = false;

    const register = async () => {
      if (!alive || !owner || registering || !isProfilePresenceForeground()) return;
      const attemptGeneration = generation;
      registering = true;
      if (retry) { clearTimeout(retry); retry = null; }
      const result = await registerForPushNotifications().catch(() => ({ ok: false, reason: 'unexpected_error' }));
      registering = false;
      if (!alive || attemptGeneration !== generation) {
        if (alive && owner) void register();
        return;
      }
      if (result.ok || retryUsed) return;
      if (!['network_error', 'expo_token_error', 'unexpected_error'].includes(result.reason ?? '')) return;
      retryUsed = true;
      retry = setTimeout(() => { void register(); }, 5 * 60 * 1000);
    };

    const setOwner = (next: string | null, reconnect = false) => {
      if (owner === next && !reconnect) return;
      generation += 1;
      cancelPushRegistration();
      owner = next;
      retryUsed = false;
      if (retry) { clearTimeout(retry); retry = null; }
      if (owner) void register();
    };
    const restoreGeneration = generation;
    void supabase.auth.getSession().then(({ data }) => {
      if (generation === restoreGeneration) setOwner(data.session?.user?.id ?? null);
    }).catch(() => {});

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user?.id) setOwner(null);
      else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') setOwner(session.user.id, event === 'SIGNED_IN');
    });

    // iOS peut faire évoluer/régénérer le token après une mise à jour,
    // un changement de profil de provisioning ou un retour depuis Réglages.
    // À chaque retour au premier plan, republier le token réel au serveur.
    const stopTokenListener = listenForExpoPushTokenChanges();

    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !alive) return;
      if (owner) void register();
    });

    return () => {
      alive = false;
      cancelPushRegistration();
      pushLifecycleOwnerActive = false;
      if (retry) clearTimeout(retry);
      listener.subscription.unsubscribe();
      stopTokenListener();
      appState.remove();
    };
  }, []);

  return null;
}
