import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { submitProblemReport, currentScreenName } from '../services/problemReportService';
import { screenLabel } from '../services/reportLoop';
import { robotSay } from '../services/robotCoachService';
import { describeReportLocation, isReportOpen, registerReportLayer, setReportOpen, subscribeReportSurface, topReportLayer } from '../services/reportSurface';

/**
 * Formulaire « Signaler un problème » (sans fenêtre) : affiché soit dans la fenêtre racine (aucune fenêtre ouverte), soit
 * DIRECTEMENT dans la fenêtre ouverte (story, swipe, Loki Pulse…) grâce à `ModalReportLayer` (Adel, 06/10/2026).
 */
export function ProblemReportPanel({ screen, onClose }: { screen: string; onClose: () => void }) {
  const user = useUserStore((state: any) => state.user);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy || !user?.id) return;
    setBusy(true);
    try {
      await submitProblemReport(text, { userId: String(user.id), username: user.username }, 'SHAKE');
      setText('');
      onClose();
      void robotSay('REPORT_UPDATE', { text: `Reçu 📍 J’ai localisé le souci sur ${screenLabel(screen || currentScreenName())}. On s’en occupe et je te préviens dès que c’est réparé.` });
    } catch (error: any) {
      if (String(error?.message || '').includes('ABUSIVE')) {
        setText(''); onClose();
        Alert.alert('Message non transmis', 'Les insultes ne sont pas acceptées. Ton message n’a pas été envoyé et ton compte a été signalé à l’équipe.', [{ text: 'OK', style: 'cancel' }]);
        return;
      }
      const tooShort = String(error?.message || '').includes('TOO_SHORT');
      Alert.alert(tooShort ? 'Message trop court' : 'Envoi impossible', tooShort ? 'Décris le problème en quelques mots.' : 'Le message n’a pas pu partir. Vérifie ta connexion et réessaie.', [{ text: 'OK', style: 'cancel' }]);
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card} testID="problem-report-panel">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <Text style={s.title}>Signaler un problème</Text>
          <Text style={s.where} numberOfLines={2} testID="problem-report-where">📍 {screen || 'inconnu'}</Text>
          <Text style={s.hint}>Dis-nous ce qui ne va pas.</Text>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Ex. : la musique ne démarre pas"
            placeholderTextColor="#B7ADC4"
            multiline
            maxLength={2000}
            accessibilityLabel="Décris le problème"
            testID="problem-report-input"
          />
          <TouchableOpacity style={[s.send, (busy || text.trim().length < 3) && s.sendOff]} onPress={() => { void send(); }} disabled={busy || text.trim().length < 3} accessibilityRole="button" testID="problem-report-send">
            <Text style={s.sendText}>{busy ? 'ENVOI…' : 'ENVOYER'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancel} onPress={onClose} accessibilityRole="button"><Text style={s.cancelText}>ANNULER</Text></TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Abonnement commun à l'état « ouvert » et à la pile des fenêtres. */
export function useReportLayerState(): { open: boolean; top: string | null } {
  const [, force] = useState(0);
  useEffect(() => subscribeReportSurface(() => force((n) => n + 1)), []);
  return { open: isReportOpen(), top: topReportLayer() };
}

let reportLayerSeq = 0;
/** Couche montée dans chaque KeepModal ouverte : la plus haute affiche le formulaire sur place. */
export function ModalReportLayer() {
  const idRef = useRef(`report-layer-${++reportLayerSeq}`);
  useEffect(() => registerReportLayer(idRef.current), []);
  const { open, top } = useReportLayerState();
  if (!open || top !== idRef.current) return null;
  return (
    <View style={s.layer} testID="modal-report-layer">
      <ProblemReportPanel screen={describeReportLocation(currentScreenName())} onClose={() => setReportOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,3,10,.78)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 460, maxHeight: '88%', borderRadius: 22, borderWidth: 1, borderColor: '#7C5CFC', backgroundColor: '#14101D' },
  content: { padding: 18 },
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 9998, elevation: 9998 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  where: { color: '#CDBBFF', fontSize: 13, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  hint: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  input: { marginTop: 14, minHeight: 110, maxHeight: 220, borderRadius: 14, borderWidth: 1, borderColor: '#5C5468', backgroundColor: '#1E1829', color: '#FFFFFF', fontSize: 15, lineHeight: 21, padding: 12, textAlignVertical: 'top' },
  send: { minHeight: 48, borderRadius: 24, backgroundColor: '#7C5CFC', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  sendOff: { opacity: .45 },
  sendText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: .5 },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelText: { color: '#E6E0EE', fontSize: 13, fontWeight: '900' },
});
