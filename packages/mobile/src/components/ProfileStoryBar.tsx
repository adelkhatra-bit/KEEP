import React, { useCallback, useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import MusicStoryRail, { StoryRing } from './MusicStoryRail';
import MusicSwipeDeckModal from './MusicSwipeDeckModal';
import { loadProfilePresence } from '../services/profilePresenceService';
import { keepLokiPulseTrack } from '../services/lokiPulseKeep';
import { stopTrackPreviewFast } from '../services/audioPreviewService';
import {
  loadMyStoryViewers,
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
  // Adel (05/10/2026) : « je viens de garder une musique, mon cercle ne s'allume pas » -- la rangée était chargée une seule fois ; elle se recharge maintenant à chaque retour sur le profil.
  const isFocused = useIsFocused();
  const [online, setOnline] = useState<Record<string, boolean | undefined>>({});
  const [ownStory, setOwnStory] = useState<MusicStory | null>(null);
  const [stories, setStories] = useState<MusicStory[]>([]);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [openStory, setOpenStory] = useState<MusicStory | null>(null);
  const [viewers, setViewers] = useState<StoryViewer[] | null>(null);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState<MusicStory[] | null>(null);

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
        if (live) setStories(all);
        // Pastille verte/rouge : présence réelle (même source que le profil public). Inconnue = pas de pastille.
        const presence = await Promise.allSettled(all.map((story) => loadProfilePresence(story.profileId)));
        if (live) {
          const next: Record<string, boolean | undefined> = {};
          all.forEach((story, index) => {
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
    setMoreOpen(null);
    setOpenStory(story);
    setViewersOpen(false);
    if (story.profileId === viewer.id) {
      setViewers(null);
      loadMyStoryViewers().then(setViewers).catch(() => setViewers([]));
    } else {
      void recordStoryView(story.profileId);
    }
    setSeen(await markStorySeen(viewer.id, story));
  }, [viewer.id]);

  const openOwn = () => {
    if (ownStory) { void open(ownStory); return; }
    Alert.alert('Ta story du jour est terminée', 'Une story dure 24 h. Reposte : partage une musique en public, reprends-en une chez un autre membre ou mets-en une en vente — ta photo se rallume aussitôt.', [{ text: 'OK', style: 'cancel' }]);
  };

  const isOwnOpen = openStory?.profileId === viewer.id;

  return (
    <View testID="profile-story-bar" style={styles.barRow}>
      {/* La photo de profil porte l'anneau de ta story : un seul visage, pas de doublon. */}
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
      <View style={styles.railWrap}>
        <MusicStoryRail
          stories={stories}
          seen={seen}
          size={avatarSize}
          online={online}
          onOpen={(story) => { void open(story); }}
          onOpenMore={(hidden) => setMoreOpen(hidden)}
        />
      </View>

      <Modal visible={Boolean(moreOpen)} transparent animationType="fade" onRequestClose={() => setMoreOpen(null)}>
        <SafeAreaView style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Toutes les stories</Text>
              <TouchableOpacity onPress={() => setMoreOpen(null)} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.sheetClose}>
                <Text style={styles.sheetCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {orderStoriesForBar(moreOpen ?? [], seen).map((story) => {
                const unseen = (seen[story.profileId] || '') < story.latestAt;
                return (
                  <TouchableOpacity key={story.profileId} style={styles.row} onPress={() => { void open(story); }} accessibilityRole="button" accessibilityLabel={`Story de ${story.username}`}>
                    {story.avatarUrl
                      ? <Image source={{ uri: story.avatarUrl }} style={styles.rowAvatar} />
                      : <View style={[styles.rowAvatar, styles.rowAvatarFallback]}><Text style={styles.rowInitial}>{story.username.slice(0, 1).toUpperCase()}</Text></View>}
                    <Text style={styles.rowName} numberOfLines={1}>@{story.username}</Text>
                    <Text style={[styles.rowState, unseen ? styles.rowStateNew : styles.rowStateSeen]}>{unseen ? 'Nouveau' : '✓ Vue'}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <MusicSwipeDeckModal
        visible={Boolean(openStory)}
        tracks={openStory?.tracks ?? []}
        initialTrackId={openStory?.tracks[0]?.id ?? null}
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
        title={isOwnOpen ? 'Ta story' : `Story de @${openStory?.username ?? ''}`}
        subtitle={isOwnOpen ? 'Tes musiques partagées ou en vente' : `${openStory?.followed ? 'Tu le suis' : 'Même style que toi'} · GARDER coûte ${freeCost} FREE`}
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
