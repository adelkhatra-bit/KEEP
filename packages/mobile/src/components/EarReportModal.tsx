import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import KeepModal from './KeepModal';
import { colors } from '../theme/colors';
import { loadEarReport } from '../services/earReportService';
import { approval, communityReport, earChallenges, earLevel, earPoints, type EarRaw } from '../services/earReport';

const cap = (g: string) => g.charAt(0).toUpperCase() + g.slice(1);

/** « Mon oreille » (Adel, 05/10/2026, IDEA-113) : niveau de connaisseur, défis personnalisés, statistiques de style (❤ 😐 👎) et rapport de communauté. */
export default function EarReportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [raw, setRaw] = useState<EarRaw | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (!visible) return;
    let live = true;
    setState('loading');
    loadEarReport().then((r) => { if (!live) return; setRaw(r); setState(r ? 'ready' : 'error'); }).catch(() => live && setState('error'));
    return () => { live = false; };
  }, [visible]);
  const lvl = raw ? earLevel(earPoints(raw)) : null;
  const report = raw ? communityReport(raw) : null;
  return (
    <KeepModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.backdrop}>
        <View style={st.sheet} testID="ear-report">
          <View style={st.header}>
            <Text style={st.title}>Mon oreille 👂</Text>
            <TouchableOpacity style={st.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" testID="ear-report-close"><Text style={st.closeText}>✕</Text></TouchableOpacity>
          </View>
          {state === 'loading' ? <ActivityIndicator color={colors.white} style={{ margin: 24 }} /> : null}
          {state === 'error' ? <Text style={st.body}>Rapport indisponible pour le moment. Réessaie dans un instant.</Text> : null}
          {raw && lvl && report ? (
            <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator>
              <View style={st.levelBox}>
                <Text style={st.levelIcon}>{lvl.icon}</Text>
                <Text style={st.levelName} testID="ear-level">{lvl.label}</Text>
                <Text style={st.body}>{earPoints(raw)} points de flair · repérer tôt une musique que tout le monde finit par aimer rapporte le plus.</Text>
                <View style={st.track}><View style={[st.fill, { width: `${Math.round(lvl.progress * 100)}%` }]} /></View>
                <Text style={st.hint}>{lvl.next ? `Encore ${lvl.toNext} points pour « ${lvl.next.label} »` : 'Niveau maximum atteint'}</Text>
              </View>

              <Text style={st.section}>Tes défis</Text>
              {earChallenges(raw).map((c) => (
                <View key={c.key} style={st.challenge} testID={`ear-challenge-${c.key}`}>
                  <Text style={st.chTitle}>{c.done ? '✅ ' : '🎯 '}{c.label}</Text>
                  <View style={st.track}><View style={[st.fill, c.done && st.fillDone, { width: `${Math.round(Math.min(1, c.value / c.goal) * 100)}%` }]} /></View>
                  <Text style={st.hint}>{Math.min(c.value, c.goal)} / {c.goal}</Text>
                </View>
              ))}

              <Text style={st.section}>Tes styles</Text>
              {raw.genres.length ? raw.genres.map((g) => {
                const a = approval(g);
                return (
                  <View key={g.genre} style={st.styleRow} testID={`ear-style-${g.genre}`}>
                    <Text style={st.chTitle}>{cap(g.genre)} <Text style={st.hint}>· {g.tracks} musique{g.tracks > 1 ? 's' : ''}</Text></Text>
                    <Text style={st.body}>❤ {g.likes}   😐 {g.mehs}   👎 {g.dislikes}{a != null ? `   ·   ${Math.round(a * 100)} % approuvent` : ''}</Text>
                  </View>
                );
              }) : <Text style={st.body}>Partage des musiques en story : tes styles apparaîtront ici avec les ❤ 😐 👎 reçus.</Text>}

              <Text style={st.section}>Rapport de ta communauté</Text>
              <Text style={st.good}>💪 Points forts</Text>
              {report.strengths.length ? report.strengths.map((t, i) => <Text key={`s${i}`} style={st.body}>• {t}</Text>) : <Text style={st.body}>• Pas encore de point fort mesuré : réagis et partage pour en créer.</Text>}
              <Text style={st.weak}>⚠️ Points faibles</Text>
              {report.weaknesses.length ? report.weaknesses.map((t, i) => <Text key={`w${i}`} style={st.body}>• {t}</Text>) : <Text style={st.body}>• Aucun point faible détecté.</Text>}
              <Text style={st.opp}>🚀 Opportunités</Text>
              {report.opportunities.map((t, i) => <Text key={`o${i}`} style={st.body}>• {t}</Text>)}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </KeepModal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 14 },
  sheet: { maxHeight: '92%', width: '100%', maxWidth: 560, alignSelf: 'center', borderRadius: 22, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.border, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { color: colors.white, fontSize: 22, fontWeight: '900' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.white, fontSize: 20, fontWeight: '900' },
  scroll: { paddingBottom: 12 },
  levelBox: { alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#FFD166', backgroundColor: 'rgba(255,209,102,0.08)' },
  levelIcon: { fontSize: 40 },
  levelName: { color: '#FFD166', fontSize: 22, fontWeight: '900', marginVertical: 4 },
  section: { color: colors.white, fontSize: 18, fontWeight: '900', marginTop: 18, marginBottom: 8 },
  challenge: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  chTitle: { color: colors.white, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', alignSelf: 'stretch', marginTop: 6 },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#B79CFF' },
  fillDone: { backgroundColor: '#35e08a' },
  styleRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 4 },
  hint: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  good: { color: '#35e08a', fontSize: 15, fontWeight: '900', marginTop: 8 },
  weak: { color: '#FFB020', fontSize: 15, fontWeight: '900', marginTop: 12 },
  opp: { color: '#B79CFF', fontSize: 15, fontWeight: '900', marginTop: 12 },
});
