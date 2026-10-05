import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Image, Modal, useWindowDimensions, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import MusicStoryRail, { StoryRing } from './MusicStoryRail';
import MusicSwipeDeckModal from './MusicSwipeDeckModal';
import ProfileCertificationBadge from './ProfileCertificationBadge';
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
  const [ownStory, setOwnStory] = useState<MusicStory | null>(null);
  const [stories, setStories] = useState<MusicStory[]>([]);
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
    void (async () => {
      const seenMap = await loadSeenStories(viewer.id);
      if (live) setSeen(seenMap);
      // Chaque source est indépendante : une panne de l'une ne vide jamais les autres.
      loadOwnStory(viewer).then((mine) => { if (live) setOwnStory(mine); }).catch(() => {});
      try {
        const base = await loadMusicStories(viewer.id);
        if (live) setStories(base);
        // Les musiques en vente arrivent ensuite : la rangée s'affiche sans les attendre.
        const [withSales, saleOnly] = await Promise.all([
          enrichStoriesWithSales(base).catch(() => base),
          loadSaleOnlyStories(viewer.id, base).catch(() => [] as MusicStory[]),
        ]);
        const all = [...withSales, ...saleOnly];
        // Amis par défaut (bulle grise sans story) + suggestions d'amis (ont repris mes musiques, pas encore suivis).
        const storyIds = all.map((story) => story.profileId);
        const relations = await loadStoryRelations(viewer.id).catch(() => ({ following: [] as string[], others: [] as string[] }));
        const friends = await loadFriendBubbles(relations.following, [viewer.id, ...storyIds]).catch(() => [] as MusicStory[]);
        const suggestions = await loadOthersBubbles(relations.others, [viewer.id, ...storyIds]).catch(() => [] as MusicStory[]);
        if (live) setStories([...all, ...friends, ...suggestions]);
        try {
          if (!supabase) throw new Error('offline');
          const ids = Array.from(new Set([viewer.id, ...storyIds, ...friends.map((story) => story.profileId), ...suggestions.map((story) => story.profileId)]));
          const { data: tierRows } = await supabase.rpc('keep_public_certification_tiers', { p_profile_ids: ids });
          if (live && Array.isArray(tierRows)) {
            const nextTiers: Record<string, ProfileCertificationTier> = {};
            for (const row of tierRows as Array<{ profile_id: string; certification_tier: string }>) {
              if (row?.profile_id && row.certification_tier) nextTiers[String(row.profile_id)] = row.certification_tier as ProfileCertificationTier;
            }
            setTiers(nextTiers);
          }
        } catch { /* sans certification connue : aucun badge */ }
        // Pastille verte/rouge : présence réelle (même source que le profil public). Inconnue = pas de pastille.
        const presence = await Promise.allSettled([...all, ...friends, ...suggestions].map((story) => loadProfilePresence(story.profileId)));
        if (live) {
          const next: Record<string, boolean | undefined> = {};
          [...all, ...friends, ...suggestions].forEach((story, index) => {
            const result = presence[index];
            if (result.status === 'fulfilled' && result.value.known) next[story.profileId] = result.value.online;
          });
          setOnline(next);
        }
      } catch {
        // Réseau indisponible : la rangée garde ta story locale, jamais d'écran cassé.
      }
    })();
    return () => { live = false; };
  }, [viewer.id, isFocused]);

  const open = useCallback(async (story: MusicStory) => {
    stopTrackPreviewFast();
    // Suggestion « a repris ta musique » : pas de story à lire, on va sur son profil.
    // Suggestion ou ami sans story du jour : pas de story à lire, on va sur son profil.
    if (story.suggestion || story.tracks.length === 0) { onOpenProfile?.(story.username); return; }
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

  return (
    <View testID="profile-story-bar" style={styles.barRow}>
      {/* La photo de profil porte l'anneau de ta story : un seul visage, pas de doublon. */}
      <View style={{ width: avatarSize, height: avatarSize }}>
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
      <View style={styles.railWrap}>
        <MusicStoryRail
          stories={stories}
          seen={seen}
          size={avatarSize}
          online={online}
          onOpen={(story) => { void open(story); }}
        />
      </View>

      <Modal visible={plusOpen} transparent animationType="fade" onRequestClose={closePlus}>
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
      </Modal>

      <MusicSwipeDeckModal
        visible={Boolean(openStory)}
        tracks={openStory?.tracks ?? []}
        initialTrackId={openStory?.tracks[0]?.id ?? null}
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
                    <Text style={styles.rowName} numberOfLines={1}>@{v.username}</Text>
                    {v.isFollower ? <Text style={[styles.badge, styles.badgeFollower]}>Abonné</Text> : null}
                    {v.isReprise ? <Text style={[styles.badge, styles.badgeReprise]}>Reprise</Text> : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          </SafeAreaView>
        ) : null}
        titleBadge={openTier && openTier !== 'UNVERIFIED' ? <ProfileCertificationBadge tier={openTier} compact /> : null}
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
  badgeFollower: { backgroundColor: '#2DE1C2' },
  badgeReprise: { backgroundColor: '#FFB020' },
  barRow: { flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  railWrap: { flex: 1, minWidth: 0, marginLeft: 12 },
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
  rowName: { flex: 1, color: colors.white, fontSize: 15, fontWeight: '800' },
  rowState: { fontSize: 13, fontWeight: '900' },
  rowStateNew: { color: '#2DE1C2' },
  rowStateSeen: { color: colors.textSecondary },
});
