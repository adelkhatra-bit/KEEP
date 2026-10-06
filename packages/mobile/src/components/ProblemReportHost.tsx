import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { startShakeDetection, submitProblemReport, subscribeProblemReportOpen, currentScreenName, openProblemReport, announceReportUpdates } from '../services/problemReportService';
import { navigationRef } from '../navigation/navigationRef';
import { pushCrumb, screenLabel } from '../services/reportLoop';
import { robotSay } from '../services/robotCoachService';
import KeepModal from './KeepModal';
import TasteOnboardingGate from './TasteOnboardingGate';

/** Fenêtre « Signaler un problème » : montée une seule fois dans App.tsx (utilisateur connecté). */
export default function ProblemReportHost() {
  const user = useUserStore((state: any) => state.user);
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState('');

  useEffect(() => subscribeProblemReportOpen(() => { setScreen(currentScreenName()); setVisible(true); }), []);
  useEffect(() => startShakeDetection(() => { pushCrumb('action', 'secousse'); openProblemReport(); }), []);
  // Fil des dernières actions : chaque changement d'écran est mémorisé (en mémoire) pour localiser le problème lors d'une secousse.
  useEffect(() => {
    pushCrumb('screen', currentScreenName());
    const unsubscribe = (navigationRef as any).addListener?.('state', () => pushCrumb('screen', currentScreenName()));
    return typeof unsubscribe === 'function' ? unsubscribe : undefined;
  }, []);
  // Le robot annonce les réparations (une fois) puis, rarement et discrètement, rappelle le geste « secoue ton téléphone ».
  useEffect(() => {
    if (!user?.id) return undefined;
    const first = setTimeout(() => { void announceReportUpdates(); }, 9000);
    const tip = setTimeout(() => { void robotSay('REPORT_TIP'); }, 90000);
    return () => { clearTimeout(first); clearTimeout(tip); };
  }, [user?.id]);

  const send = async () => {
    if (busy || !user?.id) return;
    setBusy(true);
    try {
      await submitProblemReport(text, { userId: String(user.id), username: user.username }, 'SHAKE');
      setText('');
      setVisible(false);
      void robotSay('REPORT_UPDATE', { text: `Reçu 📍 J’ai localisé le souci sur ${screenLabel(screen || currentScreenName())}. On s’en occupe et je te préviens dès que c’est réparé.` });
    } catch (error: any) {
      if (String(error?.message || '').includes('ABUSIVE')) {
        setText(''); setVisible(false);
        Alert.alert('Message non transmis', 'Les insultes ne sont pas acceptées. Ton message n’a pas été envoyé et ton compte a été signalé à l’équipe.', [{ text: 'OK', style: 'cancel' }]);
        return;
      }
      const tooShort = String(error?.message || '').includes('TOO_SHORT');
      Alert.alert(tooShort ? 'Message trop court' : 'Envoi impossible', tooShort ? 'Décris le problème en quelques mots.' : 'Le message n’a pas pu partir. Vérifie ta connexion et réessaie.', [{ text: 'OK', style: 'cancel' }]);
    } finally { setBusy(false); }
  };

  // Hôte global des fenêtres « support / première utilisation » (monté une fois pour l'utilisateur connecté, hors coque protégée App.tsx).
  return (
    <>
    <TasteOnboardingGate />
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
    </>
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
