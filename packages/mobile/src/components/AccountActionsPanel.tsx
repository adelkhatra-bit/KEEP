import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { useUserStore } from '../store/useUserStore';
import { colors } from '../theme/colors';
import { createAuthService } from '../services/authService';
import { clearLocalGuestMarker } from '../services/guestUpgradeService';
import { deleteOwnKeepAccount } from '../services/accountDeletionService';
import { supabase } from '../services/supabaseClient';

// Adel (16-17/09/2026) : "je clique sur une fonction, j'ai le résultat,
// sans être mélangé à d'autres trucs" -- déconnexion/suppression (ex-onglet
// 4 de Réglages avancés) se déplie maintenant directement dans le menu.
export default function AccountActionsPanel() {
  const logout = useUserStore((s) => s.logout);
  const isLocalGuest = useUserStore((s) => s.isLocalGuest);
  const isDemoMode = useUserStore((s) => s.isDemoMode);
  const [signingOut, setSigningOut] = React.useState(false);
  const [deletingAccount, setDeletingAccount] = React.useState(false);

  const signOutNow = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (supabase && !isLocalGuest && !isDemoMode) await createAuthService(supabase).signOut();
      await clearLocalGuestMarker();
    } catch {
      await clearLocalGuestMarker();
    } finally {
      logout();
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Se déconnecter ?', 'Ton profil Loki Music reste enregistré. Tu pourras revenir avec ton identifiant Loki Music et ton mot de passe.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => { void signOutNow(); } },
    ]);
  };

  const deleteAccountNow = async () => {
    if (deletingAccount || isLocalGuest || isDemoMode) return;
    setDeletingAccount(true);
    try {
      await deleteOwnKeepAccount();
      await clearLocalGuestMarker();
      logout();
    } catch (e: any) {
      Alert.alert('Suppression du compte', e?.message || 'Impossible de supprimer le compte pour le moment.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const confirmDeleteAccount = () => {
    if (isLocalGuest || isDemoMode) {
      Alert.alert('Aucun compte serveur', 'Cet essai n’a pas encore de compte Loki Music permanent. Utilise Déconnexion pour effacer l’identité locale de cet appareil.');
      return;
    }
    Alert.alert('Supprimer définitivement mon compte ?', 'Cette action supprime définitivement ton compte Loki Music, ton profil, tes musiques gardées, playlists, abonnements sociaux, notifications et avatar. Elle ne peut pas être annulée.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'SUPPRIMER MON COMPTE', style: 'destructive', onPress: () => { void deleteAccountNow(); } },
    ]);
  };

  return <View>
    <Text style={s.help}>Se déconnecter ferme uniquement la session de cet appareil. Le compte et les données Loki Music restent enregistrés.</Text>
    <TouchableOpacity style={s.signOutButton} onPress={confirmSignOut} disabled={signingOut || deletingAccount}>
      <Text style={s.signOutText}>{signingOut ? 'Déconnexion…' : 'Se déconnecter'}</Text>
    </TouchableOpacity>
    <View style={s.deleteDivider} />
    <Text style={s.deleteTitle}>Suppression définitive</Text>
    <Text style={s.help}>Supprime le compte serveur et les données associées. Différent d’une simple déconnexion.</Text>
    <TouchableOpacity style={s.deleteAccountButton} onPress={confirmDeleteAccount} disabled={deletingAccount || signingOut}>
      <Text style={s.deleteAccountText}>{deletingAccount ? 'Suppression…' : 'Supprimer définitivement mon compte'}</Text>
    </TouchableOpacity>
  </View>;
}

const s = StyleSheet.create({
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  signOutButton: { minHeight: 44, marginTop: 12, borderRadius: 22, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  signOutText: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  deleteDivider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  deleteTitle: { color: colors.danger, fontSize: 14, fontWeight: '900' },
  deleteAccountButton: { minHeight: 44, marginTop: 10, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3A1319', borderWidth: 1, borderColor: colors.danger, paddingHorizontal: 12 },
  deleteAccountText: { color: '#FF9AA8', fontSize: 13, fontWeight: '900', textAlign: 'center' },
});
