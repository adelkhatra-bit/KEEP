import type { CanonicalTrack } from '@keep/music';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import { blockUser } from '../services/moderationService';
import TrackPreviewButton from './TrackPreviewButton';
import { commitKeep } from '../services/keepTrackAction';
import {
  loadMusicAgoraMessages,
  loadMusicAgoraRooms,
  loadMusicAgoraSettings,
  loadMusicAgoraSharedTrack,
  MusicAgoraMessage,
  MusicAgoraRevealMode,
  MusicAgoraRoom,
  postMusicAgoraMessage,
  reportMusicAgoraMessage,
  saveMusicAgoraSettings,
  setMusicAgoraRoomSubscription,
  subscribeMusicAgoraRoom,
} from '../services/musicAgoraService';

const PAGE_SIZE = 24;

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const delta = Math.max(0, Date.now() - t);
  if (delta < 60_000) return 'maintenant';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function readableError(error: unknown): string {
  const message = String((error as any)?.message || error || '');
  if (message.includes('message_blocked_language')) return 'Message refusé : garde le débat musical, enlève les insultes.';
  if (message.includes('rate_limited')) return 'Trop de messages d’un coup. Réessaie dans un instant.';
  if (message.includes('authentication_required')) return 'Connecte ton compte pour participer.';
  if (message.includes('message_length')) return 'Écris un message court, jusqu’à 280 caractères.';
  if (message.includes('blocked_relationship')) return 'Cette conversation n’est pas disponible.';
  return 'Impossible de publier pour le moment.';
}

export default function MusicAgoraPanel({
  currentProfileId,
  enabled,
  onOpenProfile,
  shareableTracks = [],
  compact = false,
}: {
  currentProfileId: string;
  enabled: boolean;
  onOpenProfile: (username: string) => void;
  shareableTracks?: CanonicalTrack[];
  compact?: boolean;
}) {
  const [rooms, setRooms] = useState<MusicAgoraRoom[]>([]);
  const [roomSlug, setRoomSlug] = useState('');
  const [messages, setMessages] = useState<MusicAgoraMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [homeEnabled, setHomeEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ profileId: string; username: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedTrack, setSharedTrack] = useState<CanonicalTrack | null>(null);
  const [shareRevealMode, setShareRevealMode] = useState<MusicAgoraRevealMode>('MASKED');
  const [keepBusyId, setKeepBusyId] = useState<string | null>(null);
  const chatScrollRef = useRef<ScrollView | null>(null);
  const initialScrollDone = useRef(false);

  const room = useMemo(() => rooms.find((item) => item.slug === roomSlug) ?? rooms[0] ?? null, [rooms, roomSlug]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      loadMusicAgoraRooms().catch(() => []),
      enabled ? loadMusicAgoraSettings().catch(() => ({ homeEnabled: false, notificationsEnabled: true })) : Promise.resolve({ homeEnabled: false, notificationsEnabled: true }),
    ]).then(([rows, settings]) => {
      if (!live) return;
      setRooms(rows);
      setRoomSlug((current) => current || rows[0]?.slug || '');
      setHomeEnabled(settings.homeEnabled);
      setNotificationsEnabled(settings.notificationsEnabled);
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enabled]);

  const refresh = async (slug = roomSlug, quiet = false) => {
    if (!slug) return;
    if (!quiet) setLoading(true);
    try {
      const rows = await loadMusicAgoraMessages(slug, undefined, PAGE_SIZE);
      setMessages(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      if (!quiet) {
        setMessages([]);
        setHasMore(false);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    if (!roomSlug) return;
    initialScrollDone.current = false;
    void refresh(roomSlug);
    if (enabled && homeEnabled) void setMusicAgoraRoomSubscription(roomSlug, true, notificationsEnabled).catch(() => {});
    const unsubscribe = subscribeMusicAgoraRoom(roomSlug, () => { void refresh(roomSlug, true); });
    const timer = setInterval(() => {
      void refresh(roomSlug, true);
      if (compact && enabled) {
        void loadMusicAgoraSettings().then((settings) => {
          setHomeEnabled(settings.homeEnabled);
          setNotificationsEnabled(settings.notificationsEnabled);
        }).catch(() => {});
      }
    }, 5000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [roomSlug, enabled, homeEnabled, notificationsEnabled, compact]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: initialScrollDone.current });
      initialScrollDone.current = true;
    }, 40);
    return () => clearTimeout(timer);
  }, [messages[messages.length - 1]?.id, roomSlug]);

  const loadOlder = async () => {
    if (!roomSlug || !messages.length || olderBusy) return;
    setOlderBusy(true);
    try {
      const rows = await loadMusicAgoraMessages(roomSlug, messages[0]?.id, PAGE_SIZE);
      setMessages((current) => [...rows.filter((row) => !current.some((item) => item.id === row.id)), ...current]);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setOlderBusy(false);
    }
  };

  const updateHomeChat = async (next: boolean) => {
    if (!enabled || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const settings = await saveMusicAgoraSettings(next, notificationsEnabled);
      setHomeEnabled(settings.homeEnabled);
      setNotificationsEnabled(settings.notificationsEnabled);
      Alert.alert(
        settings.homeEnabled ? 'Tchat activé' : 'Tchat désactivé sur le profil',
        settings.homeEnabled
          ? 'Le mini-Tchat reste maintenant visible sur ton profil et se met à jour automatiquement.'
          : 'La petite fenêtre disparaît du profil. Tu peux la réactiver à tout moment dans Notifications ou dans le Tchat.',
      );
    } catch {
      Alert.alert('Tchat', 'Impossible de modifier ce réglage pour le moment.');
    } finally {
      setSettingsBusy(false);
    }
  };

  const updateNotifications = async (next: boolean) => {
    if (!enabled || settingsBusy) return;
    setSettingsBusy(true);
    try {
      const settings = await saveMusicAgoraSettings(homeEnabled, next);
      setNotificationsEnabled(settings.notificationsEnabled);
      if (roomSlug && homeEnabled) void setMusicAgoraRoomSubscription(roomSlug, true, next).catch(() => {});
    } finally {
      setSettingsBusy(false);
    }
  };

  const publish = async () => {
    const body = draft.trim();
    if (!enabled) {
      Alert.alert('Compte requis', 'Connecte ton compte Loki Music pour participer au Tchat.');
      return;
    }
    if (!roomSlug || posting || (!sharedTrack && body.length < 2)) return;
    setPosting(true);
    try {
      await postMusicAgoraMessage(roomSlug, body, {
        targetProfileId: replyTarget?.profileId ?? null,
        sharedTrackId: sharedTrack?.id ?? null,
        revealMode: sharedTrack ? shareRevealMode : 'NONE',
      });
      setDraft('');
      setReplyTarget(null);
      setSharedTrack(null);
      setShareRevealMode('MASKED');
      await refresh(roomSlug);
    } catch (error) {
      Alert.alert('Tchat', readableError(error));
    } finally {
      setPosting(false);
    }
  };

  const sendQuickReaction = async (emoji: string) => {
    if (!enabled || !roomSlug || posting) return;
    setPosting(true);
    try {
      await postMusicAgoraMessage(roomSlug, emoji, { targetProfileId: replyTarget?.profileId ?? null });
      setReplyTarget(null);
      await refresh(roomSlug, true);
    } catch (error) {
      Alert.alert('Tchat', readableError(error));
    } finally {
      setPosting(false);
    }
  };

  const keepSharedTrack = async (message: MusicAgoraMessage, visibility: 'PUBLIC' | 'PRIVATE') => {
    if (!message.sharedTrackId || keepBusyId) return;
    setKeepBusyId(message.sharedTrackId);
    try {
      const track = await loadMusicAgoraSharedTrack(message.sharedTrackId);
      if (!track) throw new Error('track_not_found');
      const result = await commitKeep(track, [], undefined, {
        visibility,
        context: {
          source: 'community_chat',
          sourceProfileId: message.profileId,
          sourceUsername: message.username,
          agoraMessageId: message.id,
        },
      });
      Alert.alert(
        result.alreadyKept ? 'Déjà dans ta musique' : 'Pépite ajoutée',
        result.alreadyKept
          ? 'Ce morceau était déjà dans ta musique. Aucun FREE n’a été repris.'
          : `Ajoutée en ${visibility === 'PUBLIC' ? 'public' : 'privé'} avec @${message.username} enregistré comme source du partage.`,
      );
    } catch (error: any) {
      const msg = String(error?.message || error || '');
      Alert.alert('GARDER', msg.includes('INSUFFICIENT') ? 'Tu n’as pas assez de FREE pour garder cette pépite.' : 'Impossible d’ajouter cette musique pour le moment.');
    } finally {
      setKeepBusyId(null);
    }
  };

  const askKeepSharedTrack = (message: MusicAgoraMessage) => {
    if (!message.sharedTrackId) return;
    Alert.alert(
      'Garder cette pépite · 3 FREE',
      'Choisis comment elle apparaîtra sur ton profil. Si tu l’as déjà, Loki ne crée aucun doublon et ne reprend aucun FREE.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Privé', onPress: () => void keepSharedTrack(message, 'PRIVATE') },
        { text: 'Public', onPress: () => void keepSharedTrack(message, 'PUBLIC') },
      ],
    );
  };

  const moderate = (message: MusicAgoraMessage) => {
    if (message.profileId === currentProfileId) return;
    Alert.alert(
      `@${message.username}`,
      'Action sur ce message',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Répondre', onPress: () => setReplyTarget({ profileId: message.profileId, username: message.username }) },
        {
          text: 'Signaler',
          onPress: () => {
            Alert.alert('Signaler', 'Choisis la raison.', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Spam', onPress: () => void reportMusicAgoraMessage(message.id, 'spam').then(() => Alert.alert('Merci', 'Le message a été signalé.')).catch(() => {}) },
              { text: 'Harcèlement', onPress: () => void reportMusicAgoraMessage(message.id, 'harassment').then(() => Alert.alert('Merci', 'Le message a été signalé.')).catch(() => {}) },
              { text: 'Inapproprié', onPress: () => void reportMusicAgoraMessage(message.id, 'inappropriate_content').then(() => Alert.alert('Merci', 'Le message a été signalé.')).catch(() => {}) },
            ]);
          },
        },
        {
          text: 'Bloquer',
          style: 'destructive',
          onPress: () => void blockUser(message.profileId).then(() => setMessages((rows) => rows.filter((row) => row.profileId !== message.profileId))).catch(() => {}),
        },
      ],
    );
  };

  if (compact && (!enabled || !homeEnabled)) return null;

  return <View style={[s.shell, compact && s.shellCompact]}>
    {compact ? (
      <View style={s.compactHeader}>
        <View style={s.liveDot} />
        <View style={s.compactHeaderCopy}>
          <Text style={s.compactTitle}>TCHAT LOKI · EN DIRECT</Text>
          <Text style={s.compactMeta}>{room?.label || 'Discussion musicale'} · nouveaux messages automatiques</Text>
        </View>
        <Text style={s.compactBadge}>ACTIVÉ</Text>
      </View>
    ) : <View style={s.intro}>
      <View style={s.titleRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.kicker}>TCHAT LOKI</Text>
          <Text style={s.title}>Parle, partage et garde tes pépites.</Text>
        </View>
        {enabled ? <TouchableOpacity style={[s.homeToggle, homeEnabled && s.homeToggleOn]} disabled={settingsBusy} onPress={() => void updateHomeChat(!homeEnabled)} accessibilityRole="switch" accessibilityState={{ checked: homeEnabled }}>
          <Text style={[s.homeToggleText, homeEnabled && s.homeToggleTextOn]}>{homeEnabled ? 'MINI-CHAT · ACTIVÉ' : 'MINI-CHAT · DÉSACTIVÉ'}</Text>
        </TouchableOpacity> : null}
      </View>
      <Text style={s.subtitle}>Messages publics par salon, réponses ciblées, musique écoutable. Filtre d’insultes, signalement, blocage et anti-spam actifs.</Text>
      {enabled && homeEnabled ? <TouchableOpacity onPress={() => void updateNotifications(!notificationsEnabled)} style={s.notificationsToggle}>
        <Text style={s.notificationsToggleText}>{notificationsEnabled ? '🔔 Notifications du salon activées' : '🔕 Notifications du salon coupées'}</Text>
      </TouchableOpacity> : null}
    </View>}

    {!compact ? <View style={s.rooms}>
      {rooms.map((item) => (
        <TouchableOpacity key={item.slug} style={[s.roomChip, roomSlug === item.slug && s.roomChipOn]} onPress={() => setRoomSlug(item.slug)}>
          <Text style={[s.roomChipText, roomSlug === item.slug && s.roomChipTextOn]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View> : null}

    {!compact && room ? <View style={s.prompt}><Text style={s.promptLabel}>QUESTION DU SALON</Text><Text style={s.promptText}>{room.prompt}</Text></View> : null}

    {loading ? <View style={s.loading}><ActivityIndicator color={colors.primaryLight}/></View> : null}

    <ScrollView
      ref={chatScrollRef}
      style={[s.chatScroll, compact && s.chatScrollCompact]}
      contentContainerStyle={s.list}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => {
        if (!initialScrollDone.current) chatScrollRef.current?.scrollToEnd({ animated: false });
      }}
    >
      {hasMore ? <TouchableOpacity style={s.older} disabled={olderBusy} onPress={() => void loadOlder()}><Text style={s.olderText}>{olderBusy ? 'CHARGEMENT…' : '↑ PLUS ANCIENS'}</Text></TouchableOpacity> : null}
      {(compact ? messages.slice(-6) : messages).map((message) => (
        <View key={message.id} style={[s.message, message.profileId === currentProfileId ? s.messageOwn : s.messageOther, message.targetProfileId && s.directMessage]}>
          <TouchableOpacity style={s.author} onPress={() => onOpenProfile(message.username)}>
            {message.avatarUrl ? <Image source={{ uri: message.avatarUrl }} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>{message.username.slice(0,1).toUpperCase()}</Text></View>}
            <View style={s.authorCopy}>
              <Text style={s.username} numberOfLines={1}>@{message.username}</Text>
              <Text style={s.meta}>{message.targetUsername ? `pour @${message.targetUsername} · ` : ''}{ago(message.createdAt)}</Text>
            </View>
          </TouchableOpacity>
          <Text style={s.body}>{message.body}</Text>

          {message.sharedTrackId ? <View style={s.musicCard}>
            {message.musicRevealMode === 'FULL' && message.trackArtworkUrl
              ? <Image source={{ uri: message.trackArtworkUrl }} style={s.musicArt}/>
              : <View style={[s.musicArt,s.musicArtMasked]}><Text style={s.musicMaskIcon}>♫</Text></View>}
            <View style={s.musicCopy}>
              <Text style={s.musicKicker}>{message.musicRevealMode === 'MASKED' ? 'PÉPITE MASQUÉE' : 'PÉPITE PARTAGÉE'}</Text>
              <Text style={s.musicTitle} numberOfLines={1}>{message.musicRevealMode === 'FULL' ? (message.trackTitle || 'Musique') : 'Écoute avant de découvrir'}</Text>
              <Text style={s.musicArtist} numberOfLines={1}>{message.musicRevealMode === 'FULL' ? (message.trackArtist || `via @${message.username}`) : `via @${message.username}`}</Text>
            </View>
            <TrackPreviewButton trackKey={message.sharedTrackId} previewUrl={message.trackPreviewUrl || undefined} compact small />
            <TouchableOpacity style={s.keepMusic} disabled={keepBusyId === message.sharedTrackId} onPress={() => askKeepSharedTrack(message)}>
              <Text style={s.keepMusicText}>{keepBusyId === message.sharedTrackId ? '…' : 'GARDER · 3 FREE'}</Text>
            </TouchableOpacity>
          </View> : null}

          {message.profileId !== currentProfileId ? <View style={s.messageActions}>
            <TouchableOpacity style={s.reply} onPress={() => setReplyTarget({ profileId: message.profileId, username: message.username })}><Text style={s.replyText}>RÉPONDRE</Text></TouchableOpacity>
            <TouchableOpacity style={s.more} onPress={() => moderate(message)} accessibilityLabel={`Actions pour le message de ${message.username}`}><Text style={s.moreText}>•••</Text></TouchableOpacity>
          </View> : null}
        </View>
      ))}
      {!loading && !messages.length ? <Text style={s.empty}>Le salon est calme. Lance la première discussion.</Text> : null}
    </ScrollView>

    {enabled ? <View style={[s.composer, compact && s.composerCompact]}>
      {replyTarget ? <View style={s.replyTarget}><Text style={s.replyTargetText}>Réponse à @{replyTarget.username}</Text><TouchableOpacity onPress={() => setReplyTarget(null)}><Text style={s.replyTargetClose}>×</Text></TouchableOpacity></View> : null}
      {sharedTrack ? <View style={s.selectedMusic}>
        <Text style={s.selectedMusicTitle} numberOfLines={1}>♫ {sharedTrack.title} · {sharedTrack.artist}</Text>
        <View style={s.revealChoices}>
          <TouchableOpacity style={[s.revealChip,shareRevealMode==='MASKED'&&s.revealChipOn]} onPress={() => setShareRevealMode('MASKED')}><Text style={s.revealChipText}>MASQUÉ</Text></TouchableOpacity>
          <TouchableOpacity style={[s.revealChip,shareRevealMode==='FULL'&&s.revealChipOn]} onPress={() => setShareRevealMode('FULL')}><Text style={s.revealChipText}>TITRE + JAQUETTE</Text></TouchableOpacity>
          <TouchableOpacity style={s.removeMusic} onPress={() => setSharedTrack(null)}><Text style={s.removeMusicText}>×</Text></TouchableOpacity>
        </View>
      </View> : null}
      <View style={s.quickReactions}>
        {['❤️','🔥','👏','🎵'].map((emoji) => <TouchableOpacity key={emoji} style={s.quickReaction} disabled={posting} onPress={() => void sendQuickReaction(emoji)} accessibilityLabel={`Envoyer ${emoji}`}><Text style={s.quickReactionText}>{emoji}</Text></TouchableOpacity>)}
      </View>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Écris ici…"
        placeholderTextColor={colors.textMutedGrey}
        multiline
        maxLength={280}
        style={s.input}
      />
      <View style={s.composerBottom}>
        <TouchableOpacity style={s.shareMusic} disabled={!shareableTracks.length} onPress={() => setShareOpen(true)}>
          <Text style={s.shareMusicText}>♫ PARTAGER UNE MUSIQUE</Text>
        </TouchableOpacity>
        <Text style={s.counter}>{draft.length}/280</Text>
        <TouchableOpacity style={[s.send, (!sharedTrack && !draft.trim()) && s.sendOff]} disabled={(!sharedTrack && !draft.trim()) || posting} onPress={() => void publish()}><Text style={s.sendText}>{posting ? '…' : 'ENVOYER'}</Text></TouchableOpacity>
      </View>
    </View> : <View style={s.locked}><Text style={s.lockedText}>Connecte-toi pour écrire. La lecture reste ouverte.</Text></View>}

    <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
      <View style={s.modalBackdrop}><View style={s.shareSheet}>
        <View style={s.shareHead}><View style={{ flex:1 }}><Text style={s.shareTitle}>Partager une pépite</Text><Text style={s.shareHint}>Choisis une musique de ton profil. Tu pourras masquer ou révéler son identité.</Text></View><TouchableOpacity onPress={() => setShareOpen(false)}><Text style={s.shareClose}>×</Text></TouchableOpacity></View>
        <ScrollView style={s.shareList} contentContainerStyle={{ gap:7 }}>
          {shareableTracks.slice(0,60).map((track) => <TouchableOpacity key={track.id} style={s.shareTrackRow} onPress={() => { setSharedTrack(track); setShareRevealMode('MASKED'); setShareOpen(false); }}>
            {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.shareTrackArt}/> : <View style={[s.shareTrackArt,s.musicArtMasked]}><Text style={s.musicMaskIcon}>♫</Text></View>}
            <View style={{ flex:1,minWidth:0 }}><Text style={s.shareTrackTitle} numberOfLines={1}>{track.title}</Text><Text style={s.shareTrackArtist} numberOfLines={1}>{track.artist}</Text></View>
            <Text style={s.shareTrackArrow}>›</Text>
          </TouchableOpacity>)}
          {!shareableTracks.length ? <Text style={s.empty}>Ajoute d’abord une musique à ton profil pour pouvoir la partager.</Text> : null}
        </ScrollView>
      </View></View>
    </Modal>
  </View>;
}

const s=StyleSheet.create({
  shell:{gap:12,paddingBottom:8},
  shellCompact:{marginHorizontal:18,marginVertical:10,padding:10,borderRadius:20,borderWidth:1,borderColor:colors.primary,backgroundColor:'rgba(20,14,31,.94)',overflow:'hidden'},
  compactHeader:{minHeight:42,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:4},
  liveDot:{width:8,height:8,borderRadius:4,backgroundColor:colors.keep},
  compactHeaderCopy:{flex:1,minWidth:0},
  compactTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900',letterSpacing:.6},
  compactMeta:{color:colors.textMutedGrey,fontSize:8.5,marginTop:2},
  compactBadge:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:.8},
  intro:{padding:14,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  titleRow:{flexDirection:'row',alignItems:'center',gap:10},
  kicker:{color:colors.keep,fontSize:10,fontWeight:'900',letterSpacing:1.4},
  title:{color:colors.textPrimary,fontSize:19,fontWeight:'900',marginTop:4},
  subtitle:{color:colors.textMutedGrey,fontSize:11,lineHeight:16,marginTop:5},
  homeToggle:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,borderColor:colors.info,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  homeToggleOn:{backgroundColor:colors.info},
  homeToggleText:{color:colors.info,fontSize:9,fontWeight:'900'},
  homeToggleTextOn:{color:colors.white},
  notificationsToggle:{alignSelf:'flex-start',marginTop:8},
  notificationsToggleText:{color:colors.textMutedGrey,fontSize:10,fontWeight:'800'},
  rooms:{flexDirection:'row',flexWrap:'wrap',gap:7},
  roomChip:{minHeight:34,paddingHorizontal:12,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  roomChipOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},
  roomChipText:{color:colors.textMutedGrey,fontSize:11,fontWeight:'800'},
  roomChipTextOn:{color:colors.white},
  prompt:{padding:12,borderRadius:15,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  promptLabel:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1},
  promptText:{color:colors.textPrimary,fontSize:14,lineHeight:19,fontWeight:'800',marginTop:4},
  composer:{borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:10},
  composerCompact:{padding:8,borderRadius:14},
  input:{minHeight:64,maxHeight:120,color:colors.textPrimary,fontSize:14,lineHeight:20,textAlignVertical:'top'},
  quickReactions:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:6},
  quickReaction:{width:34,height:30,borderRadius:15,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center',justifyContent:'center'},
  quickReactionText:{fontSize:16},
  composerBottom:{flexDirection:'row',alignItems:'center',gap:7,marginTop:8},
  counter:{color:colors.textMutedGrey,fontSize:9,marginLeft:'auto'},
  send:{minHeight:34,paddingHorizontal:12,borderRadius:17,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  sendOff:{opacity:.45},
  sendText:{color:colors.white,fontSize:9,fontWeight:'900',letterSpacing:.7},
  shareMusic:{minHeight:34,paddingHorizontal:10,borderRadius:17,borderWidth:1,borderColor:colors.keep,alignItems:'center',justifyContent:'center'},
  shareMusicText:{color:colors.keep,fontSize:8,fontWeight:'900'},
  locked:{padding:10,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  lockedText:{color:colors.textMutedGrey,fontSize:11,textAlign:'center'},
  loading:{paddingVertical:8,alignItems:'center'},
  chatScroll:{maxHeight:410},
  chatScrollCompact:{maxHeight:250},
  list:{gap:8,paddingVertical:4},
  message:{position:'relative',padding:10,borderRadius:16,borderWidth:1,maxWidth:'91%'},
  messageOwn:{alignSelf:'flex-end',backgroundColor:'rgba(124,92,252,.18)',borderColor:colors.primary},
  messageOther:{alignSelf:'flex-start',backgroundColor:colors.backgroundCard,borderColor:colors.border},
  directMessage:{borderColor:colors.info},
  author:{flexDirection:'row',alignItems:'center',paddingRight:34},
  avatar:{width:34,height:34,borderRadius:17,backgroundColor:colors.backgroundElevated},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.primaryLight,fontWeight:'900'},
  authorCopy:{flex:1,minWidth:0,marginLeft:8},
  username:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  meta:{color:colors.textMutedGrey,fontSize:9,marginTop:2},
  body:{color:colors.textPrimary,fontSize:13,lineHeight:19,marginTop:8},
  messageActions:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:6,marginTop:8},
  reply:{minHeight:28,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:colors.info,alignItems:'center',justifyContent:'center'},
  replyText:{color:colors.info,fontSize:8,fontWeight:'900'},
  more:{width:30,height:30,alignItems:'center',justifyContent:'center'},
  moreText:{color:colors.textMutedGrey,fontSize:14,fontWeight:'900'},
  empty:{color:colors.textMutedGrey,fontSize:12,textAlign:'center',paddingVertical:16},
  older:{minHeight:40,borderRadius:16,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  olderText:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:.8},
  replyTarget:{minHeight:30,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,borderRadius:12,backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.info,marginBottom:7},
  replyTargetText:{color:colors.info,fontSize:10,fontWeight:'900'},
  replyTargetClose:{color:colors.textPrimary,fontSize:18,fontWeight:'900'},
  selectedMusic:{padding:8,borderRadius:12,borderWidth:1,borderColor:colors.keep,backgroundColor:colors.successFaint,marginBottom:7},
  selectedMusicTitle:{color:colors.textPrimary,fontSize:10,fontWeight:'900'},
  revealChoices:{flexDirection:'row',alignItems:'center',gap:6,marginTop:7},
  revealChip:{minHeight:28,paddingHorizontal:8,borderRadius:14,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  revealChipOn:{borderColor:colors.keep,backgroundColor:colors.successSoft},
  revealChipText:{color:colors.textPrimary,fontSize:8,fontWeight:'900'},
  removeMusic:{marginLeft:'auto',width:28,height:28,borderRadius:14,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  removeMusicText:{color:colors.textMutedGrey,fontSize:16,fontWeight:'900'},
  musicCard:{marginTop:9,padding:9,borderRadius:14,borderWidth:1,borderColor:colors.keep,backgroundColor:colors.successFaint,flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
  musicArt:{width:42,height:42,borderRadius:10,backgroundColor:colors.backgroundElevated},
  musicArtMasked:{alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.primary},
  musicMaskIcon:{color:colors.primaryLight,fontSize:19,fontWeight:'900'},
  musicCopy:{flex:1,minWidth:120},
  musicKicker:{color:colors.keep,fontSize:8,fontWeight:'900',letterSpacing:.8},
  musicTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900',marginTop:2},
  musicArtist:{color:colors.textMutedGrey,fontSize:9,marginTop:2},
  keepMusic:{minHeight:32,paddingHorizontal:9,borderRadius:16,backgroundColor:colors.keep,alignItems:'center',justifyContent:'center'},
  keepMusicText:{color:colors.background,fontSize:8,fontWeight:'900'},
  modalBackdrop:{flex:1,backgroundColor:colors.overlay,alignItems:'center',justifyContent:'center',padding:18},
  shareSheet:{width:'100%',maxWidth:460,maxHeight:'78%',borderRadius:22,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.backgroundElevated,padding:14},
  shareHead:{flexDirection:'row',alignItems:'flex-start',gap:10},
  shareTitle:{color:colors.textPrimary,fontSize:18,fontWeight:'900'},
  shareHint:{color:colors.textMutedGrey,fontSize:10,lineHeight:15,marginTop:3},
  shareClose:{color:colors.textMutedGrey,fontSize:24,fontWeight:'900'},
  shareList:{marginTop:12},
  shareTrackRow:{minHeight:54,flexDirection:'row',alignItems:'center',gap:9,padding:8,borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard},
  shareTrackArt:{width:38,height:38,borderRadius:9,backgroundColor:colors.backgroundElevated},
  shareTrackTitle:{color:colors.textPrimary,fontSize:11,fontWeight:'900'},
  shareTrackArtist:{color:colors.textMutedGrey,fontSize:9,marginTop:2},
  shareTrackArrow:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},
});
