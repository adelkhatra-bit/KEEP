import React from 'react';
import { Linking, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { supabase } from '../services/supabaseClient';
import { createAuthService } from '../services/authService';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import {
  approveDesktopPairing,
  clearPendingWebPairing,
  clearWebCompanionSessionId,
  currentWebCompanionSessionId,
  getWebCompanionSessionStatus,
  parsePairingDeepLink,
  readPendingWebPairing,
  registerCurrentWebCompanionSession,
} from '../services/webPairingService';

type PendingApproval = { pairingId: string; token: string };

export default function WebPairingLifecycle() {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [pendingApproval, setPendingApproval] = React.useState<PendingApproval | null>(null);
  const approvingRef = React.useRef(false);

  const handleNativePairingUrl = React.useCallback((url: string | null | undefined) => {
    if (Platform.OS === 'web' || !url) return;
    const parsed = parsePairingDeepLink(url);
    if (!parsed) return;
    setPendingApproval(parsed);

    const state = useUserStore.getState();
    if (!state.user || state.isLocalGuest || state.isDemoMode) {
      Alert.alert(
        'Connexion ordinateur',
        'Connecte-toi à ton compte Loki Music sur ce téléphone pour autoriser cet ordinateur.',
      );
      useAccountGateStore.getState().requestAccount('login');
    }
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    void Linking.getInitialURL().then(handleNativePairingUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleNativePairingUrl(url));
    return () => sub.remove();
  }, [handleNativePairingUrl]);

  React.useEffect(() => {
    if (Platform.OS === 'web' || !pendingApproval || approvingRef.current) return;
    if (!user || isLocalGuest || isDemoMode) return;

    approvingRef.current = true;
    void approveDesktopPairing(pendingApproval.pairingId, pendingApproval.token)
      .then((result) => {
        setPendingApproval(null);
        Alert.alert(
          'Ordinateur autorisé',
          result.deviceLabel ? `${result.deviceLabel} peut maintenant ouvrir ton compte Loki Music.` : 'Retourne sur ton ordinateur : la connexion est autorisée.',
        );
      })
      .catch((error: any) => {
        Alert.alert(
          'Connexion ordinateur',
          String(error?.message || '').includes('pairing_expired')
            ? 'Ce QR code a expiré. Génère un nouveau QR sur l’ordinateur.'
            : 'Impossible d’autoriser cet ordinateur. Génère un nouveau QR et réessaie.',
        );
      })
      .finally(() => {
        approvingRef.current = false;
      });
  }, [pendingApproval, user?.id, isLocalGuest, isDemoMode]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || !user || isLocalGuest || isDemoMode) return;
    const pending = readPendingWebPairing();
    if (!pending) return;

    let active = true;
    void registerCurrentWebCompanionSession(pending.pairingId, pending.token)
      .then(() => {
        if (active) clearPendingWebPairing();
      })
      .catch(() => {
        // Le magic-link a déjà créé la session. Garder le proof en sessionStorage
        // permet une nouvelle tentative au prochain rendu/rechargement.
      });
    return () => { active = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || !user || isLocalGuest || isDemoMode || !supabase) return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      if (!active) return;
      const sessionId = currentWebCompanionSessionId();
      if (!sessionId) return;
      try {
        const status = await getWebCompanionSessionStatus(sessionId);
        if (!active) return;
        if (status.revoked) {
          clearWebCompanionSessionId();
          useUserStore.getState().logout();
          await createAuthService(supabase).signOut().catch(() => {});
          return;
        }
      } catch {
        // Une panne réseau ne déconnecte jamais un ordinateur sain.
      }
      timer = setTimeout(() => { void check(); }, 10000);
    };

    timer = setTimeout(() => { void check(); }, 1500);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [user?.id, isLocalGuest, isDemoMode]);

  return null;
}
