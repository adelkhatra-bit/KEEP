import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import { blockUser } from '../services/moderationService';
import {
  loadMusicAgoraMessages,
  loadMusicAgoraRooms,
  MusicAgoraMessage,
  MusicAgoraRoom,
  postMusicAgoraMessage,
  reportMusicAgoraMessage,
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
  if (message.includes('message_length')) return 'Écris entre 2 et 280 caractères.';
  return 'Impossible de publier pour le moment.';
}

export default function MusicAgoraPanel({
  currentProfileId,
  enabled,
  onOpenProfile,
}: {
  currentProfileId: string;
  enabled: boolean;
  onOpenProfile: (username: string) => void;
}) {
  const [rooms, setRooms] = useState<MusicAgoraRoom[]>([]);
  const [roomSlug, setRoomSlug] = useState('');
  const [messages, setMessages] = useState<MusicAgoraMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [olderBusy, setOlderBusy] = useState(false);
  const [posting, setPosting] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const room = useMemo(() => rooms.find((item) => item.slug === roomSlug) ?? rooms[0] ?? null, [rooms, roomSlug]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    loadMusicAgoraRooms()
      .then((rows) => {
        if (!live) return;
        setRooms(rows);
        setRoomSlug((current) => current || rows[0]?.slug || '');
      })
      .catch(() => { if (live) setRooms([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const refresh = async (slug = roomSlug) => {
    if (!slug) return;
    setLoading(true);
    try {
      const rows = await loadMusicAgoraMessages(slug, undefined, PAGE_SIZE);
      setMessages(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      setMessages([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!roomSlug) return;
    void refresh(roomSlug);
    const timer = setInterval(() => { void refresh(roomSlug); }, 20_000);
    return () => clearInterval(timer);
  }, [roomSlug]);

  const loadOlder = async () => {
    if (!roomSlug || !messages.length || olderBusy) return;
    setOlderBusy(true);
    try {
      const rows = await loadMusicAgoraMessages(roomSlug, messages[messages.length - 1]?.id, PAGE_SIZE);
      setMessages((current) => [...current, ...rows.filter((row) => !current.some((item) => item.id === row.id))]);
      setHasMore(rows.length === PAGE_SIZE);
    } finally {
      setOlderBusy(false);
    }
  };

  const publish = async () => {
    const body = draft.trim();
    if (!enabled) {
      Alert.alert('Compte requis', 'Connecte ton compte Loki Music pour participer à La Place.');
      return;
    }
    if (!roomSlug || body.length < 2 || posting) return;
    setPosting(true);
    try {
      await postMusicAgoraMessage(roomSlug, body);
      setDraft('');
      await refresh(roomSlug);
    } catch (error) {
      Alert.alert('La Place', readableError(error));
    } finally {
      setPosting(false);
    }
  };

  const moderate = (message: MusicAgoraMessage) => {
    if (message.profileId === currentProfileId) return;
    Alert.alert(
      `@${message.username}`,
      'Que veux-tu faire ?',
      [
        { text: 'Annuler', style: 'cancel' },
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

  return <View style={s.shell}>
    <View style={s.intro}>
      <Text style={s.kicker}>LA PLACE</Text>
      <Text style={s.title}>Parle musique, pas algorithme.</Text>
      <Text style={s.subtitle}>Souvenirs, découvertes, débats. Messages courts. Pas d’insultes. Pas de DM ici.</Text>
    </View>

    <View style={s.rooms}>
      {rooms.map((item) => (
        <TouchableOpacity key={item.slug} style={[s.roomChip, roomSlug === item.slug && s.roomChipOn]} onPress={() => setRoomSlug(item.slug)}>
          <Text style={[s.roomChipText, roomSlug === item.slug && s.roomChipTextOn]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </View>

    {room ? <View style={s.prompt}><Text style={s.promptLabel}>QUESTION DU SALON</Text><Text style={s.promptText}>{room.prompt}</Text></View> : null}

    {enabled ? <View style={s.composer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Ton souvenir, ton avis, ta découverte…"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={280}
        style={s.input}
      />
      <View style={s.composerBottom}><Text style={s.counter}>{draft.length}/280</Text><TouchableOpacity style={[s.send, (!draft.trim() || posting) && s.sendOff]} disabled={!draft.trim() || posting} onPress={() => void publish()}><Text style={s.sendText}>{posting ? '…' : 'PUBLIER'}</Text></TouchableOpacity></View>
    </View> : <View style={s.locked}><Text style={s.lockedText}>Connecte-toi pour écrire. La lecture reste ouverte.</Text></View>}

    {loading ? <View style={s.loading}><ActivityIndicator color={colors.primaryLight}/></View> : null}

    <View style={s.list}>
      {messages.map((message) => (
        <View key={message.id} style={s.message}>
          <TouchableOpacity style={s.author} onPress={() => onOpenProfile(message.username)}>
            {message.avatarUrl ? <Image source={{ uri: message.avatarUrl }} style={s.avatar}/> : <View style={[s.avatar,s.avatarFallback]}><Text style={s.avatarText}>{message.username.slice(0,1).toUpperCase()}</Text></View>}
            <View style={s.authorCopy}><Text style={s.username} numberOfLines={1}>@{message.username}</Text><Text style={s.meta}>{message.kind} · {ago(message.createdAt)}</Text></View>
          </TouchableOpacity>
          <Text style={s.body}>{message.body}</Text>
          {message.profileId !== currentProfileId ? <TouchableOpacity style={s.more} onPress={() => moderate(message)} accessibilityLabel={`Actions pour le message de ${message.username}`}><Text style={s.moreText}>•••</Text></TouchableOpacity> : null}
        </View>
      ))}
      {!loading && !messages.length ? <Text style={s.empty}>Le salon est calme. Lance la première discussion.</Text> : null}
    </View>

    {hasMore ? <TouchableOpacity style={s.older} disabled={olderBusy} onPress={() => void loadOlder()}><Text style={s.olderText}>{olderBusy ? 'CHARGEMENT…' : 'PLUS ANCIENS'}</Text></TouchableOpacity> : null}
  </View>;
}

const s=StyleSheet.create({
  shell:{gap:12,paddingBottom:8},
  intro:{padding:14,borderRadius:18,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.primaryFaint},
  kicker:{color:colors.keep,fontSize:10,fontWeight:'900',letterSpacing:1.4},
  title:{color:colors.textPrimary,fontSize:19,fontWeight:'900',marginTop:4},
  subtitle:{color:colors.textMuted,fontSize:11,lineHeight:16,marginTop:5},
  rooms:{flexDirection:'row',flexWrap:'wrap',gap:7},
  roomChip:{minHeight:34,paddingHorizontal:12,borderRadius:17,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,alignItems:'center',justifyContent:'center'},
  roomChipOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},
  roomChipText:{color:colors.textMuted,fontSize:11,fontWeight:'800'},
  roomChipTextOn:{color:colors.white},
  prompt:{padding:12,borderRadius:15,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  promptLabel:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1},
  promptText:{color:colors.textPrimary,fontSize:14,lineHeight:19,fontWeight:'800',marginTop:4},
  composer:{borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,padding:10},
  input:{minHeight:70,maxHeight:120,color:colors.textPrimary,fontSize:14,lineHeight:20,textAlignVertical:'top'},
  composerBottom:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8},
  counter:{color:colors.textMuted,fontSize:10},
  send:{minHeight:34,paddingHorizontal:14,borderRadius:17,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  sendOff:{opacity:.45},
  sendText:{color:colors.white,fontSize:10,fontWeight:'900',letterSpacing:.7},
  locked:{padding:10,borderRadius:14,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  lockedText:{color:colors.textMuted,fontSize:11,textAlign:'center'},
  loading:{paddingVertical:8,alignItems:'center'},
  list:{gap:8},
  message:{position:'relative',padding:11,borderRadius:16,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  author:{flexDirection:'row',alignItems:'center',paddingRight:34},
  avatar:{width:34,height:34,borderRadius:17,backgroundColor:colors.backgroundElevated},
  avatarFallback:{alignItems:'center',justifyContent:'center'},
  avatarText:{color:colors.primaryLight,fontWeight:'900'},
  authorCopy:{flex:1,minWidth:0,marginLeft:8},
  username:{color:colors.textPrimary,fontSize:12,fontWeight:'900'},
  meta:{color:colors.textMuted,fontSize:9,marginTop:2},
  body:{color:colors.textPrimary,fontSize:13,lineHeight:19,marginTop:8},
  more:{position:'absolute',right:8,top:8,width:30,height:30,alignItems:'center',justifyContent:'center'},
  moreText:{color:colors.textMuted,fontSize:14,fontWeight:'900'},
  empty:{color:colors.textMuted,fontSize:12,textAlign:'center',paddingVertical:16},
  older:{minHeight:40,borderRadius:16,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  olderText:{color:colors.primaryLight,fontSize:10,fontWeight:'900',letterSpacing:.8},
});
