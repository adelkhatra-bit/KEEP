import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { useUserStore } from '../store/useUserStore';
import { currentWebCompanionSessionId, listWebCompanionSessions } from '../services/webPairingService';

import { formatWebCompanionRemaining, webCompanionRemainingMs } from '../services/webCompanionCountdown';
import { setVisibleInterval } from '../utils/visibleInterval';

/**
 * Visible sur l'accueil ordinateur et à côté du ☰ de la session.
 * Le serveur est la source de vérité : jamais de « connecté » à partir
 * d'un simple identifiant conservé dans localStorage.
 *
 * Aucune consommation de FREE : la durée de 24 h est gratuite aujourd'hui.
 * Une éventuelle tarification devra être explicite et atomique côté serveur.
 */
export default function WebCompanionCountdown() {
  const userId = useUserStore((s) => s.user?.id);
  const [createdAt, setCreatedAt] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (Platform.OS !== 'web' || !userId) {
      setCreatedAt(null);
      return undefined;
    }

    let alive = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || !alive) return;
      const sessionId = currentWebCompanionSessionId();
      if (!sessionId) {
        setCreatedAt(null);
        return;
      }
      inFlight = true;
      try {
        const sessions = await listWebCompanionSessions();
        const current = sessions.find((session) =>
          session.id === sessionId &&
          !session.revoked_at &&
          webCompanionRemainingMs(session.created_at, Date.now()) > 0
        );
        if (alive) setCreatedAt(current?.created_at ?? null);
      } catch {
        // En cas de doute sur la connexion, ne pas afficher « PC connecté ».
        if (alive) setCreatedAt(null);
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    // Un nouveau QR peut être approuvé après le rendu initial.
    const stopRefreshTimer = setVisibleInterval(() => { void refresh(); }, 30000);
    const clockTimer = setInterval(() => { if (alive) setNow(Date.now()); }, 1000);
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      stopRefreshTimer();
      clearInterval(clockTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [userId]);

  if (Platform.OS !== 'web' || !userId || !createdAt) return null;
  const remaining = webCompanionRemainingMs(createdAt, now);
  if (remaining <= 0) return null;

  return (
    <View testID="pc-connected-countdown" style={styles.badge} accessible accessibilityRole="text"
      accessibilityLabel={'Ordinateur connecté. Déconnexion automatique dans ' + formatWebCompanionRemaining(remaining)}>
      <View style={styles.dot} />
      <Text style={styles.label}>PC CONNECTÉ</Text>
      <Text style={styles.timer}>{formatWebCompanionRemaining(remaining)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    backgroundColor: colors.backgroundCard,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.keep },
  label: { color: colors.textPrimary, fontSize: 11, fontWeight: '900' },
  timer: { color: colors.primaryLight, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
