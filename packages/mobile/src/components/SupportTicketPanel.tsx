import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';
import {
  createSupportTicket,
  loadOwnSupportTickets,
  loadSupportMessages,
  replyToSupportTicket,
  subscribeOwnSupport,
  SupportCategory,
  SupportMessage,
  SupportTicket,
} from '../services/supportCenterService';

const CATEGORIES: Array<{ key: SupportCategory; label: string }> = [
  { key: 'TECHNICAL', label: 'Technique' },
  { key: 'ACCOUNT', label: 'Compte' },
  { key: 'RECOGNITION', label: 'Écoute' },
  { key: 'PAYMENT', label: 'Paiement' },
  { key: 'SAFETY', label: 'Sécurité' },
  { key: 'IDEA', label: 'Idée' },
  { key: 'OTHER', label: 'Autre' },
];

const STATUS_LABEL: Record<SupportTicket['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  WAITING_USER: 'Réponse KEEP',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

export default function SupportTicketPanel({ profileId, username, enabled }: { profileId: string; username: string; enabled: boolean }) {
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<SupportMessage[]>([]);
  const [category, setCategory] = React.useState<SupportCategory>('TECHNICAL');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [reply, setReply] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const refreshTickets = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const rows = await loadOwnSupportTickets();
      setTickets(rows);
      if (selectedId && !rows.some((ticket) => ticket.id === selectedId)) setSelectedId(null);
    } catch { }
  }, [enabled, selectedId]);

  const refreshMessages = React.useCallback(async () => {
    if (!enabled || !selectedId) { setMessages([]); return; }
    try { setMessages(await loadSupportMessages(selectedId)); } catch { }
  }, [enabled, selectedId]);

  React.useEffect(() => {
    if (!enabled) return undefined;
    setLoading(true);
    void refreshTickets().finally(() => setLoading(false));
    const unsubscribe = subscribeOwnSupport(profileId, () => {
      void refreshTickets();
      void refreshMessages();
    });
    return unsubscribe;
  }, [enabled, profileId, refreshMessages, refreshTickets]);

  React.useEffect(() => { void refreshMessages(); }, [refreshMessages]);

  const sendNew = async () => {
    if (!enabled) return;
    setBusy(true);
    try {
      const ticket = await createSupportTicket({ profileId, username, category, subject, message });
      setSubject('');
      setMessage('');
      setSelectedId(ticket.id);
      await refreshTickets();
      await loadSupportMessages(ticket.id).then(setMessages);
      Alert.alert('Message envoyé', 'Ta demande est enregistrée dans KEEP. La réponse apparaîtra ici.');
    } catch (e: any) {
      Alert.alert('Support KEEP', e?.message || 'Impossible d’envoyer la demande pour le moment.');
    } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    try {
      await replyToSupportTicket(profileId, selectedId, reply);
      setReply('');
      await refreshMessages();
      await refreshTickets();
    } catch (e: any) {
      Alert.alert('Support KEEP', e?.message || 'Impossible d’envoyer la réponse.');
    } finally { setBusy(false); }
  };

  if (!enabled) {
    return <View style={s.wrap}><Text style={s.title}>Aide & support KEEP</Text><Text style={s.help}>Crée ou connecte ton compte KEEP pour écrire directement à l’équipe et conserver l’historique de tes demandes.</Text></View>;
  }

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  return <View style={s.wrap}>
    <Text style={s.title}>Aide & support KEEP</Text>
    <Text style={s.help}>Signale un problème, une erreur de reconnaissance, un souci de compte ou propose une idée. KEEP joint automatiquement le contexte technique utile, jamais ton mot de passe.</Text>

    <Text style={s.label}>Type de demande</Text>
    <View style={s.chips}>{CATEGORIES.map((item) => <TouchableOpacity key={item.key} style={[s.chip, category === item.key && s.chipActive]} onPress={() => setCategory(item.key)}><Text style={[s.chipText, category === item.key && s.chipTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
    <TextInput style={s.input} value={subject} onChangeText={setSubject} placeholder="Objet" placeholderTextColor={colors.textMuted} maxLength={140} />
    <TextInput style={[s.input, s.messageInput]} value={message} onChangeText={setMessage} placeholder="Décris précisément ce qui se passe…" placeholderTextColor={colors.textMuted} multiline maxLength={5000} />
    <TouchableOpacity style={s.send} onPress={sendNew} disabled={busy}><Text style={s.sendText}>{busy ? 'Envoi…' : 'Envoyer à KEEP'}</Text></TouchableOpacity>

    <View style={s.divider} />
    <View style={s.row}><Text style={s.label}>Mes demandes</Text>{loading ? <ActivityIndicator color={colors.primaryLight} size="small"/> : null}</View>
    {!tickets.length && !loading ? <Text style={s.help}>Aucune demande pour le moment.</Text> : null}
    {tickets.slice(0, 8).map((ticket) => <TouchableOpacity key={ticket.id} style={[s.ticket, selectedId === ticket.id && s.ticketActive]} onPress={() => setSelectedId(ticket.id)}>
      <View style={s.ticketText}><Text style={s.ticketSubject} numberOfLines={1}>{ticket.subject}</Text><Text style={s.ticketMeta}>{CATEGORIES.find((item) => item.key === ticket.category)?.label ?? ticket.category} · {new Date(ticket.lastMessageAt).toLocaleDateString()}</Text></View>
      <Text style={s.status}>{STATUS_LABEL[ticket.status]}</Text>
    </TouchableOpacity>)}

    {selected ? <View style={s.thread}>
      <Text style={s.threadTitle}>{selected.subject}</Text>
      {messages.map((item) => <View key={item.id} style={[s.bubble, item.senderRole === 'ADMIN' ? s.adminBubble : s.userBubble]}><Text style={s.bubbleAuthor}>{item.senderRole === 'ADMIN' ? 'KEEP' : 'Moi'}</Text><Text style={s.bubbleText}>{item.body}</Text></View>)}
      <TextInput style={[s.input, s.replyInput]} value={reply} onChangeText={setReply} placeholder="Répondre à KEEP…" placeholderTextColor={colors.textMuted} multiline maxLength={5000}/>
      <TouchableOpacity style={s.replyButton} onPress={sendReply} disabled={busy || !reply.trim()}><Text style={s.replyText}>Répondre</Text></TouchableOpacity>
    </View> : null}
  </View>;
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 15, marginBottom: 14 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  help: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, label: { color: colors.textPrimary, fontSize: 12, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 32, paddingHorizontal: 11, borderRadius: 16, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }, chipActive: { borderColor: colors.primaryLight, backgroundColor: colors.backgroundElevated }, chipText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' }, chipTextActive: { color: colors.primaryLight },
  input: { minHeight: 44, marginTop: 9, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, backgroundColor: colors.background }, messageInput: { minHeight: 94, textAlignVertical: 'top' },
  send: { minHeight: 42, marginTop: 10, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, sendText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 15 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticket: { minHeight: 54, marginTop: 7, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 8 }, ticketActive: { borderColor: colors.primaryLight }, ticketText: { flex: 1 }, ticketSubject: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' }, ticketMeta: { color: colors.textMuted, fontSize: 9, marginTop: 3 }, status: { color: colors.primaryLight, fontSize: 9, fontWeight: '900' },
  thread: { marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border }, threadTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '900', marginBottom: 8 }, bubble: { padding: 10, borderRadius: radius.md, marginTop: 7, maxWidth: '94%' }, adminBubble: { backgroundColor: colors.backgroundElevated, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primaryLight }, userBubble: { backgroundColor: colors.background, alignSelf: 'flex-end', borderWidth: 1, borderColor: colors.border }, bubbleAuthor: { color: colors.primaryLight, fontSize: 9, fontWeight: '900', marginBottom: 4 }, bubbleText: { color: colors.textPrimary, fontSize: 11, lineHeight: 16 },
  replyInput: { minHeight: 68, textAlignVertical: 'top' }, replyButton: { minHeight: 38, marginTop: 8, borderRadius: 19, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, replyText: { color: colors.primaryLight, fontSize: 11, fontWeight: '900' },
});
