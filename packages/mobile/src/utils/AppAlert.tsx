import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/spacing';

export interface AppAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
}

type Listener = (state: AlertState) => void;
let listener: Listener | null = null;
let currentState: AlertState = { visible: false, title: '', buttons: [] };

function emit() {
  listener?.(currentState);
}

/**
 * Remplace RN `Alert.alert` : react-native-web ne l'implémente PAS (no-op
 * silencieux), ce qui rendait tout bouton dépendant d'une confirmation ou
 * d'un choix (Mode Démo, choix de playlist au GARDER, fiche profil Discover,
 * etc.) inopérant sur le Web/PWA -- on appuyait et rien ne se passait.
 * Natif : délègue tel quel à RN Alert. Web : vrai modal contrôlé ici, monté
 * une seule fois via <WebAlertHost/> à la racine de App.tsx.
 */
export const AppAlert = {
  alert(title: string, message?: string, buttons: AppAlertButton[] = [{ text: 'OK' }]) {
    if (Platform.OS !== 'web') {
      const { Alert } = require('react-native');
      Alert.alert(title, message, buttons);
      return;
    }
    currentState = { visible: true, title, message, buttons };
    emit();
  },
};

export function WebAlertHost() {
  const [state, setState] = useState<AlertState>(currentState);

  useEffect(() => {
    listener = setState;
    return () => {
      listener = null;
    };
  }, []);

  if (Platform.OS !== 'web' || !state.visible) return null;

  const press = (btn: AppAlertButton) => {
    currentState = { ...currentState, visible: false };
    emit();
    btn.onPress?.();
  };

  return (
    <Modal transparent visible animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{state.title}</Text>
          {!!state.message && <Text style={styles.message}>{state.message}</Text>}
          <View style={styles.actions}>
            {state.buttons.map((b, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  b.style === 'cancel' && styles.btnCancel,
                  b.style === 'destructive' && styles.btnDestructive,
                ]}
                onPress={() => press(b)}
              >
                <Text style={[styles.btnText, b.style === 'cancel' && styles.btnTextCancel]}>{b.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.xl },
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  title: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm, textAlign: 'center' },
  message: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  btn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  btnCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnDestructive: { backgroundColor: colors.danger },
  btnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  btnTextCancel: { color: colors.textSecondary },
});
