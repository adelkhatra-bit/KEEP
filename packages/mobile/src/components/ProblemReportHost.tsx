import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { startShakeDetection, submitProblemReport, subscribeProblemReportOpen, currentScreenName, openProblemReport } from '../services/problemReportService';
import KeepModal from './KeepModal';

/** Fenêtre « Signaler un problème » : montée une seule fois dans App.tsx (utilisateur connecté). */
export default function ProblemReportHost() {
  const user = useUserStore((state: any) => state.user);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState('');

  useEffect(() => subscribeProblemReportOpen(() => { setScreen(currentScreenName()); setVisible(true); }), []);
  useEffect(() => startShakeDetection(openProblemReport), []);

  const send = async () => {
    if (busy || !user?.id) return;
    setBusy(true);
    try {
      await submitProblemReport(text, { userId: String(user.id), username: user.username });
      setText('');
      setVisible(false);
      Alert.alert('Merci !', 'Ton message est bien parti avec l’écran concerné. On le regarde et on corrige.', [{ text: 'OK', style: 'cancel' }]);
    } catch (error: any) {
      const tooShort = String(error?.message || '').includes('TOO_SHORT');
      Alert.alert(tooShort ? 'Message trop court' : 'Envoi impossible', tooShort ? 'Décris le problème en quelques mots.' : 'Le message n’a pas pu partir. Vérifie ta connexion et réessaie.', [{ text: 'OK', style: 'cancel' }]);
    } finally { setBusy(false); }
  };

  return (
    <KeepModal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.card}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
            <Text style={s.title}>Signaler un problème</Text>
            <Text style={s.hint}>Écran concerné : {screen || 'inconnu'}. Dis-nous ce qui ne va pas : le message part tout de suite avec ton appareil et la version de l’app.</Text>
            <TextInput
              style={s.input}
              value={text}
              onChangeText={setText}
              placeholder="Ex. : la musique met du temps à démarrer sur Aperçu"
              placeholderTextColor="#B7ADC4"
              multiline
              maxLength={2000}
              accessibilityLabel="Décris le problème"
              testID="problem-report-input"
            />
            <TouchableOpacity style={[s.send, (busy || text.trim().length < 3) && s.sendOff]} onPress={() => { void send(); }} disabled={busy || text.trim().length < 3} accessibilityRole="button" testID="problem-report-send">
              <Text style={s.sendText}>{busy ? 'ENVOI…' : 'ENVOYER'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancel} onPress={() => setVisible(false)} accessibilityRole="button"><Text style={s.cancelText}>ANNULER</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </KeepModal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,3,10,.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 460, maxHeight: '88%', borderRadius: 22, borderWidth: 1, borderColor: '#7C5CFC', backgroundColor: '#14101D' },
  content: { padding: 18 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  hint: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  input: { marginTop: 14, minHeight: 110, maxHeight: 220, borderRadius: 14, borderWidth: 1, borderColor: '#5C5468', backgroundColor: '#1E1829', color: '#FFFFFF', fontSize: 15, lineHeight: 21, padding: 12, textAlignVertical: 'top' },
  send: { minHeight: 48, borderRadius: 24, backgroundColor: '#7C5CFC', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  sendOff: { opacity: .45 },
  sendText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: .5 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelText: { color: '#E6E0EE', fontSize: 13, fontWeight: '900' },
});
