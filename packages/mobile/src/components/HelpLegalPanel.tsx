import React from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import SupportCenterPanel from './SupportCenterPanel';
import { BlockedUserSummary, listBlockedUsers, unblockUser } from '../services/moderationService';

const LEGAL_URLS = {
  privacy: 'https://adelkhatra-bit.github.io/KEEP/privacy/',
  privacyChoices: 'https://adelkhatra-bit.github.io/KEEP/privacy-choices/',
  terms: 'https://adelkhatra-bit.github.io/KEEP/terms/',
  support: 'https://adelkhatra-bit.github.io/KEEP/support/',
} as const;

// Adel (16-17/09/2026) : "je clique sur une fonction, j'ai le résultat"
// -- support, mentions légales et comptes bloqués (ex-onglet 3) se
// déplient maintenant directement dans le menu.
export default function HelpLegalPanel({ profileId, username, enabled }: { profileId: string; username: string; enabled: boolean }) {
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUserSummary[] | null>(null);
  const [blockedLoading, setBlockedLoading] = React.useState(false);
  const [unblockingId, setUnblockingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setBlockedLoading(true);
    listBlockedUsers().then((list) => { if (live) setBlockedUsers(list); }).finally(() => { if (live) setBlockedLoading(false); });
    return () => { live = false; };
  }, []);

  const handleUnblock = async (id: string) => {
    if (unblockingId) return;
    setUnblockingId(id);
    try {
      await unblockUser(id);
      setBlockedUsers((list) => (list ?? []).filter((u) => u.id !== id));
    } catch {
      Alert.alert('Action impossible', 'Réessaie dans un instant.');
    } finally {
      setUnblockingId(null);
    }
  };

  const openExternal = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert('Lien indisponible', 'Impossible d’ouvrir cette page pour le moment.'));
  };

  return <View>
    <SupportCenterPanel profileId={profileId} username={username} enabled={enabled} />

    <Text style={[s.sectionTitle, { marginTop: 16 }]}>Informations &amp; confidentialité</Text>
    <TouchableOpacity style={s.action} onPress={() => openExternal(LEGAL_URLS.privacy)}><Text style={s.actionText}>Politique de confidentialité</Text><Text style={s.actionArrow}>›</Text></TouchableOpacity>
    <TouchableOpacity style={s.action} onPress={() => openExternal(LEGAL_URLS.privacyChoices)}><Text style={s.actionText}>Choix de confidentialité</Text><Text style={s.actionArrow}>›</Text></TouchableOpacity>
    <TouchableOpacity style={s.action} onPress={() => openExternal(LEGAL_URLS.terms)}><Text style={s.actionText}>Conditions d’utilisation</Text><Text style={s.actionArrow}>›</Text></TouchableOpacity>
    <TouchableOpacity style={[s.action, { borderBottomWidth: 0 }]} onPress={() => openExternal(LEGAL_URLS.support)}><Text style={s.actionText}>Centre d’aide public</Text><Text style={s.actionArrow}>›</Text></TouchableOpacity>

    <Text style={[s.sectionTitle, { marginTop: 16 }]}>Comptes bloqués</Text>
    {blockedLoading ? <ActivityIndicator color={colors.primaryLight} style={{ marginVertical: 12 }} /> : !blockedUsers || blockedUsers.length === 0 ? (
      <Text style={s.help}>Aucun compte bloqué pour l’instant.</Text>
    ) : blockedUsers.map((u) => (
      <View key={u.id} style={s.blockedRow}>
        {u.avatarUrl ? <Image source={{ uri: u.avatarUrl }} style={s.blockedAvatar} /> : <View style={[s.blockedAvatar, s.blockedAvatarFallback]}><Text style={s.blockedAvatarText}>K</Text></View>}
        <Text style={s.blockedUsername} numberOfLines={1}>{u.username}</Text>
        <TouchableOpacity style={s.blockedUnblockButton} disabled={unblockingId === u.id} onPress={() => void handleUnblock(u.id)}>
          <Text style={s.blockedUnblockText}>{unblockingId === u.id ? '…' : 'Débloquer'}</Text>
        </TouchableOpacity>
      </View>
    ))}
  </View>;
}

const s = StyleSheet.create({
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  actionText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' }, actionArrow: { color: colors.primaryLight, fontSize: 20 },
  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  blockedAvatar: { width: 30, height: 30, borderRadius: 15 },
  blockedAvatarFallback: { backgroundColor: colors.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  blockedAvatarText: { color: colors.primaryLight, fontSize: 13, fontWeight: '900' },
  blockedUsername: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '800' },
  blockedUnblockButton: { minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  blockedUnblockText: { color: colors.primaryLight, fontSize: 12, fontWeight: '800' },
});
