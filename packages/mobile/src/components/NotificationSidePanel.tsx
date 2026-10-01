import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { KeepNotification, loadNotifications, markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from '../services/notificationService';

type Props = {
  visible: boolean;
  profileId: string;
  onClose: () => void;
  onOpenAll: () => void;
  onOpenChat: () => void;
};

function timeLabel(value: string): string {
  const d = new Date(value);
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - d.getTime()) / 60000));
  if (diffMin < 1) return 'À l’instant';
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function NotificationSidePanel({ visible, profileId, onClose, onOpenAll, onOpenChat }: Props) {
  const slide = useRef(new Animated.Value(1)).current;
  const [items, setItems] = useState<KeepNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!profileId) return;
    setLoading(true);
    try { setItems(await loadNotifications(profileId)); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!visible) { slide.setValue(1); return undefined; }
    void refresh();
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 2 }).start();
    const unsub = subscribeToNotifications(profileId, (notification) => setItems((prev) => [notification, ...prev.filter((row) => row.id !== notification.id)].slice(0, 100)));
    return () => unsub();
  }, [visible, profileId]);

  const close = () => {
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start(({ finished }) => { if (finished) onClose(); });
  };

  const markRead = async (item: KeepNotification) => {
    if (item.readAt) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, readAt } : row));
    await markNotificationRead(profileId, item.id).catch(() => {});
  };

  const markAll = async () => {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((row) => ({ ...row, readAt: row.readAt || readAt })));
    await markAllNotificationsRead(profileId).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={close} accessibilityLabel="Fermer les notifications" />
        <Animated.View style={[s.panel, { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }] }]}>
          <View style={s.header}>
            <View>
              <Text style={s.eyebrow}>LOKI MUSIC</Text>
              <Text style={s.title}>Notifications</Text>
            </View>
            <TouchableOpacity style={s.close} onPress={close} accessibilityLabel="Fermer"><Text style={s.closeText}>×</Text></TouchableOpacity>
          </View>
          <View style={s.actions}>
            <TouchableOpacity style={s.actionGhost} onPress={() => void markAll()}><Text style={s.actionGhostText}>TOUT LIRE</Text></TouchableOpacity>
            <TouchableOpacity style={s.actionGhost} onPress={() => { close(); setTimeout(onOpenChat, 200); }} accessibilityLabel="Ouvrir le tchat"><Text style={s.actionGhostText}>TCHAT</Text></TouchableOpacity>
            <TouchableOpacity style={s.actionPrimary} onPress={() => { close(); setTimeout(onOpenAll, 200); }}><Text style={s.actionPrimaryText}>TOUT VOIR</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
            {loading && !items.length ? <Text style={s.empty}>Chargement…</Text> : null}
            {!loading && !items.length ? <View style={s.emptyCard}><Text style={s.emptyIcon}>🔔</Text><Text style={s.emptyTitle}>Rien de nouveau</Text><Text style={s.empty}>Tes Battles, reprises, visites, événements et gains apparaîtront ici.</Text></View> : null}
            {items.map((item) => (
              <TouchableOpacity key={item.id} style={[s.card, !item.readAt && s.cardUnread]} onPress={() => void markRead(item)} activeOpacity={0.84}>
                <View style={s.cardTop}><View style={[s.dot, item.readAt && s.dotRead]} /><Text style={s.cardTitle} numberOfLines={1}>{item.title || 'Loki Music'}</Text><Text style={s.time}>{timeLabel(item.createdAt)}</Text></View>
                <Text style={s.body} numberOfLines={3}>{item.body}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root:{flex:1,flexDirection:'row',justifyContent:'flex-end'},
  backdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(4,2,9,.62)'},
  panel:{width:'88%',maxWidth:390,height:'100%',backgroundColor:colors.backgroundCard,borderLeftWidth:2,borderLeftColor:colors.primary,paddingTop:52,shadowColor:colors.primaryLight,shadowOpacity:.35,shadowRadius:24,shadowOffset:{width:-8,height:0},elevation:24},
  header:{paddingHorizontal:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  eyebrow:{color:colors.primaryLight,fontSize:9,fontWeight:'900',letterSpacing:1.4},
  title:{color:colors.textPrimary,fontSize:24,fontWeight:'900',marginTop:2},
  close:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.primaryFaint,borderWidth:1,borderColor:colors.primary},
  closeText:{color:colors.textPrimary,fontSize:26,lineHeight:28,fontWeight:'700'},
  actions:{flexDirection:'row',gap:8,paddingHorizontal:16,paddingTop:14,paddingBottom:10},
  actionGhost:{flex:1,minHeight:40,borderRadius:13,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',backgroundColor:colors.backgroundElevated},
  actionGhostText:{color:colors.textPrimary,fontSize:9,fontWeight:'900'},
  actionPrimary:{flex:1,minHeight:40,borderRadius:13,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary},
  actionPrimaryText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  list:{padding:16,paddingTop:6,paddingBottom:36,gap:9},
  card:{padding:12,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated},
  cardUnread:{borderColor:colors.primaryLight,backgroundColor:colors.primaryFaint},
  cardTop:{flexDirection:'row',alignItems:'center',gap:7},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.keep},
  dotRead:{backgroundColor:colors.textMuted},
  cardTitle:{flex:1,minWidth:0,color:colors.textPrimary,fontSize:13,fontWeight:'900'},
  time:{color:colors.textMuted,fontSize:9,fontWeight:'700'},
  body:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,marginTop:7},
  emptyCard:{padding:20,borderRadius:18,borderWidth:1,borderColor:colors.border,backgroundColor:colors.backgroundElevated,alignItems:'center'},
  emptyIcon:{fontSize:28,marginBottom:8},
  emptyTitle:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginBottom:4},
  empty:{color:colors.textMutedGrey,fontSize:12,lineHeight:17,textAlign:'center'},
});
