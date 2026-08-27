import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { broadcastEventToFollowers, createCreatorEvent, loadMyRsvps, loadUpcomingEvents, setEventRsvp, CreatorEvent, EventRsvpStatus } from '../services/creatorEventService';
import { shareEvent } from '../services/sharingService';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';
import { hasFeature } from '../services/entitlementService';
import { loadCurrentPlanCode } from '../services/planService';
import SwipeDeck from '../components/SwipeDeck';

const RSVP_LABEL: Record<EventRsvpStatus, string> = {
  GOING: '✓ Je participe',
  MAYBE: 'Peut-être',
  NOT_GOING: 'Je ne participe pas',
};

export default function PartiesScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [events, setEvents] = useState<CreatorEvent[]>([]);
  const [eventIndex, setEventIndex] = useState(0);
  const [rsvps, setRsvps] = useState<Record<string, EventRsvpStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [planCode, setPlanCode] = useState('FREE');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [venueName, setVenueName] = useState('');
  const [countryCode, setCountryCode] = useState(user?.countryCode || 'FR');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const liveEvents = await loadUpcomingEvents();
      setEvents(liveEvents);
      setEventIndex(0);
      if (user && !isLocalGuest && !isDemoMode) setRsvps(await loadMyRsvps(user.id));
      else setRsvps({});
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les soirées.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, [user?.id, isLocalGuest, isDemoMode]);
  useEffect(() => {
    let live = true;
    if (!user || isLocalGuest || isDemoMode) { setPlanCode('FREE'); return; }
    loadCurrentPlanCode(user.id).then((code) => live && setPlanCode(code || 'FREE')).catch(() => live && setPlanCode('FREE'));
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);

  const currentEvent = events.length ? events[eventIndex % events.length] : null;
  const creatorEnabled = hasFeature(planCode, 'CREATE_EVENT');
  const nextEvent = () => { if (events.length) setEventIndex((value) => (value + 1) % events.length); };

  const requireAccount = () => {
    Alert.alert('Compte KEEP requis', 'Crée ou connecte ton compte KEEP pour répondre aux soirées.', [
      { text: 'Plus tard', style: 'cancel' },
      { text: 'Créer / se connecter', onPress: () => navigation.navigate('Main', { screen: 'Profile' }) },
    ]);
  };

  const chooseRsvp = async (eventId: string, status: EventRsvpStatus, advanceAfter = false) => {
    if (!user || isLocalGuest || isDemoMode) { requireAccount(); return; }
    setBusyId(eventId);
    try {
      await setEventRsvp(user.id, eventId, status);
      setRsvps((current) => ({ ...current, [eventId]: status }));
      if (advanceAfter) nextEvent();
    } catch {
      Alert.alert('Soirée', 'Impossible d’enregistrer ta réponse pour le moment.');
    } finally { setBusyId(''); }
  };

  const openCreate = () => {
    if (!creatorEnabled) {
      navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'CREATE_EVENT' });
      return;
    }
    setCreateOpen(true);
  };

  const parseDate = () => {
    const clean = startsAt.trim();
    if (!clean) return null;
    const parsed = new Date(clean.length === 16 ? `${clean}:00` : clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const publish = async (notifyFollowers: boolean) => {
    const iso = parseDate();
    if (name.trim().length < 3) return Alert.alert('Soirée', 'Indique un nom pour la soirée.');
    if (!iso) return Alert.alert('Soirée', 'Indique la date au format AAAA-MM-JJTHH:MM.');
    setCreateBusy(true);
    try {
      const created = await createCreatorEvent({
        name: name.trim(),
        description: description.trim(),
        venueName: venueName.trim(),
        startsAt: iso,
        countryCode: countryCode.trim().toUpperCase().slice(0,2),
        djArtistNames: user?.username ? [user.username] : [],
      });
      let sent = 0;
      if (notifyFollowers) sent = await broadcastEventToFollowers(created.id, message.trim());
      setCreateOpen(false);
      setName(''); setStartsAt(''); setVenueName(''); setDescription(''); setMessage('');
      await reload();
      Alert.alert('Soirée publiée', notifyFollowers ? `${sent} abonné(s) ont reçu l’invitation KEEP.` : 'La soirée est maintenant visible dans KEEP.');
    } catch (e: any) {
      if (String(e?.message || '').includes('CREATOR_PRO_REQUIRED')) navigation.navigate('Offers', { focusPlan: 'CREATOR_PRO', sourceFeature: 'CREATE_EVENT' });
      else Alert.alert('Soirée', e?.message || 'Impossible de créer la soirée pour le moment.');
    } finally { setCreateBusy(false); }
  };

  const dateText = currentEvent ? new Date(currentEvent.startsAt).toLocaleString('fr-FR', { weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit' }) : '';
  const currentRsvp = currentEvent ? rsvps[currentEvent.id] : undefined;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}><Text style={styles.title}>Soirées</Text><Text style={styles.subtitle}>Swipe les événements : participe, passe ou garde-les en tête.</Text></View>
          <TouchableOpacity style={[styles.createButton,!creatorEnabled && styles.createButtonLocked]} onPress={openCreate} accessibilityLabel={creatorEnabled ? 'Créer une soirée' : 'Créer une soirée, Creator Pro requis'}>
            <Text style={styles.createButtonText}>{creatorEnabled ? '＋ CRÉER' : '🔒 CRÉER'}</Text>
          </TouchableOpacity>
        </View>
        {!creatorEnabled ? <TouchableOpacity style={styles.creatorHint} onPress={openCreate}><Text style={styles.creatorHintText}>Créer une soirée et notifier ses abonnés nécessite KEEP CREATOR PRO. Appuie ici pour voir directement la formule.</Text></TouchableOpacity> : null}

        {loading ? <ActivityIndicator color={colors.primaryLight} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && !currentEvent ? <View style={styles.empty}><Text style={styles.emptyTitle}>Aucun événement publié pour le moment.</Text><Text style={styles.meta}>Les invitations de tes artistes, DJ et lieux suivis apparaîtront ici.</Text></View> : null}

        {currentEvent ? <>
          <SwipeDeck resetKey={currentEvent.id} enabled={busyId !== currentEvent.id} onSwipeLeft={() => chooseRsvp(currentEvent.id,'NOT_GOING',true)} onSwipeRight={() => chooseRsvp(currentEvent.id,'GOING',true)} leftLabel="NON" rightLabel="J’Y VAIS" hint="Glisse ← non · → je participe · les boutons restent disponibles">
            <View style={styles.card}>
              <View style={styles.badge}><Text style={styles.badgeText}>ÉVÉNEMENT</Text></View>
              <Text style={styles.eventName}>{currentEvent.name}</Text>
              <Text style={styles.date}>{dateText}</Text>
              <Text style={styles.meta}>{[currentEvent.venueName,currentEvent.countryCode].filter(Boolean).join(' · ')}</Text>
              {currentEvent.djArtistNames.length ? <Text style={styles.dj}>{currentEvent.djArtistNames.map((n) => `@${n.replace(/^@+/, '')}`).join(' · ')}</Text> : null}
              {currentEvent.description ? <Text style={styles.description}>{currentEvent.description}</Text> : null}
              <View style={styles.currentAnswer}><Text style={styles.currentAnswerText}>{currentRsvp ? RSVP_LABEL[currentRsvp] : 'Pas encore de réponse'}</Text></View>
            </View>
          </SwipeDeck>

          <View style={styles.rsvpRow}>
            <TouchableOpacity style={[styles.roundAction,styles.noAction]} onPress={() => void chooseRsvp(currentEvent.id,'NOT_GOING',true)} disabled={busyId === currentEvent.id}><Text style={styles.noText}>✕</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.maybeAction,currentRsvp === 'MAYBE' && styles.maybeActionOn]} onPress={() => void chooseRsvp(currentEvent.id,'MAYBE')} disabled={busyId === currentEvent.id}><Text style={styles.maybeText}>PEUT-ÊTRE</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.roundAction,styles.yesAction]} onPress={() => void chooseRsvp(currentEvent.id,'GOING',true)} disabled={busyId === currentEvent.id}>{busyId === currentEvent.id ? <ActivityIndicator color="#111"/> : <Text style={styles.yesText}>✓</Text>}</TouchableOpacity>
          </View>

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondary} onPress={nextEvent}><Text style={styles.secondaryText}>Suivant</Text></TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => shareEvent(currentEvent.id,currentEvent.name).catch(() => {})}><Text style={styles.secondaryText}>↗ Partager</Text></TouchableOpacity>
          </View>
        </> : null}
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.backdrop}><View style={styles.sheet}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>Créer une soirée</Text><TouchableOpacity onPress={() => setCreateOpen(false)}><Text style={styles.close}>Fermer</Text></TouchableOpacity></View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Nom de la soirée" placeholderTextColor={colors.textMuted}/>
            <TextInput style={styles.input} value={startsAt} onChangeText={setStartsAt} placeholder="2026-09-12T22:00" placeholderTextColor={colors.textMuted} autoCapitalize="none"/>
            <TextInput style={styles.input} value={venueName} onChangeText={setVenueName} placeholder="Lieu" placeholderTextColor={colors.textMuted}/>
            <TextInput style={styles.input} value={countryCode} onChangeText={setCountryCode} placeholder="Pays (FR)" placeholderTextColor={colors.textMuted} autoCapitalize="characters" maxLength={2}/>
            <TextInput style={[styles.input,styles.multiline]} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={colors.textMuted} multiline/>
            <TextInput style={[styles.input,styles.multiline]} value={message} onChangeText={setMessage} placeholder="Message à tes abonnés (optionnel)" placeholderTextColor={colors.textMuted} multiline/>
            <TouchableOpacity style={styles.publish} onPress={() => void publish(true)} disabled={createBusy}>{createBusy ? <ActivityIndicator color="#FFF"/> : <Text style={styles.publishText}>PUBLIER + NOTIFIER MES ABONNÉS</Text>}</TouchableOpacity>
            <TouchableOpacity style={styles.publishSecondary} onPress={() => void publish(false)} disabled={createBusy}><Text style={styles.publishSecondaryText}>Publier sans notification</Text></TouchableOpacity>
          </ScrollView>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#090610'},content:{padding:spacing.xl,paddingBottom:spacing.xxxl},headerRow:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:spacing.md},title:{...typography.h1,color:'#F8F6FC'},subtitle:{color:'#8F879D',fontSize:12,lineHeight:17,marginTop:3},createButton:{minHeight:40,paddingHorizontal:12,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#8B5CF6'},createButtonLocked:{backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},createButtonText:{color:'#FFF',fontSize:10,fontWeight:'900'},creatorHint:{padding:11,borderRadius:13,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',marginBottom:spacing.lg},creatorHintText:{color:'#B79CFF',fontSize:10,lineHeight:15,textAlign:'center',fontWeight:'700'},error:{color:colors.danger,textAlign:'center',paddingVertical:18},empty:{backgroundColor:'#151020',borderRadius:18,padding:spacing.lg,borderWidth:1,borderColor:'#312348'},emptyTitle:{color:'#F8F6FC',fontSize:15,fontWeight:'900',marginBottom:6},
  card:{height:420,borderRadius:26,padding:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',justifyContent:'flex-end',overflow:'hidden'},badge:{alignSelf:'flex-start',paddingHorizontal:9,paddingVertical:5,borderRadius:radius.pill,backgroundColor:'rgba(139,92,246,.16)',marginBottom:10},badgeText:{color:'#B79CFF',fontSize:9,fontWeight:'900',letterSpacing:1},eventName:{color:'#FFF',fontSize:28,lineHeight:32,fontWeight:'900'},date:{color:'#E5F266',fontSize:13,fontWeight:'900',marginTop:8},meta:{color:'#A99DB9',fontSize:12,marginTop:5},dj:{color:'#B79CFF',fontSize:12,fontWeight:'800',marginTop:5},description:{color:'#D0C6D9',fontSize:12,lineHeight:18,marginTop:14},currentAnswer:{alignSelf:'flex-start',marginTop:16,paddingHorizontal:10,paddingVertical:6,borderRadius:radius.pill,backgroundColor:'#21182F'},currentAnswerText:{color:'#FFF',fontSize:10,fontWeight:'900'},
  rsvpRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:18,marginTop:16},roundAction:{width:58,height:58,borderRadius:29,alignItems:'center',justifyContent:'center',borderWidth:2},noAction:{borderColor:'#FF5F83',backgroundColor:'#151020'},yesAction:{borderColor:'#E5F266',backgroundColor:'#E5F266'},noText:{color:'#FF5F83',fontSize:26,fontWeight:'800'},yesText:{color:'#17130B',fontSize:25,fontWeight:'900'},maybeAction:{minHeight:44,paddingHorizontal:15,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},maybeActionOn:{borderColor:'#B79CFF',backgroundColor:'#34234F'},maybeText:{color:'#D9CFE5',fontSize:9,fontWeight:'900'},secondaryRow:{flexDirection:'row',gap:8,marginTop:12},secondary:{flex:1,minHeight:42,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#312348',backgroundColor:'#120D1B'},secondaryText:{color:'#B79CFF',fontSize:11,fontWeight:'800'},
  backdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',justifyContent:'flex-end'},sheet:{maxHeight:'86%',backgroundColor:'#151020',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,borderColor:'#493369',padding:18},modalHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12},modalTitle:{color:'#FFF',fontSize:19,fontWeight:'900'},close:{color:'#B79CFF',fontSize:12,fontWeight:'900'},input:{minHeight:46,borderRadius:13,borderWidth:1,borderColor:'#3B2B50',backgroundColor:'#120D1B',color:'#FFF',paddingHorizontal:13,marginBottom:9},multiline:{minHeight:78,paddingTop:12,textAlignVertical:'top'},publish:{minHeight:48,borderRadius:24,backgroundColor:'#8B5CF6',alignItems:'center',justifyContent:'center',marginTop:5},publishText:{color:'#FFF',fontSize:10,fontWeight:'900'},publishSecondary:{minHeight:42,alignItems:'center',justifyContent:'center'},publishSecondaryText:{color:'#B79CFF',fontSize:10,fontWeight:'800'},
});
