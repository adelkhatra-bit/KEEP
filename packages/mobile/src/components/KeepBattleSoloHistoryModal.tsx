import React from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeepBattleSoloHistoryEntry, loadKeepBattleSoloHistory } from '../services/keepBattleHistoryService';

interface KeepBattleSoloHistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export function KeepBattleSoloHistoryModal({ visible, onClose }: KeepBattleSoloHistoryModalProps) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = React.useState<KeepBattleSoloHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setLoading(true);
    loadKeepBattleSoloHistory(50).then((data) => {
      setHistory(data);
      setLoading(false);
    }).catch(() => {
      setHistory([]);
      setLoading(false);
    });
  }, [visible]);

  const formatDate = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return `Aujourd'hui ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (date.toDateString() === yesterday.toDateString()) {
        return `Hier ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
      }
      return date.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoDate;
    }
  };

  const themeLabel = (code: string): string => {
    const themes: Record<string, string> = {
      MIX: '🎵 Mix',
      POP: '🎤 Pop',
      ROCK: '🎸 Rock',
      HIPHOP: '🎙️ Hip-Hop',
      JAZZ: '🎷 Jazz',
      ELECTRONIC: '🎹 Électro',
      CLASSICAL: '🎻 Classique',
    };
    return themes[code] || code;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} statusBarTranslucent>
      <View style={[s.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>📊 Historique SOLO</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.loadingContainer}>
              <ActivityIndicator size="large" color="#E5F266" />
              <Text style={s.loadingText}>Chargement...</Text>
            </View>
          ) : history.length === 0 ? (
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>Aucun match SOLO pour le moment.</Text>
              <Text style={s.emptyHint}>Lance-toi dans le SOLO Training pour débuter !</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.listContent}>
              {history.map((entry, idx) => {
                const difference = entry.free_after - entry.free_before;
                const isGain = difference >= 0;
                return (
                  <View key={entry.id || idx} style={s.historyRow}>
                    <View style={s.historyLeft}>
                      <Text style={s.historyTheme}>{themeLabel(entry.theme_code)}</Text>
                      <Text style={s.historyScore}>
                        {entry.correct_answers}/{entry.round_count} · {Math.round((entry.correct_answers / entry.round_count) * 100)}%
                      </Text>
                      <Text style={s.historyDate}>{formatDate(entry.completed_at)}</Text>
                    </View>
                    <View style={s.historyRight}>
                      <Text style={s.historyCredits}>
                        <Text style={s.creditBefore}>{entry.free_before}</Text>
                        <Text style={s.creditArrow}> → </Text>
                        <Text style={isGain ? s.creditGain : s.creditLoss}>
                          {isGain ? '+' : ''}{difference}
                        </Text>
                        <Text style={s.creditArrow}> → </Text>
                        <Text style={s.creditAfter}>{entry.free_after}</Text>
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.78)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: '#151020', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: '#493369', padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  close: { color: '#E1D7FF', fontSize: 14, fontWeight: '900' },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  loadingText: { color: '#F8F6FC', fontSize: 13, fontWeight: '700', marginTop: 12 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyText: { color: '#F8F6FC', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  emptyHint: { color: '#8F879D', fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  listContent: { gap: 8 },
  historyRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#3B2E4E' },
  historyLeft: { flex: 1, minWidth: 0 },
  historyTheme: { color: '#E5F266', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  historyScore: { color: '#F8F6FC', fontSize: 13, fontWeight: '800', marginTop: 2 },
  historyDate: { color: '#8F879D', fontSize: 10, fontWeight: '700', marginTop: 3 },
  historyRight: { marginLeft: 12, alignItems: 'flex-end' },
  historyCredits: { fontSize: 12, fontWeight: '700' },
  creditBefore: { color: '#B79CFF', fontWeight: '800' },
  creditArrow: { color: '#8F879D', fontWeight: '700' },
  creditGain: { color: '#7FF2B7', fontWeight: '900' },
  creditLoss: { color: '#FFB3C3', fontWeight: '900' },
  creditAfter: { color: '#E5F266', fontWeight: '800' },
});
