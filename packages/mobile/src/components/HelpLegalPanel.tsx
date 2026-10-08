import React from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { colors } from '../theme/colors';
import SupportCenterPanel from './SupportCenterPanel';
import { BlockedUserSummary, listBlockedUsers, unblockUser } from '../services/moderationService';
import { lokiText } from '../theme/lokiText';


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
  const [howItWorksOpen, setHowItWorksOpen] = React.useState(false);

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

    <View style={s.howItWorksCard}>
      <TouchableOpacity
        style={s.howItWorksHeader}
        onPress={() => setHowItWorksOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel="Comment bien démarrer avec Loki Music"
        accessibilityState={{ expanded: howItWorksOpen }}
      >
        <View style={s.howItWorksIcon}><Text style={s.howItWorksIconText}>L</Text></View>
        <View style={s.howItWorksCopy}>
          <Text style={s.howItWorksEyebrow}>À SAVOIR · BIEN DÉMARRER</Text>
          <Text style={s.howItWorksTitle}>Comment Loki Music fonctionne</Text>
          <Text style={s.howItWorksLead}>Construis ta collection, fais vivre ton profil, partage et joue.</Text>
        </View>
        <Text style={s.howItWorksChevron}>{howItWorksOpen ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      {howItWorksOpen ? <View style={s.howItWorksSteps}>
        <View style={s.howStep}><Text style={s.howStepNo}>1</Text><Text style={s.howStepText}><Text style={s.howStepStrong}>ÉCOUTE.</Text> Commence par reconnaître et écouter un maximum de musiques. Garde seulement celles que tu aimes.</Text></View>
        <View style={s.howStep}><Text style={s.howStepNo}>2</Text><Text style={s.howStepText}><Text style={s.howStepStrong}>CONSTRUIS TON PROFIL.</Text> Tes morceaux et playlists donnent une identité musicale à ton profil.</Text></View>
        <View style={s.howStep}><Text style={s.howStepNo}>3</Text><Text style={s.howStepText}><Text style={s.howStepStrong}>PARTAGE.</Text> Fais circuler ton profil et tes découvertes. Les actions éligibles peuvent rapporter des Fruits et attirer de nouveaux abonnés.</Text></View>
        <View style={s.howStep}><Text style={s.howStepNo}>4</Text><Text style={s.howStepText}><Text style={s.howStepStrong}>JOUE.</Text> Lance un Solo ou défie tes amis en Battle sur un style musical pour gagner les Free annoncés pour la partie.</Text></View>
        <View style={s.howStep}><Text style={s.howStepNo}>5</Text><Text style={s.howStepText}><Text style={s.howStepStrong}>RECOMMENCE.</Text> Utilise tes Free pour garder de nouvelles découvertes. Plus ta collection est riche, plus ton profil a de choses à faire découvrir.</Text></View>
        <Text style={s.howItWorksNote}>Les morceaux repris depuis la communauté conservent leur provenance Loki Music afin que le découvreur reste identifiable dans la circulation prévue par la plateforme.</Text>
      </View> : null}
    </View>

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
  howItWorksCard:{marginTop:14,borderRadius:20,borderWidth:1.5,borderColor:colors.primaryLight,backgroundColor:'#171024',overflow:'hidden'},
  howItWorksHeader:{minHeight:78,flexDirection:'row',alignItems:'center',gap:10,padding:12},
  howItWorksIcon:{width:42,height:42,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,shadowColor:colors.primaryLight,shadowOpacity:.5,shadowRadius:8,shadowOffset:{width:0,height:0},elevation:5},
  howItWorksIconText:{color:'#FFF',fontSize:19,fontWeight:'900'},howItWorksCopy:{flex:1,minWidth:0},howItWorksEyebrow:{color:colors.primaryLight,fontSize:lokiText.label.fontSize,fontWeight:'900',letterSpacing:.8},howItWorksTitle:{color:colors.textPrimary,fontSize:15,fontWeight:'900',marginTop:2},howItWorksLead:{color:colors.textMuted,fontSize:11,lineHeight:15,marginTop:2},howItWorksChevron:{color:colors.primaryLight,fontSize:20,fontWeight:'900'},
  howItWorksSteps:{paddingHorizontal:12,paddingBottom:14,gap:9,borderTopWidth:1,borderTopColor:colors.border},howStep:{flexDirection:'row',gap:9,paddingTop:9},howStepNo:{width:24,height:24,lineHeight:24,borderRadius:12,textAlign:'center',overflow:'hidden',backgroundColor:colors.primary,color:'#FFF',fontSize:11,fontWeight:'900'},howStepText:{flex:1,color:colors.textMutedGrey,fontSize:12,lineHeight:17},howStepStrong:{color:colors.textPrimary,fontWeight:'900'},howItWorksNote:{color:colors.keep,fontSize:lokiText.label.fontSize,lineHeight:15,fontWeight:'800',marginTop:3},
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
