import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MusicServiceIcon, { MUSIC_SERVICE_BRAND_COLORS } from './MusicServiceIcon';
import { MusicServiceKey } from '../services/keylessMusicBridge';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

type Props = {
  visible: boolean;
  service: MusicServiceKey | null;
  name: string;
  planLabel: string;
  remainingAfter: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function MusicServiceActivationModal({
  visible,
  service,
  name,
  planLabel,
  remainingAfter,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!service) return null;
  const brandColor = MUSIC_SERVICE_BRAND_COLORS[service] ?? '#A884FA';
  const supportsAccountSync = service === 'spotify' || service === 'deezer';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onCancel} accessibilityLabel="Fermer" />
        <View style={s.card} accessibilityViewIsModal>
          <View style={s.handle} />
          <View style={s.hero}>
            <View style={[s.logo, { borderColor: brandColor }]}>
              <MusicServiceIcon service={service} size={31} />
            </View>
            <View style={s.heroText}>
              <Text style={s.eyebrow}>SERVICE MUSICAL Loki</Text>
              <Text style={s.title}>Activer {name}</Text>
              <Text style={s.subtitle}>{supportsAccountSync ? `Tu gardes le contrôle. Après l’activation Loki, ${name} te demandera directement l’autorisation de connecter ton compte.` : 'Tu gardes le contrôle. Loki mémorise uniquement que tu veux utiliser ce service.'}</Text>
            </View>
          </View>

          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Comment ça va fonctionner</Text>
            <Step n="1" text={`Loki réserve 1 emplacement de ta formule ${planLabel}.`} />
            <Step n="2" text="Ce choix est sauvegardé dans ton compte Loki et reste présent après fermeture ou changement d’appareil." />
            <Step n="3" text={supportsAccountSync ? `Tu autorises ensuite ${name} avec sa page officielle. Loki pourra importer uniquement les métadonnées autorisées de tes favoris/playlists et synchroniser tes Vibes vers tes playlists.` : `Quand tu envoies un morceau ou une Vibe vers ${name}, Loki prépare la musique puis ouvre le service choisi.`} />
          </View>

          <View style={s.safeBox}>
            <Text style={s.safeTitle}>✓ Tes accès restent privés</Text>
            <Text style={s.safeText}>{supportsAccountSync ? `Loki ne reçoit jamais ton mot de passe ${name}. La connexion passe par OAuth officiel. Loki stocke le jeton serveur nécessaire et les métadonnées que tu autorises ; aucun fichier audio protégé n’est téléchargé, copié ou ré-uploadé.` : `Loki ne demande pas ton mot de passe ${name} et ne publie rien à ta place. Sans connexion API du fournisseur, Loki utilise simplement le passage sécurisé vers l’application ou le site du service.`}</Text>
          </View>

          <View style={s.slotRow}>
            <Text style={s.slotLabel}>Après activation</Text>
            <Text style={s.slotValue}>{remainingAfter} emplacement{remainingAfter > 1 ? 's' : ''} restant{remainingAfter > 1 ? 's' : ''}</Text>
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelButton} onPress={onCancel} disabled={busy} accessibilityRole="button">
              <Text style={s.cancelText}>ANNULER</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.confirmButton} onPress={onConfirm} disabled={busy} accessibilityRole="button" accessibilityLabel={`Activer ${name}`}>
              <Text style={s.confirmText}>{busy ? 'ACTIVATION…' : `ACTIVER ${name.toUpperCase()}`}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return <View style={s.step}>
    <View style={s.stepNumber}><Text style={s.stepNumberText}>{n}</Text></View>
    <Text style={s.stepText}>{text}</Text>
  </View>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,3,9,0.82)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 30 },
  card: { width: '100%', maxWidth: 430, backgroundColor: '#151020', borderWidth: 1, borderColor: '#6E4BA5', borderRadius: 24, padding: 17, shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 18 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: '#6E4BA5', alignSelf: 'center', marginBottom: 15 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 54, height: 54, borderRadius: 17, borderWidth: 1, backgroundColor: '#0E0A14', alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1 },
  eyebrow: { color: '#BFA9FF', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 3 },
  subtitle: { color: '#E2DAEA', fontSize: 11, lineHeight: 16, marginTop: 4 },
  infoBox: { marginTop: 16, padding: 13, borderRadius: radius.lg, backgroundColor: '#171020', borderWidth: 1, borderColor: '#493369' },
  infoTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', marginBottom: 7 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 8 },
  stepNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  stepText: { flex: 1, color: '#FFFFFF', fontSize: 12, lineHeight: 17 },
  safeBox: { marginTop: 11, padding: 12, borderRadius: radius.lg, backgroundColor: '#10251B', borderWidth: 1, borderColor: '#38D990' },
  safeTitle: { color: '#8AF3BF', fontSize: 11, fontWeight: '900' },
  safeText: { color: '#FFFFFF', fontSize: 9, lineHeight: 14, marginTop: 5 },
  slotRow: { minHeight: 42, marginTop: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#0E0A14', borderWidth: 1, borderColor: '#3F3154', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  slotLabel: { color: '#E2DAEA', fontSize: 9, fontWeight: '800' },
  slotValue: { color: '#BFA9FF', fontSize: 10, fontWeight: '900', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  cancelButton: { flex: 0.8, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: '#493369', backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  confirmButton: { flex: 1.4, minHeight: 44, borderRadius: 22, backgroundColor: '#5B3F8C', borderWidth: 1, borderColor: '#A884FA', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  confirmText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', textAlign: 'center' },
});
