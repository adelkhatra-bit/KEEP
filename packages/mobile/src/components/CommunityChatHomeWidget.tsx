import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import {
  loadMusicAgoraMessages,
  loadMusicAgoraSettings,
  MusicAgoraMessage,
  postMusicAgoraMessage,
  saveMusicAgoraSettings,
} from '../services/musicAgoraService';
import { lokiText } from '../theme/lokiText';


export default function CommunityChatHomeWidget({ onOpenProfile }: { onOpenProfile?: (username: string) => void }) {
  const [homeEnabled, setHomeEnabled] = useState(false);
  const [messages, setMessages] = useState<MusicAgoraMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const settings = await loadMusicAgoraSettings().catch(() => ({ homeEnabled: false, notificationsEnabled: true, surfaces: ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE'] as const }));
    setHomeEnabled(settings.homeEnabled);
    if (!settings.homeEnabled) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await loadMusicAgoraMessages('place', undefined, 3);
      setMessages(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (!live) return;
      await refresh();
    };
    void run();
    const timer = setInterval(() => { if (live) void run(); }, 12_000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  if (!homeEnabled) return null;

  const send = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      await postMusicAgoraMessage('place', body);
      setDraft('');
      await refresh();
    } finally {
      setPosting(false);
    }
  };

  const hide = async () => {
    const settings = await loadMusicAgoraSettings().catch(() => ({ homeEnabled: true, notificationsEnabled: true, surfaces: ['LISTEN','DISCOVER','PLAYLISTS','PARTIES','PROFILE'] as const }));
    await saveMusicAgoraSettings(false, settings.notificationsEnabled, [...settings.surfaces]).catch(() => null);
    setHomeEnabled(false);
  };

  return <View style={s.shell}>
    <View style={s.head}>
      <View style={s.headCopy}>
        <Text style={s.kicker}>TCHAT · LA PLACE</Text>
        <Text style={s.title}>Ça parle musique maintenant</Text>
      </View>
      <TouchableOpacity style={s.hide} onPress={() => void hide()} accessibilityLabel="Masquer le Tchat de l’accueil"><Text style={s.hideText}>×</Text></TouchableOpacity>
    </View>

    {loading && !messages.length ? <ActivityIndicator color={colors.primaryLight} /> : null}

    <View style={s.feed}>
      {messages.slice(0,3).map((message) => <View key={message.id} style={s.message}>
        <TouchableOpacity disabled={!onOpenProfile} onPress={() => onOpenProfile?.(message.username)}>
          <Text style={s.author}>@{message.username}</Text>
        </TouchableOpacity>
        <Text style={s.body} numberOfLines={2}>{message.sharedTrackId ? '♫ ' : ''}{message.body}</Text>
      </View>)}
      {!loading && !messages.length ? <Text style={s.empty}>Le Tchat est calme. Lance une discussion.</Text> : null}
    </View>

    <View style={s.composer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Écris dans La Place…"
        placeholderTextColor={colors.textMutedGrey}
        maxLength={280}
        style={s.input}
        returnKeyType="send"
        onSubmitEditing={() => void send()}
      />
      <TouchableOpacity style={[s.send,!draft.trim()&&s.sendOff]} disabled={!draft.trim()||posting} onPress={() => void send()}>
        <Text style={s.sendText}>{posting?'…':'ENVOYER'}</Text>
      </TouchableOpacity>
    </View>
  </View>;
}

const s=StyleSheet.create({
  shell:{width:'100%',maxWidth:520,marginTop:14,padding:10,borderRadius:17,borderWidth:1,borderColor:colors.info,backgroundColor:colors.backgroundElevated},
  head:{flexDirection:'row',alignItems:'center',gap:8},
  headCopy:{flex:1,minWidth:0},
  kicker:{color:colors.info,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:1.1},
  title:{color:colors.textPrimary,fontSize:12,fontWeight:'900',marginTop:2},
  hide:{width:28,height:28,borderRadius:14,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},
  hideText:{color:colors.textMutedGrey,fontSize:17,fontWeight:'900'},
  feed:{gap:6,marginTop:8},
  message:{padding:7,borderRadius:10,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},
  author:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900'},
  body:{color:colors.textPrimary,fontSize:lokiText.label.fontSize,lineHeight:14,marginTop:2},
  empty:{color:colors.textMutedGrey,fontSize:lokiText.label.fontSize,textAlign:'center',paddingVertical:8},
  composer:{flexDirection:'row',alignItems:'center',gap:7,marginTop:8},
  input:{flex:1,minHeight:36,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundCard,paddingHorizontal:11,color:colors.textPrimary,fontSize:11},
  send:{minHeight:36,paddingHorizontal:11,borderRadius:18,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},
  sendOff:{opacity:.4},
  sendText:{color:colors.white,fontSize:lokiText.label.fontSize,fontWeight:'900'},
});
