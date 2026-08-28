import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { consumeWebAuthAndOpenNative, subscribeToNativeAuthLinks } from '../services/authLinkHandoff';
import { supabase } from '../services/supabaseClient';

/**
 * Consomme les liens e-mail Supabase sans introduire une nouvelle navigation.
 * Le composant ne rend rien : il s'occupe uniquement du handoff sécurisé
 * Web <-> app native et laisse les stores/auth listeners existants réagir à la
 * session Supabase réellement créée.
 */
export default function AuthEmailLinkLifecycle() {
  useEffect(() => {
    if (!supabase) return undefined;

    if (Platform.OS === 'web') {
      void consumeWebAuthAndOpenNative(supabase).catch(() => {
        // Une URL expirée ne doit pas mettre KEEP en écran blanc. L'utilisateur
        // reste sur l'app et peut demander un nouveau lien depuis Connexion.
      });
      return undefined;
    }

    return subscribeToNativeAuthLinks(
      supabase,
      undefined,
      () => {
        // Même règle côté natif : le lien peut être redemandé sans casser l'app.
      },
    );
  }, []);

  return null;
}
