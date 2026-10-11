import React from 'react';
import { Linking, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { supabase } from '../services/supabaseClient';
import { createAuthService } from '../services/authService';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { navigationRef } from '../navigation/navigationRef';
import { confirmLeaveGame } from '../services/gameExitGuard';
import { startCrossDeviceSessionSync } from '../services/sessionCloudSyncService';
import {
  approveDesktopPairing,
  cancelDesktopPairing,
  clearPendingWebPairing,
  clearWebCompanionSessionId,
  currentWebCompanionSessionId,
  getWebCompanionSessionStatus,
  isPcTargetScreen,
  parsePairingDeepLink,
  previewDesktopPairing,
  PairingUnusableError,
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

  // Le même compte QR partage son historique d'écoute sur iPhone et PC.
  React.useEffect(() => {
    if (!user?.id || isDemoMode || isLocalGuest) return undefined;
    return startCrossDeviceSessionSync(user.id);
  }, [user?.id, isDemoMode, isLocalGuest]);
  const handledPcScreenRef = React.useRef<string | null>(null);

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
    const request = pendingApproval;
    const decide = (approve: boolean) => {
      setPendingApproval(null);
      const action = approve ? approveDesktopPairing : cancelDesktopPairing;
      void action(request.pairingId, request.token)
        .then(() => {
          Alert.alert(
            approve ? 'Ordinateur autorisé' : 'Connexion annulée',
            approve ? 'Retourne sur ton ordinateur.' : 'Cette demande ne peut plus connecter cet ordinateur.',
          );
        })
        .catch(() => {
          Alert.alert('Connexion ordinateur', 'La demande n’a pas été confirmée. Réessaie depuis le QR de ton ordinateur.');
        })
        .finally(() => { approvingRef.current = false; });
    };
    void previewDesktopPairing(request.pairingId, request.token)
      .then((p) => p.deviceLabel || '')
      .catch((error) => (error instanceof PairingUnusableError ? null : ''))
      .then((label) => {
        if (label === null) {
          // QR expiré / déjà utilisé : on ne touche ni à la session ni au compte.
          setPendingApproval(null);
          approvingRef.current = false;
          Alert.alert(
            'QR code expiré',
            'Ce QR code n’est plus valable. Sur ton ordinateur, appuie sur « Rafraîchir le QR », puis scanne le nouveau.',
          );
          return;
        }
        Alert.alert(
          'Connecter cet ordinateur ?',
          `Quelqu’un essaie de se connecter à ton compte${label ? ` depuis : ${label}` : ''}.\nAccepte uniquement si tu viens de scanner le QR sur ton propre ordinateur.`,
          [
            {
              text: 'Non, ce n’est pas moi',
              style: 'cancel',
              onPress: () => {
                decide(false);
                Alert.alert(
                  'Connexion refusée',
                  'Par sécurité, change ton mot de passe et active un authentificateur (application d’authentification) pour protéger ton compte.',
                );
              },
            },
            { text: 'Oui, c’est moi', onPress: () => decide(true) },
          ],
          { cancelable: false },
        );
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
    if (Platform.OS !== 'web' || !user || isLocalGuest || isDemoMode) return undefined;
    const client = supabase;
    if (!client) return undefined;
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
          await createAuthService(client).signOut().catch(() => {});
          return;
        }
        // Commande de navigation issue du téléphone : une seule fois par événement,
        // même après rechargement du navigateur, et sans sortir de force d'un Solo.
        if (status.screenRequestId && isPcTargetScreen(status.requestedScreen) && navigationRef.isReady()) {
          const eventKey = sessionId + ':' + status.screenRequestId;
          if (handledPcScreenRef.current !== eventKey) {
            handledPcScreenRef.current = eventKey;
            const storeKey = 'loki:pc:last-screen:' + sessionId;
            let alreadyHandled = false;
            try { alreadyHandled = window.sessionStorage.getItem(storeKey) === status.screenRequestId; } catch { /* privée */ }
            if (!alreadyHandled) {
              try { window.sessionStorage.setItem(storeKey, status.screenRequestId); } catch { /* privée */ }
              const screen = status.requestedScreen;
              confirmLeaveGame(() => {
                if (navigationRef.isReady()) (navigationRef.navigate as any)('Main', { screen });
              });
            }
          }
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
