import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { broadcastEventToFollowers, createCreatorEvent, loadMyRsvps, loadUpcomingEvents, setEventRsvp, CreatorEvent, EventRsvpStatus, loadMyPendingEventReviews, submitEventReview, loadEventReviewSummary, PendingEventReview, EventReviewSummary, loadEventRsvpCounts, EventRsvpCounts, updateCreatorEvent, disableCreatorEvent, loadEventParticipants, EventParticipant, pickAndUploadEventImage, loadMyEventTicket, EventTicket, checkinEventTicketByCode, toggleEventCheckin, buildGoogleCalendarUrl, buildEventIcs, loadMyEventOrganizerContact } from '../services/creatorEventService';
import { shareEvent } from '../services/sharingService';
import { getCommercialRules, getEventCreationAccess, getGrowthRewardStatus, QuotaAccess } from '../services/growthAccessService';
import { useUserStore } from '../store/useUserStore';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import SwipeDeck from '../components/SwipeDeck';
import KeepBattleArenaPanel from '../components/KeepBattleArenaPanel';
import { isKeepBattleEnabled } from '../services/keepBattleExperienceService';
import { loadKeepBattleGlobalLeaderboard, loadKeepBattlePlayerStats, loadKeepBattleThemes, loadPendingArenaRematches, respondKeepBattleArenaRematch, loadMyKeepBattleCreditStatus, KeepBattleGlobalLeaderboardEntry, KeepBattlePendingRematch, KeepBattlePlayerStats } from '../services/keepBattleService';
import { loadIncomingBattleChallenges, respondBattleChallenge, KeepBattleIncomingChallenge } from '../services/keepBattleLiveService';
import { supabase } from '../services/supabaseClient';
import { useBattleAvailabilityStore } from '../store/useBattleAvailabilityStore';
import { FreeCreditBreakdown, loadFreeCreditBreakdown } from '../services/creditService';
import { loadCurrentPlanCode } from '../services/planService';
import ProfileCertificationBadge, { CERTIFICATION_META } from '../components/ProfileCertificationBadge';
import type { ProfileCertificationTier } from '../services/publicProfileStateService';
import { searchAddress, reverseGeocodeAddress, getCurrentKeepLocation, KeepLocationPermissionError, AddressSuggestion } from '../services/locationService';
import { LinearGradient } from 'expo-linear-gradient';
import WheelPicker from '../components/WheelPicker';

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

function pad2(n: number) { return String(n).padStart(2, '0'); }
function toLocalInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
// Adel (08/09/2026) : "arrete d'utiliser [des boutons] ... mets un systeme
// de roulette pour la date et l'heure ... je veux pouvoir selectionner une
// heure et 45 minutes, 2h14, etc." -- remplace les choix rapides par une
// vraie roulette (voir WheelPicker) : aucune heure n'est imposee, seule la
// position de defilement initiale l'est (necessaire pour tout widget
// roulette), entierement modifiable par l'utilisateur.
function buildDateWheelItems(days = 180): { label: string; date: Date }[] {
  const now = new Date();
  const items: { label: string; date: Date }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    items.push({ label, date: d });
  }
  return items;
}
const HOUR_WHEEL_ITEMS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_WHEEL_ITEMS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// Adel (08/09/2026) : "chacun invite ... soit individu avec le pseudo de
// l'utilisateur que ca fasse classe" -- image QR generee a la volee, pas de
// nouvelle dependance native (image affichee comme n'importe quelle photo).
function qrImageUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(payload)}`;
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
  // Adel (07/09/2026) : "à côté de Loki Battle, dans la rubrique soirée,
  // rajoute les Free juste à côté" -- solde visible directement sur le
  // lanceur, avant même d'ouvrir Battle.
  const [battleFreeBalance, setBattleFreeBalance] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    if (!battleFeatureEnabled || battleOpen || !user || isLocalGuest || isDemoMode) { setBattleFreeBalance(null); return undefined; }
    loadMyKeepBattleCreditStatus().then((status) => { if (live) setBattleFreeBalance(status.remainingFree); }).catch(() => { if (live) setBattleFreeBalance(null); });
    return () => { live = false; };
  }, [battleFeatureEnabled, battleOpen, user, isLocalGuest, isDemoMode]);
  // Règle (07/09/2026, Adel) : un badge Free reprend toujours la couleur de la
  // certification correspondante, jamais une couleur fixe.
  const [myPlanCode, setMyPlanCode] = useState<ProfileCertificationTier>('FREE');
  useEffect(() => {
    let live = true;
    if (!user || isLocalGuest || isDemoMode) { setMyPlanCode('FREE'); return undefined; }
    loadCurrentPlanCode(user.id).then((code) => { if (live) setMyPlanCode((code as ProfileCertificationTier) || 'FREE'); }).catch(() => { if (live) setMyPlanCode('FREE'); });
    return () => { live = false; };
  }, [user, isLocalGuest, isDemoMode]);
  const myTierColors = CERTIFICATION_META[myPlanCode] ?? CERTIFICATION_META.FREE;
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
        { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create') },
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
  // Adel (07/09/2026) : "la certif doit être présentée partout, même sur les
  // Battles" -- calculée en direct pour chaque joueur du classement (jamais
  // figée), même RPC que le reste de l'app.
  const [leaderboardTiers, setLeaderboardTiers] = useState<Record<string, ProfileCertificationTier>>({});
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
      const ids = rows.map((r) => r.profileId).filter(Boolean);
      if (ids.length && supabase) {
        Promise.resolve(supabase.rpc('keep_public_certification_tiers', { p_profile_ids: ids })).then(({ data }) => {
          if (!live || !Array.isArray(data)) return;
          setLeaderboardTiers(Object.fromEntries(data.map((r: any) => [String(r.profile_id), r.certification_tier as ProfileCertificationTier])));
        }).catch(() => {});
      }
    }).catch(() => { if (live) setLeaderboard([]); }).finally(() => { if (live) setLeaderboardLoading(false); });
    return () => { live = false; };
  }, [partiesTab, battleFeatureEnabled]);
  const [createBusy, setCreateBusy] = useState(false);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  // Adel (08/09/2026) : "mets un systeme de roulette pour la date et
  // l'heure ... je veux pouvoir selectionner une heure et 45 minutes, 2h14,
  // etc." -- startsAt reste la source de verite envoyee au serveur, mais
  // n'est plus tape a la main : ces trois index pilotent la roulette et se
  // synchronisent vers startsAt via l'effet ci-dessous.
  const dateWheelItems = useMemo(() => buildDateWheelItems(), []);
  const [dateIdx, setDateIdx] = useState(0);
  const [hourIdx, setHourIdx] = useState(() => new Date().getHours());
  const [minuteIdx, setMinuteIdx] = useState(() => new Date().getMinutes());
  useEffect(() => {
    const day = dateWheelItems[dateIdx]?.date;
    if (!day) return;
    setStartsAt(toLocalInputValue(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hourIdx, minuteIdx, 0, 0)));
  }, [dateIdx, hourIdx, minuteIdx, dateWheelItems]);
  const [venueName, setVenueName] = useState('');
  const [venueCoords, setVenueCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Adel (08/09/2026) : "le systeme puisse proposer des adresses
  // automatiquement selon le pays ... le FR doit etre automatique" --
  // suggestions d'adresse en direct pendant la saisie du lieu, biaisees sur
  // countryCode (FR par defaut). Choisir une suggestion fige aussi ses
  // coordonnees (approx_lat/approx_lng), sinon l'evenement reste sans
  // position precise comme avant.
  const [venueSuggestions, setVenueSuggestions] = useState<AddressSuggestion[]>([]);
  const [venueSearchBusy, setVenueSearchBusy] = useState(false);
  const [countryCode, setCountryCode] = useState(user?.countryCode || 'FR');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  // Adel (08/09/2026) : "est-ce que je peux la faire uniquement en
  // notification ou avec deux boutons ... l'utilisateur puisse cocher cette
  // fonction ... il aura le nombre d'utilisateurs qui participe" -- coché
  // par défaut (c'est ce qui donne le compteur), décochable pour une simple
  // notification sans réponse attendue.
  const [includeRsvpButtons, setIncludeRsvpButtons] = useState(true);
  const [rsvpCounts, setRsvpCounts] = useState<EventRsvpCounts | null>(null);
  // Adel (08/09/2026) : "il puisse effacer les evenements ... tous les
  // modifier ... voir tous les participants" -- edition en place (meme
  // formulaire que la creation), suppression = debit definitif (soft
  // delete cote serveur), liste nominative des reponses pour l'organisateur.
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventBusyAction, setEventBusyAction] = useState<'delete' | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  // Adel (08/09/2026) : "une piece jointe comme une photo de l'evenement".
  const [eventImageUrl, setEventImageUrl] = useState('');
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  // Adel (08/09/2026) : "souhaitez-vous imposer le QR code de l'utilisateur
  // ... chacun invite ... soit individu avec le pseudo ... que ca fasse
  // classe ... l'invite disparaissent automatiquement un jour apres
  // l'evenement".
  const [requireQrCode, setRequireQrCode] = useState(false);
  // Adel (08/09/2026) : "un numero de telephone ... je souhaite montrer mon
  // numero de telephone ou pas" -- optionnel, masque par defaut.
  const [organizerPhone, setOrganizerPhone] = useState('');
  const [showOrganizerPhone, setShowOrganizerPhone] = useState(false);
  const [myTicket, setMyTicket] = useState<EventTicket | null>(null);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  // Adel (08/09/2026) : "l'organisateur ... pourra le scanner ... tout ceux
  // qui ont participe et tout ceux qui ne sont pas venus" -- saisie du code
  // (dicte ou copie depuis l'ecran du participant) en repli sans nouvelle
  // dependance camera ; le tap-to-toggle sur chaque ligne reste disponible
  // meme sans QR.
  const [checkinCode, setCheckinCode] = useState('');
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkinTogglingId, setCheckinTogglingId] = useState('');

  useEffect(() => {
    if (!createOpen || venueCoords || venueName.trim().length < 3) { setVenueSuggestions([]); return undefined; }
    let cancelled = false;
    setVenueSearchBusy(true);
    const timer = setTimeout(() => {
      void searchAddress(venueName, countryCode || 'FR')
        .then((rows) => { if (!cancelled) setVenueSuggestions(rows); })
        .finally(() => { if (!cancelled) setVenueSearchBusy(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [venueName, venueCoords, countryCode, createOpen]);

  const pickVenueSuggestion = (suggestion: AddressSuggestion) => {
    setVenueName(suggestion.label);
    setVenueCoords({ lat: suggestion.lat, lng: suggestion.lng });
    setVenueSuggestions([]);
    if (suggestion.countryCode) setCountryCode(suggestion.countryCode);
  };

  // Adel (08/09/2026) : "va t'inspirer des grandes plateformes" -- bouton
  // "utiliser ma position" (Airbnb/Eventbrite quand on cree depuis le lieu
  // meme), en plus de la recherche par texte, jamais a la place.
  const [locatingVenue, setLocatingVenue] = useState(false);
  const useMyLocationForVenue = async () => {
    if (locatingVenue) return;
    setLocatingVenue(true);
    try {
      const here = await getCurrentKeepLocation();
      const address = await reverseGeocodeAddress(here.lat, here.lng);
      if (address) pickVenueSuggestion(address);
      else if (here.city) { setVenueName(here.city); setVenueCoords({ lat: here.lat, lng: here.lng }); setVenueSuggestions([]); if (here.countryCode) setCountryCode(here.countryCode); }
      else Alert.alert('Position', 'Adresse précise indisponible pour le moment.');
    } catch (e) {
      Alert.alert('Position', e instanceof KeepLocationPermissionError ? 'Autorise l’accès à ta position pour remplir l’adresse automatiquement.' : 'Impossible de récupérer ta position pour le moment.');
    } finally {
      setLocatingVenue(false);
    }
  };

  // Adel (08/09/2026) : "systeme d'etoile ... comprendre pourquoi il a eu un
  // flop" -- evenements passes ou j'ai repondu "je participe" et pas encore
  // note, proposes en un tap ; la moyenne de l'evenement courant est
  // affichee sur sa carte pour que l'organisateur (et tout le monde) voie le
  // retour en direct.
  const [pendingReviews, setPendingReviews] = useState<PendingEventReview[]>([]);
  const [reviewTarget, setReviewTarget] = useState<PendingEventReview | null>(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [currentEventReviewSummary, setCurrentEventReviewSummary] = useState<EventReviewSummary | null>(null);

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
      if (user && !isLocalGuest && !isDemoMode) {
        setRsvps(await loadMyRsvps(user.id));
        setPendingReviews(await loadMyPendingEventReviews().catch(() => []));
      } else { setRsvps({}); setPendingReviews([]); }
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

  useEffect(() => {
    let cancelled = false;
    setMyTicket(null);
    if (!currentEvent) { setCurrentEventReviewSummary(null); setRsvpCounts(null); return undefined; }
    void loadEventReviewSummary(currentEvent.id).then((summary) => { if (!cancelled) setCurrentEventReviewSummary(summary); }).catch(() => {});
    void loadEventRsvpCounts(currentEvent.id).then((counts) => { if (!cancelled) setRsvpCounts(counts); }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentEvent?.id]);

  const openReview = (target: PendingEventReview) => { setReviewTarget(target); setReviewStars(5); setReviewComment(''); };

  const submitReview = async () => {
    if (!reviewTarget || reviewBusy) return;
    setReviewBusy(true);
    try {
      await submitEventReview(reviewTarget.eventId, reviewStars, reviewComment.trim());
      setPendingReviews((current) => current.filter((row) => row.eventId !== reviewTarget.eventId));
      setReviewTarget(null);
      if (currentEvent?.id === reviewTarget.eventId) setCurrentEventReviewSummary(await loadEventReviewSummary(reviewTarget.eventId).catch(() => currentEventReviewSummary));
      Alert.alert('Merci !', 'Ton avis a été enregistré.');
    } catch {
      Alert.alert('Avis', 'Impossible d’enregistrer ton avis pour le moment.');
    } finally {
      setReviewBusy(false);
    }
  };

  const requireAccount = () => Alert.alert('Compte Loki requis', 'Crée ou connecte ton compte Loki pour répondre aux soirées.', [
    { text: 'Plus tard', style: 'cancel' }, { text: 'Créer / se connecter', onPress: () => useAccountGateStore.getState().requestAccount('create') },
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
    // Adel (08/09/2026) : "tu mets pas des heures par defaut, je veux
    // pouvoir selectionner" -- la roulette a besoin d'une position de
    // depart (aujourd'hui, heure actuelle), mais rien n'est impose : tout
    // reste modifiable en faisant defiler.
    const now = new Date();
    setDateIdx(0); setHourIdx(now.getHours()); setMinuteIdx(now.getMinutes());
    // BUG REEL trouve en direct (Adel, capture d'ecran "Indique la date au
    // format...") : quand les trois index de la roulette tombent tous DEJA
    // sur leur valeur courante (ex. ouvrir Creer juste apres le montage de
    // l'ecran, avant que l'heure/minute n'ait bouge), React ignore ces
    // set*(meme valeur) -- l'effet qui calcule startsAt a partir des index
    // ne se redeclenche alors JAMAIS, et startsAt reste a sa valeur initiale
    // vide. On pose donc startsAt directement ici, sans dependre de cet
    // effet pour la toute premiere valeur.
    setStartsAt(toLocalInputValue(now));
    setCreateOpen(true);
  };

  const parseDate = () => {
    const clean = startsAt.trim(); if (!clean) return null;
    const parsed = new Date(clean.length === 16 ? `${clean}:00` : clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const resetEventForm = () => {
    setCreateOpen(false); setEditingEventId(null);
    setName(''); setStartsAt(''); setVenueName(''); setVenueCoords(null); setVenueSuggestions([]);
    setYoutubeUrl(''); setDescription(''); setMessage(''); setIncludeRsvpButtons(true);
    setEventImageUrl(''); setRequireQrCode(false);
    setOrganizerPhone(''); setShowOrganizerPhone(false);
  };

  const openEdit = (event: CreatorEvent) => {
    setEditingEventId(event.id);
    setName(event.name);
    const eventDate = new Date(event.startsAt);
    const today = new Date();
    const dayDiff = Math.round((new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
    setDateIdx(Math.max(0, Math.min(dateWheelItems.length - 1, dayDiff)));
    setHourIdx(eventDate.getHours());
    setMinuteIdx(eventDate.getMinutes());
    // BUG REEL (meme cause qu'openCreate ci-dessus) : poser startsAt
    // directement depuis la vraie date de l'evenement, sans dependre de
    // l'effet de la roulette pour la valeur initiale.
    setStartsAt(toLocalInputValue(eventDate));
    setVenueName(event.venueName || '');
    setVenueCoords(null);
    setCountryCode(event.countryCode || 'FR');
    setDescription(event.description || '');
    setYoutubeUrl(event.youtubeUrl || '');
    setMessage('');
    setEventImageUrl(event.imageUrl || '');
    setRequireQrCode(event.requireQrCode);
    // Adel (08/09/2026) : la lecture publique masque deja le numero si
    // l'organisateur ne l'affiche pas -- on va chercher le vrai numero
    // (RPC reservee au createur) pour ne pas vider le champ a tort.
    setOrganizerPhone(''); setShowOrganizerPhone(false);
    void loadMyEventOrganizerContact(event.id).then((contact) => {
      setOrganizerPhone(contact.organizerPhone);
      setShowOrganizerPhone(contact.showOrganizerPhone);
    }).catch(() => {});
    setCreateOpen(true);
  };

  const pickEventImage = async () => {
    if (!user || imageUploadBusy) return;
    setImageUploadBusy(true);
    try {
      const url = await pickAndUploadEventImage(user.id);
      if (url) setEventImageUrl(url);
    } catch {
      Alert.alert('Photo', 'Impossible d’ajouter cette photo pour le moment.');
    } finally {
      setImageUploadBusy(false);
    }
  };

  const deleteEvent = (event: CreatorEvent) => {
    // Adel (08/09/2026) : "s'il les efface, il faut que dans le systeme
    // comptabilise comme debit" -- suppression definitive de la visibilite,
    // mais compte toujours dans le quota mensuel (soft delete cote serveur).
    Alert.alert(
      'Supprimer cet événement ?',
      `« ${event.name} » ne sera plus visible et continuera de compter dans ton quota mensuel de créations.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          setEventBusyAction('delete');
          try { await disableCreatorEvent(event.id); await reload(); }
          catch { Alert.alert('Événement', 'Impossible de supprimer cet événement pour le moment.'); }
          finally { setEventBusyAction(null); }
        } },
      ],
    );
  };

  const openParticipants = async (event: CreatorEvent) => {
    setParticipantsOpen(true); setParticipantsLoading(true);
    try { setParticipants(await loadEventParticipants(event.id)); }
    catch { setParticipants([]); }
    finally { setParticipantsLoading(false); }
  };

  const submitCheckinCode = async () => {
    const code = checkinCode.trim();
    if (!code || checkinBusy) return;
    setCheckinBusy(true);
    try {
      const result = await checkinEventTicketByCode(code);
      setCheckinCode('');
      setParticipants((rows) => rows.map((p) => p.profileId === result.profileId ? { ...p, checkedInAt: p.checkedInAt || new Date().toISOString() } : p));
      Alert.alert(result.alreadyCheckedIn ? 'Déjà enregistré' : 'Bienvenue !', `${result.username} — ${result.alreadyCheckedIn ? 'était déjà pointé(e) présent(e).' : 'pointé(e) présent(e) ✅'}`);
    } catch (e: any) {
      const code2 = String(e?.message || '');
      Alert.alert('Billet', code2 === 'TICKET_NOT_FOUND' ? 'Aucun billet ne correspond à ce code.' : 'Impossible de valider ce billet pour le moment.');
    } finally {
      setCheckinBusy(false);
    }
  };

  const toggleParticipantCheckin = async (participant: EventParticipant) => {
    if (!currentEvent || checkinTogglingId) return;
    setCheckinTogglingId(participant.profileId);
    try {
      const checkedIn = await toggleEventCheckin(currentEvent.id, participant.profileId);
      setParticipants((rows) => rows.map((p) => p.profileId === participant.profileId ? { ...p, checkedInAt: checkedIn ? new Date().toISOString() : null } : p));
    } catch {
      Alert.alert('Participants', 'Impossible de mettre à jour le pointage pour le moment.');
    } finally {
      setCheckinTogglingId('');
    }
  };

  // Adel (08/09/2026) : "il pourra dire que je telecharge mon QR code ou un
  // bouton QR code ... l'invite disparaissent automatiquement un jour apres
  // l'evenement" -- le billet reste charge, mais son affichage/telechargement
  // n'est propose que dans la fenetre utile (jusqu'a 24h apres la fin).
  const ticketStillVisible = (ticket: EventTicket | null) => {
    if (!ticket) return false;
    const end = new Date(ticket.endsAt || ticket.startsAt).getTime();
    return Date.now() < end + 24 * 60 * 60 * 1000;
  };

  const openMyTicket = async () => {
    if (!currentEvent) return;
    setTicketModalOpen(true); setTicketLoading(true);
    try { setMyTicket(await loadMyEventTicket(currentEvent.id)); }
    catch { setMyTicket(null); }
    finally { setTicketLoading(false); }
  };

  const downloadTicketIcs = () => {
    if (!myTicket) return;
    const ics = buildEventIcs(myTicket);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([ics], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${myTicket.eventName.replace(/[^a-z0-9]+/gi, '-')}.ics`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      Alert.alert('Agenda', 'Utilise « Ajouter à Google Agenda » pour enregistrer cet évènement.');
    }
  };

  // Adel (08/09/2026) : "publie sans notification pour moi c'est pas
  // logique" -- un evenement cree sans jamais prevenir personne n'a pas de
  // sens ; un seul bouton, qui notifie toujours a la creation (la case a
  // cocher juste au-dessus choisit SEULEMENT si les boutons de reponse sont
  // inclus). Modifier une soiree existante reste silencieux : re-notifier
  // a chaque correction serait du spam.
  const publish = async () => {
    const iso = parseDate();
    if (name.trim().length < 3) return Alert.alert('Événement', 'Indique un nom pour l’événement.');
    if (!iso) return Alert.alert('Événement', 'Indique la date au format AAAA-MM-JJTHH:MM.');
    setCreateBusy(true);
    try {
      const payload = { name: name.trim(), description: description.trim(), venueName: venueName.trim(), startsAt: iso, countryCode: countryCode.trim().toUpperCase().slice(0,2), youtubeUrl: youtubeUrl.trim() || undefined, imageUrl: eventImageUrl.trim() || undefined, requireQrCode, organizerPhone: organizerPhone.trim() || undefined, showOrganizerPhone, lat: venueCoords?.lat, lng: venueCoords?.lng };
      if (editingEventId) {
        await updateCreatorEvent(editingEventId, payload);
        resetEventForm();
        await reload();
        Alert.alert('Événement modifié', 'Les changements sont enregistrés.');
      } else {
        const created = await createCreatorEvent({ ...payload, djArtistNames: user?.username ? [user.username] : [] });
        const sent = await broadcastEventToFollowers(created.id, message.trim(), includeRsvpButtons);
        resetEventForm();
        await reload();
        Alert.alert('Événement publié', `${sent} abonné(s) ont reçu l’invitation Loki.`);
      }
    } catch (e: any) {
      const code = String(e?.message || '');
      if (code.includes('EVENT_FOLLOWERS_REQUIRED')) {
        const [, current, minimum] = code.split(':');
        Alert.alert('Audience requise', `La création d’événements demande au moins ${Number(minimum || 500)} abonnés. Tu en as actuellement ${Number(current || 0)}.`);
      } else if (code.includes('VENUE_PRO_EVENT_LIMIT')) navigation.navigate('Offers', { focusPlan: 'VENUE_PRO', sourceFeature: 'CREATE_EVENT' });
      else if (code.includes('CREATOR_PRO_REQUIRED')) navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'CREATE_EVENT' });
      else Alert.alert('Événement', code || 'Impossible d’enregistrer l’événement pour le moment.');
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
          onRequireAccount={() => Alert.alert(
            'Compte Loki requis',
            'Le mode invité permet d’écouter et de visiter des profils, mais Loki Battle est réservé aux comptes créés. Crée ton compte (pseudo + mot de passe + e-mail) : tu reçois +20 Free offerts et tu peux jouer, gagner des Free et construire ta communauté musicale.',
            [
              { text: 'Plus tard', style: 'cancel' },
              { text: 'Créer mon compte', onPress: () => useAccountGateStore.getState().requestAccount('create') },
            ],
          )}
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
          <Text style={styles.incomingText}><Text style={styles.incomingName}>{challenge.username}</Text> souhaite faire un Battle avec toi ({themeLabels[challenge.themeCode] || challenge.themeCode} · {challenge.roundCount} morceaux). Acceptes-tu ?</Text>
          <View style={styles.incomingActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser le Battle" disabled={incomingResponding === challenge.id} style={[styles.incomingNo, incomingResponding === challenge.id && styles.incomingBusy]} onPress={() => respondIncomingBattle(challenge, false)}><Text style={styles.incomingNoText}>REFUSER</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter le Battle" disabled={incomingResponding === challenge.id} style={[styles.incomingYes, incomingResponding === challenge.id && styles.incomingBusy]} onPress={() => respondIncomingBattle(challenge, true)}><Text style={styles.incomingYesText}>{incomingResponding === challenge.id ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity>
          </View>
        </View>
      ))}
      {!incomingBattle.length ? pendingRematchLB.map((item) => (
        <View key={item.arenaId} style={styles.incomingBanner}>
          <Text style={styles.incomingText}>🔁 Revanche proposée avec {item.participantUsernames.map((u) => `${u}`).join(', ') || 'le groupe'}. Acceptes-tu ?</Text>
          <View style={styles.incomingActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refuser la revanche" disabled={rematchResponding === item.arenaId} style={[styles.incomingNo, rematchResponding === item.arenaId && styles.incomingBusy]} onPress={() => respondPendingRematchLB(item, false)}><Text style={styles.incomingNoText}>REFUSER</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Accepter la revanche" disabled={rematchResponding === item.arenaId} style={[styles.incomingYes, rematchResponding === item.arenaId && styles.incomingBusy]} onPress={() => respondPendingRematchLB(item, true)}><Text style={styles.incomingYesText}>{rematchResponding === item.arenaId ? 'CONNEXION…' : 'ACCEPTER'}</Text></TouchableOpacity>
          </View>
        </View>
      )) : null}

      {partiesTab === 'SOIREES' ? <>
        {!eventAccess || !['CREATOR_PRO','VENUE_PRO'].includes(eventAccess.planCode) ? <TouchableOpacity style={styles.creatorHint} onPress={() => void openCreate()}><Text style={styles.creatorHintText}>🔒 À partir de {minEventFollowers} abonnés : Creator Pro 9,99 € · 1 événement/mois. Venue Pro 29,99 € · événements illimités.</Text></TouchableOpacity>
          : !audienceReady ? <TouchableOpacity style={styles.creatorHint} onPress={() => void openCreate()}><Text style={styles.creatorHintText}>🔒 Audience événements : {followers}/{minEventFollowers} abonnés. La formule est prête, il reste à atteindre le seuil communautaire.</Text></TouchableOpacity>
            : eventAccess.planCode === 'CREATOR_PRO' ? <TouchableOpacity style={styles.creatorHint} onPress={() => !canCreate && navigation.navigate('Offers',{focusPlan:'VENUE_PRO',sourceFeature:'CREATE_EVENT'})}><Text style={styles.creatorHintText}>{canCreate ? `Creator Pro : ta création du mois est disponible · seuil ${minEventFollowers} abonnés atteint.` : 'Limite du mois atteinte · Venue Pro débloque les événements en illimité.'}</Text></TouchableOpacity>
              : <View style={styles.creatorHint}><Text style={styles.creatorHintText}>Venue Pro : événements illimités · seuil {minEventFollowers} abonnés atteint.</Text></View>}

        {loading ? <ActivityIndicator color={colors.primaryLight}/> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading&&!error&&!currentEvent ? <View style={styles.empty}><Text style={styles.emptyTitle}>Aucun événement publié pour le moment.</Text><Text style={styles.meta}>Les invitations de tes artistes, DJ et lieux suivis apparaîtront ici.</Text></View> : null}

        {/* Adel (08/09/2026) : "systeme d'etoile ... comprendre pourquoi il
            a eu un flop" -- proposer de noter une soiree passee des qu'il y
            en a une en attente, sans devoir la retrouver ailleurs. */}
        {pendingReviews.map((row) => (
          <TouchableOpacity key={row.eventId} style={styles.reviewPrompt} onPress={() => openReview(row)}>
            <Text style={styles.reviewPromptTitle}>⭐ Donne ton avis sur « {row.name} »</Text>
            <Text style={styles.reviewPromptMeta}>{new Date(row.startsAt).toLocaleDateString('fr-FR')} · {row.creatorUsername}{row.venueName ? ` · ${row.venueName}` : ''}</Text>
          </TouchableOpacity>
        ))}

        {currentEvent ? <>
          <SwipeDeck resetKey={currentEvent.id} enabled={busyId!==currentEvent.id} onSwipeLeft={()=>chooseRsvp(currentEvent.id,'NOT_GOING',true)} onSwipeRight={()=>chooseRsvp(currentEvent.id,'GOING',true)} leftLabel="NON" rightLabel="J’Y VAIS" hint="Glisse si tu veux · les boutons fonctionnent aussi sans swipe">
            <View style={styles.card}>
              {/* Adel (08/09/2026) : "une piece jointe comme une photo de
                  l'evenement ... ca va se presenter un peu comme le style
                  musical" -- affiche en poster plein cadre avec un degrade
                  sombre, comme une pochette, jamais un simple carre annexe. */}
              {currentEvent.imageUrl ? <>
                <Image source={{ uri: currentEvent.imageUrl }} style={styles.cardCoverImage} resizeMode="cover" />
                <LinearGradient colors={['rgba(9,6,16,0)', 'rgba(9,6,16,.55)', 'rgba(9,6,16,.96)']} style={styles.cardCoverGradient} />
              </> : null}
              <View style={styles.badge}><Text style={styles.badgeText}>ÉVÉNEMENT</Text></View><Text style={styles.eventName}>{currentEvent.name}</Text><Text style={styles.date}>{dateText}</Text><Text style={styles.meta}>{[currentEvent.venueName,currentEvent.countryCode].filter(Boolean).join(' · ')}</Text>{currentEventReviewSummary && currentEventReviewSummary.reviewCount > 0 ? <Text style={styles.reviewSummary}>⭐ {currentEventReviewSummary.averageRating.toFixed(1)} · {currentEventReviewSummary.reviewCount} avis</Text> : null}{user?.id === currentEvent.creatorId && rsvpCounts && (rsvpCounts.going + rsvpCounts.maybe + rsvpCounts.notGoing) > 0 ? <Text style={styles.rsvpCountsText}>✓ {rsvpCounts.going} participent · {rsvpCounts.maybe} peut-être · {rsvpCounts.notGoing} ne viennent pas</Text> : null}{currentEvent.djArtistNames.length?<Text style={styles.dj}>{currentEvent.djArtistNames.map((n)=>`${n.replace(/^@+/,'')}`).join(' · ')}</Text>:null}{currentEvent.description?<Text style={styles.description}>{currentEvent.description}</Text>:null}{(currentEvent.youtubeUrl || currentEvent.organizerPhone) ? <View style={styles.eventLinksRow}>{currentEvent.youtubeUrl?<TouchableOpacity style={styles.youtubeLink} onPress={()=>{void Linking.openURL(currentEvent.youtubeUrl as string);}}><Text style={styles.youtubeLinkText}>▶ Voir sur YouTube</Text></TouchableOpacity>:null}{currentEvent.organizerPhone?<TouchableOpacity style={styles.callOrganizerLink} onPress={()=>{void Linking.openURL(`tel:${currentEvent.organizerPhone}`);}}><View style={styles.callOrganizerIcon}><Text style={styles.callOrganizerIconText}>📞</Text></View><View><Text style={styles.callOrganizerLabel}>Appeler l’organisateur</Text><Text style={styles.callOrganizerNumber}>{currentEvent.organizerPhone}</Text></View></TouchableOpacity>:null}</View> : null}<View style={styles.currentAnswer}><Text style={styles.currentAnswerText}>{currentRsvp?RSVP_LABEL[currentRsvp]:'Pas encore de réponse'}</Text></View></View>
          </SwipeDeck>
          <View style={styles.rsvpRow}><TouchableOpacity style={[styles.roundAction,styles.noAction]} onPress={()=>void chooseRsvp(currentEvent.id,'NOT_GOING',true)}><Text style={styles.noText}>✕</Text></TouchableOpacity><TouchableOpacity style={[styles.maybeAction,currentRsvp==='MAYBE'&&styles.maybeActionOn]} onPress={()=>void chooseRsvp(currentEvent.id,'MAYBE')}><Text style={styles.maybeText}>PEUT-ÊTRE</Text></TouchableOpacity><TouchableOpacity style={[styles.roundAction,styles.yesAction]} onPress={()=>void chooseRsvp(currentEvent.id,'GOING',true)}>{busyId===currentEvent.id?<ActivityIndicator color="#111"/>:<Text style={styles.yesText}>✓</Text>}</TouchableOpacity></View>
          <View style={styles.secondaryRow}><TouchableOpacity style={styles.secondary} onPress={nextEvent}><Text style={styles.secondaryText}>Suivant</Text></TouchableOpacity><TouchableOpacity style={styles.secondary} onPress={()=>shareEvent(currentEvent.id,currentEvent.name).catch(()=>{})}><Text style={styles.secondaryText}>↗ Partager</Text></TouchableOpacity></View>
          {/* Adel (08/09/2026) : "il pourra dire que je telecharge mon QR
              code ou un bouton QR code" -- reserve a qui participe a un
              evenement qui impose le QR. */}
          {currentEvent.requireQrCode && currentRsvp === 'GOING' ? <TouchableOpacity style={styles.ticketButton} onPress={() => void openMyTicket()}><Text style={styles.ticketButtonText}>🎟 Mon billet</Text></TouchableOpacity> : null}
          {/* Adel (08/09/2026) : "il puisse effacer les evenements qu'il a
              deja mis, tous les modifier ... voir tous les participants" --
              reserve a l'organisateur de CETTE soiree. */}
          {user?.id === currentEvent.creatorId ? <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondary} onPress={()=>openEdit(currentEvent)}><Text style={styles.secondaryText}>✎ Modifier</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={()=>void openParticipants(currentEvent)}><Text style={styles.secondaryText}>👥 Participants</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.secondary,styles.secondaryDanger]} disabled={eventBusyAction==='delete'} onPress={()=>deleteEvent(currentEvent)}>{eventBusyAction==='delete'?<ActivityIndicator color="#FF6C8C"/>:<Text style={[styles.secondaryText,styles.secondaryDangerText]}>Supprimer</Text>}</TouchableOpacity>
          </View> : null}
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
              <View style={styles.battleLauncherKickerRow}>
                <Text style={styles.battleLauncherKicker}>Loki BATTLE</Text>
                {battleFreeBalance != null ? <View style={[styles.battleLauncherFreeBadge, { backgroundColor: `${myTierColors.colors[myTierColors.colors.length - 1]}33`, borderColor: myTierColors.ring }]}><Text style={[styles.battleLauncherFreeBadgeText, { color: myTierColors.ring }]}>{battleFreeBalance} Free</Text></View> : null}
              </View>
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
                    <View style={styles.leaderboardNameRow}>
                      <Text numberOfLines={1} style={styles.leaderboardName}>{entry.username}</Text>
                      {leaderboardTiers[entry.profileId] ? <ProfileCertificationBadge tier={leaderboardTiers[entry.profileId]} compact /> : null}
                    </View>
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
              <View style={styles.statsUsernameRow}><Text style={styles.statsUsername}>{statsEntry.username}</Text>{leaderboardTiers[statsEntry.profileId] ? <ProfileCertificationBadge tier={leaderboardTiers[statsEntry.profileId]} compact /> : null}</View>
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
                <Text style={styles.creditHistoryNextCredit}>📅 Prochain versement mensuel dans {(() => { const now = new Date(); const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1); return Math.max(1, Math.ceil((nextFirst.getTime() - now.getTime()) / 86400000)); })()} jour(s) (le 1er du mois)</Text>
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

    <Modal visible={createOpen} transparent animationType="slide" onRequestClose={resetEventForm}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{editingEventId ? 'Modifier l’événement' : 'Créer un événement'}</Text><TouchableOpacity onPress={resetEventForm}><Text style={styles.close}>Fermer</Text></TouchableOpacity></View><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nom de l’événement" placeholderTextColor={colors.textMuted}/>
      {/* Adel (08/09/2026) : "mets un systeme de roulette pour la date et
          l'heure ... je veux pouvoir selectionner une heure et 45 minutes,
          2h14, etc." -- trois roulettes (date / heure / minute), aucune
          valeur n'est imposee au clic, tout se choisit en faisant defiler. */}
      <Text style={styles.wheelSectionLabel}>Date et heure</Text>
      <View style={styles.wheelRow}>
        <WheelPicker items={dateWheelItems.map((d) => d.label)} selectedIndex={dateIdx} onChange={setDateIdx} width={158} />
        <WheelPicker items={HOUR_WHEEL_ITEMS} selectedIndex={hourIdx} onChange={setHourIdx} width={52} />
        <Text style={styles.wheelColon}>:</Text>
        <WheelPicker items={MINUTE_WHEEL_ITEMS} selectedIndex={minuteIdx} onChange={setMinuteIdx} width={52} />
      </View>
      {startsAt ? <Text style={styles.wheelSummary}>📅 {new Date(`${startsAt}:00`).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</Text> : null}
      {/* Adel (08/09/2026) : "une piece jointe comme une photo de
          l'evenement" */}
      <TouchableOpacity style={styles.imagePickerButton} onPress={() => void pickEventImage()} disabled={imageUploadBusy}>
        {eventImageUrl ? <Image source={{ uri: eventImageUrl }} style={styles.imagePickerPreview} resizeMode="cover" /> : null}
        <Text style={styles.imagePickerText}>{imageUploadBusy ? 'Envoi…' : eventImageUrl ? '✎ Changer la photo' : '📷 Ajouter une photo (affiche + le style musical)'}</Text>
      </TouchableOpacity>
      {/* Adel (08/09/2026) : "souhaitez-vous imposer le QR code de
          l'utilisateur ... chacun invite ... que ca fasse classe" */}
      <TouchableOpacity style={styles.rsvpToggleRow} onPress={() => setRequireQrCode((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: requireQrCode }}>
        <View style={[styles.rsvpToggleBox, requireQrCode && styles.rsvpToggleBoxOn]}>{requireQrCode ? <Text style={styles.rsvpToggleCheck}>✓</Text> : null}</View>
        <View style={{ flex: 1 }}><Text style={styles.rsvpToggleLabel}>Souhaitez-vous imposer le QR code personnel ?</Text><Text style={styles.rsvpToggleHint}>Chaque personne qui participe reçoit un billet individuel à son pseudo, à présenter le soir même. Tu pourras pointer les présents.</Text></View>
      </TouchableOpacity>
      {/* Adel (08/09/2026) : "un numero de telephone ... je souhaite montrer
          mon numero de telephone ou pas" -- optionnel, masque par defaut. */}
      <TextInput style={styles.input} value={organizerPhone} onChangeText={setOrganizerPhone} placeholder="Ton téléphone (optionnel)" placeholderTextColor={colors.textMuted} keyboardType="phone-pad"/>
      {organizerPhone.trim() ? <TouchableOpacity style={styles.rsvpToggleRow} onPress={() => setShowOrganizerPhone((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: showOrganizerPhone }}>
        <View style={[styles.rsvpToggleBox, showOrganizerPhone && styles.rsvpToggleBoxOn]}>{showOrganizerPhone ? <Text style={styles.rsvpToggleCheck}>✓</Text> : null}</View>
        <View style={{ flex: 1 }}><Text style={styles.rsvpToggleLabel}>Afficher mon numéro sur l’évènement ?</Text><Text style={styles.rsvpToggleHint}>Visible par tous, avec un bouton pour t’appeler directement. Décoché : ton numéro reste privé.</Text></View>
      </TouchableOpacity> : null}
      {/* Adel (08/09/2026) : "le systeme puisse proposer des adresses
          automatiquement selon le pays ... le FR doit etre automatique" --
          suggestions en direct pendant la saisie, biaisees sur countryCode
          (FR par defaut) ; choisir une suggestion fige aussi sa position. */}
      <View style={styles.venueInputRow}>
        <TextInput style={[styles.input, styles.venueInput]} value={venueName} onChangeText={(v) => { setVenueName(v); setVenueCoords(null); }} placeholder="Lieu (tape une adresse…)" placeholderTextColor={colors.textMuted}/>
        {/* Adel (08/09/2026) : "va t'inspirer des grandes plateformes" -- bouton
            "utiliser ma position", comme Airbnb/Eventbrite quand on cree
            l'evenement depuis le lieu meme. */}
        <TouchableOpacity style={styles.venueLocateButton} onPress={() => void useMyLocationForVenue()} disabled={locatingVenue} accessibilityLabel="Utiliser ma position actuelle">
          {locatingVenue ? <ActivityIndicator color="#8B5CF6"/> : <Text style={styles.venueLocateIcon}>📍</Text>}
        </TouchableOpacity>
      </View>
      {venueSearchBusy ? <ActivityIndicator color="#8B5CF6" style={styles.venueSuggestionsLoading}/> : venueSuggestions.length ? <View style={styles.venueSuggestions}>{venueSuggestions.map((s, i) => (
        <TouchableOpacity key={`${s.lat}-${s.lng}-${i}`} style={styles.venueSuggestionRow} onPress={() => pickVenueSuggestion(s)}>
          <Text style={styles.venueSuggestionPrimary} numberOfLines={1}>{s.primaryText}</Text>
          {s.secondaryText ? <Text style={styles.venueSuggestionSecondary} numberOfLines={1}>{s.secondaryText}</Text> : null}
        </TouchableOpacity>
      ))}</View> : null}
      <TextInput style={styles.input} value={countryCode} onChangeText={setCountryCode} placeholder="Pays (FR)" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={2}/><TextInput style={[styles.input,styles.multiline]} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={colors.textMuted} multiline/>
      {/* Adel (08/09/2026) : "un lien YouTube pour montrer les evenements,
          la decoration, etc." */}
      <TextInput style={styles.input} value={youtubeUrl} onChangeText={setYoutubeUrl} placeholder="Lien YouTube (optionnel)" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="url"/>
      <TextInput style={[styles.input,styles.multiline]} value={message} onChangeText={setMessage} placeholder="Message à tes abonnés (optionnel)" placeholderTextColor={colors.textMuted} multiline/>
      {/* Adel (08/09/2026) : "est-ce que je peux la faire uniquement en
          notification ou avec deux boutons ... l'utilisateur puisse cocher
          cette fonction ... il aura le nombre d'utilisateurs qui participe"
          -- pas de sens de modifier une soiree deja publiee sans notifier de
          nouveau les gens deja repondus, donc reserve a la creation. */}
      {!editingEventId ? <TouchableOpacity style={styles.rsvpToggleRow} onPress={() => setIncludeRsvpButtons((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: includeRsvpButtons }}>
        <View style={[styles.rsvpToggleBox, includeRsvpButtons && styles.rsvpToggleBoxOn]}>{includeRsvpButtons ? <Text style={styles.rsvpToggleCheck}>✓</Text> : null}</View>
        <View style={{ flex: 1 }}><Text style={styles.rsvpToggleLabel}>Ajouter les boutons Participe / Plus tard / Je ne viens pas</Text><Text style={styles.rsvpToggleHint}>Coché : tu verras le nombre de réponses par catégorie. Décoché : simple notification, sans réponse attendue.</Text></View>
      </TouchableOpacity> : null}
      {/* Adel (08/09/2026) : "publie sans notification pour moi c'est pas
          logique" -- un seul bouton desormais, qui notifie toujours à la
          création. */}
      <TouchableOpacity style={styles.publish} onPress={()=>void publish()} disabled={createBusy}>{createBusy?<ActivityIndicator color="#FFF"/>:<Text style={styles.publishText}>{editingEventId ? 'ENREGISTRER LES MODIFICATIONS' : 'PUBLIER + NOTIFIER'}</Text>}</TouchableOpacity>
    </ScrollView></View></View></Modal>

    {/* Adel (08/09/2026) : "voir tous les participants" */}
    <Modal visible={participantsOpen} transparent animationType="slide" onRequestClose={() => setParticipantsOpen(false)}>
      <View style={styles.backdrop}><View style={styles.sheet}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>Participants</Text><TouchableOpacity onPress={() => setParticipantsOpen(false)}><Text style={styles.close}>Fermer</Text></TouchableOpacity></View>
        {/* Adel (08/09/2026) : "il pourra le scanner" -- saisie du code du
            billet (dicté ou lu par le participant) : pas de camera pour
            l'instant, mais le pointage lui-même est bien reel et immediat. */}
        <View style={styles.checkinRow}>
          <TextInput style={[styles.input, styles.checkinInput]} value={checkinCode} onChangeText={setCheckinCode} placeholder="Code du billet" placeholderTextColor={colors.textMuted} autoCapitalize="characters"/>
          <TouchableOpacity style={styles.checkinButton} disabled={checkinBusy || !checkinCode.trim()} onPress={() => void submitCheckinCode()}>{checkinBusy ? <ActivityIndicator color="#111"/> : <Text style={styles.checkinButtonText}>Valider</Text>}</TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {participantsLoading ? <ActivityIndicator color={colors.primaryLight}/> : participants.length ? participants.map((p) => (
            <View key={p.profileId} style={styles.participantRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.participantNameRow}><Text style={styles.participantName} numberOfLines={1}>{p.username}</Text><ProfileCertificationBadge tier={p.certificationTier} compact/></View>
                {p.ticketCode ? <Text style={styles.participantTicket}>{p.checkedInAt ? '✅ Présent' : '🎟 Billet non scanné'}</Text> : null}
              </View>
              <Text style={[styles.participantStatus, p.status==='GOING'&&styles.participantStatusGoing, p.status==='NOT_GOING'&&styles.participantStatusNotGoing]}>{RSVP_LABEL[p.status]}</Text>
              {p.status === 'GOING' ? <TouchableOpacity style={[styles.participantCheckinBtn, p.checkedInAt && styles.participantCheckinBtnOn]} disabled={checkinTogglingId===p.profileId} onPress={() => void toggleParticipantCheckin(p)}>
                {checkinTogglingId===p.profileId ? <ActivityIndicator color="#111"/> : <Text style={[styles.participantCheckinBtnText, p.checkedInAt && styles.participantCheckinBtnTextOn]}>{p.checkedInAt ? '✓' : 'Présent ?'}</Text>}
              </TouchableOpacity> : null}
            </View>
          )) : <Text style={styles.meta}>Personne n’a encore répondu.</Text>}
        </ScrollView>
      </View></View>
    </Modal>

    {/* Adel (08/09/2026) : "il pourra dire que je telecharge mon QR code ...
        l'integrer sur son agenda Google ... comme il sort de Apple" -- billet
        personnel (pseudo + QR) + export agenda (Google + .ics pour Apple/
        Outlook), sans nouvelle dependance native. */}
    <Modal visible={ticketModalOpen} transparent animationType="fade" onRequestClose={() => setTicketModalOpen(false)}>
      <View style={styles.statsBackdrop}><View style={styles.ticketCard}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer" style={styles.statsClose} onPress={() => setTicketModalOpen(false)}><Text style={styles.statsCloseText}>×</Text></TouchableOpacity>
        {ticketLoading ? <ActivityIndicator color={colors.primaryLight} style={{ marginTop: 30 }}/> : myTicket && ticketStillVisible(myTicket) ? <>
          <Text style={styles.ticketEventName}>{myTicket.eventName}</Text>
          <Text style={styles.ticketMeta}>{new Date(myTicket.startsAt).toLocaleString('fr-FR', { weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' })}{myTicket.venueName ? ` · ${myTicket.venueName}` : ''}</Text>
          {myTicket.ticketCode ? <>
            <View style={styles.ticketQrFrame}><Image source={{ uri: qrImageUrl(`LOKI-TICKET:${myTicket.eventId}:${myTicket.ticketCode}`) }} style={styles.ticketQrImage}/></View>
            <Text style={styles.ticketUsername}>{myTicket.username}</Text>
            <Text style={styles.ticketCode}>{myTicket.ticketCode}</Text>
            <Text style={styles.ticketHint}>{myTicket.checkedInAt ? '✅ Déjà scanné à l’entrée' : 'Présente ce QR code à l’entrée.'}</Text>
          </> : <Text style={styles.ticketHint}>Ton billet arrive dans un instant.</Text>}
          <View style={styles.ticketCalendarRow}>
            <TouchableOpacity style={styles.ticketCalendarButton} onPress={() => { void Linking.openURL(buildGoogleCalendarUrl(myTicket)); }}><Text style={styles.ticketCalendarButtonText}>📅 Google Agenda</Text></TouchableOpacity>
            <TouchableOpacity style={styles.ticketCalendarButton} onPress={downloadTicketIcs}><Text style={styles.ticketCalendarButtonText}>⤓ .ics (Apple/Outlook)</Text></TouchableOpacity>
          </View>
        </> : <Text style={styles.meta}>Billet indisponible (l’évènement est déjà loin derrière nous).</Text>}
      </View></View>
    </Modal>

    {/* Adel (08/09/2026) : "systeme d'etoile ... un commentaire" */}
    <Modal visible={!!reviewTarget} transparent animationType="fade" onRequestClose={() => setReviewTarget(null)}>
      <View style={styles.backdrop}><View style={styles.reviewSheet}>
        <Text style={styles.modalTitle}>{reviewTarget?.name}</Text>
        <Text style={styles.reviewPromptMeta}>{reviewTarget ? new Date(reviewTarget.startsAt).toLocaleDateString('fr-FR') : ''}</Text>
        <View style={styles.reviewStars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setReviewStars(n)} accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`}>
              <Text style={styles.reviewStar}>{n <= reviewStars ? '★' : '☆'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={[styles.input, styles.multiline]} value={reviewComment} onChangeText={setReviewComment} placeholder="Ton commentaire (optionnel)" placeholderTextColor={colors.textMuted} multiline maxLength={500}/>
        <TouchableOpacity style={styles.publish} onPress={() => void submitReview()} disabled={reviewBusy}>{reviewBusy ? <ActivityIndicator color="#FFF"/> : <Text style={styles.publishText}>ENVOYER MON AVIS</Text>}</TouchableOpacity>
        <TouchableOpacity style={styles.publishSecondary} onPress={() => setReviewTarget(null)}><Text style={styles.publishSecondaryText}>Plus tard</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
container:{flex:1,backgroundColor:'#090610'},partiesTabs:{flexDirection:'row',gap:8,marginBottom:spacing.lg},partiesTabBtn:{flex:1,minHeight:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#151020',borderWidth:1,borderColor:'#312348'},partiesTabBtnOn:{backgroundColor:'#8B5CF6',borderColor:'#8B5CF6'},partiesTabText:{color:'#F8F6FC',fontSize:12,fontWeight:'900'},partiesTabTextOn:{color:'#FFF'},leaderboardPanel:{marginBottom:spacing.lg,padding:12,borderRadius:18,borderWidth:1,borderColor:'#40334B',backgroundColor:'#151020',gap:6},leaderboardHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},myRankingButton:{minHeight:30,paddingHorizontal:10,borderRadius:15,borderWidth:1,borderColor:'#8B5CF6',backgroundColor:'#21182F',alignItems:'center',justifyContent:'center'},myRankingButtonText:{color:'#FFF',fontSize:9,fontWeight:'900'},leaderboardTitle:{color:'#E5F266',fontSize:12,fontWeight:'900',letterSpacing:.8,marginBottom:2},leaderboardHint:{color:'#8F879D',fontSize:10,fontWeight:'700',marginBottom:2},leaderboardRow:{minHeight:38,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:9,borderRadius:12,backgroundColor:'#1B1422'},leaderboardTrophy:{width:22,textAlign:'center',fontSize:13,color:'#FFF',fontWeight:'900'},leaderboardNameRow:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6},leaderboardName:{flexShrink:1,color:'#FFF',fontSize:13,fontWeight:'900'},leaderboardWins:{color:'#E5F266',fontSize:11,fontWeight:'900'},leaderboardStats:{color:'#B79CFF',fontSize:11,fontWeight:'800'},leaderboardSpecialty:{color:'#E5F266',fontSize:10,fontWeight:'800',marginTop:1},leaderboardPresence:{color:'#6EE8A7',fontSize:10,fontWeight:'800',marginTop:1},leaderboardChevron:{color:'#8F879D',fontSize:16,fontWeight:'900',marginLeft:2},battleFullscreen:{flex:1,paddingHorizontal:12,paddingTop:4,paddingBottom:4},battleLauncher:{minHeight:72,marginTop:spacing.lg,marginBottom:spacing.md,paddingHorizontal:12,paddingVertical:10,borderRadius:17,backgroundColor:'#151020',borderWidth:1,borderColor:'#E5F266',flexDirection:'row',alignItems:'center',gap:9},battleLauncherIcon:{width:42,height:42,borderRadius:21,backgroundColor:'#2A1A14',borderWidth:1,borderColor:'#D6AA36',alignItems:'center',justifyContent:'center'},battleLauncherBolt:{fontSize:19},battleLauncherCopy:{flex:1,minWidth:0},battleLauncherKicker:{color:'#D6AA36',fontSize:12,fontWeight:'900',letterSpacing:1},battleLauncherKickerRow:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},battleLauncherFreeBadge:{minHeight:18,paddingHorizontal:7,borderRadius:9,backgroundColor:'#123D2C',borderWidth:1,borderColor:'#31C981',alignItems:'center',justifyContent:'center'},battleLauncherFreeBadgeText:{color:'#7CF2B9',fontSize:10,fontWeight:'900'},battleLauncherTitle:{color:'#FFFFFF',fontSize:16,fontWeight:'900',marginTop:1},battleLauncherMeta:{color:'#FFFFFF',fontSize:12,lineHeight:17,fontWeight:'700',marginTop:2},battleLauncherOpen:{color:'#E5F266',fontSize:12,fontWeight:'900'},content:{padding:spacing.xl,paddingBottom:spacing.xxxl},headerRow:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:spacing.md},title:{...typography.h1,color:'#F8F6FC'},subtitle:{color:'#FFFFFF',fontSize:14,lineHeight:19,marginTop:3,fontWeight:'700'},createButton:{minHeight:42,paddingHorizontal:12,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#8B5CF6'},createButtonLocked:{backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},createButtonText:{color:'#FFF',fontSize:12,fontWeight:'900'},creatorHint:{padding:10,borderRadius:13,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',marginBottom:spacing.lg},creatorHintText:{color:'#F8F6FC',fontSize:12,lineHeight:17,textAlign:'center',fontWeight:'800'},error:{color:colors.danger,textAlign:'center',paddingVertical:18},empty:{backgroundColor:'#151020',borderRadius:18,padding:spacing.lg,borderWidth:1,borderColor:'#312348'},emptyTitle:{color:'#F8F6FC',fontSize:15,fontWeight:'900',marginBottom:6},card:{height:420,borderRadius:26,padding:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end',overflow:'hidden'},badge:{alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:5,borderRadius:radius.pill,backgroundColor:'rgba(139,92,246,.16)',marginBottom:10},badgeText:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:1},eventName:{color:'#FFF',fontSize:28,lineHeight:32,fontWeight:'900'},date:{color:'#E5F266',fontSize:13,fontWeight:'900',marginTop:8},meta:{color:'#FFFFFF',fontSize:12,marginTop:5,fontWeight:'700'},dj:{color:'#E1D7FF',fontSize:12,fontWeight:'800',marginTop:5},description:{color:'#F8F6FC',fontSize:12,lineHeight:18,marginTop:14,fontWeight:'700'},reviewSummary:{color:'#FFD166',fontSize:12,fontWeight:'900',marginTop:6},rsvpCountsText:{color:'#B79CFF',fontSize:11,fontWeight:'800',marginTop:6},rsvpToggleRow:{flexDirection:'row',alignItems:'flex-start',gap:10,marginBottom:9,padding:10,borderRadius:14,backgroundColor:'#17121D',borderWidth:1,borderColor:'#3B2E4E'},rsvpToggleBox:{width:22,height:22,borderRadius:6,borderWidth:2,borderColor:'#8B5CF6',alignItems:'center',justifyContent:'center',marginTop:1},rsvpToggleBoxOn:{backgroundColor:'#8B5CF6'},rsvpToggleCheck:{color:'#FFF',fontSize:13,fontWeight:'900'},rsvpToggleLabel:{color:'#F8F6FC',fontSize:12,fontWeight:'800'},rsvpToggleHint:{color:'#8F879D',fontSize:10,lineHeight:14,fontWeight:'700',marginTop:2},reviewPrompt:{marginBottom:spacing.md,padding:12,borderRadius:16,borderWidth:1,borderColor:'#FFD166',backgroundColor:'#241D0F'},reviewPromptTitle:{color:'#FFD166',fontSize:12,fontWeight:'900'},reviewPromptMeta:{color:'#F8F6FC',fontSize:11,fontWeight:'700',marginTop:3},reviewSheet:{width:'100%',maxWidth:420,alignSelf:'center',borderRadius:26,padding:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},reviewStars:{flexDirection:'row',justifyContent:'center',gap:8,marginVertical:14},reviewStar:{color:'#FFD166',fontSize:34},eventLinksRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},youtubeLink:{minHeight:34,paddingHorizontal:12,borderRadius:17,backgroundColor:'#3A1116',borderWidth:1,borderColor:'#FF4B4B',alignItems:'center',justifyContent:'center'},youtubeLinkText:{color:'#FF6C6C',fontSize:11,fontWeight:'900'},callOrganizerLink:{minHeight:52,paddingHorizontal:12,paddingVertical:7,borderRadius:16,backgroundColor:'#0F2A1D',borderWidth:1,borderColor:'#38D990',flexDirection:'row',alignItems:'center',gap:9},callOrganizerIcon:{width:32,height:32,borderRadius:16,backgroundColor:'#123D2C',alignItems:'center',justifyContent:'center'},callOrganizerIconText:{fontSize:15},callOrganizerLabel:{color:'#7CF2B9',fontSize:10,fontWeight:'900',letterSpacing:.3},callOrganizerNumber:{color:'#FFFFFF',fontSize:13,fontWeight:'900',marginTop:1},currentAnswer:{alignSelf:'flex-start',marginTop:16,paddingHorizontal:10,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'#21182F'},currentAnswerText:{color:'#FFF',fontSize:12,fontWeight:'900'},rsvpRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:18,marginTop:16},roundAction:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',borderWidth:2},noAction:{borderColor:'#FF5F83',backgroundColor:'#151020'},yesAction:{borderColor:'#E5F266',backgroundColor:'#E5F266'},noText:{color:'#FF5F83',fontSize:26,fontWeight:'800'},yesText:{color:'#17130B',fontSize:25,fontWeight:'900'},maybeAction:{minHeight:44,paddingHorizontal:15,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},maybeActionOn:{borderColor:'#B79CFF',backgroundColor:'#34234F'},maybeText:{color:'#F8F6FC',fontSize:12,fontWeight:'900'},secondaryRow:{flexDirection:'row',gap:8,marginTop:12},secondary:{flex:1,minHeight:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#151020',borderWidth:1,borderColor:'#312348'},secondaryText:{color:'#F8F6FC',fontSize:12,fontWeight:'800'},secondaryDanger:{borderColor:'#FF6C8C'},secondaryDangerText:{color:'#FF6C8C'},participantRow:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,paddingHorizontal:4,borderBottomWidth:1,borderBottomColor:'#241D30'},participantNameRow:{flexDirection:'row',alignItems:'center',gap:6},participantName:{color:'#F8F6FC',fontSize:13,fontWeight:'800',flexShrink:1},participantStatus:{color:'#B79CFF',fontSize:11,fontWeight:'900'},participantStatusGoing:{color:'#38D990'},participantStatusNotGoing:{color:'#FF6C8C'},backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'flex-end'},sheet:{maxHeight:'88%',backgroundColor:'#151020',borderTopLeftRadius:26,borderTopRightRadius:26,borderWidth:1,borderColor:'#493369',padding:18},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},modalTitle:{color:'#FFF',fontSize:18,fontWeight:'900'},close:{color:'#E1D7FF',fontSize:12,fontWeight:'900'},input:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#3B2E4E',backgroundColor:'#0F0B15',color:'#FFF',paddingHorizontal:12,marginBottom:9},venueInputRow:{flexDirection:'row',alignItems:'center',gap:8},venueInput:{flex:1},venueLocateButton:{width:48,height:48,borderRadius:14,marginBottom:9,backgroundColor:'#0F0B15',borderWidth:1,borderColor:'#3B2E4E',alignItems:'center',justifyContent:'center'},venueLocateIcon:{fontSize:18},venueSuggestions:{marginTop:-4,marginBottom:9,borderRadius:14,borderWidth:1,borderColor:'#3B2E4E',backgroundColor:'#17121D',overflow:'hidden'},venueSuggestionRow:{minHeight:44,paddingHorizontal:12,paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#241B30'},venueSuggestionPrimary:{color:'#F8F6FC',fontSize:12,fontWeight:'800'},venueSuggestionSecondary:{color:'#8F879D',fontSize:10,fontWeight:'700',marginTop:1},venueSuggestionsLoading:{marginTop:-4,marginBottom:9},multiline:{minHeight:84,paddingTop:12,textAlignVertical:'top'},publish:{minHeight:50,borderRadius:25,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center',marginTop:5},publishText:{color:'#FFF',fontSize:12,fontWeight:'900'},publishSecondary:{minHeight:42,alignItems:'center',justifyContent:'center'},publishSecondaryText:{color:'#F8F6FC',fontSize:12,fontWeight:'800'},
statsBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',alignItems:'center',justifyContent:'center',padding:spacing.lg},statsCard:{width:'100%',maxWidth:400,borderRadius:26,padding:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},myRankingCard:{width:'100%',maxWidth:400,maxHeight:'82%',borderRadius:26,padding:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},creditHistoryRow:{minHeight:38,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,paddingHorizontal:10,borderRadius:12,backgroundColor:'#1B1422',marginBottom:5},creditHistoryLabel:{flex:1,color:'#FFF',fontSize:11,lineHeight:15,fontWeight:'800'},creditHistoryGain:{color:'#7FF2B7',fontSize:12,fontWeight:'900'},creditHistoryLoss:{color:'#FFB3C3',fontSize:12,fontWeight:'900'},creditHistoryNextCredit:{color:'#B79CFF',fontSize:11,lineHeight:15,fontWeight:'700',marginBottom:8},statsClose:{position:'absolute',top:12,right:12,width:34,height:34,borderRadius:17,backgroundColor:'#1F1830',alignItems:'center',justifyContent:'center',zIndex:2},statsCloseText:{color:'#FFF',fontSize:20,lineHeight:22,fontWeight:'700'},statsUsernameRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:14,paddingRight:40},statsUsername:{color:'#FFF',fontSize:20,fontWeight:'900'},statsBigRow:{flexDirection:'row',gap:8},statsBigItem:{flex:1,alignItems:'center',paddingVertical:12,borderRadius:16,backgroundColor:'#1B1422'},statsBigValue:{color:'#E5F266',fontSize:22,fontWeight:'900'},statsBigLabel:{color:'#B79CFF',fontSize:10,fontWeight:'800',marginTop:2,textAlign:'center'},statsSmallRow:{flexDirection:'row',gap:5,marginTop:6},statsSmallItem:{flex:1,alignItems:'center',paddingVertical:7,borderRadius:12,backgroundColor:'#17121D'},statsSmallValue:{color:'#FFF',fontSize:11,fontWeight:'900'},statsSmallLabel:{color:'#8F879D',fontSize:9,fontWeight:'800',marginTop:1,textAlign:'center'},statsAvg:{color:'#FFF',fontSize:12,fontWeight:'700',textAlign:'center',marginTop:12},statsSectionTitle:{color:'#E5F266',fontSize:11,fontWeight:'900',letterSpacing:.8,marginTop:20,marginBottom:8},statsThemeRow:{minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:12,borderRadius:14,backgroundColor:'#1B1422',marginBottom:6},statsThemeLabel:{color:'#FFF',fontSize:12,fontWeight:'900'},statsThemeValue:{color:'#B79CFF',fontSize:11,fontWeight:'800'},statsThemeEmpty:{color:'#B79CFF',fontSize:12,lineHeight:16,fontWeight:'700'},statsActionsRow:{flexDirection:'row',gap:8,marginTop:18},statsFollowButton:{flex:1,minHeight:48,borderRadius:24,borderWidth:1.5,borderColor:'#FF5F83',backgroundColor:'#3A1822',alignItems:'center',justifyContent:'center'},statsFollowButtonActive:{backgroundColor:'#173529',borderColor:'#38D990'},statsFollowButtonText:{color:'#FFB3C3',fontSize:11,fontWeight:'900'},statsFollowButtonTextActive:{color:'#38D990'},statsProfileButtonSmall:{flex:1,minHeight:48,borderRadius:24,backgroundColor:'#8B5CF6',borderWidth:1.5,borderColor:'#4E8DFF',alignItems:'center',justifyContent:'center'},statsProfileButtonText:{color:'#FFF',fontSize:11,fontWeight:'900'},
incomingBanner:{marginBottom:spacing.md,padding:14,borderRadius:18,borderWidth:2,borderColor:'#E5F266',backgroundColor:'#1B1222'},incomingText:{color:'#F3EDF7',fontSize:13,lineHeight:18,fontWeight:'700'},incomingName:{color:'#FFF',fontWeight:'900'},incomingActions:{flexDirection:'row',gap:10,marginTop:10},incomingNo:{flex:1,minHeight:44,borderRadius:22,borderWidth:2,borderColor:'#8A7795',backgroundColor:'#211829',alignItems:'center',justifyContent:'center'},incomingNoText:{color:'#FFF',fontSize:13,fontWeight:'900'},incomingYes:{flex:1,minHeight:44,borderRadius:22,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},incomingYesText:{color:'#17130B',fontSize:13,fontWeight:'900'},incomingBusy:{opacity:.6},
cardCoverImage:{position:'absolute',top:0,left:0,right:0,bottom:0},cardCoverGradient:{position:'absolute',top:0,left:0,right:0,bottom:0},
ticketButton:{minHeight:46,marginTop:10,borderRadius:23,backgroundColor:'#151020',borderWidth:1.5,borderColor:'#FFD166',alignItems:'center',justifyContent:'center'},ticketButtonText:{color:'#FFD166',fontSize:13,fontWeight:'900'},
wheelSectionLabel:{color:'#B79CFF',fontSize:11,fontWeight:'900',letterSpacing:.6,marginBottom:6},wheelRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,marginBottom:9,padding:8,borderRadius:16,backgroundColor:'#0F0B15',borderWidth:1,borderColor:'#3B2E4E'},wheelColon:{color:'#FFF',fontSize:18,fontWeight:'900'},wheelSummary:{color:'#E5F266',fontSize:12,fontWeight:'800',textAlign:'center',marginBottom:9,textTransform:'capitalize'},
imagePickerButton:{minHeight:48,borderRadius:14,borderWidth:1,borderColor:'#3B2E4E',backgroundColor:'#0F0B15',marginBottom:9,alignItems:'center',justifyContent:'center',overflow:'hidden'},imagePickerPreview:{width:'100%',height:120},imagePickerText:{color:'#B79CFF',fontSize:12,fontWeight:'800',paddingVertical:12,paddingHorizontal:12,textAlign:'center'},
checkinRow:{flexDirection:'row',gap:8,marginBottom:10},checkinInput:{flex:1,marginBottom:0},checkinButton:{minHeight:48,paddingHorizontal:16,borderRadius:14,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center'},checkinButtonText:{color:'#17130B',fontSize:12,fontWeight:'900'},
participantTicket:{color:'#8F879D',fontSize:10,fontWeight:'800',marginTop:2},participantCheckinBtn:{minHeight:30,paddingHorizontal:10,borderRadius:15,borderWidth:1,borderColor:'#3B2E4E',backgroundColor:'#17121D',alignItems:'center',justifyContent:'center',marginLeft:8},participantCheckinBtnOn:{backgroundColor:'#38D990',borderColor:'#38D990'},participantCheckinBtnText:{color:'#F8F6FC',fontSize:10,fontWeight:'900'},participantCheckinBtnTextOn:{color:'#0B1F16'},
ticketCard:{width:'100%',maxWidth:380,borderRadius:26,padding:22,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',alignItems:'center'},ticketEventName:{color:'#FFF',fontSize:18,fontWeight:'900',textAlign:'center',paddingRight:24},ticketMeta:{color:'#B79CFF',fontSize:12,fontWeight:'800',marginTop:4,textAlign:'center'},ticketQrFrame:{marginTop:18,padding:10,borderRadius:16,backgroundColor:'#FFF'},ticketQrImage:{width:200,height:200},ticketUsername:{color:'#FFD166',fontSize:16,fontWeight:'900',marginTop:14},ticketCode:{color:'#8F879D',fontSize:11,fontWeight:'800',letterSpacing:1,marginTop:2},ticketHint:{color:'#F8F6FC',fontSize:11,fontWeight:'700',marginTop:8,textAlign:'center'},ticketCalendarRow:{flexDirection:'row',gap:8,marginTop:18,width:'100%'},ticketCalendarButton:{flex:1,minHeight:42,borderRadius:21,backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369',alignItems:'center',justifyContent:'center',paddingHorizontal:6},ticketCalendarButtonText:{color:'#F8F6FC',fontSize:10,fontWeight:'900',textAlign:'center'}
});
