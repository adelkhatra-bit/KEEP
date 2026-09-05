import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { broadcastEventToFollowers, createCreatorEvent, loadMyRsvps, loadUpcomingEvents, setEventRsvp, CreatorEvent, EventRsvpStatus } from '../services/creatorEventService';
import { shareEvent } from '../services/sharingService';
import { getCommercialRules, getEventCreationAccess, getGrowthRewardStatus, QuotaAccess } from '../services/growthAccessService';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import SwipeDeck from '../components/SwipeDeck';
import KeepBattleArenaPanel from '../components/KeepBattleArenaPanel';
import { isKeepBattleEnabled } from '../services/keepBattleExperienceService';
import { loadKeepBattleGlobalLeaderboard, loadKeepBattlePlayerStats, loadKeepBattleThemes, loadPendingArenaRematches, respondKeepBattleArenaRematch, KeepBattleGlobalLeaderboardEntry, KeepBattlePendingRematch, KeepBattlePlayerStats } from '../services/keepBattleService';
import { loadIncomingBattleChallenges, respondBattleChallenge, KeepBattleIncomingChallenge } from '../services/keepBattleLiveService';
import { supabase } from '../services/supabaseClient';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import { FreeCreditBreakdown, loadFreeCreditBreakdown } from '../services/creditService';

const RSVP_LABEL: Record<EventRsvpStatus, string> = {
  GOING: '✓ Je participe', MAYBE: 'Peut-être', NOT_GOING: 'Je ne participe pas',
};

// Adel (03/09/2026) : "joue en solo mix confirmé ... rajoute ce système-là
// dans le classement global" -- même libellé de niveau que sur l'écran
// "Joueurs disponibles" (KeepBattleMobileGameV3.tsx), dupliqué ici à
// l'identique (fonction pure d'une ligne, pas de module partagé pour ça).
const tierLabel = (tier?: string | null) => tier === 'EXPERT' ? '👑 Expert' : tier === 'CONFIRME' ? '⭐ Confirmé' : '🌱 Débutant';

// Adel (02/09/2026) : "je clique sur Battle et ça me bloque, je peux pas
// avoir jouer solo" -- vrai bug trouvé : `navigation.setParams({openBattle:
// undefined, arenaId: undefined})` met bien à jour l'état interne de React
// Navigation, mais sur le build web ça ne réécrit pas forcément l'URL du
// navigateur elle-même. La barre d'adresse pouvait donc garder
// `?openBattle=...&arenaId=<vieille arène terminée>`, et n'importe quel
// remontage de cet écran (changer d'onglet et revenir) relisait cette URL
// périmée, rouvrant la même arène terminée pour toujours au lieu de l'écran
// d'accueil Battle. Cette fonction force en plus l'URL elle-même à
// disparaître de ces paramètres, sans dépendre de la synchronisation de
// React Navigation.
function stripBattleUrlParams() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('openBattle') && !url.searchParams.has('arenaId') && !url.searchParams.has('source')) return;
    url.searchParams.delete('openBattle');
    url.searchParams.delete('arenaId');
    url.searchParams.delete('source');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // Le navigateur peut refuser certains réglages (mode privé, etc.) :
    // l'écran reste utilisable, seul ce filet de sécurité est perdu.
  }
}

export default function PartiesScreen({ navigation, route }: any) {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [events, setEvents] = useState<CreatorEvent[]>([]);
  const [eventIndex, setEventIndex] = useState(0);
  const [rsvps, setRsvps] = useState<Record<string, EventRsvpStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [eventAccess, setEventAccess] = useState<QuotaAccess | null>(null);
  const [followers, setFollowers] = useState(0);
  const [minEventFollowers, setMinEventFollowers] = useState(500);
  const [createOpen, setCreateOpen] = useState(false);
  const [battleOpen, setBattleOpen] = useState(false);
  // Adel (02/09/2026) : "chaque fois que je reviens en arrière, ça revient
  // sur cette page" -- le bouton RETOUR du navigateur restaure une ENTRÉE
  // D'HISTORIQUE ancienne qui porte encore ?arenaId=... dans son URL (chaque
  // navigation vers une notification Battle en a poussé une nouvelle).
  // Nettoyer arenaId au moment de QUITTER (onExit) ne peut rien changer à des
  // entrées déjà écrites AVANT ce nettoyage. La vraie protection : ne jamais
  // laisser arenaId vivre dans l'URL au-delà de l'instant où il est consommé
  // -- on le recopie dans un state local dès qu'on l'utilise, puis on l'efface
  // immédiatement de l'URL (pas seulement à la fermeture).
  const [pendingArenaId, setPendingArenaId] = useState<string | undefined>(undefined);
  // BUG RÉEL trouvé le 30/08/2026 (audit Soirées en direct) : le lanceur
  // Loki BATTLE s'affichait pour 100% des utilisateurs réels alors qu'Adel
  // a explicitement choisi de garder keep_battle désactivé (rollout_percent
  // à 0, voir feature-flags.tsx) -- aucun code ne lisait jamais le flag ici.
  const [battleFeatureEnabled, setBattleFeatureEnabled] = useState(false);
  useEffect(() => { let live = true; isKeepBattleEnabled().then((enabled) => live && setBattleFeatureEnabled(enabled)); return () => { live = false; }; }, []);
  // Adel (02/09/2026) : "on devrait faire deux petits boutons, un côté
  // Battle et un côté les soirées ... je trouve qu'on mélange un peu les
  // deux ... par défaut ça revient toujours à soirée" -- Soirées et Battle
  // deviennent deux onglets séparés au lieu d'un lanceur mélangé dans le
  // flux des événements ; Soirées reste l'onglet par défaut.
  const [partiesTab, setPartiesTab] = useState<'SOIREES' | 'BATTLE'>('SOIREES');
  const [leaderboard, setLeaderboard] = useState<KeepBattleGlobalLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [myRankingOpen, setMyRankingOpen] = useState(false);
  const [myRankingLoading, setMyRankingLoading] = useState(false);
  const [myFreeBreakdown, setMyFreeBreakdown] = useState<FreeCreditBreakdown | null>(null);
  // Adel (02/09/2026) : "mettre aussi le style qu'il écoute ... dans quelle
  // catégorie il est très fort" -- topThemeCode ne renvoie qu'un code
  // ('RAP_FR'...), le libellé français vient du même catalogue de thèmes
  // déjà utilisé par l'écran Battle lui-même, chargé une fois ici aussi.
  const [themeLabels, setThemeLabels] = useState<Record<string, string>>({});
  // Adel (03/09/2026) : "sur classement solo aussi il faut mettre la
  // notification ou carrément intégrer l'invitation" -- jusqu'ici seul le
  // bandeau global (toast, GlobalNotificationBanner) couvrait cet écran ;
  // rien d'intégré directement dans la page elle-même. Sondage propre à cet
  // écran (actif seulement quand Battle est affiché ET pas encore ouvert en
  // plein écran, pour ne jamais dupliquer le bandeau interne de
  // KeepBattleMobileGameV3 une fois qu'on y est).
  const [incomingBattle, setIncomingBattle] = useState<KeepBattleIncomingChallenge[]>([]);
  const [incomingResponding, setIncomingResponding] = useState<string | null>(null);
  useEffect(() => {
    // Adel (03/09/2026) : "il doit être en soirée, il doit être dans Battle,
    // il est de partout pour pas le louper" -- ce bandeau doit vivre sur
    // TOUT l'écran Soirées, y compris le sous-onglet SOIRÉES (événements),
    // pas seulement le sous-onglet BATTLE.
    if (!battleFeatureEnabled || battleOpen || !user || isLocalGuest || isDemoMode) { setIncomingBattle([]); return; }
    let live = true;
    const poll = () => { loadIncomingBattleChallenges().then((rows) => { if (live) setIncomingBattle(rows); }).catch(() => {}); };
    poll();
    const id = setInterval(poll, 2000);
    return () => { live = false; clearInterval(id); };
  }, [battleFeatureEnabled, battleOpen, user, isLocalGuest, isDemoMode]);
  const respondIncomingBattle = (challenge: KeepBattleIncomingChallenge, accept: boolean) => {
    setIncomingResponding(challenge.id);
    respondBattleChallenge(challenge.id, accept).then((result) => {
      setIncomingBattle((rows) => rows.filter((r) => r.id !== challenge.id));
      if (accept && result.arenaId) { setPendingArenaId(result.arenaId); setBattleOpen(true); }
    }).catch(() => {}).finally(() => setIncomingResponding(null));
  };
  // Adel (03/09/2026) : "dans Soirées tu mets que du fixe, la notification tu
  // l'intègres uniquement dans Profil/Playlists/Découvertes/Écoute" -- ce
  // flag reste vrai tant que cet écran est monté, quel que soit son
  // sous-onglet, pour que GlobalNotificationBanner sache qu'il doit se taire
  // ici (le bandeau fixe de cet écran prend déjà le relais).
  useEffect(() => {
    useBattleAvailabilityStore.getState().setPartiesTabOpen(true);
    return () => useBattleAvailabilityStore.getState().setPartiesTabOpen(false);
  }, []);
  // Adel (03/09/2026) : "quand j'appuie sur revanche, pareil ça me met une
  // invite fixe ... il faut que ce soit partout dans Soirées, même le
  // classement" -- même sondage/traitement que `incomingBattle` ci-dessus,
  // pour une revanche d'arène à laquelle je n'ai pas encore répondu.
  const [pendingRematchLB, setPendingRematchLB] = useState<KeepBattlePendingRematch[]>([]);
  const [rematchResponding, setRematchResponding] = useState<string | null>(null);
  useEffect(() => {
    if (!battleFeatureEnabled || battleOpen || !user || isLocalGuest || isDemoMode) { setPendingRematchLB([]); return; }
    let live = true;
    const poll = () => { loadPendingArenaRematches().then((rows) => { if (live) setPendingRematchLB(rows); }).catch(() => {}); };
    poll();
    const id = setInterval(poll, 2000);
    return () => { live = false; clearInterval(id); };
  }, [battleFeatureEnabled, battleOpen, user, isLocalGuest, isDemoMode]);
  const respondPendingRematchLB = (item: KeepBattlePendingRematch, accept: boolean) => {
    setRematchResponding(item.arenaId);
    respondKeepBattleArenaRematch(item.arenaId, accept).then(() => {
      setPendingRematchLB((rows) => rows.filter((r) => r.arenaId !== item.arenaId));
      if (accept) { setPendingArenaId(item.arenaId); setBattleOpen(true); }
    }).catch(() => {
      setPendingRematchLB((rows) => rows.filter((r) => r.arenaId !== item.arenaId));
    }).finally(() => setRematchResponding(null));
  };
  // Adel (02/09/2026) : "un pop-up qui me permette de voir son style musical
  // ... toutes les statistiques ... inspire-toi de TikTok" -- fiche joueur en
  // pop-up depuis le classement, chargée à la demande (pas au chargement du
  // classement entier -- robuste à grande échelle).
  const [statsEntry, setStatsEntry] = useState<KeepBattleGlobalLeaderboardEntry | null>(null);
  const [statsData, setStatsData] = useState<KeepBattlePlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsFollowing, setStatsFollowing] = useState(false);
  const [statsFollowBusy, setStatsFollowBusy] = useState(false);
  const openPlayerStats = (entry: KeepBattleGlobalLeaderboardEntry) => {
    setStatsEntry(entry);
    setStatsData(null);
    setStatsFollowing(false);
    setStatsLoading(true);
    loadKeepBattlePlayerStats(entry.profileId).then(setStatsData).catch(() => setStatsData(null)).finally(() => setStatsLoading(false));
    if (supabase && user && !isLocalGuest && !isDemoMode && user.id !== entry.profileId) {
      supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('followee_id', entry.profileId).maybeSingle()
        .then(({ data }) => setStatsFollowing(!!data), () => {});
    }
  };
  const openMyRanking = () => {
    if (!user || isLocalGuest || isDemoMode) {
      Alert.alert('Compte Loki requis', 'Crée ou connecte ton compte Loki pour retrouver ton classement et l’historique de tes Free.', [
        { text: 'Plus tard', style: 'cancel' },
        { text: 'Créer / se connecter', onPress: () => navigation.navigate('Main', { screen: 'Profile' }) },
      ]);
      return;
    }
    setMyRankingOpen(true);
    setMyRankingLoading(true);
    loadFreeCreditBreakdown().then(setMyFreeBreakdown).catch(() => setMyFreeBreakdown(null)).finally(() => setMyRankingLoading(false));
  };
  // Adel (03/09/2026) : "tu peux mettre ... ajouter ou abonner/s'abonner
  // ça dépend si je suis déjà abonné" -- même table/logique que le vrai
  // bouton Suivre du profil (PublicUserProfileScreen), dupliquée ici en
  // minimal plutôt qu'une extraction de service risquée à ce stade.
  const toggleStatsFollow = async () => {
    if (!supabase || !user || isLocalGuest || isDemoMode || !statsEntry || statsFollowBusy) return;
    setStatsFollowBusy(true);
    if (statsFollowing) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('followee_id', statsEntry.profileId);
      if (!error) setStatsFollowing(false);
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: user.id, followee_id: statsEntry.profileId });
      if (!error) setStatsFollowing(true);
    }
    setStatsFollowBusy(false);
  };
  useEffect(() => {
    if (partiesTab !== 'BATTLE' || !battleFeatureEnabled) return;
    let live = true;
    setLeaderboardLoading(true);
    Promise.all([
      loadKeepBattleGlobalLeaderboard(20),
      loadKeepBattleThemes().catch(() => []),
    ]).then(([rows, themes]) => {
      if (!live) return;
      setLeaderboard(rows);
      setThemeLabels(Object.fromEntries(themes.map((t) => [t.code, t.label])));
    }).catch(() => { if (live) setLeaderboard([]); }).finally(() => { if (live) setLeaderboardLoading(false); });
    return () => { live = false; };
  }, [partiesTab, battleFeatureEnabled]);
  const [createBusy, setCreateBusy] = useState(false);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [venueName, setVenueName] = useState('');
  const [countryCode, setCountryCode] = useState(user?.countryCode || 'FR');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  const reloadAccess = async () => {
    if (!user || isLocalGuest || isDemoMode) { setEventAccess(null); setFollowers(0); setMinEventFollowers(500); return; }
    try {
      const [access, growth, rules] = await Promise.all([
        getEventCreationAccess(),
        getGrowthRewardStatus().catch(() => null),
        getCommercialRules().catch(() => null),
      ]);
      setEventAccess(access);
      setFollowers(growth?.followers ?? 0);
      setMinEventFollowers(rules?.followerTiers?.[3] || 500);
    } catch { setEventAccess(null); }
  };

  const reload = async () => {
    setLoading(true); setError('');
    try {
      const liveEvents = await loadUpcomingEvents();
      setEvents(liveEvents); setEventIndex(0);
      if (user && !isLocalGuest && !isDemoMode) setRsvps(await loadMyRsvps(user.id));
      else setRsvps({});
      await reloadAccess();
    } catch (e: any) { setError(e?.message || 'Impossible de charger les soirées.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, [user?.id, isLocalGuest, isDemoMode]);
  useEffect(() => {
    if (!route?.params?.openBattle) return;
    setPendingArenaId(route?.params?.arenaId);
    setBattleOpen(true);
    navigation.setParams?.({ openBattle: undefined, source: undefined, arenaId: undefined });
    stripBattleUrlParams();
  }, [navigation, route?.params?.openBattle]);
  const currentEvent = events.length ? events[eventIndex % events.length] : null;
  const audienceReady = followers >= minEventFollowers;
  const canCreate = Boolean(eventAccess?.allowed || eventAccess?.unlimited) && audienceReady;
  const nextEvent = () => { if (events.length) setEventIndex((value) => (value + 1) % events.length); };

  const requireAccount = () => Alert.alert('Compte Loki requis', 'Crée ou connecte ton compte Loki pour répondre aux soirées.', [
    { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: () => navigation.navigate('Main', { screen: 'Profile' }) },
  ]);

  const chooseRsvp = async (eventId: string, status: EventRsvpStatus, advanceAfter = false) => {
    if (!user || isLocalGuest || isDemoMode) { requireAccount(); return; }
    setBusyId(eventId);
    try { await setEventRsvp(user.id, eventId, status); setRsvps((current) => ({ ...current, [eventId]: status })); if (advanceAfter) nextEvent(); }
    catch { Alert.alert('Soirée', 'Impossible d’enregistrer ta réponse pour le moment.'); }
    finally { setBusyId(''); }
  };

  const openCreate = async () => {
    if (!user || isLocalGuest || isDemoMode) {
      navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'CREATE_EVENT' });
      return;
    }
    const [access, growth, rules] = await Promise.all([
      getEventCreationAccess().catch(() => eventAccess),
      getGrowthRewardStatus().catch(() => null),
      getCommercialRules().catch(() => null),
    ]);
    if (access) setEventAccess(access);
    const liveFollowers = growth?.followers ?? followers;
    const liveMinimum = rules?.followerTiers?.[3] || minEventFollowers || 500;
    setFollowers(liveFollowers);
    setMinEventFollowers(liveMinimum);

    if (!access || !['CREATOR_PRO', 'VENUE_PRO'].includes(access.planCode)) {
      navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'CREATE_EVENT' });
      return;
    }
    if (liveFollowers < liveMinimum) {
      Alert.alert('500 abonnés requis', `La création d’événements s’ouvre à partir de ${liveMinimum} abonnés. Tu en as actuellement ${liveFollowers}.`);
      return;
    }
    if (!access.allowed && !access.unlimited) {
      navigation.navigate('Offers', { focusPlan: 'VENUE_PRO', sourceFeature: 'CREATE_EVENT' });
      return;
    }
    setCreateOpen(true);
  };

  const parseDate = () => {
    const clean = startsAt.trim(); if (!clean) return null;
    const parsed = new Date(clean.length === 16 ? `${clean}:00` : clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const publish = async (notifyFollowers: boolean) => {
    const iso = parseDate();
    if (name.trim().length < 3) return Alert.alert('Soirée', 'Indique un nom pour la soirée.');
    if (!iso) return Alert.alert('Soirée', 'Indique la date au format AAAA-MM-JJTHH:MM.');
    setCreateBusy(true);
    try {
      const created = await createCreatorEvent({ name: name.trim(), description: description.trim(), venueName: venueName.trim(), startsAt: iso, countryCode: countryCode.trim().toUpperCase().slice(0,2), djArtistNames: user?.username ? [user.username] : [] });
      let sent = 0; if (notifyFollowers) sent = await broadcastEventToFollowers(created.id, message.trim());
      setCreateOpen(false); setName(''); setStartsAt(''); setVenueName(''); setDescription(''); setMessage('');
      await reload();
      Alert.alert('Soirée publiée', notifyFollowers ? `${sent} abonné(s) ont reçu l’invitation Loki.` : 'La soirée est maintenant visible dans Loki.');
    } catch (e: any) {
      const code = String(e?.message || '');
      if (code.includes('EVENT_FOLLOWERS_REQUIRED')) {
        const [, current, minimum] = code.split(':');
        Alert.alert('Audience requise', `La création d’événements demande au moins ${Number(minimum || 500)} abonnés. Tu en as actuellement ${Number(current || 0)}.`);
      } else if (code.includes('VENUE_PRO_EVENT_LIMIT')) navigation.navigate('Offers', { focusPlan: 'VENUE_PRO', sourceFeature: 'CREATE_EVENT' });
      else if (code.includes('CREATOR_PRO_REQUIRED')) navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'CREATE_EVENT' });
      else Alert.alert('Soirée', code || 'Impossible de créer la soirée pour le moment.');
    } finally { setCreateBusy(false); }
  };

  const dateText = currentEvent ? new Date(currentEvent.startsAt).toLocaleString('fr-FR', { weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' }) : '';
  const currentRsvp = currentEvent ? rsvps[currentEvent.id] : undefined;
  const createLabel = !audienceReady && eventAccess && ['CREATOR_PRO','VENUE_PRO'].includes(eventAccess.planCode)
    ? `🔒 ${followers}/${minEventFollowers}`
    : eventAccess?.unlimited && canCreate ? '＋ ILLIMITÉ'
      : eventAccess?.planCode === 'CREATOR_PRO' ? (canCreate ? '＋ 1 / MOIS' : '🔒 LIMITE') : '🔒 CRÉER';

  if (battleOpen) {
    return <SafeAreaView style={styles.container}>
      <View style={styles.battleFullscreen}>
        <KeepBattleArenaPanel
          enabled={Boolean(user && !isLocalGuest && !isDemoMode)}
          initialArenaId={pendingArenaId}
          onOpenProfile={(username) => navigation.navigate('PublicProfile', { username })}
          onRequireAccount={() => navigation.navigate('Main', { screen: 'Profile' })}
          onExit={() => { setBattleOpen(false); setPendingArenaId(undefined); navigation.setParams?.({ arenaId: undefined, openBattle: undefined, source: undefined }); stripBattleUrlParams(); }}
          onOpenSession={(sessionId) => { setBattleOpen(false); setPendingArenaId(undefined); navigation.setParams?.({ arenaId: undefined, openBattle: undefined, source: undefined }); stripBattleUrlParams(); navigation.navigate('SessionRecap', { sessionId }); }}
        />
      </View>
    </SafeAreaView>;
  }

  return <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={{flex:1}}><Text style={styles.title}>{partiesTab === 'BATTLE' ? 'Loki BATTLE' : 'Soirées'}</Text><Text style={styles.subtitle}>{partiesTab === 'BATTLE' ? 'Classement, solo ou multijoueur.' : 'Découvre, participe et joue sans swipe obligatoire.'}</Text></View>
        {partiesTab === 'SOIREES' ? <TouchableOpacity style={[styles.createButton,!canCreate&&styles.createButtonLocked]} onPress={() => void openCreate()}><Text style={styles.createButtonText}>{createLabel}</Text></TouchableOpacity> : null}
      </View>

      {/* Adel (02/09/2026) : "on devrait faire deux petits boutons, un côté
          Battle et un côté les soirées ... par défaut ça revient toujours à
          soirée" -- deux onglets au lieu de mélanger les deux dans le même
          flux ; Soirées reste l'onglet par défaut. */}
      {battleFeatureEnabled ? (
        <View style={styles.partiesTabs}>
          <TouchableOpacity style={[styles.partiesTabBtn, partiesTab === 'SOIREES' && styles.partiesTabBtnOn]} onPress={() => setPartiesTab('SOIREES')}><Text style={[styles.partiesTabText, partiesTab === 'SOIREES' && styles.partiesTabTextOn]}>SOIRÉES</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.partiesTabBtn, partiesTab === 'BATTLE' && styles.partiesTabBtnOn]} onPress={() => setPartiesTab('BATTLE')}><Text style={[styles.partiesTabText, partiesTab === 'BATTLE' && styles.partiesTabTextOn]}>⚡ BATTLE</Text></TouchableOpacity>
        </View>
      ) : null}

      {/* Adel (03/09/2026) : "il doit être en soirée, il doit être dans
          Battle, il est de partout pour pas le louper" -- bandeaux fixes
          d'invite/revanche rendus ICI, avant le choix du sous-onglet, pour
          rester visibles que l'utilisateur soit sur SOIRÉES (événements) ou
          BATTLE (classement) -- ils vivaient uniquement dans la branche
          BATTLE avant, invisibles sur le sous-onglet SOIRÉES. */}
      {incomingBattle.map((challenge) => (
        <View key={challenge.id} style={styles.incomingBanner}>
          <Text style={styles.incomingText}><Text style={styles.incomingName}>@{challenge.username}</Text> souhaite faire un Battle avec toi ({themeLabels[challenge.themeCode] || challenge.themeCode} · {challenge.roundCount} morceaux). Acceptes-tu ?</Text>
          <View style={styles.incomingActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" disabled={incomingResponding === challenge.id} style={[styles.incomingNo, incomingResponding === challenge.id && styles.incomingBusy]} onPress={() => respondIncomingBattle(challenge, false)}><Text style={styles.incomingNoText}>REFUSER</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" disabled={incomingResponding === challenge.id} style={[styles.incomingYes, incomingResponding === challenge.id && styles.incomingBusy]} onPress={() => respondIncomingBattle(challenge, true)}><Text style={styles.incomingYesText}>{incomingResponding === challenge.id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity>
          </View>
        </View>
      ))}
      {!incomingBattle.length ? pendingRematchLB.map((item) => (
        <View key={item.arenaId} style={styles.incomingBanner}>
          <Text style={styles.incomingText}>🔁 Revanche proposée avec {item.participantUsernames.map((u) => `@${u}`).join(', ') || 'le groupe'}. Acceptes-tu ?</Text>
          <View style={styles.incomingActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" disabled={rematchResponding === item.arenaId} style={[styles.incomingNo, rematchResponding === item.arenaId && styles.incomingBusy]} onPress={() => respondPendingRematchLB(item, false)}><Text style={styles.incomingNoText}>REFUSER</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" disabled={rematchResponding === item.arenaId} style={[styles.incomingYes, rematchResponding === item.arenaId && styles.incomingBusy]} onPress={() => respondPendingRematchLB(item, true)}><Text style={styles.incomingYesText}>{rematchResponding === item.arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity>
          </View>
        </View>
      )) : null}

      {partiesTab === 'SOIREES' ? <>
        {!eventAccess || !['CREATOR_PRO','VENUE_PRO'].includes(eventAccess.planCode) ? <TouchableOpacity style={styles.creatorHint} onPress={() => void openCreate()}><Text style={styles.creatorHintText}>🔒 À partir de {minEventFollowers} abonnés : Creator Pro 9,99 € · 1 soirée/mois. Venue Pro 29,99 € · soirées illimitées.</Text></TouchableOpacity>
          : !audienceReady ? <TouchableOpacity style={styles.creatorHint} onPress={() => void openCreate()}><Text style={styles.creatorHintText}>🔒 Audience événements : {followers}/{minEventFollowers} abonnés. La formule est prête, il reste à atteindre le seuil communautaire.</Text></TouchableOpacity>
            : eventAccess.planCode === 'CREATOR_PRO' ? <TouchableOpacity style={styles.creatorHint} onPress={() => !canCreate && navigation.navigate('Offers',{focusPlan:'VENUE_PRO',sourceFeature:'CREATE_EVENT'})}><Text style={styles.creatorHintText}>{canCreate ? `Creator Pro : ta création du mois est disponible · seuil ${minEventFollowers} abonnés atteint.` : 'Limite du mois atteinte · Venue Pro débloque les soirées en illimité.'}</Text></TouchableOpacity>
              : <View style={styles.creatorHint}><Text style={styles.creatorHintText}>Venue Pro : soirées illimitées · seuil {minEventFollowers} abonnés atteint.</Text></View>}

        {loading ? <ActivityIndicator color={colors.primaryLight}/> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading&&!error&&!currentEvent ? <View style={styles.empty}><Text style={styles.emptyTitle}>Aucun événement publié pour le moment.</Text><Text style={styles.meta}>Les invitations de tes artistes, DJ et lieux suivis apparaîtront ici.</Text></View> : null}

        {currentEvent ? <>
          <SwipeDeck resetKey={currentEvent.id} enabled={busyId!==currentEvent.id} onSwipeLeft={()=>chooseRsvp(currentEvent.id,'NOT_GOING',true)} onSwipeRight={()=>chooseRsvp(currentEvent.id,'GOING',true)} leftLabel="NON" rightLabel="J’Y VAIS" hint="Glisse si tu veux · les boutons fonctionnent aussi sans swipe">
            <View style={styles.card}><View style={styles.badge}><Text style={styles.badgeText}>ÉVÉNEMENT</Text></View><Text style={styles.eventName}>{currentEvent.name}</Text><Text style={styles.date}>{dateText}</Text><Text style={styles.meta}>{[currentEvent.venueName,currentEvent.countryCode].filter(Boolean).join(' · ')}</Text>{currentEvent.djArtistNames.length?<Text style={styles.dj}>{currentEvent.djArtistNames.map((n)=>`@${n.replace(/^@+/,'')}`).join(' · ')}</Text>:null}{currentEvent.description?<Text style={styles.description}>{currentEvent.description}</Text>:null}<View style={styles.currentAnswer}><Text style={styles.currentAnswerText}>{currentRsvp?RSVP_LABEL[currentRsvp]:'Pas encore de réponse'}</Text></View></View>
          </SwipeDeck>
          <View style={styles.rsvpRow}><TouchableOpacity style={[styles.roundAction,styles.noAction]} onPress={()=>void chooseRsvp(currentEvent.id,'NOT_GOING',true)}><Text style={styles.noText}>✕</Text></TouchableOpacity><TouchableOpacity style={[styles.maybeAction,currentRsvp==='MAYBE'&&styles.maybeActionOn]} onPress={()=>void chooseRsvp(currentEvent.id,'MAYBE')}><Text style={styles.maybeText}>PEUT-ÊTRE</Text></TouchableOpacity><TouchableOpacity style={[styles.roundAction,styles.yesAction]} onPress={()=>void chooseRsvp(currentEvent.id,'GOING',true)}>{busyId===currentEvent.id?<ActivityIndicator color="#111"/>:<Text style={styles.yesText}>✓</Text>}</TouchableOpacity></View>
          <View style={styles.secondaryRow}><TouchableOpacity style={styles.secondary} onPress={nextEvent}><Text style={styles.secondaryText}>Suivant</Text></TouchableOpacity><TouchableOpacity style={styles.secondary} onPress={()=>shareEvent(currentEvent.id,currentEvent.name).catch(()=>{})}><Text style={styles.secondaryText}>↗ Partager</Text></TouchableOpacity></View>
        </> : null}
      </> : (
        <>
          {/* Adel (02/09/2026) : "le bouton salon musical au-dessus du
              classement global, jouer en jaune au lieu de violet, le contour
              du bouton battle en jaune" -- le lanceur passe avant le
              classement, couleurs alignées sur le jaune de marque Battle. */}
          <TouchableOpacity style={styles.battleLauncher} onPress={() => { setPendingArenaId(undefined); setBattleOpen(true); }} accessibilityRole="button" accessibilityLabel="Ouvrir le Salon Loki Battle">
            <View style={styles.battleLauncherIcon}><Text style={styles.battleLauncherBolt}>⚡</Text></View>
            <View style={styles.battleLauncherCopy}>
              <Text style={styles.battleLauncherKicker}>Loki BATTLE</Text>
              <Text style={styles.battleLauncherTitle}>Salon musical</Text>
              <Text style={styles.battleLauncherMeta}>Solo ou multijoueur · mode plein écran · aucun code à écrire</Text>
            </View>
            <Text style={styles.battleLauncherOpen}>JOUER ›</Text>
          </TouchableOpacity>

          {leaderboardLoading ? <ActivityIndicator color={colors.primaryLight} /> : null}
          {!leaderboardLoading && leaderboard.length ? (
            <View style={styles.leaderboardPanel}>
              <View style={styles.leaderboardHeader}>
                <Text style={styles.leaderboardTitle}>CLASSEMENT GLOBAL</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Ouvrir mon classement et mon historique de Free" style={styles.myRankingButton} onPress={openMyRanking}>
                  <Text style={styles.myRankingButtonText}>MON CLASSEMENT</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.leaderboardHint}>👆 Touche un joueur pour voir ses stats</Text>
              {leaderboard.map((entry, index) => (
                <TouchableOpacity
                  key={entry.profileId}
                  style={styles.leaderboardRow}
                  onPress={() => openPlayerStats(entry)}
                >
                  <Text style={styles.leaderboardTrophy}>{index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={styles.leaderboardName}>@{entry.username}</Text>
                    {entry.isOnline ? (
                      <Text numberOfLines={1} style={styles.leaderboardPresence}>● joue en solo{entry.presenceThemeCode && themeLabels[entry.presenceThemeCode] ? ` · ${themeLabels[entry.presenceThemeCode]}` : ''} · {tierLabel(entry.skillTier)}</Text>
                    ) : null}
                    {entry.topThemeCode && themeLabels[entry.topThemeCode] ? (
                      <Text numberOfLines={1} style={styles.leaderboardSpecialty}>🎯 Incollable en {themeLabels[entry.topThemeCode]}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.leaderboardWins}>{entry.wins} victoire{entry.wins > 1 ? 's' : ''}</Text>
                  <Text style={styles.leaderboardStats}>✓{entry.totalCorrect}{entry.avgResponseMs != null ? ` · ${(entry.avgResponseMs / 1000).toFixed(1)}s` : ''}</Text>
                  <Text style={styles.leaderboardChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : !leaderboardLoading ? <View style={styles.empty}><Text style={styles.emptyTitle}>Aucun classement pour le moment.</Text><Text style={styles.meta}>Joue un Battle pour apparaître ici.</Text></View> : null}
        </>
      )}
    </ScrollView>

    <Modal visible={Boolean(statsEntry)} transparent animationType="fade" onRequestClose={() => setStatsEntry(null)}>
      <View style={styles.statsBackdrop}>
        <View style={styles.statsCard}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" style={styles.statsClose} onPress={() => setStatsEntry(null)}><Text style={styles.statsCloseText}>×</Text></TouchableOpacity>
          {statsEntry ? (
            <>
              <Text style={styles.statsUsername}>@{statsEntry.username}</Text>
              {statsLoading ? <ActivityIndicator color={colors.primaryLight} style={{ marginTop: 20 }} /> : (
                <>
                  <View style={styles.statsBigRow}>
                    <View style={styles.statsBigItem}><Text style={styles.statsBigValue}>{statsData?.wins ?? statsEntry.wins}</Text><Text style={styles.statsBigLabel}>Victoires</Text></View>
                    <View style={styles.statsBigItem}><Text style={styles.statsBigValue}>{statsData?.matchesPlayed ?? statsEntry.matchesPlayed}</Text><Text style={styles.statsBigLabel}>Matchs</Text></View>
                    <View style={styles.statsBigItem}><Text style={styles.statsBigValue}>{statsData?.totalCorrect ?? statsEntry.totalCorrect}</Text><Text style={styles.statsBigLabel}>Bonnes rép.</Text></View>
                  </View>
                  {statsData ? <View style={styles.statsSmallRow}>
                    <View style={styles.statsSmallItem}><Text style={styles.statsSmallValue}>👥 {statsData.followers}</Text><Text style={styles.statsSmallLabel}>Abonnés</Text></View>
                    <View style={styles.statsSmallItem}><Text style={styles.statsSmallValue}>🎁 {statsData.freeBalance}</Text><Text style={styles.statsSmallLabel}>Free restant</Text></View>
                    <View style={styles.statsSmallItem}><Text style={styles.statsSmallValue}>🏆 {statsData.freeWon}</Text><Text style={styles.statsSmallLabel}>Free gagné</Text></View>
                    <View style={styles.statsSmallItem}><Text style={styles.statsSmallValue}>↘ {statsData.freeLost}</Text><Text style={styles.statsSmallLabel}>Free perdu</Text></View>
                  </View> : null}
                  {(statsData?.avgResponseMs ?? statsEntry.avgResponseMs) != null ? (
                    <Text style={styles.statsAvg}>⚡ {(((statsData?.avgResponseMs ?? statsEntry.avgResponseMs) as number) / 1000).toFixed(1)}s de temps de réponse moyen</Text>
                  ) : null}
                  <Text style={styles.statsSectionTitle}>STYLES OÙ IL EST IMBATTABLE</Text>
                  {statsData?.topThemes?.length ? statsData.topThemes.map((t) => (
                    <View key={t.themeCode} style={styles.statsThemeRow}>
                      <Text style={styles.statsThemeLabel}>🎯 {themeLabels[t.themeCode] || t.themeCode}</Text>
                      <Text style={styles.statsThemeValue}>{t.wins} victoire{t.wins > 1 ? 's' : ''} · {t.matches} match{t.matches > 1 ? 's' : ''}</Text>
                    </View>
                  )) : <Text style={styles.statsThemeEmpty}>Pas encore assez de matchs pour dégager un style dominant.</Text>}
                  <View style={styles.statsActionsRow}>
                    <TouchableOpacity style={[styles.statsFollowButton, statsFollowing && styles.statsFollowButtonActive]} disabled={statsFollowBusy} onPress={toggleStatsFollow}>
                      <Text style={[styles.statsFollowButtonText, statsFollowing && styles.statsFollowButtonTextActive]}>{statsFollowing ? '✓ ABONNÉ(E)' : '+ SUIVRE'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.statsProfileButtonSmall} onPress={() => { navigation.navigate('PublicProfile', { username: statsEntry.username }); setStatsEntry(null); }}>
                      <Text style={styles.statsProfileButtonText}>VOIR PROFIL</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          ) : null}
        </View>
      </View>
    </Modal>

    <Modal visible={myRankingOpen} transparent animationType="fade" onRequestClose={() => setMyRankingOpen(false)}>
      <View style={styles.statsBackdrop}><View style={styles.myRankingCard}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" style={styles.statsClose} onPress={() => setMyRankingOpen(false)}><Text style={styles.statsCloseText}>×</Text></TouchableOpacity>
        <Text style={styles.statsUsername}>MON CLASSEMENT</Text>
        {myRankingLoading ? <ActivityIndicator color={colors.primaryLight} /> : <ScrollView showsVerticalScrollIndicator={false}>
          {(() => {
            const index = leaderboard.findIndex((entry) => entry.profileId === user?.id);
            const mine = index >= 0 ? leaderboard[index] : null;
            return <>
              <View style={styles.statsBigRow}>
                <View style={styles.statsBigItem}><Text style={styles.statsBigValue}>{index >= 0 ? `#${index + 1}` : '—'}</Text><Text style={styles.statsBigLabel}>Rang global</Text></View>
                <View style={styles.statsBigItem}><Text style={styles.statsBigValue}>{mine?.wins ?? 0}</Text><Text style={styles.statsBigLabel}>Victoires</Text></View>
                <View style={styles.statsBigItem}><Text style={styles.statsBigValue}>{myFreeBreakdown?.remaining ?? 0}</Text><Text style={styles.statsBigLabel}>Free disponibles</Text></View>
              </View>
              {myFreeBreakdown ? <>
                <Text style={styles.statsSectionTitle}>HISTORIQUE ET SOLDE DES FREE</Text>
                <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Total gagné</Text><Text style={styles.creditHistoryGain}>+{myFreeBreakdown.totalEarned}</Text></View>
                <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Total dépensé / perdu</Text><Text style={styles.creditHistoryLoss}>−{myFreeBreakdown.totalSpent}</Text></View>
                <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Base invité + inscription</Text><Text style={styles.creditHistoryGain}>+{myFreeBreakdown.guestLimit + myFreeBreakdown.signupBonus}</Text></View>
                {myFreeBreakdown.followerBonus ? <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Bonus abonnés</Text><Text style={styles.creditHistoryGain}>+{myFreeBreakdown.followerBonus}</Text></View> : null}
                {myFreeBreakdown.referralBonus ? <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Parrainages ({myFreeBreakdown.referralCount})</Text><Text style={styles.creditHistoryGain}>+{myFreeBreakdown.referralBonus}</Text></View> : null}
                {myFreeBreakdown.monthlyBonus ? <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Bonus mensuels</Text><Text style={styles.creditHistoryGain}>+{myFreeBreakdown.monthlyBonus}</Text></View> : null}
                {myFreeBreakdown.adminGrant ? <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Ajustements Super Admin</Text><Text style={myFreeBreakdown.adminGrant > 0 ? styles.creditHistoryGain : styles.creditHistoryLoss}>{myFreeBreakdown.adminGrant > 0 ? '+' : ''}{myFreeBreakdown.adminGrant}</Text></View> : null}
                <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Battle gagnés</Text><Text style={styles.creditHistoryGain}>+{myFreeBreakdown.battleWon}</Text></View>
                <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Battle perdus</Text><Text style={styles.creditHistoryLoss}>−{myFreeBreakdown.battleLost}</Text></View>
                <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Free utilisés pour garder</Text><Text style={styles.creditHistoryLoss}>−{myFreeBreakdown.used}</Text></View>
                {myFreeBreakdown.lockedArena ? <View style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>Mises Battle en cours</Text><Text style={styles.creditHistoryLoss}>−{myFreeBreakdown.lockedArena}</Text></View> : null}
                <Text style={styles.statsSectionTitle}>BATTLE RÉCENTS</Text>
                {myFreeBreakdown.recentBattles.length ? myFreeBreakdown.recentBattles.map((event, index) => <View key={`${event.createdAt}-${index}`} style={styles.creditHistoryRow}><Text style={styles.creditHistoryLabel}>{event.result === 'WIN' ? '🏆 Victoire' : '❌ Défaite'}{event.themeCode ? ` · ${themeLabels[event.themeCode] || event.themeCode}` : ''} · {new Date(event.createdAt).toLocaleDateString('fr-FR')}</Text><Text style={event.amount >= 0 ? styles.creditHistoryGain : styles.creditHistoryLoss}>{event.amount > 0 ? '+' : ''}{event.amount}</Text></View>) : <Text style={styles.statsThemeEmpty}>Aucun Battle avec mouvement de Free pour le moment.</Text>}
              </> : <Text style={styles.statsThemeEmpty}>Historique indisponible. Réessaie dans un instant.</Text>}
            </>;
          })()}
        </ScrollView>}
      </View></View>
    </Modal>

    <Modal visible={createOpen} transparent animationType="slide" onRequestClose={()=>setCreateOpen(false)}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Créer une soirée</Text><TouchableOpacity onPress={()=>setCreateOpen(false)}><Text style={styles.close}>Fermer</Text></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nom de la soirée" placeholderTextColor={colors.textMuted}/><TextInput style={styles.input} value={startsAt} onChangeText={setStartsAt} placeholder="2026-09-12T22:00" placeholderTextColor={colors.textMuted} autoCapitalize="none"/><TextInput style={styles.input} value={venueName} onChangeText={setVenueName} placeholder="Lieu" placeholderTextColor={colors.textMuted}/><TextInput style={styles.input} value={countryCode} onChangeText={setCountryCode} placeholder="Pays (FR)" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={2}/><TextInput style={[styles.input,styles.multiline]} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={colors.textMuted} multiline/><TextInput style={[styles.input,styles.multiline]} value={message} onChangeText={setMessage} placeholder="Message à tes abonnés (optionnel)" placeholderTextColor={colors.textMuted} multiline/>
      <TouchableOpacity style={styles.publish} onPress={()=>void publish(true)} disabled={createBusy}>{createBusy?<ActivityIndicator color="#FFF"/>:<Text style={styles.publishText}>PUBLIER + NOTIFIER</Text>}</TouchableOpacity><TouchableOpacity style={styles.publishSecondary} onPress={()=>void publish(false)} disabled={createBusy}><Text style={styles.publishSecondaryText}>Publier sans notification</Text></TouchableOpacity>
    </ScrollView></View></View></Modal>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
container:{flex:1,backgroundColor:'#090610'},partiesTabs:{flexDirection:'row',gap:8,marginBottom:spacing.lg},partiesTabBtn:{flex:1,minHeight:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#151020',borderWidth:1,borderColor:'#312348'},partiesTabBtnOn:{backgroundColor:'#8B5CF6',borderColor:'#8B5CF6'},partiesTabText:{color:'#F8F6FC',fontSize:12,fontWeight:'900'},partiesTabTextOn:{color:'#FFF'},leaderboardPanel:{marginBottom:spacing.lg,padding:12,borderRadius:18,borderWidth:1,borderColor:'#40334B',backgroundColor:'#151020',gap:6},leaderboardHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},myRankingButton:{minHeight:30,paddingHorizontal:10,borderRadius:15,borderWidth:1,borderColor:'#8B5CF6',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center'},myRankingButtonText:{color:'#FFF',fontSize:9,fontWeight:'900'},leaderboardTitle:{color:'#E5F266',fontSize:12,fontWeight:'900',letterSpacing:.8,marginBottom:2},leaderboardHint:{color:'#8F879D',fontSize:10,fontWeight:'700',marginBottom:2},leaderboardRow:{minHeight:38,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:9,borderRadius:12,backgroundColor:'#1B1422'},leaderboardTrophy:{width:22,textAlign:'center',fontSize:13,color:'#FFF',fontWeight:'900'},leaderboardName:{flex:1,color:'#FFF',fontSize:13,fontWeight:'900'},leaderboardWins:{color:'#E5F266',fontSize:11,fontWeight:'900'},leaderboardStats:{color:'#B79CFF',fontSize:11,fontWeight:'800'},leaderboardSpecialty:{color:'#E5F266',fontSize:10,fontWeight:'800',marginTop:1},leaderboardPresence:{color:'#6EE8A7',fontSize:10,fontWeight:'800',marginTop:1},leaderboardChevron:{color:'#8F879D',fontSize:16,fontWeight:'900',marginLeft:2},battleFullscreen:{flex:1,paddingHorizontal:12,paddingTop:4,paddingBottom:4},battleLauncher:{minHeight:72,marginTop:spacing.lg,marginBottom:spacing.md,paddingHorizontal:12,paddingVertical:10,borderRadius:17,backgroundColor:'#151020',borderWidth:1,borderColor:'#E5F266',flexDirection:'row',alignItems:'center',gap:9},battleLauncherIcon:{width:42,height:42,borderRadius:21,backgroundColor:'#2A1A14',borderWidth:1,borderColor:'#D6AA36',alignItems:'center',justifyContent:'center'},battleLauncherBolt:{fontSize:19},battleLauncherCopy:{flex:1,minWidth:0},battleLauncherKicker:{color:'#D6AA36',fontSize:12,fontWeight:'900',letterSpacing:1},battleLauncherTitle:{color:'#FFFFFF',fontSize:16,fontWeight:'900',marginTop:1},battleLauncherMeta:{color:'#FFFFFF',fontSize:12,lineHeight:17,fontWeight:'700',marginTop:2},battleLauncherOpen:{color:'#E5F266',fontSize:12,fontWeight:'900'},content:{padding:spacing.xl,paddingBottom:spacing.xxxl},headerRow:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:spacing.md},title:{...typography.h1,color:'#F8F6FC'},subtitle:{color:'#FFFFFF',fontSize:14,lineHeight:19,marginTop:3,fontWeight:'700'},createButton:{minHeight:42,paddingHorizontal:12,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#8B5CF6'},createButtonLocked:{backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},createButtonText:{color:'#FFF',fontSize:12,fontWeight:'900'},creatorHint:{padding:10,borderRadius:13,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',marginBottom:spacing.lg},creatorHintText:{color:'#F8F6FC',fontSize:12,lineHeight:17,textAlign:'center',fontWeight:'800'},error:{color:colors.danger,textAlign:'center',paddingVertical:18},empty:{backgroundColor:'#151020',borderRadius:18,padding:spacing.lg,borderWidth:1,borderColor:'#312348'},emptyTitle:{color:'#F8F6FC',fontSize:15,fontWeight:'900',marginBottom:6},card:{height:420,borderRadius:26,padding:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end',overflow:'hidden'},badge:{alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:5,borderRadius:radius.pill,backgroundColor:'rgba(139,92,246,.16)',marginBottom:10},badgeText:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:1},eventName:{color:'#FFF',fontSize:28,lineHeight:32,fontWeight:'900'},date:{color:'#E5F266',fontSize:13,fontWeight:'900',marginTop:8},meta:{color:'#FFFFFF',fontSize:12,marginTop:5,fontWeight:'700'},dj:{color:'#E1D7FF',fontSize:12,fontWeight:'800',marginTop:5},description:{color:'#F8F6FC',fontSize:12,lineHeight:18,marginTop:14,fontWeight:'700'},currentAnswer:{alignSelf:'flex-start',marginTop:16,paddingHorizontal:10,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'#21182F'},currentAnswerText:{color:'#FFF',fontSize:12,fontWeight:'900'},rsvpRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:18,marginTop:16},roundAction:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',borderWidth:2},noAction:{borderColor:'#FF5F83',backgroundColor:'#151020'},yesAction:{borderColor:'#E5F266',backgroundColor:'#E5F266'},noText:{color:'#FF5F83',fontSize:26,fontWeight:'800'},yesText:{color:'#17130B',fontSize:25,fontWeight:'900'},maybeAction:{minHeight:44,paddingHorizontal:15,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},maybeActionOn:{borderColor:'#B79CFF',backgroundColor:'#34234F'},maybeText:{color:'#F8F6FC',fontSize:12,fontWeight:'900'},secondaryRow:{flexDirection:'row',gap:8,marginTop:12},secondary:{flex:1,minHeight:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#151020',borderWidth:1,borderColor:'#312348'},secondaryText:{color:'#F8F6FC',fontSize:12,fontWeight:'800'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'flex-end'},sheet:{maxHeight:'88%',backgroundColor:'#151020',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:'#493369',padding:18},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},modalTitle:{color:'#FFF',fontSize:18,fontWeight:'900'},close:{color:'#E1D7FF',fontSize:12,fontWeight:'900'},input:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#3B2E4E',backgroundColor:'#0F0B15',color:'#FFF',paddingHorizontal:12,marginBottom:9},multiline:{minHeight:84,paddingTop:12,textAlignVertical:'top'},publish:{minHeight:50,borderRadius:25,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center',marginTop:5},publishText:{color:'#FFF',fontSize:12,fontWeight:'900'},publishSecondary:{minHeight:42,alignItems:'center',justifyContent:'center'},publishSecondaryText:{color:'#F8F6FC',fontSize:12,fontWeight:'800'},
statsBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',alignItems:'center',justifyContent:'center',padding:spacing.lg},statsCard:{width:'100%',maxWidth:400,borderRadius:26,padding:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},myRankingCard:{width:'100%',maxWidth:400,maxHeight:'82%',borderRadius:26,padding:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},creditHistoryRow:{minHeight:38,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingHorizontal:10,borderRadius:12,backgroundColor:'#1B1422',marginBottom:5},creditHistoryLabel:{flex:1,color:'#FFF',fontSize:11,lineHeight:15,fontWeight:'800'},creditHistoryGain:{color:'#7FF2B7',fontSize:12,fontWeight:'900'},creditHistoryLoss:{color:'#FFB3C3',fontSize:12,fontWeight:'900'},statsClose:{position:'absolute',top:12,right:12,width:34,height:34,borderRadius:17,backgroundColor:'#1F1830',alignItems:'center',justifyContent:'center',zIndex:2},statsCloseText:{color:'#FFF',fontSize:20,lineHeight:22,fontWeight:'700'},statsUsername:{color:'#FFF',fontSize:20,fontWeight:'900',marginBottom:14,paddingRight:40},statsBigRow:{flexDirection:'row',gap:8},statsBigItem:{flex:1,alignItems:'center',paddingVertical:12,borderRadius:16,backgroundColor:'#1B1422'},statsBigValue:{color:'#E5F266',fontSize:22,fontWeight:'900'},statsBigLabel:{color:'#B79CFF',fontSize:10,fontWeight:'800',marginTop:2,textAlign:'center'},statsSmallRow:{flexDirection:'row',gap:5,marginTop:6},statsSmallItem:{flex:1,alignItems:'center',paddingVertical:7,borderRadius:12,backgroundColor:'#17121D'},statsSmallValue:{color:'#FFF',fontSize:11,fontWeight:'900'},statsSmallLabel:{color:'#8F879D',fontSize:9,fontWeight:'800',marginTop:1,textAlign:'center'},statsAvg:{color:'#FFF',fontSize:12,fontWeight:'700',textAlign:'center',marginTop:12},statsSectionTitle:{color:'#E5F266',fontSize:11,fontWeight:'900',letterSpacing:.8,marginTop:20,marginBottom:8},statsThemeRow:{minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:12,borderRadius:14,backgroundColor:'#1B1422',marginBottom:6},statsThemeLabel:{color:'#FFF',fontSize:12,fontWeight:'900'},statsThemeValue:{color:'#B79CFF',fontSize:11,fontWeight:'800'},statsThemeEmpty:{color:'#B79CFF',fontSize:12,lineHeight:16,fontWeight:'700'},statsActionsRow:{flexDirection:'row',gap:8,marginTop:18},statsFollowButton:{flex:1,minHeight:48,borderRadius:24,borderWidth:1.5,borderColor:'#FF5F83',backgroundColor:'#3A1822',alignItems:'center',justifyContent:'center'},statsFollowButtonActive:{backgroundColor:'#173529',borderColor:'#38D990'},statsFollowButtonText:{color:'#FFB3C3',fontSize:11,fontWeight:'900'},statsFollowButtonTextActive:{color:'#38D990'},statsProfileButtonSmall:{flex:1,minHeight:48,borderRadius:24,backgroundColor:'#8B5CF6',borderWidth:1.5,borderColor:'#4E8DFF',alignItems:'center',justifyContent:'center'},statsProfileButtonText:{color:'#FFF',fontSize:11,fontWeight:'900'},
incomingBanner:{marginBottom:spacing.md,padding:14,borderRadius:18,borderWidth:2,borderColor:'#E5F266',backgroundColor:'#1B1222'},incomingText:{color:'#F3EDF7',fontSize:13,lineHeight:18,fontWeight:'700'},incomingName:{color:'#FFF',fontWeight:'900'},incomingActions:{flexDirection:'row',gap:10,marginTop:10},incomingNo:{flex:1,minHeight:44,borderRadius:22,borderWidth:2,borderColor:'#8A7795',backgroundColor:'#211829',alignItems:'center',justifyContent:'center'},incomingNoText:{color:'#FFF',fontSize:13,fontWeight:'900'},incomingYes:{flex:1,minHeight:44,borderRadius:22,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},incomingYesText:{color:'#17130B',fontSize:13,fontWeight:'900'},incomingBusy:{opacity:.6}
});
