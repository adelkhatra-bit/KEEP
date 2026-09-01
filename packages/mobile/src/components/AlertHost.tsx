import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';
import { useAlertStore } from '../store/useAlertStore';

/** Rendu web de keepAlert.ts -- voir useAlertStore.ts pour le pourquoi. */
export default function AlertHost() {
  const current = useAlertStore((s) => s.current);
  const hide = useAlertStore((s) => s.hide);

  if (!current) return null;

  const press = (onPress?: () => void) => {
    hide();
    onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => press(current.buttons.find((b) => b.style === 'cancel')?.onPress)}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>{current.title}</Text>
          {current.message ? <Text style={s.message}>{current.message}</Text> : null}
          <View style={s.buttons}>
            {current.buttons.map((button, index) => (
              <TouchableOpacity
                key={`${button.text ?? 'OK'}-${index}`}
                style={[s.button, button.style === 'destructive' ? s.buttonDestructive : button.style === 'cancel' ? s.buttonCancel : s.buttonDefault]}
                onPress={() => press(button.onPress)}
                accessibilityRole="button"
              >
                <Text style={[s.buttonText, button.style === 'cancel' ? s.buttonTextCancel : s.buttonTextSolid]}>{button.text || 'OK'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 3, 8, 0.72)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 400, backgroundColor: colors.backgroundCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 10 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', lineHeight: 22 },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  // Adel (02/09/2026) : "je les aurais fait un tout petit peu plus petits et
  // je les aurais mis en face ... pas l'un sur l'autre" -- avec 3 boutons
  // (Annuler/Plus tard + 2 actions), l'ancien minWidth:84 + paddingHorizontal:16
  // dépassait la largeur d'un écran de téléphone et le retour à la ligne
  // (flexWrap) empilait le dernier bouton seul en dessous. Rétréci pour que
  // 2-3 boutons tiennent réellement côte à côte au lieu de s'empiler.
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginTop: 10 },
  button: { minHeight: 38, borderRadius: radius.pill, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  buttonDefault: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonDestructive: { backgroundColor: colors.danger, borderColor: colors.danger },
  buttonCancel: { backgroundColor: 'transparent', borderColor: colors.border },
  buttonText: { fontSize: 11, fontWeight: '900' },
  buttonTextSolid: { color: colors.white },
  buttonTextCancel: { color: colors.textSecondary },
});
