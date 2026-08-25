import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { shareEvent } from '../services/sharingService';
import { colors } from '../theme/colors';
import { spacing, radius, typography } from '../theme/spacing';

const EVENTS = [
  { id: 'e1', name: 'Piscine Sunset Session', venueName: 'Club Lumen', startsAt: '2026-08-23T18:00:00.000Z', djArtistNames: ['dj_nova'] },
  { id: 'e2', name: 'Afro House Night', venueName: 'Le Sous-Sol', startsAt: '2026-08-29T22:00:00.000Z', djArtistNames: ['dj_nova', 'sam_k'] },
];

export default function PartiesScreen() {
  const [interestedEventIds, setInterestedEventIds] = useState<Set<string>>(new Set());

  const toggleInterested = (eventId: string) => {
    setInterestedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Soirées</Text>
        <Text style={styles.subtitle}>Découvre les soirées, DJ et événements compatibles avec ton KEEP DNA.</Text>

        {EVENTS.map((event) => {
          const interested = interestedEventIds.has(event.id);
          const date = new Date(event.startsAt).toLocaleDateString('fr-FR', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          });
          return (
            <View key={event.id} style={styles.card}>
              <View style={styles.badge}><Text style={styles.badgeText}>LIVE</Text></View>
              <Text style={styles.eventName}>{event.name}</Text>
              <Text style={styles.meta}>{event.venueName} · {date}</Text>
              <Text style={styles.meta}>{event.djArtistNames.map((n) => `@${n}`).join(', ')}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.primaryButton, interested && styles.primaryButtonActive]}
                  onPress={() => toggleInterested(event.id)}
                >
                  <Text style={styles.primaryText}>{interested ? '✓ Intéressé' : 'Ça m’intéresse'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareButton} onPress={() => shareEvent(event.id, event.name).catch(() => {})}>
                  <Text style={styles.shareText}>↗ Partager</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090610' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.h1, color: '#F8F6FC', marginBottom: spacing.xs },
  subtitle: { color: '#8F879D', fontSize: 13, lineHeight: 19, marginBottom: spacing.xl },
  card: { backgroundColor: '#151020', borderRadius: 18, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: '#312348' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(139,92,246,0.16)', marginBottom: spacing.sm },
  badgeText: { color: '#B79CFF', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  eventName: { color: '#F8F6FC', fontSize: 17, fontWeight: '900' },
  meta: { color: '#8F879D', fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  primaryButton: { flex: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center', backgroundColor: '#2A1C3E', borderWidth: 1, borderColor: '#4A326B' },
  primaryButtonActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  primaryText: { color: '#F8F6FC', fontWeight: '800', fontSize: 12 },
  shareButton: { paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#312348' },
  shareText: { color: '#B79CFF', fontWeight: '800', fontSize: 12 },
});
