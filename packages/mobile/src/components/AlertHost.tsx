import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { useAlertStore } from '../store/useAlertStore';

/** Carte d'alerte (partagée par la fenêtre racine et par les couches montées dans une fenêtre ouverte). */
export function AlertCard({ current, press }: { current: { title: string; message?: string; buttons: Array<{ text?: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> }; press: (onPress?: () => void) => void }) {
  return (
    <View style={s.backdrop}>
      <View style={s.card}>
        <View style={s.brandLine} />
        <Text style={s.title}>{current.title}</Text>
        {current.message ? <Text style={s.message}>{current.message}</Text> : null}
        <View testID="keep-alert-buttons" style={[s.buttons, current.buttons.length > 3 && s.buttonsGrid]}>
          {current.buttons.map((button, index) => (
            <TouchableOpacity
              key={`${button.text ?? 'OK'}-${index}`}
              style={[s.button, current.buttons.length > 3 ? s.buttonHalf : s.buttonEqual, button.style === 'destructive' ? s.buttonDestructive : button.style === 'cancel' ? s.buttonCancel : s.buttonDefault]}
              onPress={() => press(button.onPress)}
              accessibilityRole="button"
            >
              <Text style={[s.buttonText, button.style === 'cancel' ? s.buttonTextCancel : s.buttonTextSolid]} numberOfLines={2}>{button.text || 'OK'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Popup Loki Music global : web + iOS + Android.
 * Adel (05/10/2026) : sur iPhone, une fenêtre Modal ne peut pas s'ouvrir par-dessus une autre Modal déjà affichée -- une alerte déclenchée depuis le
 * lecteur de story / de swipe n'apparaissait qu'APRÈS sa fermeture (« le popup est arrivé quand j'ai fermé la page »). Quand une couche
 * `ModalAlertLayer` est montée dans une fenêtre ouverte, c'est elle qui affiche l'alerte ; cette fenêtre racine reste muette.
 */
export default function AlertHost() {
  const current = useAlertStore((s) => s.current);
  const hide = useAlertStore((s) => s.hide);
  const insideModal = useAlertStore((s) => s.hostStack.length > 0);

  if (!current || insideModal) return null;

  const press = (onPress?: () => void) => {
    hide();
    onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => press(current.buttons.find((b) => b.style === 'cancel')?.onPress)}>
      <AlertCard current={current} press={press} />
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 3, 8, 0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 400, backgroundColor: colors.backgroundElevated, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, padding: 20, gap: 10, shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  brandLine: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginBottom: 2 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', lineHeight: 22 },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  // Adel (02/09/2026) : "je les aurais fait un tout petit peu plus petits et
  // je les aurais mis en face ... pas l'un sur l'autre" -- avec 3 boutons
  // (Annuler/Plus tard + 2 actions), l'ancien minWidth:84 + paddingHorizontal:16
  // dépassait la largeur d'un écran de téléphone et le retour à la ligne
  // (flexWrap) empilait le dernier bouton seul en dessous. Rétréci pour que
  // 2-3 boutons tiennent réellement côte à côte au lieu de s'empiler.
  // RÈGLE VERROUILLÉE (Adel 02/10/2026, « c'est pas la première fois que je
  // vois ça », capture « Solos terminés » + popup e-mail du mode démo) :
  // les boutons d'une popup sont TOUS alignés sur UNE ligne en bas, sur
  // toute la largeur, même largeur chacun (flex: 1) ; un libellé long passe
  // sur 2 lignes DANS son bouton. Jamais un bouton seul renvoyé à la ligne,
  // jamais calés à droite avec des largeurs différentes. Au-delà de 3
  // boutons : grille régulière de 2 colonnes. Contrôlé par
  // AlertHostButtonsLayout.contract.test.ts.
  buttons: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 10 },
  buttonsGrid: { flexWrap: 'wrap' },
  button: { minHeight: 44, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  buttonEqual: { flex: 1, minWidth: 0 },
  buttonHalf: { width: '48%', flexGrow: 1 },
  buttonDefault: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonDestructive: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonCancel: { backgroundColor: 'rgba(124,92,252,0.10)', borderColor: colors.primary },
  buttonText: { fontSize: 12, lineHeight: 15, fontWeight: '900', textAlign: 'center' },
  buttonTextSolid: { color: colors.white },
  buttonTextCancel: { color: colors.primaryLight },
});
