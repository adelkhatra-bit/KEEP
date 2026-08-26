import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { loadMyRsvps, loadUpcomingEvents, setEventRsvp, CreatorEvent, EventRsvpStatus } from '../services/creatorEventService';
import { shareEvent } from '../services/sharingService';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

const RSVP_LABEL: Record<EventRsvpStatus, string> = {
  GOING: '✓ Je participe',
  MAYBE: 'Peut-être',
  NOT_GOING: 'Je ne participe pas',
};

export default function PartiesScreen() {
  const user = useUserStore((s) => s.user);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [events, setEvents] = useState<CreatorEvent[]>([]);
  const [rsvps, setRsvps] = useState<Record<string, EventRsvpStatus>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const liveEvents = await loadUpcomingEvents();
      setEvents(liveEvents);
      if (user && !isLocalGuest && !isDemoMode) setRsvps(await loadMyRsvps(user.id));
      else setRsvps({});
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les soirées.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [user?.id, isLocalGuest, isDemoMode]);

  const chooseRsvp = async (eventId: string, status: EventRsvpStatus) => {
    if (!user || isLocalGuest || isDemoMode) {
      Alert.alert('Compte KEEP requis', 'Crée ton compte KEEP pour répondre à une invitation et indiquer si tu participes.');
      return;
    }
    setBusyId(eventId);
    try {
      await setEventRsvp(user.id, eventId, status);
      setRsvps((current) => ({ ...current, [eventId]: status }));
    } catch {
      Alert.alert('Soirée', 'Impossible d’enregistrer ta réponse pour le moment.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Soirées</Text>
        <Text style={styles.subtitle}>Découvre les soirées, DJ et événements compatibles avec ton KEEP DNA. Réponds directement : je participe, peut-être ou non.</Text>

        {loading ? <ActivityIndicator color={colors.primaryLight} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && events.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Aucun événement publié pour le moment.</Text><Text style={styles.meta}>Les invitations de tes artistes, DJ et lieux suivis apparaîtront ici.</Text></View> : null}

        {events.map((event) => {
          const current = rsvps[event.id];
          const date = new Date(event.startsAt).toLocaleString('fr-FR', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          });
          return (
            <View key={event.id} style={styles.card}>
              <View style={styles.badge}><Text style={styles.badgeText}>ÉVÉNEMENT</Text></View>
              <Text style={styles.eventName}>{event.name}</Text>
              <Text style={styles.meta}>{[event.venueName, event.countryCode, date].filter(Boolean).join(' · ')}</Text>
              {event.djArtistNames.length ? <Text style={styles.meta}>{event.djArtistNames.map((n) => `@${n.replace(/^@+/, '')}`).join(', ')}</Text> : null}
              {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

              <Text style={styles.responseTitle}>{current ? `Ta réponse : ${RSVP_LABEL[current]}` : 'Tu participes ?'}</Text>
              <View style={styles.rsvpRow}>
                {(['GOING','MAYBE','NOT_GOING'] as EventRsvpStatus[]).map((status) => (
                  <TouchableOpacity key={status} style={[styles.rsvpButton, current === status && styles.rsvpButtonActive]} onPress={() => chooseRsvp(event.id, status)} disabled={busyId === event.id}>
                    <Text style={[styles.rsvpText, current === status && styles.rsvpTextActive]}>{status === 'GOING' ? 'Oui' : status === 'MAYBE' ? 'Peut-être' : 'Non'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.shareButton} onPress={() => shareEvent(event.id, event.name).catch(() => {})}>
                <Text style={styles.shareText}>↗ Partager l’événement</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#090610'},content:{padding:spacing.xl,paddingBottom:spacing.xxxl},title:{...typography.h1,color:'#F8F6FC',marginBottom:spacing.xs},subtitle:{color:'#8F879D',fontSize:13,lineHeight:19,marginBottom:spacing.xl},error:{color:colors.danger,textAlign:'center',paddingVertical:18},empty:{backgroundColor:'#151020',borderRadius:18,padding:spacing.lg,borderWidth:1,borderColor:'#312348'},emptyTitle:{color:'#F8F6FC',fontSize:15,fontWeight:'900',marginBottom:6},card:{backgroundColor:'#151020',borderRadius:18,padding:spacing.lg,marginBottom:spacing.md,borderWidth:1,borderColor:'#312348'},badge:{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:4,borderRadius:radius.pill,backgroundColor:'rgba(139,92,246,0.16)',marginBottom:spacing.sm},badgeText:{color:'#B79CFF',fontSize:9,fontWeight:'900',letterSpacing:1},eventName:{color:'#F8F6FC',fontSize:17,fontWeight:'900'},meta:{color:'#8F879D',fontSize:12,marginTop:4},description:{color:'#C8C0D3',fontSize:12,lineHeight:18,marginTop:10},responseTitle:{color:'#F8F6FC',fontSize:12,fontWeight:'800',marginTop:14},rsvpRow:{flexDirection:'row',gap:7,marginTop:8},rsvpButton:{flex:1,minHeight:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#3B2B50'},rsvpButtonActive:{backgroundColor:'#8B5CF6',borderColor:'#8B5CF6'},rsvpText:{color:'#B8AEC4',fontSize:11,fontWeight:'800'},rsvpTextActive:{color:'#FFF'},shareButton:{minHeight:42,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#312348',marginTop:10},shareText:{color:'#B79CFF',fontWeight:'800',fontSize:12},
});
