import { readProfileMemory, writeProfileMemory } from '../services/profileMemory';
import ClampedText from './ClampedText';
import { reportAutoDiagnostic } from '../services/problemReportService';
import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { AppState, Image, useWindowDimensions, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import MusicStoryRail, { StoryRing } from './MusicStoryRail';
import MusicSwipeDeckModal from './MusicSwipeDeckModal';
import ProfileCertificationBadge from './ProfileCertificationBadge';
import SourceProfileQuickView from './SourceProfileQuickView';
import { loadMyOfferedTrackIds } from '../services/playlistSaleService';
import { supabase } from '../services/supabaseClient';
import type { ProfileCertificationTier } from '../services/publicProfileStateService';
import { loadProfilePresence } from '../services/profilePresenceService';
import { keepLokiPulseTrack } from '../services/lokiPulseKeep';
import { preloadTrackPreview, stopTrackPreviewFast, toggleTrackPreview } from '../services/audioPreviewService';
import {
  composeStoryTeaser,
  loadMyPinnableTracks,
  loadMyStoryViewers,
  SALE_TRACK_PREFIX,
  loadStoryRelations,
  loadProfilesActivity,
  loadStyleSuggestions,
  loadOthersBubbles,
  loadFriendBubbles,
  subscribeOwnStoryChanged,
  orderTracksForPlayback,
  pinStoryTrack,
  type PinnableTrack,
  loadOwnStory,
  STORY_WINDOW_HOURS,
  watchStoryOf,
  loadStoryRanking,
  loadMyStoryStats,
  type MyStoryStats,
  type StoryViewer,
  enrichStoriesWithSales,
  isSaleStoryTrack,
  loadMusicStories,
  loadSaleOnlyStories,
  loadSeenStories,
  markStorySeen,
  orderStoriesForBar,
  type MusicStory,
} from '../services/musicStoriesService';
import { colors } from '../theme/colors';
import { ownBadgeFor, ownBadgeMessage, pruneExpiredStory } from '../services/storyActivity';
import { shareReferralLink } from '../services/referralShare';
import { buildViewerDetail } from '../services/storyViewerDetail';
import { loadMyLikesAmong, likeKey } from '../services/trackLikesService';
import { navigationRef } from '../navigation/navigationRef';
import KeepModal from './KeepModal';

/**
 * Bulles de stories du PROFIL, à côté de la photo (Adel, 05/10/2026).
 * Contenu : ta story (tes musiques partagées en public + celles en vente) + celles des profils suivis / du même style, avec leurs
 * musiques EN VENTE (titre masqué, mène à la boutique). Les stories vues se
 * grisent et passent après. Lecteur = le Swipe existant ; GARDER = même
 * économie FREE que Loki Pulse.
 */
type Props = {
  viewer: { id: string; username: string; avatarUrl?: string | null };
  freeCost: number;
  onOpenProfile?: (username: string) => void;
  /** Même diamètre que la photo de profil. */
  size?: number;
  /** Genre de l'utilisateur (donnée privée connue de lui seul) : anneau rose pour une femme, bleu pour un homme. */
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
};

export default function ProfileStoryBar({ viewer, freeCost, onOpenProfile, size, gender }: Props) {
  const avatarSize = size ?? 80;
  const compactScreen = useWindowDimensions().height < 640;
  // Adel (05/10/2026) : « je viens de garder une musique, mon cercle ne s'allume pas » -- la rangée était chargée une seule fois ; elle se recharge maintenant à chaque retour sur le profil.
  const isFocused = useIsFocused();
  const [online, setOnline] = useState<Record<string, boolean | undefined>>({});
  const [activityKnown, setActivityKnown] = useState(false);
  const [ranking, setRanking] = useState<Record<string, { rank: number; score: number }>>({});
  const [myStats, setMyStats] = useState<MyStoryStats | null>(null);
  const [quickUsername, setQuickUsername] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<Record<string, string>>({});
  const [ownStory, setOwnStory] = useState<MusicStory | null>(null);
  const [ownStoryOpening, setOwnStoryOpening] = useState(false);
  const ownStoryLoadRef = React.useRef<Promise<MusicStory | null> | null>(null);
  const reloadOwnStory = useCallback((): Promise<MusicStory | null> => {
    const job = loadOwnStory(viewer).then((mine) => {
      setOwnStory(mine);
      writeProfileMemory(viewer.id, 'own-story', mine ? { ...mine, tracks: mine.tracks.slice(0, 20) } : null);
      return mine;
    });
    ownStoryLoadRef.current = job;
    job.catch(() => {}).finally(() => { if (ownStoryLoadRef.current === job) ownStoryLoadRef.current = null; });
    return job;
  }, [viewer.id, viewer.username, viewer.avatarUrl]);
  // Affichage immédiat : la dernière story connue de cet appareil (jamais plus vieille que 24 h), le serveur la remplace ensuite.
  useEffect(() => {
    let live = true;
    void readProfileMemory<MusicStory | null>(viewer.id, 'own-story').then((cached) => {
      if (!live || !cached?.tracks?.length) return;
      const fresh = pruneExpiredStory(cached);
      if (fresh) setOwnStory((current) => current ?? fresh);
    }).catch(() => {});
    return () => { live = false; };
  }, [viewer.id]);
  const [stories, setStories] = useState<MusicStory[]>([]);
  const storiesRef = React.useRef<MusicStory[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const lastBumpRef = React.useRef(0);
  storiesRef.current = stories;
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [openStory, setOpenStory] = useState<MusicStory | null>(null);
  const [viewers, setViewers] = useState<StoryViewer[] | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  // « En savoir plus » d'un spectateur : musique par musique (temps, ❤, endroit où il est parti).
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [detailLikes, setDetailLikes] = useState<Record<string, Set<string>>>({});
  const toggleViewerDetail = (viewerId: string) => {
    if (detailFor === viewerId) { setDetailFor(null); return; }
    setDetailFor(viewerId);
    if (detailLikes[viewerId] || !openStory) return;
    void loadMyLikesAmong(viewerId, openStory.tracks.map((track) => track.id)).then((set) => setDetailLikes((previous) => ({ ...previous, [viewerId]: set }))).catch(() => setDetailLikes((previous) => ({ ...previous, [viewerId]: new Set() })));
  };
  const watchRef = React.useRef<ReturnType<typeof watchStoryOf>>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [pinnable, setPinnable] = useState<PinnableTrack[] | null>(null);
  const [pinBusy, setPinBusy] = useState('');
  const [offeredIds, setOfferedIds] = useState<Set<string>>(new Set());
  const [previewing, setPreviewing] = useState('');
  // Certification affichée à côté du nom dans le lecteur de story (Adel 05/10/2026, style Instagram).
  const [tiers, setTiers] = useState<Record<string, ProfileCertificationTier>>({});

  useEffect(() => {
    let live = true;
    if (!isFocused) return undefined;
    // Adel (05/10/2026) : « le profil met du temps à charger ». Tout part EN PARALLÈLE et la rangée se remplit au fur et à mesure
    // (amis et suggestions dès que les liens arrivent, stories ensuite) : plus de chaîne d'attentes l'une derrière l'autre.
    // Adel (05/10/2026) : « quand il a gardé, ça lui a enlevé toutes les bulles » -- chaque rechargement repartait d'une rangée VIDE et
    // n'affichait que ce qui était déjà revenu ; une branche en échec laissait la rangée vide. Désormais on garde ce qui est affiché
    // jusqu'à ce que les nouvelles données soient là, et on ne retire jamais une bulle si une des branches a échoué.
    const previous = new Map(storiesRef.current.map((story) => [story.profileId, story] as const));
    // Mémoire locale (Adel 05/10/2026 : « le chargement est très long ») : la dernière rangée connue s'affiche tout de suite,
    // le serveur la remplace ensuite. Les musiques de plus de 24 h ne sont jamais réaffichées (fenêtre de story).
    void readProfileMemory<MusicStory[]>(viewer.id, 'story-rail').then((cached) => {
      if (!live || !cached?.length) return;
      for (const raw of cached) {
        const story = raw.suggestion || raw.styleMatch ? raw : pruneExpiredStory(raw);
        if (story && !previous.has(story.profileId) && !collected.has(story.profileId)) previous.set(story.profileId, story);
      }
      if (collected.size === 0) setStories(display());
    }).catch(() => {});
    const collected = new Map<string, MusicStory>();
    let degraded = false;
    let storiesLoaded = false;
    let activityFailed = false;
    // Tant que les stories n'ont pas répondu, une bulle déjà affichée avec ses musiques ne perd pas ses musiques (pas de clignotement).
    const display = () => [
      ...Array.from(collected.values()).map((story) => {
        const before = previous.get(story.profileId);
        const keep = !storiesLoaded && before && before.tracks.length > 0 && story.tracks.length === 0 ? pruneExpiredStory(before) : null;
        return keep ?? story;
      }),
      ...Array.from(previous.values()).filter((story) => !collected.has(story.profileId)).map((story) => (story.suggestion || story.styleMatch ? story : pruneExpiredStory(story))).filter((story): story is MusicStory => Boolean(story)),
    ];
    const merge = (list: MusicStory[]) => {
      for (const story of list) {
        const known = collected.get(story.profileId);
        if (!known || story.tracks.length > known.tracks.length) collected.set(story.profileId, story);
      }
      if (live) setStories(display());
    };
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const run = async (attempt: number) => {
      degraded = false;
      // Adel (05/10/2026) : profil trop lent. Les « vues » ne bloquent plus le départ des autres chargements (un aller-retour de moins).
      void loadSeenStories(viewer.id).then((seenMap) => { if (live) setSeen(seenMap); }).catch(() => {});
      // Chaque source est indépendante : une panne de l'une ne vide jamais les autres.
      void reloadOwnStory();
      const relationsPromise = loadStoryRelations(viewer.id).then((relations) => { if (relations.partial) degraded = true; return relations; }).catch((error) => {
        degraded = true;
        reportAutoDiagnostic('STORY_RELATIONS_FAILED', error);
        return { following: [] as string[], others: [] as string[] };
      });
      // Branche A : bulles d'amis, liés et suggestions par style (ne dépendent que des liens).
      const bubblesPromise = relationsPromise.then(async (relations) => {
        const [friends, others, styleFriends] = await Promise.all([
          loadFriendBubbles(relations.following, [viewer.id]).catch(() => { degraded = true; return [] as MusicStory[]; }),
          loadOthersBubbles(relations.others, [viewer.id]).catch(() => { degraded = true; return [] as MusicStory[]; }),
          loadStyleSuggestions(viewer.id, [...relations.following, ...relations.others]).catch(() => { degraded = true; return [] as MusicStory[]; }),
        ]);
        merge([...friends, ...others, ...styleFriends]);
        return [...friends, ...others, ...styleFriends];
      });
      // Branche B : les stories (musiques), puis leur enrichissement boutique.
      const storiesPromise = (async () => {
        try {
          const relations = await relationsPromise;
          const base = await loadMusicStories(viewer.id, relations);
          merge(base);
          const [withSales, saleOnly] = await Promise.all([
            enrichStoriesWithSales(base).catch(() => base),
            loadSaleOnlyStories(viewer.id, base).catch(() => [] as MusicStory[]),
          ]);
          storiesLoaded = true;
          merge([...withSales, ...saleOnly]);
          return [...withSales, ...saleOnly];
        } catch { storiesLoaded = true; degraded = true; return [] as MusicStory[]; /* Réseau indisponible : la rangée garde ce qui est déjà affiché */ }
      })();
      // Certifications + activité réelle : deux appels serveur en parallèle, lancés dès que des profils sont connus
      // (amis dès la branche A, puis stories dès la branche B) au lieu d'attendre toute la chaîne.
      const metaDone = new Set<string>();
      const applyMeta = async (profileIds: string[]) => {
        const ids = Array.from(new Set(profileIds)).filter((id) => id && !metaDone.has(id));
        if (!ids.length) return;
        ids.forEach((id) => metaDone.add(id));
        const [tierResult, activity] = await Promise.all([
          (supabase ? Promise.resolve(supabase.rpc('keep_public_certification_tiers', { p_profile_ids: ids })).catch(() => null) : Promise.resolve(null)),
          loadProfilesActivity(ids.filter((id) => id !== viewer.id)).catch(() => { activityFailed = true; return {} as Record<string, { lastActiveAt: string | null; online: boolean }>; }),
        ]);
        if (!live) return;
        const tierRows = (tierResult as any)?.data;
        if (Array.isArray(tierRows)) {
          const nextTiers: Record<string, ProfileCertificationTier> = {};
          for (const row of tierRows as Array<{ profile_id: string; certification_tier: string }>) {
            if (row?.profile_id && row.certification_tier) nextTiers[String(row.profile_id)] = row.certification_tier as ProfileCertificationTier;
          }
          setTiers((previous) => ({ ...previous, ...nextTiers }));
        }
        // Pastille verte/rouge + tri « dernier actif d'abord » ; les anciens inactifs passent à la suite.
        const next: Record<string, boolean | undefined> = {};
        const seenAt: Record<string, string> = {};
        for (const [id, info] of Object.entries(activity)) {
          next[id] = info.online;
          // '' = le serveur connaît ce membre mais il n'a AUCUNE activité ; absent = inconnu (jamais masqué).
          if (info.online) seenAt[id] = new Date().toISOString();
          else seenAt[id] = info.lastActiveAt ?? '';
        }
        setOnline((previous) => ({ ...previous, ...next }));
        setLastSeenAt((previous) => ({ ...previous, ...seenAt }));
      };
      const bubblesMeta = bubblesPromise.then((bubbles) => applyMeta([viewer.id, ...bubbles.map((story) => story.profileId)]));
      const storiesMeta = storiesPromise.then((withStories) => applyMeta(withStories.map((story) => story.profileId)));
      await Promise.all([bubblesMeta, storiesMeta]);
      if (!live) return;
      // Données complètes : on retire alors les bulles qui ont disparu côté serveur (story expirée, désabonnement).
      if (!degraded) setStories(Array.from(collected.values()));
      // Mémoire : 12 membres, 12 musiques chacun au plus (le disque reste léger), et seulement des données complètes.
      if (!degraded) writeProfileMemory(viewer.id, 'story-rail', Array.from(collected.values()).slice(0, 12).map((story) => ({ ...story, tracks: story.tracks.slice(0, 12) })));
      if (!activityFailed) setActivityKnown(true);
      // Une seule nouvelle tentative, 6 s plus tard, si une branche a échoué (jamais de boucle : règle de résilience de connexion).
      if (degraded && attempt === 0 && live) retryTimer = setTimeout(() => { if (live) void run(1); }, 6000);
    };
    // Classement de la semaine : badge discret sur les bulles (échec = aucun badge, jamais bloquant).
    void loadStoryRanking().then((map) => { if (live) setRanking(map); }).catch(() => {});
    void loadMyStoryStats().then((stats) => { if (live) setMyStats(stats); }).catch(() => {});
    void run(0);
    return () => { live = false; if (retryTimer) clearTimeout(retryTimer); };
  }, [viewer.id, isFocused, reloadTick]);

  // Adel (05/10/2026) : « assure-toi que les bulles se rafraîchissent vite » -- une nouvelle story d'un membre n'apparaissait qu'au retour sur l'écran.
  // Rechargement : en direct (Realtime sur story_pins), au retour dans l'app, et toutes les 90 s tant que l'écran est visible ; jamais plus d'une fois / 5 s.
  useEffect(() => {
    if (!isFocused) return undefined;
    const bump = () => {
      const now = Date.now();
      if (now - lastBumpRef.current < 5000) return;
      lastBumpRef.current = now;
      setReloadTick((value) => value + 1);
    };
    let channel: any = null;
    try {
      if (supabase) channel = supabase.channel(`story-pins-${viewer.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'story_pins' }, bump).subscribe();
    } catch { /* Realtime indisponible : l'intervalle et le retour dans l'app suffisent */ }
    const interval = setInterval(bump, 90000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') bump(); });
    return () => {
      clearInterval(interval);
      appState.remove();
      try { if (channel && supabase) void supabase.removeChannel(channel); } catch { /* déjà fermé */ }
    };
  }, [viewer.id, isFocused]);

  // Liste des vues ouverte : on la rafraîchit toutes les 8 s pour voir « regarde maintenant » puis « parti il y a … » sans quitter l'écran.
  useEffect(() => {
    if (!viewersOpen) return;
    const timer = setInterval(() => { loadMyStoryViewers().then(setViewers).catch(() => {}); }, 8000);
    return () => clearInterval(timer);
  }, [viewersOpen]);

  // Départ : fermeture de la story, app mise en arrière-plan ou écran quitté -> le propriétaire voit tout de suite « parti ».
  const stopWatch = useCallback(() => { watchRef.current?.stop(); watchRef.current = null; }, []);
  useEffect(() => { if (!openStory) stopWatch(); }, [openStory, stopWatch]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state !== 'active') stopWatch(); });
    return () => { sub.remove(); stopWatch(); };
  }, [stopWatch]);

  const open = useCallback(async (story: MusicStory) => {
    stopTrackPreviewFast();
    // Suggestion « a repris ta musique » : pas de story à lire, on va sur son profil.
    // Suggestion ou ami sans story du jour : pas de story à lire, on va sur son profil.
    // Story d'abord (même à revoir) ; sans story, une fiche rapide s'ouvre par-dessus (suivre / voir le profil) : jamais une page qui s'ouvre d'office.
    if (story.suggestion || story.tracks.length === 0) { setQuickUsername(story.username); return; }
    // Cercle allumé → on repart de la dernière musique ; cercle éteint (déjà vue) → de la première.
    const unseenNow = (seen[story.profileId] || '') < story.latestAt;
    const ordered = orderTracksForPlayback(story.tracks, unseenNow);
    // La musique doit démarrer tout de suite : on précharge l'extrait du premier morceau avant même l'ouverture du lecteur.
    if (ordered[0]?.previewUrl) void preloadTrackPreview(ordered[0].previewUrl).catch(() => {});
    setOpenStory({ ...story, tracks: ordered });
    setViewersOpen(false);
    watchRef.current?.stop();
    watchRef.current = null;
    if (story.profileId === viewer.id) {
      setViewers(null);
      loadMyStoryViewers().then(setViewers).catch(() => setViewers([]));
    } else {
      // Façon Instagram : la vue ne compte qu'après quelques secondes de présence réelle ; durée, musiques vues, écoute et départ sont suivis.
      watchRef.current = watchStoryOf(story.profileId, ordered.length);
    }
    setSeen(await markStorySeen(viewer.id, story));
  }, [viewer.id, seen]);

  // Suivre directement depuis la bulle (comme Instagram) : la bulle rejoint mes abonnements sans quitter l'écran.
  const followMember = async (story: MusicStory) => {
    if (!supabase || followBusy) return;
    setFollowBusy(story.profileId);
    try {
      const { error } = await supabase.rpc('keep_follow_profile', { p_followee_id: story.profileId });
      if (error) throw error;
      setStories((previous) => previous.map((item) => (item.profileId === story.profileId ? { ...item, followed: true, suggestion: false, styleMatch: false } : item)));
    } catch {
      Alert.alert('Abonnement impossible', 'L’abonnement n’a pas pu être enregistré. Réessaie dans un instant.', [{ text: 'OK', style: 'cancel' }]);
    } finally { setFollowBusy(null); }
  };

  // Cause racine (Adel, 06/10/2026 : « ma story est longue à charger, ça me dit que je n'ai pas mis de story puis ça se débloque ») :
  // un appui avant la fin du chargement trouvait ownStory = null et affichait « story terminée ». Maintenant : la dernière story
  // connue s'affiche tout de suite (mémoire locale, 24 h max), et un appui pendant le chargement ATTEND la réponse.
  const openOwn = async () => {
    if (ownStory) { void open(ownStory); return; }
    if (ownStoryLoadRef.current) {
      setOwnStoryOpening(true);
      const mine = await ownStoryLoadRef.current.catch(() => null);
      setOwnStoryOpening(false);
      if (mine) { void open(mine); return; }
    }
    Alert.alert('Ta story du jour est terminée', 'Une story dure 24 h. Reposte : partage une musique en public, reprends-en une chez un autre membre ou mets-en une en vente — ta photo se rallume aussitôt.', [{ text: 'OK', style: 'cancel' }]);
  };

  const refreshOwnStory = useCallback(() => { void reloadOwnStory(); }, [reloadOwnStory]);
  useEffect(() => subscribeOwnStoryChanged(() => { refreshOwnStory(); }), [refreshOwnStory]);
  const showAlreadyInOtherStory = (track: PinnableTrack) => {
    const holder = track.inOtherStory;
    if (!holder) return;
    Alert.alert('Déjà en story', `Chez @${holder.username}. Va la voir et repartage-la.`, [
      { text: 'OK', style: 'cancel' },
      {
        text: 'Voir sa story',
        onPress: () => {
          closePlus();
          const story = stories.find((item) => item.profileId === holder.profileId && item.tracks.length > 0);
          setTimeout(() => { if (story) void open(story); else onOpenProfile?.(holder.username); }, 350);
        },
      },
    ]);
  };
  const openPlus = () => {
    setPlusOpen(true);
    setPinnable(null);
    loadMyPinnableTracks(viewer.id).then(setPinnable).catch(() => setPinnable([]));
    loadMyOfferedTrackIds().then((map) => setOfferedIds(new Set(Object.keys(map)))).catch(() => {});
  };
  // Adel (05/10/2026) : une musique déjà dans la story ne s'ajoute pas deux fois : on le dit clairement.
  const inStoryIds = new Set((ownStory?.tracks ?? []).map((track) => (track.id.startsWith(SALE_TRACK_PREFIX) ? track.id.slice(SALE_TRACK_PREFIX.length) : track.id)));
  // Pré-écoute avant d'ajouter à la story (Adel, 05/10/2026).
  const previewTrack = (track: PinnableTrack) => {
    if (!track.previewUrl) {
      Alert.alert('Pas d’extrait', 'Aucun extrait audio n’est disponible pour cette musique.', [{ text: 'OK', style: 'cancel' }]);
      return;
    }
    const key = `story-plus:${track.trackId}`;
    void toggleTrackPreview(key, track.previewUrl, (playing) => setPreviewing(playing ? track.trackId : ''), () => setPreviewing('')).catch(() => setPreviewing(''));
  };
  const closePlus = () => { stopTrackPreviewFast(); setPreviewing(''); setPlusOpen(false); };
  const pin = async (track: PinnableTrack) => {
    if (inStoryIds.has(track.trackId)) {
      Alert.alert('Elle y était déjà', `« ${track.title} » a été ajoutée à ta story plus tôt : elle y reste visible 24 h après son ajout.`, [{ text: 'OK', style: 'cancel' }]);
      return;
    }
    if (pinBusy) return;
    setPinBusy(track.trackId);
    try {
      await pinStoryTrack(track.trackId);
      closePlus();
      refreshOwnStory();
      Alert.alert('✅ Ajoutée à ta story', `Tu viens d’ajouter « ${track.title} » à ta story : elle sera visible pendant 24 heures.${track.inSale ? ' Elle est en vente : jaquette et artiste restent masqués.' : ''} Ta photo s’allume.`, [{ text: 'OK', style: 'cancel' }]);
    } catch {
      Alert.alert('Ajout impossible', 'Seules tes musiques gardées en public peuvent aller en story. Réessaie dans un instant.', [{ text: 'OK', style: 'cancel' }]);
    } finally { setPinBusy(''); }
  };
  const isOwnOpen = openStory?.profileId === viewer.id;
  // Enchaînement (Adel 05/10/2026) : la story terminée, on propose tout de suite la suivante (non vues d'abord, la story vue repasse derrière).
  const nextStories = openStory
    ? stories.filter((story) => story.profileId !== openStory.profileId && story.profileId !== viewer.id && !story.suggestion && story.tracks.length > 0)
        .sort((a, b) => Number((seen[a.profileId] || '') < a.latestAt) === Number((seen[b.profileId] || '') < b.latestAt) ? 0 : ((seen[a.profileId] || '') < a.latestAt ? -1 : 1))
    : [];
  const nextStory = nextStories[0] ?? null;
  const openTier = openStory ? tiers[openStory.profileId] : undefined;

  // Adel (05/10/2026) : la photo (avec le « + ») fait partie de la MÊME rangée que les bulles : toute la ligne défile ensemble, comme Instagram.
  const leadingPhoto = (
    <View style={{ width: avatarSize, height: avatarSize, marginRight: 4 }}>
      <TouchableOpacity
        onPress={() => { void openOwn(); }}
        disabled={ownStoryOpening}
        style={ownStoryOpening ? { opacity: 0.55 } : undefined}
        accessibilityState={{ busy: ownStoryOpening }}
        accessibilityRole="button"
        accessibilityLabel={ownStory ? 'Ouvrir ta story' : 'Ta photo de profil : aucune story pour le moment'}
        testID="home-story-own"
      >
        <StoryRing size={avatarSize} unseen={Boolean(ownStory && (seen[viewer.id] || '') < ownStory.latestAt)} plain={!ownStory} tone={gender === 'FEMALE' ? 'PINK' : gender === 'MALE' ? 'BLUE' : undefined}>
          {viewer.avatarUrl
            ? <Image source={{ uri: viewer.avatarUrl }} style={[styles.photo, { width: ownStory ? avatarSize - 16 : avatarSize, height: ownStory ? avatarSize - 16 : avatarSize, borderRadius: avatarSize / 2 }]} />
            : <View style={[styles.photo, styles.photoFallback, { width: ownStory ? avatarSize - 16 : avatarSize, height: ownStory ? avatarSize - 16 : avatarSize, borderRadius: avatarSize / 2 }]}><Text style={styles.photoInitial}>{(viewer.username || 'K').slice(0, 1).toUpperCase()}</Text></View>}
        </StoryRing>
      </TouchableOpacity>
      {(() => {
        // Badge à débloquer (Adel 05/10/2026) : 🔒 au départ ; un appui explique comment le débloquer et montre la progression.
        const stats: MyStoryStats = myStats ?? { shares: 0, reprises: 0, followers: 0, score: 0, rank: null, eligible: true, graceDaysLeft: 0, referralsQualified: 0, premium: false };
        const badge = ownBadgeFor(stats.rank, stats.score, stats.eligible);
        return (
          <TouchableOpacity
            style={[styles.ownBadge, badge.locked ? styles.ownBadgeLocked : styles.ownBadgeOn]}
            onPress={() => {
              const message = ownBadgeMessage(stats);
              if (message.needsReferral) {
                // Verrouillé : parrainer 1 ami (lien d'affiliation) ou voir les formules.
                Alert.alert(message.title, message.body, [
                  { text: 'Parrainer un ami', onPress: () => { void shareReferralLink(viewer.username); } },
                  { text: 'Voir les formules', onPress: () => { try { (navigationRef as any).navigate('Offers'); } catch { /* écran indisponible */ } } },
                  { text: 'Fermer', style: 'cancel' },
                ]);
                return;
              }
              Alert.alert(message.title, message.body, [{ text: 'Mettre une musique en story', onPress: openPlus }, { text: 'OK', style: 'cancel' }]);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${badge.label}. Appuie pour voir comment progresser`}
            testID="story-own-badge"
          >
            <Text style={styles.ownBadgeText}>{badge.icon}</Text>
          </TouchableOpacity>
        );
      })()}
      <TouchableOpacity style={styles.plusBadge} onPress={openPlus} accessibilityRole="button" accessibilityLabel="Ajouter une musique à ta story" testID="story-plus">
        <Text style={styles.plusBadgeText}>+</Text>
      </TouchableOpacity>
      </View>
  );

  return (
    <View testID="profile-story-bar" style={styles.barRow}>
      <View style={styles.railWrap}>
        <MusicStoryRail
          activityKnown={activityKnown}
          ranking={ranking}
          stories={stories.map((story) => (lastSeenAt[story.profileId] !== undefined ? { ...story, lastSeenAt: lastSeenAt[story.profileId] } : story))}
          seen={seen}
          size={avatarSize}
          online={online}
          onOpen={(story) => { void open(story); }}
          leading={leadingPhoto}
          onFollow={followMember}
          followBusyId={followBusy}
        />
      </View>

      <KeepModal visible={plusOpen} transparent animationType="fade" onRequestClose={closePlus}>
        <SafeAreaView style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Ajouter à ta story</Text>
              <TouchableOpacity onPress={closePlus} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.sheetClose}><Text style={styles.sheetCloseText}>✕</Text></TouchableOpacity>
            </View>
            <ClampedText style={styles.plusHelp} text="Choisis une de tes musiques en public : elle devient la dernière de ta story pendant 24 h. 🔒 = déjà en story chez un autre membre : va la voir et repartage-la depuis sa story." />
            {pinnable === null ? <Text style={styles.viewsEmpty}>Chargement de tes musiques…</Text> : null}
            {pinnable && pinnable.length === 0 ? <Text style={styles.viewsEmpty}>Tu n'as pas encore de musique en public. Garde-en une en Public, elle apparaîtra ici.</Text> : null}
            <ScrollView>
              {(pinnable ?? []).map((track) => (
                <View key={track.trackId} style={styles.row}>
                  {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.rowCover} /> : <View style={[styles.rowCover, styles.rowAvatarFallback]}><Text style={styles.rowInitial}>♪</Text></View>}
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowName} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.rowArtist} numberOfLines={1}>{track.inSale ? '🏷 En vente · masquée dans la story' : track.artist}</Text>
                  </View>
                  <TouchableOpacity style={styles.previewBtn} onPress={() => previewTrack(track)} accessibilityRole="button" accessibilityLabel={previewing === track.trackId ? `Arrêter l’extrait de ${track.title}` : `Écouter un extrait de ${track.title}`}>
                    <Text style={styles.previewBtnText}>{previewing === track.trackId ? '■' : '▶'}</Text>
                  </TouchableOpacity>
                  {!inStoryIds.has(track.trackId) && track.inOtherStory ? (
                    // Anti-doublon entre stories (Adel, 06/10/2026) : déjà en story chez un autre membre → cadenas ; on va la repartager chez lui.
                    <TouchableOpacity style={[styles.addBtn, styles.addBtnLocked]} onPress={() => showAlreadyInOtherStory(track)} accessibilityRole="button" accessibilityLabel={`${track.title} est déjà en story chez ${track.inOtherStory.username}`} testID={`story-pin-locked-${track.trackId}`}>
                      <Text style={[styles.addBtnText, styles.addBtnTextDone]}>🔒</Text>
                    </TouchableOpacity>
                  ) : (
                  <TouchableOpacity style={[styles.addBtn, inStoryIds.has(track.trackId) && styles.addBtnDone]} onPress={() => { void pin(track); }} disabled={Boolean(pinBusy)} accessibilityRole="button" accessibilityLabel={inStoryIds.has(track.trackId) ? `${track.title} est déjà dans ta story` : `Ajouter ${track.title} à ma story`}>
                    <Text style={[styles.addBtnText, inStoryIds.has(track.trackId) && styles.addBtnTextDone]}>{pinBusy === track.trackId ? '…' : inStoryIds.has(track.trackId) ? '✓ En story' : '+ Ajouter'}</Text>
                  </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </KeepModal>

      <SourceProfileQuickView
        visible={Boolean(quickUsername)}
        noStory
        username={quickUsername ?? ''}
        currentUserId={viewer.id}
        accountRequired={false}
        onClose={() => setQuickUsername(null)}
        onOpenFull={(username) => { setQuickUsername(null); onOpenProfile?.(username); }}
        onRequireAccount={() => setQuickUsername(null)}
      />

      <MusicSwipeDeckModal
        visible={Boolean(openStory)}
        tracks={openStory?.tracks ?? []}
        initialTrackId={openStory?.tracks[0]?.id ?? null}
        resetKey={openStory?.profileId ?? null}
        trackAddedAt={openStory ? Object.fromEntries(openStory.tracks.map((track) => [track.id, openStory.addedAt?.[track.id] ?? openStory.latestAt])) : undefined}
        saleInfoByTrackId={openStory?.saleInfo}
        uncertifiedTrackIds={openStory?.freeTrackIds}
        onTitlePress={!isOwnOpen && openStory ? () => { const username = openStory.username; setOpenStory(null); setTimeout(() => setQuickUsername(username), 350); } : undefined}
        // Adel 05/10/2026 : « tu écris trop » -- plus de phrase d'accroche sur la story d'un autre (elle nommait à tort le diffuseur comme crédité).
        headerExtra={isOwnOpen ? (
          <TouchableOpacity style={styles.viewsChip} onPress={() => setViewersOpen(true)} accessibilityRole="button" accessibilityLabel="Voir qui a vu ta story" testID="story-views-chip">
            <Text style={styles.viewsChipText}>👁 {viewers ? `${viewers.length} vue${viewers.length > 1 ? 's' : ''}` : '… vues'} · Voir qui ›</Text>
          </TouchableOpacity>
        ) : null}
        overlay={isOwnOpen && viewersOpen ? (
          <SafeAreaView style={styles.backdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Vues de ta story</Text>
                <TouchableOpacity onPress={() => setViewersOpen(false)} accessibilityRole="button" accessibilityLabel="Fermer la liste" style={styles.sheetClose}><Text style={styles.sheetCloseText}>✕</Text></TouchableOpacity>
              </View>
              {viewers && viewers.length === 0 ? <Text style={styles.viewsEmpty}>Aucune vue</Text> : null}
              {/* Vues façon Instagram (Adel, 06/10/2026) : une bulle par spectateur, indépendante ; on touche une bulle → ce qu'il a vu.
                  Pastille : ✓ = toute la story, sinon « vues / total ». Aucun texte long, aucune durée. */}
              <ScrollView contentContainerStyle={styles.viewerGrid}>
                {(viewers ?? []).map((v) => {
                  const total = openStory?.tracks.length || v.tracksTotal || 0;
                  const detail = openStory ? buildViewerDetail(openStory.tracks.map((track) => ({ id: track.id, title: track.title, artist: track.artist })), v, detailLikes[v.viewerId] ?? new Set<string>(), likeKey) : null;
                  const seenN = detail ? detail.rows.length : Math.min(v.tracksSeen, total);
                  const full = total > 0 && seenN >= total;
                  const selected = detailFor === v.viewerId;
                  return (
                    <TouchableOpacity key={v.viewerId} style={[styles.viewerBubble, selected && styles.viewerBubbleOn]} onPress={() => toggleViewerDetail(v.viewerId)} accessibilityRole="button" accessibilityState={{ expanded: selected }} accessibilityLabel={`${v.username} : ${seenN} sur ${total}`} testID={`story-viewer-${v.viewerId}`}>
                      <View>
                        {v.avatarUrl ? <Image source={{ uri: v.avatarUrl }} style={styles.bubbleAvatar} /> : <View style={[styles.bubbleAvatar, styles.rowAvatarFallback]}><Text style={styles.rowInitial}>{v.username.slice(0, 1).toUpperCase()}</Text></View>}
                        <View style={[styles.bubbleBadge, full ? styles.bubbleBadgeFull : null, v.watching ? styles.bubbleBadgeLive : null]}><Text style={styles.bubbleBadgeText}>{v.watching ? '●' : full ? '✓' : `${seenN}/${total}`}</Text></View>
                      </View>
                      <Text style={styles.bubbleName} numberOfLines={1}>{v.username}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {(() => {
                const v = (viewers ?? []).find((item) => item.viewerId === detailFor);
                if (!v || !openStory) return null;
                const detail = buildViewerDetail(openStory.tracks.map((track) => ({ id: track.id, title: track.title, artist: track.artist })), v, detailLikes[v.viewerId] ?? new Set<string>(), likeKey);
                return (
                  <View style={styles.detailBox} testID={`story-viewer-detail-${v.viewerId}`}>
                    <View style={styles.detailHead}>
                      <Text style={styles.detailName} numberOfLines={1}>@{v.username}{v.isReprise ? ' ⟳' : ''}</Text>
                      <TouchableOpacity style={styles.detailProfileBtn} onPress={() => { setViewersOpen(false); setOpenStory(null); onOpenProfile?.(v.username); }} accessibilityRole="button" accessibilityLabel={`Voir le profil de ${v.username}`} testID={`story-viewer-profile-${v.viewerId}`}>
                        <Text style={styles.detailProfileText}>Profil ›</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={{ maxHeight: 260 }}>
                      {detail.rows.length === 0 ? <Text style={styles.detailMeta}>Rien vu</Text> : null}
                      {detail.rows.map((r) => (
                        <View key={`${v.viewerId}-${r.trackId}`} style={[styles.detailRow, (r.outcome === 'LEFT_HERE' || r.outcome === 'WATCHING') && styles.detailRowLeft]} testID={`story-viewer-track-${v.viewerId}-${r.index}`}>
                          <Text style={styles.detailIcon} accessibilityLabel={r.label}>{r.outcome === 'FULL' ? '✓' : r.outcome === 'SKIPPED' ? '⏭' : r.outcome === 'WATCHING' ? '●' : '■'}</Text>
                          <Text style={[styles.detailTitle, { flex: 1, minWidth: 0 }]} numberOfLines={1}>{r.title}</Text>
                          {r.liked ? <Text style={styles.detailLike} accessibilityLabel="Il a aimé">❤</Text> : null}
                        </View>
                      ))}
                    </ScrollView>
                    <Text style={styles.detailLegend}>✓ entière · ⏭ passée · ■ arrêt</Text>
                  </View>
                );
              })()}
            </View>
          </SafeAreaView>
        ) : null}
        titleBadge={openTier && openTier !== 'UNVERIFIED' ? <ProfileCertificationBadge tier={openTier} compact /> : null}
        onFinished={() => {
          // Enchaînement façon Instagram : la story finie, on passe tout de suite à la prochaine NON vue (la plus récente d'abord).
          if (!openStory) return;
          const upcoming = orderStoriesForBar(stories.filter((story) => !story.suggestion && story.tracks.length > 0 && story.profileId !== openStory.profileId && story.profileId !== viewer.id && (seen[story.profileId] || '') < story.latestAt), seen)[0];
          if (upcoming) void open(upcoming);
        }}
        endExtra={nextStory ? (
          <View style={styles.nextBox}>
            <TouchableOpacity style={styles.nextButton} onPress={() => { void open(nextStory); }} accessibilityRole="button" accessibilityLabel={`Voir la story de ${nextStory.username}`} testID="story-next">
              <Text style={styles.nextButtonText} numberOfLines={1}>STORY SUIVANTE · @{nextStory.username}</Text>
            </TouchableOpacity>
            {nextStories.length > 1 ? (
              <View style={styles.nextBubbles}>
                {nextStories.slice(1, 5).map((story) => (
                  <TouchableOpacity key={story.profileId} onPress={() => { void open(story); }} accessibilityRole="button" accessibilityLabel={`Story de ${story.username}`} style={styles.nextBubble}>
                    {story.avatarUrl
                      ? <Image source={{ uri: story.avatarUrl }} style={styles.nextBubbleImg} />
                      : <View style={[styles.nextBubbleImg, styles.rowAvatarFallback]}><Text style={styles.rowInitial}>{story.username.slice(0, 1).toUpperCase()}</Text></View>}
                    <Text style={styles.nextBubbleName} numberOfLines={1}>@{story.username}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        title={isOwnOpen ? 'Ta story' : `Story de @${openStory?.username ?? ''}`}
        subtitle={isOwnOpen ? 'Tes musiques partagées ou en vente' : undefined}
        previewOnly={isOwnOpen}
        sourceUsername={isOwnOpen ? undefined : openStory?.username}
        sourceAvatarUrl={isOwnOpen ? null : openStory?.avatarUrl ?? null}
        sourceProfileId={isOwnOpen ? undefined : openStory?.profileId}
        emptyTitle="Cette story est terminée."
        backLabel="REVENIR AU PROFIL"
        loop={false}
        askVisibilityOnKeep
        // Décision d'Adel (05/10/2026) : garder une musique publique d'un autre membre est GRATUIT (créateur identifié) -> aucun débit ni avertissement de coût.
        keepCostNotice={undefined}
        keepDebitAmount={0}
        optimisticPass
        onKeep={async (track, visibility) => {
          // Musique en vente : jamais de GARDER direct, on ouvre la boutique du vendeur.
          if (isSaleStoryTrack(track)) {
            const seller = openStory?.username;
            setOpenStory(null);
            if (seller) onOpenProfile?.(seller);
            return false;
          }
          const { ok } = await keepLokiPulseTrack(track, visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE', freeCost, openStory && openStory.profileId !== viewer.id ? { profileId: openStory.profileId, username: openStory.username } : undefined);
          return ok;
        }}
        onPass={() => true}
        onOpenSourceProfile={(username) => { setOpenStory(null); onOpenProfile?.(username); }}
        onWatchEvent={(event) => watchRef.current?.event(event)}
        likeMode={isOwnOpen ? 'count-only' : 'auto'}
        onClose={() => setOpenStory(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rowCopy: { flex: 1, minWidth: 0 },
  previewBtn: { flexShrink: 0, width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#7C5CFC', backgroundColor: '#1B1230', alignItems: 'center', justifyContent: 'center' },
  previewBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  addBtn: { flexShrink: 0, minHeight: 44, minWidth: 96, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#2DE1C2', backgroundColor: 'rgba(45,225,194,0.10)', alignItems: 'center', justifyContent: 'center' },
  addBtnLocked: { backgroundColor: '#2A2140', borderColor: '#5C5468' },
  addBtnDone: { borderColor: '#5C5468', backgroundColor: '#27222E' },
  addBtnText: { color: '#2DE1C2', fontSize: 13, fontWeight: '900' },
  addBtnTextDone: { color: '#E6E0EE' },
  nextBox: { alignSelf: 'stretch', alignItems: 'center', marginTop: 14, paddingHorizontal: 8 },
  nextButton: { alignSelf: 'stretch', minHeight: 46, borderRadius: 23, borderWidth: 1.5, borderColor: '#FFFFFF', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: .3 },
  nextBubbles: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  nextBubble: { alignItems: 'center', width: 64 },
  nextBubbleImg: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#FF5BA7' },
  nextBubbleName: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', marginTop: 4, maxWidth: 64 },
  teaser: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '800', marginTop: 8, paddingRight: 8 },
  plusBadge: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#7C5CFC', borderWidth: 2, borderColor: '#0B0A12', alignItems: 'center', justifyContent: 'center' },
  plusBadgeText: { color: '#FFFFFF', fontSize: 20, lineHeight: 22, fontWeight: '900' },
  plusHelp: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  rowArtist: { color: '#FFFFFF', fontSize: 13, opacity: 0.8 },
  viewsChip: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', marginTop: 6, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.primaryLight, backgroundColor: colors.primaryFaint },
  viewsChipText: { color: colors.white, fontSize: 13, fontWeight: '900' },
  viewsEmpty: { color: colors.white, fontSize: 15, lineHeight: 22, paddingVertical: 12 },
  badge: { fontSize: 14, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', color: '#04130F' },
  badgeReprise: { backgroundColor: '#FFB020' },
  barRow: { flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  railWrap: { flex: 1, minWidth: 0 },
  photo: { backgroundColor: colors.backgroundCard },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { color: colors.white, fontSize: 28, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 18 },
  sheet: { maxHeight: '85%', borderRadius: 22, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: 18 },
  suggestRow: { gap: 14, paddingVertical: 12, paddingRight: 8 },
  suggestItem: { alignItems: 'center', width: 96 },
  suggestAvatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderStyle: 'dashed', borderColor: '#B79CFF' },
  suggestName: { color: colors.white, fontSize: 13, fontWeight: '900', marginTop: 6, maxWidth: 96 },
  suggestHint: { color: '#B79CFF', fontSize: 11, fontWeight: '800', marginTop: 2, maxWidth: 96 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: colors.white, fontSize: 22, fontWeight: '900' },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: colors.white, fontSize: 20, fontWeight: '900' },
  viewerBlock: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: colors.border },
  viewerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  rowAvatar: { width: 52, height: 52, borderRadius: 26 },
  // Pochette musicale : toujours un CARRÉ (Adel, 06/10/2026), jamais un rond.
  rowCover: { width: 56, height: 56, borderRadius: 10 },
  rowAvatarFallback: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rowInitial: { color: colors.white, fontSize: 20, fontWeight: '900' },
  rowBody: { flex: 1, minWidth: 0, paddingVertical: 6 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  viewProfileBtn: { flex: 1, minHeight: 44, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: '#B79CFF', backgroundColor: 'rgba(124,92,252,0.18)', alignItems: 'center', justifyContent: 'center' },
  viewProfileText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  ownBadge: { position: 'absolute', left: -2, top: -2, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, zIndex: 3 },
  ownBadgeLocked: { backgroundColor: '#2A2140', borderColor: '#B79CFF' },
  ownBadgeOn: { backgroundColor: '#3A2A00', borderColor: '#FFD166', shadowColor: '#FFD166', shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  ownBadgeText: { fontSize: 13, lineHeight: 16 },
  viewerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 8 },
  viewerBubble: { width: 72, alignItems: 'center', paddingVertical: 4, borderRadius: 14 },
  viewerBubbleOn: { backgroundColor: 'rgba(124,92,252,0.22)' },
  bubbleAvatar: { width: 56, height: 56, borderRadius: 28 },
  bubbleBadge: { position: 'absolute', right: -6, bottom: -4, minWidth: 26, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: '#2A2140', borderWidth: 2, borderColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center' },
  bubbleBadgeFull: { backgroundColor: '#1F7A55' },
  bubbleBadgeLive: { backgroundColor: '#35E08A' },
  bubbleBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  bubbleName: { color: colors.white, fontSize: 12, fontWeight: '800', marginTop: 6, maxWidth: 70 },
  detailHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  detailName: { flex: 1, minWidth: 0, color: colors.white, fontSize: 16, fontWeight: '900' },
  detailProfileBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: '#B79CFF', alignItems: 'center', justifyContent: 'center' },
  detailProfileText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  detailIcon: { width: 22, textAlign: 'center', color: colors.white, fontSize: 15, fontWeight: '900' },
  detailLegend: { color: colors.textSecondary, fontSize: 11, marginTop: 6, textAlign: 'center' },
  detailBox: { marginTop: 8, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  detailSummary: { color: colors.white, fontSize: 14, lineHeight: 19, fontWeight: '800', marginBottom: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  detailRowLeft: { backgroundColor: 'rgba(255,176,32,0.12)', borderRadius: 8, paddingHorizontal: 6 },
  detailIndex: { color: colors.textSecondary, fontSize: 13, fontWeight: '900', width: 22, textAlign: 'center' },
  detailTitle: { color: colors.white, fontSize: 15, fontWeight: '800' },
  detailMeta: { color: colors.textSecondary, fontSize: 13 },
  detailLike: { fontSize: 20, color: '#35E08A' },
  rowName: { color: colors.white, fontSize: 18, fontWeight: '800' },
  rowStatus: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
  rowStatusLive: { color: '#35e08a' },
  rowDetail: { color: colors.textSecondary, fontSize: 14, lineHeight: 19 },
  rowState: { fontSize: 15, fontWeight: '900' },
  rowStateNew: { color: '#2DE1C2' },
  rowStateSeen: { color: colors.textSecondary },
});
