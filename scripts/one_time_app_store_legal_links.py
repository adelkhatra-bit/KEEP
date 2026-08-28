from pathlib import Path

path = Path('packages/mobile/src/screens/AdvancedProfileSettingsScreen.tsx')
s = path.read_text(encoding='utf-8')

old_import = "import { Alert, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';"
new_import = "import { Alert, Linking, Platform, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';"
if old_import not in s and new_import not in s:
    raise SystemExit('react-native import marker not found')
s = s.replace(old_import, new_import, 1)

network_marker = "const NETWORKS: { platform: SocialLink['platform']; label: string }[] = [\n  { platform: 'instagram', label: 'Instagram' },\n  { platform: 'tiktok', label: 'TikTok' },\n  { platform: 'snapchat', label: 'Snapchat' },\n  { platform: 'youtube', label: 'YouTube' },\n  { platform: 'x', label: 'X' },\n  { platform: 'facebook', label: 'Facebook' },\n];"
legal_constants = network_marker + "\n\nconst LEGAL_URLS = {\n  privacy: 'https://adelkhatra-bit.github.io/KEEP/privacy/',\n  privacyChoices: 'https://adelkhatra-bit.github.io/KEEP/privacy-choices/',\n  terms: 'https://adelkhatra-bit.github.io/KEEP/terms/',\n  support: 'https://adelkhatra-bit.github.io/KEEP/support/',\n} as const;"
if 'const LEGAL_URLS' not in s:
    if network_marker not in s:
        raise SystemExit('network marker not found')
    s = s.replace(network_marker, legal_constants, 1)

helper_marker = "  const goToTab = (screen: 'MyMusic' | 'Profile') => navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen } }] });\n  const linkFor = (platform: SocialLink['platform']) => user.socialLinks.find((l) => l.platform === platform);"
helper_replacement = helper_marker + "\n  const openExternal = (url: string) => {\n    void Linking.openURL(url).catch(() => {\n      Alert.alert('Lien indisponible', 'Impossible d’ouvrir cette page pour le moment.');\n    });\n  };"
if 'const openExternal = (url: string)' not in s:
    if helper_marker not in s:
        raise SystemExit('helper marker not found')
    s = s.replace(helper_marker, helper_replacement, 1)

account_marker = "        <View style={s.section}>\n          <Text style={s.sectionTitle}>Compte</Text>"
legal_section = "        <View style={s.section}>\n          <Text style={s.sectionTitle}>Informations & confidentialité</Text>\n          <Action label=\"Politique de confidentialité\" onPress={() => openExternal(LEGAL_URLS.privacy)} />\n          <Action label=\"Choix de confidentialité\" onPress={() => openExternal(LEGAL_URLS.privacyChoices)} />\n          <Action label=\"Conditions d’utilisation\" onPress={() => openExternal(LEGAL_URLS.terms)} />\n          <Action label=\"Support KEEP\" onPress={() => openExternal(LEGAL_URLS.support)} />\n        </View>\n\n" + account_marker
if 'Informations & confidentialité' not in s:
    if account_marker not in s:
        raise SystemExit('account section marker not found')
    s = s.replace(account_marker, legal_section, 1)

for expected in [
    "Linking.openURL",
    "Politique de confidentialité",
    "Choix de confidentialité",
    "Conditions d’utilisation",
    "Support KEEP",
    "Supprimer définitivement mon compte",
]:
    if expected not in s:
        raise SystemExit(f'missing expected marker after patch: {expected}')

path.write_text(s, encoding='utf-8')
print('App Store legal links patched successfully')
