import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { APP_NAME } from '../config/brand';
import { getFeatureState, FeatureFlagState } from '../services/featureFlagService';
import { useUserStore } from '../store/useUserStore';
import { supabase } from '../services/supabaseClient';
import { createAuthService } from '../services/authService';

/**
 * 24/10/2026 (Adel) : la version ordinateur est RÉSERVÉE AUX DÉVELOPPEURS
 * tant qu'elle n'a pas de domaine dédié. Sur le web, un compte n'entre dans
 * l'app que si le flag Super Admin `web_app` est actif pour lui (global, ou
 * compte ajouté dans « comptes de test » du flag). Fermé par défaut : un
 * utilisateur normal voit seulement l'invitation à utiliser l'iPhone.
 * Monté une seule fois à la racine (via AccountGateModal) comme voile plein
 * écran : aucun effet sur iOS/Android, ni en Mode Démo (vitrine), ni avant
 * connexion (l'écran de connexion reste accessible aux développeurs).
 */
export const WEB_APP_FLAG_KEY = 'web_app';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6812393589';

export default function WebDeveloperGate() {
  const isWeb = Platform.OS === 'web';
  const userId = useUserStore((st) => st.user?.id);
  const isDemoMode = useUserStore((st) => st.isDemoMode);
  const guarded = isWeb && Boolean(userId) && !isDemoMode;
  const [state, setState] = useState<FeatureFlagState | 'loading'>('loading');

  const check = () => {
    setState('loading');
    getFeatureState(WEB_APP_FLAG_KEY).then(setState).catch(() => setState('unavailable'));
  };

  useEffect(() => { if (guarded) check(); }, [guarded, userId]);

  const signOut = () => {
    useUserStore.getState().logout();
    if (supabase) void createAuthService(supabase).signOut().catch(() => {});
  };

  if (!guarded || state === 'enabled') return null;

  return (
    <View testID="web-developer-gate" style={[StyleSheet.absoluteFillObject, { zIndex: 9999, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }]}>
      {state === 'loading' ? <ActivityIndicator size="large" color={colors.primaryLight} /> : (
        <View style={{ width: '100%', maxWidth: 420, alignItems: 'center', gap: 14 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '900', textAlign: 'center' }}>{APP_NAME}</Text>
          <Text style={{ color: colors.textMutedGrey, fontSize: 16, lineHeight: 23, textAlign: 'center' }}>
            {state === 'unavailable'
              ? 'Le service met plus de temps que prévu. Réessaie dans un instant.'
              : `${APP_NAME} s'utilise sur iPhone. La version ordinateur arrive bientôt.`}
          </Text>
          {state === 'unavailable' ? (
            <TouchableOpacity accessibilityRole="button" onPress={check} style={{ minHeight: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, alignSelf: 'stretch' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>RÉESSAYER</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity accessibilityRole="link" onPress={() => { void Linking.openURL(APP_STORE_URL); }} style={{ minHeight: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, alignSelf: 'stretch' }}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900' }}>TÉLÉCHARGER SUR L'APP STORE</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity accessibilityRole="button" onPress={signOut} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.textMutedGrey, fontSize: 14, fontWeight: '700' }}>Changer de compte</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
