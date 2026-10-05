import { readProfileMemory, writeProfileMemory } from '../services/profileMemory';
import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Image, useWindowDimensions, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  recordStoryView,
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
  const [quickUsername, setQuickUsername] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<Record<string, string>>({});
  const [ownStory, setOwnStory] = useState<MusicStory | null>(null);
  const [stories, setStories] = useState<MusicStory[]>([]);
  const storiesRef = React.useRef<MusicStory[]>([]);
  storiesRef.current = stories;
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [openStory, setOpenStory] = useState<MusicStory | null>(null);
  const [viewers, setViewers] = useState<StoryViewer[] | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
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
      for (const story of cached) if (!previous.has(story.profileId) && !collected.has(story.profileId)) previous.set(story.profileId, story);
      if (collected.size === 0) setStories(display());
    }).catch(() => {});
    const collected = new Map<string, MusicStory>();
    let degraded = false;
    let storiesLoaded = false;
    // Tant que les stories n'ont pas répondu, une bulle déjà affichée avec ses musiques ne perd pas ses musiques (pas de clignotement).
    const display = () => [
      ...Array.from(collected.values()).map((story) => {
        const before = previous.get(story.profileId);
        return !storiesLoaded && before && before.tracks.length > 0 && story.tracks.length === 0 ? before : story;
      }),
      ...Array.from(previous.values()).filter((story) => !collected.has(story.profileId)),
    ];
    const merge = (list: MusicStory[]) => {
      for (const story of list) {
        const known = collected.get(story.profileId);
        if (!known || story.tracks.length > known.tracks.length) collected.set(story.profileId, story);
      }
      if (live) setStories(display());
    };
    void (async () => {
      // Adel (05/10/2026) : profil trop lent. Les « vues » ne bloquent plus le départ des autres chargements (un aller-retour de moins).
      void loadSeenStories(viewer.id).then((seenMap) => { if (live) setSeen(seenMap); }).catch(() => {});
      // Chaque source est indépendante : une panne de l'une ne vide jamais les autres.
      loadOwnStory(viewer).then((mine) => { if (live) setOwnStory(mine); }).catch(() => {});
      const relationsPromise = loadStoryRelations(viewer.id).catch(() => { degraded = true; return { following: [] as string[], others: [] as string[] }; });
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
          loadProfilesActivity(ids.filter((id) => id !== viewer.id)).catch(() => ({} as Record<string, { lastActiveAt: string | null; online: boolean }>)),
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
          if (info.online) seenAt[id] = new Date().toISOString();
          else if (info.lastActiveAt) seenAt[id] = info.lastActiveAt;
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
      setActivityKnown(true);
    })();
    return () => { live = false; };
  }, [viewer.id, isFocused]);

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
    if (story.profileId === viewer.id) {
      setViewers(null);
      loadMyStoryViewers().then(setViewers).catch(() => setViewers([]));
    } else {
      void recordStoryView(story.profileId);
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

  const openOwn = () => {
    if (ownStory) { void open(ownStory); return; }
    Alert.alert('Ta story du jour est terminée', 'Une story dure 24 h. Reposte : partage une musique en public, reprends-en une chez un autre membre ou mets-en une en vente — ta photo se rallume aussitôt.', [{ text: 'OK', style: 'cancel' }]);
  };

  const refreshOwnStory = useCallback(() => { loadOwnStory(viewer).then(setOwnStory).catch(() => {}); }, [viewer.id, viewer.username, viewer.avatarUrl]);
  useEffect(() => subscribeOwnStoryChanged(() => { refreshOwnStory(); }), [refreshOwnStory]);
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
        onPress={openOwn}
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
          stories={stories.map((story) => (lastSeenAt[story.profileId] ? { ...story, lastSeenAt: lastSeenAt[story.profileId] } : story))}
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
            <Text style={styles.plusHelp}>Choisis une de tes musiques en public : elle devient la dernière de ta story pendant 24 h. Tu peux aussi mettre en avant la musique d'un autre membre : garde-la en public, puis ajoute-la ici, il reste identifié.</Text>
            {pinnable === null ? <Text style={styles.viewsEmpty}>Chargement de tes musiques…</Text> : null}
            {pinnable && pinnable.length === 0 ? <Text style={styles.viewsEmpty}>Tu n'as pas encore de musique en public. Garde-en une en Public, elle apparaîtra ici.</Text> : null}
            <ScrollView>
              {(pinnable ?? []).map((track) => (
                <View key={track.trackId} style={styles.row}>
                  {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={styles.rowAvatar} /> : <View style={[styles.rowAvatar, styles.rowAvatarFallback]}><Text style={styles.rowInitial}>♪</Text></View>}
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowName} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.rowArtist} numberOfLines={1}>{track.inSale ? '🏷 En vente · masquée dans la story' : track.artist}</Text>
                  </View>
                  <TouchableOpacity style={styles.previewBtn} onPress={() => previewTrack(track)} accessibilityRole="button" accessibilityLabel={previewing === track.trackId ? `Arrêter l’extrait de ${track.title}` : `Écouter un extrait de ${track.title}`}>
                    <Text style={styles.previewBtnText}>{previewing === track.trackId ? '■' : '▶'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.addBtn, inStoryIds.has(track.trackId) && styles.addBtnDone]} onPress={() => { void pin(track); }} disabled={Boolean(pinBusy)} accessibilityRole="button" accessibilityLabel={inStoryIds.has(track.trackId) ? `${track.title} est déjà dans ta story` : `Ajouter ${track.title} à ma story`}>
                    <Text style={[styles.addBtnText, inStoryIds.has(track.trackId) && styles.addBtnTextDone]}>{pinBusy === track.trackId ? '…' : inStoryIds.has(track.trackId) ? '✓ En story' : '+ Ajouter'}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </KeepModal>

      <SourceProfileQuickView
        visible={Boolean(quickUsername)}
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
        trackAddedAt={openStory?.addedAt}
        onTitlePress={!isOwnOpen && openStory ? () => { const username = openStory.username; setOpenStory(null); setTimeout(() => setQuickUsername(username), 350); } : undefined}
        headerExtra={!isOwnOpen && openStory ? (
          <Text style={styles.teaser} numberOfLines={compactScreen ? 1 : 2} ellipsizeMode="tail">{composeStoryTeaser(openStory.username, `${openStory.profileId}:${new Date().toISOString().slice(0, 10)}`)}</Text>
        ) : isOwnOpen ? (
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
              {viewers && viewers.length === 0 ? <Text style={styles.viewsEmpty}>Personne n’a encore vu ta story aujourd’hui.</Text> : null}
              <ScrollView>
                {(viewers ?? []).map((v) => (
                  <View key={v.viewerId} style={styles.row}>
                    {v.avatarUrl ? <Image source={{ uri: v.avatarUrl }} style={styles.rowAvatar} /> : <View style={[styles.rowAvatar, styles.rowAvatarFallback]}><Text style={styles.rowInitial}>{v.username.slice(0, 1).toUpperCase()}</Text></View>}
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName} numberOfLines={1}>@{v.username}</Text>
                      <View style={styles.rowActions}>
                        {v.isReprise ? <Text style={[styles.badge, styles.badgeReprise]}>A repris</Text> : null}
                        {/* Adel 05/10/2026 : plus de badge « Abonné » ; on va sur le profil (seul endroit où l'on peut se désabonner). */}
                        <TouchableOpacity
                          style={styles.viewProfileBtn}
                          onPress={() => { setViewersOpen(false); setOpenStory(null); onOpenProfile?.(v.username); }}
                          accessibilityRole="button"
                          accessibilityLabel={`Voir le profil de ${v.username}`}
                          testID={`story-viewer-profile-${v.viewerId}`}
                        >
                          <Text style={styles.viewProfileText}>Voir le profil ›</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
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
        subtitle={isOwnOpen ? 'Tes musiques partagées ou en vente' : `${openStory?.followed ? 'Tu le suis' : 'Lié à toi par une reprise ou un abonnement'} · GARDER coûte ${freeCost} FREE`}
        previewOnly={isOwnOpen}
        sourceUsername={isOwnOpen ? undefined : openStory?.username}
        sourceAvatarUrl={isOwnOpen ? null : openStory?.avatarUrl ?? null}
        sourceProfileId={isOwnOpen ? undefined : openStory?.profileId}
        emptyTitle="Cette story est terminée."
        backLabel="REVENIR AU PROFIL"
        loop={false}
        askVisibilityOnKeep
        keepCostNotice={`GARDER ce morceau débitera ${freeCost} FREE après ton choix Public ou Privé. PASSER reste gratuit.`}
        keepDebitAmount={freeCost}
        optimisticPass
        onKeep={async (track, visibility) => {
          // Musique en vente : jamais de GARDER direct, on ouvre la boutique du vendeur.
          if (isSaleStoryTrack(track)) {
            const seller = openStory?.username;
            setOpenStory(null);
            if (seller) onOpenProfile?.(seller);
            return false;
          }
          const { ok } = await keepLokiPulseTrack(track, visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE', freeCost);
          return ok;
        }}
        onPass={() => true}
        onOpenSourceProfile={(username) => { setOpenStory(null); onOpenProfile?.(username); }}
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
  badge: { fontSize: 12, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', color: '#04130F' },
  badgeReprise: { backgroundColor: '#FFB020' },
  barRow: { flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  railWrap: { flex: 1, minWidth: 0 },
  photo: { backgroundColor: colors.backgroundCard },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoInitial: { color: colors.white, fontSize: 28, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 18 },
  sheet: { maxHeight: '75%', borderRadius: 20, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: 14 },
  suggestRow: { gap: 14, paddingVertical: 12, paddingRight: 8 },
  suggestItem: { alignItems: 'center', width: 96 },
  suggestAvatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderStyle: 'dashed', borderColor: '#B79CFF' },
  suggestName: { color: colors.white, fontSize: 13, fontWeight: '900', marginTop: 6, maxWidth: 96 },
  suggestHint: { color: '#B79CFF', fontSize: 11, fontWeight: '800', marginTop: 2, maxWidth: 96 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: colors.white, fontSize: 18, fontWeight: '900' },
  sheetClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: colors.white, fontSize: 20, fontWeight: '900' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.border },
  rowAvatar: { width: 40, height: 40, borderRadius: 20 },
  rowAvatarFallback: { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  rowInitial: { color: colors.white, fontSize: 16, fontWeight: '900' },
  rowBody: { flex: 1, minWidth: 0, paddingVertical: 6 },
  rowActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  viewProfileBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: '#B79CFF', backgroundColor: 'rgba(124,92,252,0.18)', alignItems: 'center', justifyContent: 'center' },
  viewProfileText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  rowName: { color: colors.white, fontSize: 15, fontWeight: '800' },
  rowState: { fontSize: 13, fontWeight: '900' },
  rowStateNew: { color: '#2DE1C2' },
  rowStateSeen: { color: colors.textSecondary },
});
