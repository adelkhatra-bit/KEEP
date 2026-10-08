import React from 'react';
import { Linking, Platform } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { supabase } from '../services/supabaseClient';
import { createAuthService } from '../services/authService';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import {
  approveDesktopPairing,
  cancelDesktopPairing,
  clearPendingWebPairing,
  clearWebCompanionSessionId,
  currentWebCompanionSessionId,
  getWebCompanionSessionStatus,
  inspectDesktopPairing,
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
    if (Platform.OS === 'web' || !url || approvingRef.current) return;
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
    let active = true;
    let submitting = false;
    const finish = () => {
      approvingRef.current = false;
      if (active) setPendingApproval(null);
    };
    const canApprove = () => {
      const current = useUserStore.getState();
      return active && current.user?.id === user.id && !current.isLocalGuest && !current.isDemoMode;
    };
    const fail = () => {
      if (active) Alert.alert('Connexion ordinateur', 'Ce QR n’est plus disponible. Génère un nouveau QR sur l’ordinateur.');
      finish();
    };
    void inspectDesktopPairing(pendingApproval.pairingId, pendingApproval.token)
      .then((result) => {
        if (!canApprove()) { finish(); return; }
        Alert.alert(
          'Autoriser cet ordinateur ?',
          `${result.deviceLabel} aura accès à ton compte Loki Music. Autorise uniquement l’ordinateur dont tu viens de scanner le QR.`,
          [
            { text: 'Refuser', style: 'cancel', onPress: () => {
              if (canApprove()) void cancelDesktopPairing(pendingApproval.pairingId, pendingApproval.token).catch(() => {});
              finish();
            } },
            { text: 'Autoriser', onPress: () => {
              if (submitting) return;
              if (!canApprove()) { finish(); return; }
              submitting = true;
              void approveDesktopPairing(pendingApproval.pairingId, pendingApproval.token)
                .then(() => {
                  if (active) Alert.alert('Ordinateur autorisé', 'Retourne sur ton ordinateur : la connexion est autorisée.');
                  finish();
                })
                .catch(fail);
            } },
          ],
        );
      })
      .catch(fail);
    return () => { active = false; approvingRef.current = false; };
  }, [pendingApproval, user?.id, isLocalGuest, isDemoMode]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || !user || isLocalGuest || isDemoMode) return;
    const pending = readPendingWebPairing();
    if (!pending) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const register = async () => {
      try {
        await registerCurrentWebCompanionSession(pending.pairingId, pending.token);
        if (active) clearPendingWebPairing();
      } catch (error) {
        if (!active) return;
        const code = error instanceof Error ? error.message : '';
        if (/^(session_revoked|pairing_(not_found|not_approved|user_mismatch|session_mismatch|already_claimed|expired))$/.test(code)) {
          clearPendingWebPairing();
          clearWebCompanionSessionId();
          useUserStore.getState().logout();
          if (supabase) await createAuthService(supabase).signOut().catch(() => {});
          return;
        }
        timer = setTimeout(() => { void register(); }, 10000);
      }
    };
    void register();
    return () => { active = false; if (timer) clearTimeout(timer); };
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
      if (!sessionId || readPendingWebPairing()) {
        timer = setTimeout(() => { void check(); }, 10000);
        return;
      }
      try {
        const status = await getWebCompanionSessionStatus(sessionId);
        if (!active) return;
        if (status.revoked) {
          clearWebCompanionSessionId();
          useUserStore.getState().logout();
          await createAuthService(client).signOut().catch(() => {});
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
