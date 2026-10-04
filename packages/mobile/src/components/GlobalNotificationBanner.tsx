import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Image, Modal, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeepNotification, loadNotificationPreferences, markNotificationRead, notificationSemanticKey, subscribeToNotifications } from '../services/notificationService';
import { useUserStore } from '../store/useUserStore';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import { KeepBattleIncomingChallenge, loadIncomingBattleChallenges, respondBattleChallenge } from '../services/keepBattleLiveService';
import { KeepBattlePendingRematch, loadMyActiveKeepBattleArena, loadPendingArenaRematches, respondKeepBattleArenaRematch } from '../services/keepBattleService';
import { navigateToBattleArena, navigateToBattleRanking, navigateToEvent, navigateToSharedProfile } from '../navigation/navigationRef';
import { markPlaylistSalePaid } from '../services/playlistSaleService';
import { playNotificationCue } from '../services/notificationSoundService';
import { speakLokiText } from '../services/lokiSpeechService';
import { Alert } from '../utils/keepAlert';
import { setEventRsvp } from '../services/creatorEventService';
import { useGlobalChatStore } from '../store/useGlobalChatStore';
import { supabase } from '../services/supabaseClient';
import { useGameSessionStore } from '../store/useGameSessionStore';
import { acceptMarketplacePaymentTerms } from '../services/musicAgoraService';
import NewKeepNotificationActions from './NewKeepNotificationActions';
import { maskedNewKeepCopy } from '../services/newKeepNotification';
import { loadCurrentPlanCode } from '../services/planService';
import { isNotificationAccessLocked, loadNotificationAccessRules, normalizeNotificationPlanCode, notificationAccessRequiredPlan, notificationPlanLabel, type NotificationAccessRule, type NotificationPlanCode } from '../services/notificationAccessService';

const VISIBLE_MS = 4600;
const BATTLE_VISIBLE_MS = 20000;
const EVENT_VISIBLE_MS = 20000;
const FREE_CREDIT_VISIBLE_MS = 6500;
const BATTLE_INLINE_TYPES = new Set([
  'BATTLE_CHALLENGE',
  'KEEP_BATTLE_CHALLENGE',
  'BATTLE_INVITE',
  'KEEP_BATTLE_INVITE',
]);

function dataText(notification: KeepNotification | null, key: string): string {
  const value = notification?.data?.[key];
  return typeof value === 'string' ? value : '';
}

function profileUsernameForNotification(notification: KeepNotification | null): string {
  if (!notification) return '';
  const keys = [
    'username',
    'actorUsername','actor_username',
    'viewerUsername','viewer_username',
    'requesterUsername','requester_username',
    'followerUsername','follower_username',
    'sellerUsername','seller_username',
    'inviterUsername','inviter_username',
    'originUsername','origin_username',
    'senderUsername','sender_username',
  ];
  for (const key of keys) {
    const value = dataText(notification, key).trim().replace(/^@+/, '');
    if (value) return value;
  }
  return '';
}

function isBattleChallenge(notification: KeepNotification): boolean {
  const type = String(notification.type || '').toUpperCase();
  if (BATTLE_INLINE_TYPES.has(type)) return true;
  const title = String(notification.title || '').toUpperCase();
  return title.includes('BATTLE Loki') || title.includes('BATTLE ?');
}

// Adel (03/09/2026) : "quand j'appuie sur revanche ... si je suis sur
// Profil/Playlists/Découvertes/Écoute c'est une notif" -- même distinction
// que pour un défi frais, mais pour une revanche d'arène (type
// BATTLE_ARENA_REMATCH côté serveur) -- répond via l'arène, pas via
// keep_battle_challenges.
function isBattleRematch(notification: KeepNotification): boolean {
  return String(notification.type || '').toUpperCase() === 'BATTLE_ARENA_REMATCH';
}

function isSoloRankNotification(notification: KeepNotification): boolean {
  const type = String(notification.type || '').toUpperCase();
  return type === 'SOLO_RANK_UP' || type === 'BATTLE_SOLO_RANK_CHANGED';
}

function isEventInvite(notification: KeepNotification): boolean {
  return String(notification.type || '').toUpperCase() === 'EVENT_INVITE';
}

function isFreeCreditNotification(notification: KeepNotification): boolean {
  return String(notification.type || '').toUpperCase() === 'FREE_CREDITED'
    || String(notification.data?.event || '').toUpperCase() === 'FREE_CREDITED';
}

function isAgoraNotification(notification: KeepNotification): boolean {
  const type = String(notification.type || '').toUpperCase();
  const event = String(notification.data?.event || '').toUpperCase();
  return type.startsWith('AGORA_') || event.startsWith('AGORA_');
}

function isPaymentNotification(notification: KeepNotification): boolean {
  const type = String(notification.type || '').toUpperCase();
  const event = String(notification.data?.event || '').toUpperCase();
  const soundKind = String(notification.data?.soundKind || '').toLowerCase();
  return soundKind === 'money' || type.startsWith('PLAYLIST_SALE_') || event.startsWith('PLAYLIST_SALE_');
}

function isBuyerPaidNotification(notification: KeepNotification): boolean {
  const type = String(notification.type || '').toUpperCase();
  const event = String(notification.data?.event || '').toUpperCase();
  return type === 'PLAYLIST_SALE_BUYER_PAID' || event === 'PLAYLIST_SALE_BUYER_PAID';
}

export default function GlobalNotificationBanner() {
  const user = useUserStore((s) => s.user);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const partiesTabOpen = useBattleAvailabilityStore((s) => s.partiesTabOpen);
  const isGameInProgress = useGameSessionStore((s) => s.isGameInProgress);
  const [current, setCurrent] = useState<KeepNotification | null>(null);

  useEffect(() => {
    if (!isGameInProgress) return;
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    translateY.stopAnimation();
    opacity.stopAnimation();
    translateY.setValue(OFFSCREEN_TOP);
    opacity.setValue(0);
    setCurrent(null);
  }, [isGameInProgress, opacity, translateY]);
  const [respondBusy, setRespondBusy] = useState(false);
  const [battleDecisionReady, setBattleDecisionReady] = useState(false);
  const [blockingChallenge, setBlockingChallenge] = useState<KeepBattleIncomingChallenge | null>(null);
  const [blockingRematch, setBlockingRematch] = useState<KeepBattlePendingRematch | null>(null);
  const battleDecisionPollBusy = useRef(false);
  const activeBattleResumeBusy = useRef(false);
  const OFFSCREEN_TOP = -260;
  const translateY = useRef(new Animated.Value(OFFSCREEN_TOP)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const freeCreditPulse = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationsEnabled = useRef(true);
  const seenNotificationIds = useRef(new Set<string>());
  const recentSemanticKeys = useRef(new Map<string, number>());
  const notificationPlanRef = useRef<NotificationPlanCode>('FREE');
  const notificationAccessRulesRef = useRef<NotificationAccessRule[]>([]);
  // Adel (04/09/2026) : "les notifications viennent du côté, je veux que tu
  // les fasses venir du haut vers le bas comme ça je peux les Swiper pour les
  // remonter vers le haut" -- remplace l'ancienne entrée/sortie latérale
  // par une entrée/sortie verticale depuis le haut de l'écran, et le swipe de
  // fermeture latéral par un swipe vers le HAUT uniquement (le doigt ne peut
  // pas tirer le bandeau vers le bas au-delà de sa position posée).
  const resumeActiveBattle = useCallback(async () => {
    if (!user?.id || isDemoMode || isLocalGuest || activeBattleResumeBusy.current) return;
    activeBattleResumeBusy.current = true;
    try {
      const active = await loadMyActiveKeepBattleArena().catch(() => null);
      if (!active?.id || active.me?.status !== 'ACTIVE') {
        const game = useGameSessionStore.getState();
        if (game.gameMode === 'EN_LIGNE') game.clearGameSession();
        return;
      }
      useGameSessionStore.getState().setGameInProgress(
        true,
        'EN_LIGNE',
        'Tu es engagé dans ce Battle. Pour sortir, utilise QUITTER LE BATTLE.',
        active.id,
      );
      if (!useBattleAvailabilityStore.getState().battleScreenOpen) {
        navigateToBattleArena(active.id);
      }
    } finally {
      activeBattleResumeBusy.current = false;
    }
  }, [isDemoMode, isLocalGuest, user?.id]);

  // Source de vérité globale : à la connexion et à chaque retour au premier
  // plan, reprendre immédiatement un Battle encore ACTIVE côté serveur.
  useEffect(() => {
    if (!user?.id || isDemoMode || isLocalGuest) return undefined;
    let alive = true;
    const resume = () => { if (alive) void resumeActiveBattle(); };
    const first = setTimeout(resume, 180);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resume();
    });
    return () => {
      alive = false;
      clearTimeout(first);
      sub.remove();
    };
  }, [isDemoMode, isLocalGuest, resumeActiveBattle, user?.id]);

  const refreshBlockingBattleDecision = useCallback(async () => {
    if (!user?.id || isDemoMode || isLocalGuest || battleDecisionPollBusy.current) {
      if (!user?.id || isDemoMode || isLocalGuest) {
        setBlockingChallenge(null);
        setBlockingRematch(null);
      }
      return;
    }
    battleDecisionPollBusy.current = true;
    try {
      const [challenges, rematches] = await Promise.all([
        loadIncomingBattleChallenges().catch(() => []),
        loadPendingArenaRematches().catch(() => []),
      ]);
      const challenge = challenges[0] ?? null;
      setBlockingChallenge(challenge);
      setBlockingRematch(challenge ? null : (rematches[0] ?? null));
    } finally {
      battleDecisionPollBusy.current = false;
    }
  }, [isDemoMode, isLocalGuest, user?.id]);

  // Empêche un tap déjà en cours sur l'écran précédent de traverser la
  // modale au moment précis où elle apparaît et de déclencher REFUSER/ACCEPTER.
  // La décision reste entièrement humaine : boutons activés après 700 ms.
  useEffect(() => {
    setBattleDecisionReady(false);
    if (!blockingChallenge && !blockingRematch) return undefined;
    const timer = setTimeout(() => setBattleDecisionReady(true), 700);
    return () => clearTimeout(timer);
  }, [blockingChallenge?.id, blockingRematch?.arenaId]);

  useEffect(() => {
    if (!user?.id || isDemoMode || isLocalGuest || !supabase) return undefined;
    // Source temps réel dédiée aux décisions Battle. Contrairement à la
    // notification visuelle, elle ne dépend d'aucune préférence utilisateur :
    // une invitation PENDING doit apparaître immédiatement depuis Profil,
    // Écouter, Découvertes, Playlists ou Soirées.
    const client = supabase;
    const channel = client
      .channel(`battle-decision:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'keep_battle_challenges',
          filter: `target_id=eq.${user.id}`,
        },
        () => { void refreshBlockingBattleDecision(); },
      )
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [isDemoMode, isLocalGuest, refreshBlockingBattleDecision, user?.id]);

  useEffect(() => {
    if (!user?.id || isDemoMode || isLocalGuest) {
      setBlockingChallenge(null);
      setBlockingRematch(null);
      return undefined;
    }
    // IMPORTANT SCALABILITÉ : ne JAMAIS sonder Battle toutes les 800 ms au
    // niveau global. Ce composant est monté pour chaque utilisateur connecté :
    // l'ancien polling déclenchait 2 RPC toutes les 800 ms par appareil et a
    // saturé Postgres/Auth le 02/10/2026. La source temps réel est la table
    // notifications (subscription ci-dessous). On ne relit l'état serveur
    // qu'au montage et au retour de l'app au premier plan.
    let alive = true;
    const tick = () => { if (alive) void refreshBlockingBattleDecision(); };
    // L'auth/profil est le chemin critique. Un défi déjà en attente peut
    // patienter 1,2 s ; les NOUVEAUX défis arrivent immédiatement via Realtime.
    const initialTimer = setTimeout(tick, 1200);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      alive = false;
      clearTimeout(initialTimer);
      appState.remove();
    };
  }, [isDemoMode, isLocalGuest, refreshBlockingBattleDecision, user?.id]);

  const dragY = useRef(0);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_evt, gesture) => {
      dragY.current = gesture.dy;
      translateY.setValue(Math.min(0, gesture.dy));
    },
    onPanResponderRelease: (_evt, gesture) => {
      if (gesture.dy < -70) {
        Animated.parallel([
          Animated.timing(translateY, { toValue: OFFSCREEN_TOP, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
        ]).start(() => setCurrent(null));
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      } else {
        Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 190, mass: 0.82, useNativeDriver: Platform.OS !== 'web' }).start();
      }
    },
  }), [opacity, translateY]);

  const animateOut = (after?: () => void) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, { toValue: OFFSCREEN_TOP, duration: 260, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => {
      setCurrent(null);
      after?.();
    });
  };

  useEffect(() => {
    if (!user || isDemoMode || isLocalGuest) {
      notificationsEnabled.current = false;
      seenNotificationIds.current.clear();
      recentSemanticKeys.current.clear();
      setCurrent(null);
      return undefined;
    }

    let active = true;
    notificationsEnabled.current = true;
    void loadNotificationPreferences(user.id)
      .then((prefs) => {
        if (active) notificationsEnabled.current = prefs.systemEnabled;
      })
      .catch(() => {});
    void loadCurrentPlanCode(user.id)
      .then((code) => { if (active) notificationPlanRef.current = normalizeNotificationPlanCode(code); })
      .catch(() => {});
    void loadNotificationAccessRules()
      .then((rules) => { if (active) notificationAccessRulesRef.current = rules; })
      .catch(() => {});

    const unsubscribe = subscribeToNotifications(user.id, (notification) => {
      if (!active) return;

      // Pendant un Solo ou un Battle EN LIGNE, aucun bandeau ni bip global
      // n'a le droit de prendre la session audio ou de recouvrir les 4 réponses.
      // La notification reste persistée en base et non lue ; elle est visible
      // après la partie dans Notifications, sans interrompre une manche.
      if (useGameSessionStore.getState().isGameInProgress) return;

      const battleChallenge = isBattleChallenge(notification);
      const battleRematch = isBattleRematch(notification);
      // Adel (02/09/2026) : "il pourra recevoir des invite dans n'importe
      // quelle page" -- seul un utilisateur explicitement rendu disponible
      // (bascule sur le Profil, voir useBattleAvailabilityStore) reçoit ce
      // bandeau actionnable pour un Battle ; sinon l'invitation reste gérée
      // uniquement à l'intérieur de l'écran Battle lui-même (déjà en place),
      // pour ne jamais couper une session d'écoute en cours sans consentement.
      if (battleChallenge || battleRematch) {
        // Battle consent is handled by the blocking server-truth prompt.
        // Cette branche reste active même si les notifications visuelles sont
        // désactivées : elle remplace le polling global sans perdre l'arrivée
        // instantanée d'un défi/revanche.
        void refreshBlockingBattleDecision();
        return;
      }

      if (!notificationsEnabled.current) return;

      // Une notification visuelle = un événement métier. L'id protège les
      // reconnexions Realtime ; la clé sémantique protège aussi deux lignes DB
      // différentes produites par erreur pour le même paiement/crédit/événement.
      if (seenNotificationIds.current.has(notification.id)) return;
      seenNotificationIds.current.add(notification.id);
      const semanticKey = notificationSemanticKey(notification);
      const lastShown = recentSemanticKeys.current.get(semanticKey);
      if (lastShown && Date.now() - lastShown < 30 * 60 * 1000) return;
      recentSemanticKeys.current.set(semanticKey, Date.now());
      if (recentSemanticKeys.current.size > 120) {
        const oldestKey = recentSemanticKeys.current.keys().next().value;
        if (oldestKey) recentSemanticKeys.current.delete(oldestKey);
      }
      if (seenNotificationIds.current.size > 80) {
        const oldest = seenNotificationIds.current.values().next().value;
        if (oldest) seenNotificationIds.current.delete(oldest);
      }

      if (hideTimer.current) clearTimeout(hideTimer.current);
      translateY.stopAnimation();
      opacity.stopAnimation();
      translateY.setValue(OFFSCREEN_TOP);
      opacity.setValue(0);
      freeCreditPulse.stopAnimation();
      freeCreditPulse.setValue(0);
      const requiredPlan = notificationAccessRequiredPlan(notification.type, notificationAccessRulesRef.current);
      const lockedByPlan = isNotificationAccessLocked(notification.type, notificationPlanRef.current, notificationAccessRulesRef.current);
      const presentedNotification: KeepNotification = lockedByPlan
        ? {
            ...notification,
            title: '🔒 Notification réservée',
            body: `Disponible avec ${notificationPlanLabel(requiredPlan)}. Appuie pour voir la formule.`,
            data: {
              ...(notification.data ?? {}),
              __notificationAccessLocked: true,
              __requiredPlanCode: requiredPlan,
            },
          }
        : notification;
      setCurrent(presentedNotification);
      if (isBuyerPaidNotification(notification)) {
        // Message vocal court, sans montant ni identité : pas de donnée privée
        // lue à haute voix, uniquement l'action attendue du vendeur.
        void speakLokiText('Félicitations. Tu as un paiement à vérifier.', {
          language: 'fr-FR',
          rate: 0.96,
          pitch: 1,
        }).catch(() => {});
      }
      // Le Tchat possède son bip dédié dans GlobalChatDock : ne jamais jouer
      // deux sons pour le même message entrant.
      if (!isAgoraNotification(notification)) {
        void playNotificationCue(isPaymentNotification(notification) ? 'MONEY' : 'DEFAULT');
      }

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 190, mass: 0.82, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 1, duration: 170, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();

        if (isFreeCreditNotification(notification)) {
          Animated.sequence([
            Animated.timing(freeCreditPulse, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(freeCreditPulse, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(freeCreditPulse, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(freeCreditPulse, { toValue: 0, duration: 420, useNativeDriver: Platform.OS !== 'web' }),
          ]).start();
        }
      });

      const visibleMs = isFreeCreditNotification(notification)
        ? FREE_CREDIT_VISIBLE_MS
        : (battleChallenge || battleRematch)
          ? BATTLE_VISIBLE_MS
          : isEventInvite(notification)
            ? EVENT_VISIBLE_MS
            : VISIBLE_MS;
      hideTimer.current = setTimeout(() => animateOut(), visibleMs);
    });

    return () => {
      active = false;
      unsubscribe();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };
  }, [isDemoMode, isLocalGuest, opacity, refreshBlockingBattleDecision, translateY, user?.id]);

  if (!user || isDemoMode || isLocalGuest) return null;

  // Filet de sécurité rendu : si une notification était déjà affichée au
  // moment précis où la partie démarre, elle disparaît immédiatement et ne
  // reçoit plus aucun toucher pendant le jeu.
  if (isGameInProgress) return null;

  const commitBlockingChallengeDecision = async (accept: boolean) => {
    if (!blockingChallenge || respondBusy) return;
    const item = blockingChallenge;
    setRespondBusy(true);
    try {
      const result = await respondBattleChallenge(item.id, accept);
      setBlockingChallenge(null);
      if (accept && result.arenaId) navigateToBattleArena(result.arenaId);
    } catch {
      // Never dismiss a mandatory decision unless the server confirms it.
    } finally {
      setRespondBusy(false);
      setTimeout(() => { void refreshBlockingBattleDecision(); }, 250);
    }
  };
  const answerBlockingChallenge = (accept: boolean) => {
    if (accept) { void commitBlockingChallengeDecision(true); return; }
    const item = blockingChallenge;
    if (!item || respondBusy) return;
    Alert.alert(
      'Refuser ce Battle ?',
      `Confirme uniquement si tu veux réellement refuser l’invitation de ${item.username}.`,
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'REFUSER', style: 'destructive', onPress: () => { void commitBlockingChallengeDecision(false); } },
      ],
    );
  };

  const commitBlockingRematchDecision = async (accept: boolean) => {
    if (!blockingRematch || respondBusy) return;
    const item = blockingRematch;
    setRespondBusy(true);
    try {
      await respondKeepBattleArenaRematch(item.arenaId, accept);
      setBlockingRematch(null);
      if (accept) navigateToBattleArena(item.arenaId);
    } catch {
      // Never dismiss a mandatory decision unless the server confirms it.
    } finally {
      setRespondBusy(false);
      setTimeout(() => { void refreshBlockingBattleDecision(); }, 250);
    }
  };
  const answerBlockingRematch = (accept: boolean) => {
    if (accept) { void commitBlockingRematchDecision(true); return; }
    if (!blockingRematch || respondBusy) return;
    Alert.alert(
      'Refuser la revanche ?',
      'Confirme uniquement si tu veux réellement refuser cette revanche.',
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'REFUSER', style: 'destructive', onPress: () => { void commitBlockingRematchDecision(false); } },
      ],
    );
  };

  if (isGameInProgress) return null;

  if ((blockingChallenge || blockingRematch) && !partiesTabOpen) {
    const challenge = blockingChallenge;
    const rematch = blockingRematch;
    // Une INVITATION ne doit jamais bloquer le reste de l'application.
    // Seul un Battle déjà ACTIVE côté serveur a le droit de reprendre l'écran.
    // Ici on garde les décisions accessibles dans un bandeau flottant, sans
    // Modal plein écran : Solo, écoute, profils et navigation restent utilisables.
    return (
      <View pointerEvents="box-none" style={styles.battleInviteWrap}>
        <View style={styles.battleInviteCard} accessibilityRole="alert">
          <View style={styles.battleInviteCopy}>
            <Text style={styles.battleLockEyebrow}>LOKI MUSIC · BATTLE</Text>
            <Text style={styles.battleInviteTitle}>{challenge ? '⚡ INVITATION BATTLE' : '🔁 REVANCHE BATTLE'}</Text>
            <Text style={styles.battleInviteBody} numberOfLines={2}>
              {challenge ? `${challenge.username} te défie · ${challenge.roundCount} morceaux` : `${rematch?.participantUsernames?.join(', ') || 'Le groupe'} veut rejouer`}
            </Text>
          </View>
          <View style={styles.battleInviteActions}>
            <TouchableOpacity disabled={respondBusy || !battleDecisionReady} style={[styles.battleInviteNo, (respondBusy || !battleDecisionReady) && styles.battleDisabled]} onPress={() => { void (challenge ? answerBlockingChallenge(false) : answerBlockingRematch(false)); }} accessibilityRole="button" accessibilityLabel="Refuser le Battle">
              <Text style={styles.battleInviteNoText}>REFUSER</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={respondBusy || !battleDecisionReady} style={[styles.battleInviteYes, (respondBusy || !battleDecisionReady) && styles.battleDisabled]} onPress={() => { void (challenge ? answerBlockingChallenge(true) : answerBlockingRematch(true)); }} accessibilityRole="button" accessibilityLabel="Accepter le Battle">
              <Text style={styles.battleInviteYesText}>{respondBusy ? '…' : 'ACCEPTER'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (!current) return null;
  // Sur Soirées/Battle, l'écran local possède déjà les boutons de décision.
  // Ne jamais superposer un second bandeau/bouton pour la même invitation :
  // c'était une source de taps parasites et de refus involontaires.
  if (partiesTabOpen && (isBattleChallenge(current) || isBattleRematch(current))) return null;

  const notificationAccessLockedBanner = current.data?.__notificationAccessLocked === true;
  const notificationRequiredPlan = normalizeNotificationPlanCode(current.data?.__requiredPlanCode);
  if (notificationAccessLockedBanner) {
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <TouchableOpacity
          activeOpacity={0.95}
          style={styles.banner}
          onPress={() => {
            const id = current.id;
            void markNotificationRead(user.id, id).catch(() => {});
            animateOut();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Notification réservée à la formule ${notificationPlanLabel(notificationRequiredPlan)}`}
        >
          <View style={styles.artworkFallback}><Text style={styles.note}>🔒</Text></View>
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>LOKI MUSIC · ACCÈS</Text></View>
            <Text style={styles.title} numberOfLines={1}>Notification réservée</Text>
            <Text style={styles.body} numberOfLines={2}>Disponible avec {notificationPlanLabel(notificationRequiredPlan)}. Aucun changement d’écran.</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const artworkUrl = dataText(current, 'artworkUrl');
  const freeCreditNotification = isFreeCreditNotification(current);
  const isMusic = current.type.toUpperCase() === 'NEW_PUBLIC_KEEP';
  // Nouveau morceau d'un profil suivi : titre, artiste et pochette MASQUÉS
  // (Adel 02/10/2026) — révélés seulement après GARDER.
  const displayBody = isMusic
    ? maskedNewKeepCopy(current).body
    : current.body;

  const markReadAndHide = async () => {
    if (!current) return;
    const id = current.id;
    setCurrent((item) => item ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item);
    void markNotificationRead(user.id, id).catch(() => {});
    animateOut();
  };

  const openProfileFromNotification = () => {
    if (!current) return;
    const username = profileUsernameForNotification(current);
    if (!username) return;
    const id = current.id;
    setCurrent((item) => item ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item);
    void markNotificationRead(user.id, id).catch(() => {});
    animateOut(() => navigateToSharedProfile(username));
  };

  const openChatFromNotification = () => {
    if (!current) return;
    const roomSlug = dataText(current, 'roomSlug') || dataText(current, 'room_slug');
    const targetProfileId = dataText(current, 'senderId') || dataText(current, 'sender_id') || dataText(current, 'profileId');
    const targetUsername = dataText(current, 'senderUsername') || dataText(current, 'sender_username') || dataText(current, 'username');
    const groupId = dataText(current, 'groupId') || dataText(current, 'group_id');
    const groupName = dataText(current, 'groupName') || dataText(current, 'group_name');
    const messageIdRaw = dataText(current, 'messageId') || dataText(current, 'message_id');
    const messageId = Number(messageIdRaw || 0) || undefined;
    const id = current.id;
    setCurrent((item) => item ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item);
    void markNotificationRead(user.id, id).catch(() => {});
    animateOut(() => {
      useGlobalChatStore.getState().open({
        roomSlug: roomSlug || undefined,
        targetProfileId: groupId ? undefined : (targetProfileId || undefined),
        targetUsername: groupId ? undefined : (targetUsername || undefined),
        groupId: groupId || undefined,
        groupName: groupName || undefined,
        messageId,
      });
    });
  };

  const openRankFromNotification = () => {
    if (!current) return;
    const id = current.id;
    setCurrent((item) => item ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item);
    void markNotificationRead(user.id, id).catch(() => {});
    animateOut(() => navigateToBattleRanking());
  };

  const battleChallenge = isBattleChallenge(current);
  const battleRematch = isBattleRematch(current);
  const soloRankNotification = isSoloRankNotification(current);
  const challengeId = dataText(current, 'challengeId');
  const rematchArenaId = dataText(current, 'arenaId');
  const eventInvite = isEventInvite(current);
  const agoraNotification = isAgoraNotification(current);
  const profileUsername = profileUsernameForNotification(current);
  const buyerPaidNotification = isBuyerPaidNotification(current);
  const paymentId = dataText(current, 'paymentId') || dataText(current, 'payment_id');
  const eventId = dataText(current, 'event_id') || dataText(current, 'eventId');
  const eventAudience = dataText(current, 'audience_mode');

  // Adel (02/09/2026) : "il pourra recevoir des invite dans n'importe quelle
  // page ... êtes-vous prêt oui ou non" -- une fois "disponible" activé, le
  // bandeau global doit permettre de répondre directement, pas seulement
  // avertir puis renvoyer vers l'écran Battle.
  const commitBannerBattleDecision = async (accept: boolean) => {
    if (!challengeId || respondBusy) return;
    setRespondBusy(true);
    try {
      const result = await respondBattleChallenge(challengeId, accept);
      void markNotificationRead(user.id, current!.id).catch(() => {});
      animateOut(() => {
        if (accept && result.arenaId) navigateToBattleArena(result.arenaId);
      });
    } catch {
      animateOut();
    } finally {
      setRespondBusy(false);
    }
  };
  const respondFromBanner = (accept: boolean) => {
    if (accept) { void commitBannerBattleDecision(true); return; }
    if (!challengeId || respondBusy) return;
    Alert.alert(
      'Refuser ce Battle ?',
      'Confirme le refus. Sans cette confirmation, aucune invitation Battle ne peut être refusée.',
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'REFUSER', style: 'destructive', onPress: () => { void commitBannerBattleDecision(false); } },
      ],
    );
  };

  // Adel (03/09/2026) : "quand j'appuie sur revanche, pareil ça me met une
  // invite fixe ... si je suis sur Profil/Playlists/Découvertes/Écoute c'est
  // une notif" -- même geste que `respondFromBanner`, mais via l'arène (pas
  // via keep_battle_challenges) : accepter charge et ouvre directement
  // l'arène.
  const commitRematchFromBanner = async (accept: boolean) => {
    if (!rematchArenaId || respondBusy) return;
    setRespondBusy(true);
    try {
      await respondKeepBattleArenaRematch(rematchArenaId, accept);
      void markNotificationRead(user.id, current!.id).catch(() => {});
      animateOut(() => {
        if (accept) navigateToBattleArena(rematchArenaId);
      });
    } catch {
      // Keep the invitation visible if the server did not confirm the action.
    } finally {
      setRespondBusy(false);
    }
  };
  const respondRematchFromBanner = (accept: boolean) => {
    if (accept) { void commitRematchFromBanner(true); return; }
    if (!rematchArenaId || respondBusy) return;
    Alert.alert(
      'Refuser la revanche ?',
      'Confirme uniquement si tu veux réellement refuser cette revanche.',
      [
        { text: 'ANNULER', style: 'cancel' },
        { text: 'REFUSER', style: 'destructive', onPress: () => { void commitRematchFromBanner(false); } },
      ],
    );
  };

  const respondEventFromBanner = async (accept: boolean) => {
    if (!eventId || respondBusy) return;
    setRespondBusy(true);
    try {
      await setEventRsvp(user.id, eventId, accept ? 'GOING' : 'NOT_GOING');
      void markNotificationRead(user.id, current!.id).catch(() => {});
      animateOut(() => { if (accept) navigateToEvent(eventId); });
    } catch {
      animateOut();
    } finally {
      setRespondBusy(false);
    }
  };

  const confirmPaymentFromBanner = () => {
    if (!paymentId || respondBusy || !current) return;
    Alert.alert(
      'Validation irréversible',
      'Vérifie d’abord TON compte PayPal et la preuve. En validant, tu confirmes sous ta responsabilité que les fonds sont réellement reçus. La sélection sera débloquée immédiatement. Toute fausse validation peut entraîner un avertissement, un retrait de Free, une suspension ou un bannissement selon le règlement Loki Music.',
      [
        { text: 'RETOUR', style: 'cancel' },
        {
          text: 'J’ACCEPTE · VALIDER',
          onPress: () => {
            setRespondBusy(true);
            void acceptMarketplacePaymentTerms('seller_payment_confirmation')
              .then(() => markPlaylistSalePaid(paymentId))
              .then((result) => {
                void markNotificationRead(user.id, current.id).catch(() => {});
                animateOut();
                Alert.alert(
                  'Paiement confirmé',
                  `Tu as confirmé la réception. « ${result.playlistName || 'La sélection'} » est maintenant débloquée pour l’acheteur.`,
                );
              })
              .catch((error: any) => {
                const raw = String(error?.message || error || '');
                const message = raw.includes('BUYER_HAS_NOT_MARKED_PAID')
                  ? 'L’acheteur doit d’abord signaler son paiement.'
                  : raw.includes('PAYMENT_PROOF_REQUIRED') || raw.includes('PAYMENT_PROOF_FILE_NOT_FOUND')
                    ? 'La preuve de paiement doit être présente avant confirmation.'
                    : raw.includes('TERMS')
                      ? 'Les conditions marketplace doivent être acceptées avant validation.'
                      : 'Impossible de confirmer ce paiement pour le moment.';
                Alert.alert('Paiement', message);
              })
              .finally(() => setRespondBusy(false));
          },
        },
      ],
    );
  };

  if (eventInvite && eventId) {
    const audienceLabel = eventAudience === 'ADULTS_18_PLUS' ? '18+' : eventAudience === 'FAMILY' ? 'FAMILLE' : 'TOUT PUBLIC';
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={[styles.banner, styles.eventBanner]}>
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
          {artworkUrl ? <Image source={{ uri: artworkUrl }} style={styles.artwork} /> : <View style={styles.artworkFallback}><Text style={styles.note}>♬</Text></View>}
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.eventEyebrow}>SOIRÉE · {audienceLabel}</Text></View>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{displayBody}</Text>
            <View style={styles.battleActions}>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleNo, respondBusy && styles.battleDisabled]} onPress={() => { void respondEventFromBanner(false); }} accessibilityRole="button" accessibilityLabel="Refuser l’invitation à la soirée">
                <Text style={styles.battleNoText}>REFUSER</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleYes, respondBusy && styles.battleDisabled]} onPress={() => { void respondEventFromBanner(true); }} accessibilityRole="button" accessibilityLabel="Accepter l’invitation à la soirée">
                <Text style={styles.battleYesText}>{respondBusy ? '...' : 'J’Y VAIS'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (freeCreditNotification) {
    return (
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.wrap,
          {
            opacity,
            transform: [
              { translateY },
              { scale: freeCreditPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] }) },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.95}
          style={[styles.banner, styles.freeCreditBanner]}
          onPress={() => { void markReadAndHide(); }}
          accessibilityRole="button"
          accessibilityLabel={`${current.title}. ${current.body}`}
        >
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer">
            <Text style={styles.closeButtonText}>×</Text>
          </TouchableOpacity>
          <View style={styles.freeCreditBurst}>
            <Text style={styles.freeCreditSpark}>✦</Text>
            <Text style={styles.freeCreditIcon}>🎆</Text>
            <Text style={[styles.freeCreditSpark, styles.freeCreditSparkRight]}>✦</Text>
          </View>
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.freeCreditEyebrow}>FREE CONFIRMÉS</Text>
              <Text style={styles.closeHint}>crédit serveur validé</Text>
            </View>
            <Text style={styles.freeCreditTitle} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.freeCreditBody} numberOfLines={2}>{current.body}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (battleRematch && rematchArenaId) {
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={styles.banner}>
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
          <View style={styles.artworkFallback}><Text style={styles.note}>🔁</Text></View>
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>Loki Music BATTLE</Text></View>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{current.body}</Text>
            <View style={styles.battleActions}>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleNo, respondBusy && styles.battleDisabled]} onPress={() => { void respondRematchFromBanner(false); }} accessibilityRole="button" accessibilityLabel="Refuser la revanche">
                <Text style={styles.battleNoText}>REFUSER</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleYes, respondBusy && styles.battleDisabled]} onPress={() => { void respondRematchFromBanner(true); }} accessibilityRole="button" accessibilityLabel="Accepter la revanche">
                <Text style={styles.battleYesText}>{respondBusy ? '...' : 'ACCEPTER'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (battleChallenge && challengeId) {
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={styles.banner}>
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
          {artworkUrl ? (
            <Image source={{ uri: artworkUrl }} style={styles.artwork} />
          ) : (
            <View style={styles.artworkFallback}><Text style={styles.note}>⚡</Text></View>
          )}
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>Loki Music BATTLE</Text></View>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{displayBody}</Text>
            <View style={styles.battleActions}>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleNo, respondBusy && styles.battleDisabled]} onPress={() => { void respondFromBanner(false); }} accessibilityRole="button" accessibilityLabel="Refuser le Battle">
                <Text style={styles.battleNoText}>REFUSER</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleYes, respondBusy && styles.battleDisabled]} onPress={() => { void respondFromBanner(true); }} accessibilityRole="button" accessibilityLabel="Accepter le Battle">
                <Text style={styles.battleYesText}>{respondBusy ? '...' : 'ACCEPTER'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  if (isMusic) {
    const masked = maskedNewKeepCopy(current);
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View testID="new-keep-banner" style={styles.banner}>
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
          <View style={styles.artworkFallback}><Text style={styles.note}>?</Text></View>
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.eyebrow}>Loki Music LIVE</Text></View>
            <Text style={styles.title} numberOfLines={1}>{masked.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{masked.body}</Text>
            <NewKeepNotificationActions
              notification={current}
              onOpenProfile={dataText(current, 'username') ? () => navigateToSharedProfile(dataText(current, 'username')) : undefined}
              onInteract={() => {
                // L'abonné écoute ou garde : la bannière ne se referme plus seule.
                if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
                void markNotificationRead(user.id, current.id).catch(() => {});
              }}
              onKept={() => {
                if (hideTimer.current) clearTimeout(hideTimer.current);
                hideTimer.current = setTimeout(() => animateOut(), 6000);
              }}
            />
          </View>
        </View>
      </Animated.View>
    );
  }

  if (buyerPaidNotification && paymentId) {
    return (
      <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]} {...panResponder.panHandlers}>
        <View style={[styles.banner, styles.paymentBanner]}>
          <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
          <View style={styles.artworkFallback}><Text style={styles.note}>💰</Text></View>
          <View style={styles.copy}>
            <View style={styles.eyebrowRow}><Text style={styles.paymentEyebrow}>PAIEMENT À VÉRIFIER</Text></View>
            <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
            <Text style={styles.body} numberOfLines={3}>{displayBody}</Text>
            <View style={styles.battleActions}>
              <TouchableOpacity disabled={respondBusy} style={[styles.battleNo, respondBusy && styles.battleDisabled]} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Vérifier le paiement plus tard">
                <Text style={styles.battleNoText}>PLUS TARD</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={respondBusy} style={[styles.paymentConfirm, respondBusy && styles.battleDisabled]} onPress={() => { void confirmPaymentFromBanner(); }} accessibilityRole="button" accessibilityLabel="J’ai reçu le paiement">
                <Text style={styles.paymentConfirmText}>{respondBusy ? 'VÉRIFICATION…' : 'J’AI REÇU'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { opacity, transform: [{ translateY }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.94}
        style={styles.banner}
        onPress={() => { if (soloRankNotification) openRankFromNotification(); else if (agoraNotification) openChatFromNotification(); else if (profileUsername) openProfileFromNotification(); else void markReadAndHide(); }}
        accessibilityRole="button"
        accessibilityLabel={soloRankNotification ? `${current.title}. Ouvrir le classement Solo.` : agoraNotification ? `${current.title}. Ouvrir le Tchat.` : profileUsername ? `${current.title}. Voir le profil de ${profileUsername}.` : `${current.title}. ${displayBody}. Toucher pour marquer comme lu.`}
      >
        <TouchableOpacity style={styles.closeButton} onPress={() => animateOut()} accessibilityRole="button" accessibilityLabel="Fermer"><Text style={styles.closeButtonText}>×</Text></TouchableOpacity>
        {artworkUrl ? (
          <Image source={{ uri: artworkUrl }} style={styles.artwork} />
        ) : (
          <View style={styles.artworkFallback}><Text style={styles.note}>♫</Text></View>
        )}
        <View style={styles.copy}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrow}>{isMusic ? 'Loki Music LIVE' : 'Loki Music'}</Text>
            <Text style={styles.closeHint}>{soloRankNotification ? 'voir le classement' : agoraNotification ? 'ouvrir le tchat' : profileUsername ? 'voir le profil' : 'toucher = lu'}</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>{current.title}</Text>
          <Text style={styles.body} numberOfLines={2}>{displayBody}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  battleLockBackdrop: { flex: 1, backgroundColor: 'rgba(7,5,12,0.9)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  battleInviteWrap: { position: 'absolute', zIndex: 10020, elevation: 42, top: Platform.OS === 'ios' ? 54 : 18, left: 10, right: 10, alignItems: 'center' },
  battleInviteCard: { width: '100%', maxWidth: 420, borderRadius: 18, borderWidth: 1, borderColor: '#7C5CFC', backgroundColor: 'rgba(21,16,31,.98)', paddingHorizontal: 12, paddingVertical: 11, shadowColor: '#000', shadowOpacity: .42, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 42 },
  battleInviteCopy: { minWidth: 0 },
  battleInviteTitle: { color: '#FFF', fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 2 },
  battleInviteBody: { color: '#FFF', fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  battleInviteActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  battleInviteNo: { flex: 1, minHeight: 36, borderRadius: 14, borderWidth: 1, borderColor: '#8A7795', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' },
  battleInviteNoText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  battleInviteYes: { flex: 1, minHeight: 36, borderRadius: 14, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' },
  battleInviteYesText: { color: '#17130B', fontSize: 11, fontWeight: '900' },
  battleLockCard: { width: '100%', maxWidth: 420, borderRadius: 24, borderWidth: 2, borderColor: '#7C5CFC', backgroundColor: '#15101F', paddingHorizontal: 18, paddingVertical: 20, shadowColor: '#000', shadowOpacity: 0.48, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 40 },
  battleLockEyebrow: { color: '#68F2B1', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  battleLockTitle: { color: '#FFF', fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  battleLockBody: { color: '#FFF', fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center', marginTop: 10 },
  battleLockHint: { color: '#FFF', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  battleLockActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  battleLockNo: { flex: 1, minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: '#8A7795', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' },
  battleLockNoText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  battleLockYes: { flex: 1, minHeight: 50, borderRadius: 18, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' },
  battleLockYesText: { color: '#17130B', fontSize: 13, fontWeight: '900' },
  wrap: {
    position: 'absolute',
    zIndex: 10000,
    elevation: 30,
    top: Platform.OS === 'ios' ? 54 : 18,
    left: 12,
    right: 12,
    alignItems: 'flex-end',
  },
  banner: {
    width: '100%',
    maxWidth: 390,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#49345F',
    backgroundColor: 'rgba(20, 14, 31, 0.97)',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  eventBanner: { borderColor: '#7C5CFC' },
  paymentBanner: { borderColor: '#2DE1C2' },
  paymentEyebrow: { color: '#2DE1C2', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  paymentConfirm: { flex: 1, minHeight: 38, borderRadius: 14, backgroundColor: '#2DE1C2', alignItems: 'center', justifyContent: 'center' },
  paymentConfirmText: { color: '#0B0712', fontSize: 11, fontWeight: '900' },
  freeCreditBanner: { borderWidth: 2, borderColor: '#2DE1C2', backgroundColor: 'rgba(18, 35, 37, 0.98)', shadowColor: '#2DE1C2', shadowOpacity: 0.45, shadowRadius: 18 },
  freeCreditBurst: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(45,225,194,.12)', borderWidth: 1, borderColor: 'rgba(45,225,194,.65)', position: 'relative' },
  freeCreditIcon: { fontSize: 28 },
  freeCreditSpark: { position: 'absolute', top: 4, left: 6, color: '#E5F266', fontSize: 13, fontWeight: '900' },
  freeCreditSparkRight: { left: undefined, right: 5, top: 34 },
  freeCreditEyebrow: { color: '#2DE1C2', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  freeCreditTitle: { color: '#FFFFFF', fontSize: 15, lineHeight: 19, fontWeight: '900', marginTop: 2 },
  freeCreditBody: { color: '#D8FFF6', fontSize: 11, lineHeight: 15, marginTop: 2, fontWeight: '800' },
  eventEyebrow: { color: '#B79CFF', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  closeButton: { position: 'absolute', top: 6, right: 6, zIndex: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: '#FFF', fontSize: 15, lineHeight: 16, fontWeight: '700' },
  artwork: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#21162E' },
  artworkFallback: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#26183A', borderWidth: 1, borderColor: '#513474' },
  note: { color: '#B79CFF', fontSize: 23, fontWeight: '900' },
  copy: { flex: 1, minWidth: 0 },
  battleActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  battleNo: { flex: 1, minHeight: 32, borderRadius: 16, borderWidth: 1, borderColor: '#8A7795', backgroundColor: '#211829', alignItems: 'center', justifyContent: 'center' },
  battleNoText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  battleYes: { flex: 1, minHeight: 32, borderRadius: 16, backgroundColor: '#E5F266', alignItems: 'center', justifyContent: 'center' },
  battleYesText: { color: '#17130B', fontSize: 11, fontWeight: '900' },
  battleDisabled: { opacity: 0.62 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { color: '#68F2B1', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  closeHint: { color:'#FFFFFF', fontSize: 8, fontWeight: '700' },
  title: { color: '#F8F6FC', fontSize: 13, lineHeight: 18, fontWeight: '900', marginTop: 2 },
  body: { color:'#FFFFFF', fontSize: 11, lineHeight: 15, marginTop: 2 },
});
