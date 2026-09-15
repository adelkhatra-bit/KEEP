import React, { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import UsernameAccountForm from './UsernameAccountForm';
import { useAccountGateStore } from '../store/useAccountGateStore';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

// Adel (08/09/2026) : "pourquoi ça me met sur le profil ... trouve une
// solution lorsque tu imposes de la création du compte ... le Popo doit
// s'ouvrir au bon endroit et se refermer une fois que le compte est créé ...
// il doit rester au même endroit" -- monté UNE fois à la racine de l'appli
// (App.tsx), ce popup s'ouvre par-dessus n'importe quel écran sans jamais
// naviguer : l'utilisateur ne quitte donc jamais l'endroit d'où il a
// déclenché la création/connexion de compte.
export default function AccountGateModal() {
  const visible = useAccountGateStore((s) => s.visible);
  const mode = useAccountGateStore((s) => s.mode);
  const followUsername = useAccountGateStore((s) => s.followUsername);
  const celebrate = useAccountGateStore((s) => s.celebrate);
  const handleSuccess = useAccountGateStore((s) => s.handleSuccess);
  const close = useAccountGateStore((s) => s.close);

  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!celebrate) { pop.setValue(0); return; }
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }).start();
    const timer = setTimeout(close, 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={s.backdrop}>
        {celebrate ? (
          <Animated.View style={[s.celebrateCard, { transform: [{ scale: pop }], opacity: pop }]}>
            <Text style={s.celebrateIcon}>🎉</Text>
            <Text style={s.celebrateTitle}>Bienvenue sur Loki !</Text>
            <Text style={s.celebrateText}>{followUsername ? `Tu es connecté(e) et abonné(e) à ${followUsername}.` : 'Ton compte est prêt, tu continues exactement là où tu étais.'}</Text>
          </Animated.View>
        ) : (
          <View style={s.sheet}>
            <View style={s.handle} />
            <UsernameAccountForm initialMode={mode} followUsername={followUsername} onSuccess={handleSuccess} />
            <TouchableOpacity style={s.cancel} onPress={close}><Text style={s.cancelText}>Plus tard</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 3, 8, 0.78)', justifyContent: 'flex-end', alignItems: 'center', padding: spacing.md },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92%', backgroundColor: colors.backgroundCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 18, paddingBottom: 24 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  cancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  celebrateCard: { width: '100%', maxWidth: 360, alignSelf: 'center', marginBottom: '30%', backgroundColor: colors.backgroundCard, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.primary, padding: 26, alignItems: 'center' },
  celebrateIcon: { fontSize: 44 },
  celebrateTitle: { color: colors.textPrimary, fontSize: 19, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  celebrateText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
});
