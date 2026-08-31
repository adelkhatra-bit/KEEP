from pathlib import Path

p = Path('packages/mobile/src/screens/DiscoverScreen.tsx')
s = p.read_text()

s = s.replace(
    "import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';",
    "import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';",
    1,
)

state_anchor = "  const [hasSearched, setHasSearched] = useState(false);\n"
if state_anchor not in s:
    raise SystemExit('state anchor missing')
s = s.replace(state_anchor, state_anchor + "  const [profileQuery, setProfileQuery] = useState('');\n", 1)

reset_anchor = "    setCurrentProfileSnapshot(null);\n  }, [user?.id]);"
if reset_anchor not in s:
    raise SystemExit('reset anchor missing')
s = s.replace(reset_anchor, "    setCurrentProfileSnapshot(null);\n    setProfileQuery('');\n  }, [user?.id]);", 1)

old_filter = """  const filteredProfiles = useMemo(() => {\n    if (!hasSearched || !searchPosition) return [];\n    const ranked = profiles.map((profile) => {\n      const hasCoordinates = Number.isFinite(profile.approxLat) && Number.isFinite(profile.approxLng);\n      const distance = hasCoordinates\n        ? distanceKm(searchPosition.latitude, searchPosition.longitude, profile.approxLat as number, profile.approxLng as number)\n        : null;\n      return { profile, distance };\n    }).filter((item) => radiusKm >= 20000 ? true : item.distance !== null && item.distance <= radiusKm);\n    ranked.sort((a, b) => {\n      if (a.distance === null && b.distance === null) return a.profile.username.localeCompare(b.profile.username);\n      if (a.distance === null) return 1;\n      if (b.distance === null) return -1;\n      return a.distance - b.distance;\n    });\n    return ranked.map((item) => item.profile);\n  }, [profiles, radiusKm, searchPosition, hasSearched]);\n"""
new_filter = """  const filteredProfiles = useMemo(() => {\n    const needle = profileQuery.trim().replace(/^@/, '').toLowerCase();\n    const candidates = needle\n      ? profiles.filter((profile) => profile.username.toLowerCase().includes(needle))\n      : profiles;\n\n    // Découvertes doit être utile dès l'ouverture : le GPS affine le classement,\n    // il ne doit jamais être une condition pour voir ou retrouver un profil public.\n    if (!hasSearched || !searchPosition) return candidates;\n\n    const ranked = candidates.map((profile) => {\n      const hasCoordinates = Number.isFinite(profile.approxLat) && Number.isFinite(profile.approxLng);\n      const distance = hasCoordinates\n        ? distanceKm(searchPosition.latitude, searchPosition.longitude, profile.approxLat as number, profile.approxLng as number)\n        : null;\n      return { profile, distance };\n    }).filter((item) => radiusKm >= 20000 ? true : item.distance !== null && item.distance <= radiusKm);\n    ranked.sort((a, b) => {\n      if (a.distance === null && b.distance === null) return a.profile.username.localeCompare(b.profile.username);\n      if (a.distance === null) return 1;\n      if (b.distance === null) return -1;\n      return a.distance - b.distance;\n    });\n    return ranked.map((item) => item.profile);\n  }, [profiles, profileQuery, radiusKm, searchPosition, hasSearched]);\n"""
if old_filter not in s:
    raise SystemExit('filter anchor missing')
s = s.replace(old_filter, new_filter, 1)

header_anchor = """        <View style={styles.discoveryHeader}>\n          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Profils autour de moi</Text><Text style={styles.mutedHint}>Découvre des personnes par proximité et affinités musicales.</Text></View>\n          {hasSearched && !discoveryUnlocked && !accessLoading ? <TouchableOpacity style={styles.lockBadge} onPress={openPremium}><Text style={styles.lockText}>🔒 Premium</Text></TouchableOpacity> : hasSearched && freeRemaining !== null ? <TouchableOpacity style={styles.trialBadge} onPress={openPremium} accessibilityRole=\"button\" accessibilityLabel=\"Voir Premium pour plus de découvertes\"><Text style={styles.trialText}>FREE · {freeRemaining} RESTANT{freeRemaining === 1 ? '' : 'S'}</Text></TouchableOpacity> : null}\n        </View>\n\n        <View style={styles.searchPanel}>"""
header_repl = """        <View style={styles.discoveryHeader}>\n          <View style={{ flex: 1 }}><Text style={styles.sectionTitle}>Profils autour de moi</Text><Text style={styles.mutedHint}>Découvre des personnes par proximité et affinités musicales.</Text></View>\n          {currentProfile && !discoveryUnlocked && !accessLoading ? <TouchableOpacity style={styles.lockBadge} onPress={openPremium}><Text style={styles.lockText}>🔒 Premium</Text></TouchableOpacity> : currentProfile && freeRemaining !== null ? <TouchableOpacity style={styles.trialBadge} onPress={openPremium} accessibilityRole=\"button\" accessibilityLabel=\"Voir Premium pour plus de découvertes\"><Text style={styles.trialText}>FREE · {freeRemaining} RESTANT{freeRemaining === 1 ? '' : 'S'}</Text></TouchableOpacity> : null}\n        </View>\n\n        <View style={styles.usernameSearch}>\n          <Text style={styles.usernameSearchIcon}>⌕</Text>\n          <TextInput\n            value={profileQuery}\n            onChangeText={(value) => { setProfileQuery(value); setProfileIndex(0); setDiscoveryAccess(null); setCurrentProfileSnapshot(null); }}\n            placeholder=\"Rechercher un pseudo KEEP\"\n            placeholderTextColor=\"#8E849A\"\n            autoCapitalize=\"none\"\n            autoCorrect={false}\n            style={styles.usernameSearchInput}\n            accessibilityLabel=\"Rechercher un utilisateur KEEP par pseudo\"\n          />\n          {profileQuery ? <TouchableOpacity style={styles.usernameClear} onPress={() => { setProfileQuery(''); setProfileIndex(0); }} accessibilityLabel=\"Effacer la recherche\"><Text style={styles.usernameClearText}>×</Text></TouchableOpacity> : null}\n        </View>\n\n        <View style={styles.searchPanel}>"""
if header_anchor not in s:
    raise SystemExit('header anchor missing')
s = s.replace(header_anchor, header_repl, 1)

s = s.replace(
    "<Text style={styles.searchHint}>{hasSearched && searchPosition ? `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} dans ce rayon` : 'Choisis d’abord la distance, puis appuie sur Rechercher.'}</Text>",
    "<Text style={styles.searchHint}>{hasSearched && searchPosition ? `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} dans ce rayon` : `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} disponible${filteredProfiles.length > 1 ? 's' : ''} · le GPS affine ensuite la proximité`}</Text>",
    1,
)

old_render = """        {hasSearched && (accessLoading || loadingProfiles) ? <ActivityIndicator color={colors.primaryLight} /> : hasSearched && !discoveryUnlocked && currentProfile ? (\n          <TouchableOpacity style={styles.lockCard} onPress={openPremium}>"""
new_render = """        {loadingProfiles || (currentProfile && accessLoading) ? <ActivityIndicator color={colors.primaryLight} /> : !discoveryUnlocked && currentProfile ? (\n          <TouchableOpacity style={styles.lockCard} onPress={openPremium}>"""
if old_render not in s:
    raise SystemExit('render start anchor missing')
s = s.replace(old_render, new_render, 1)

old_empty = """        ) : !hasSearched ? (\n          <View style={styles.emptyCard}><Text style={styles.mutedHint}>Aucun profil n’est affiché par défaut. Choisis une distance puis appuie sur RECHERCHER.</Text></View>\n        ) : !currentProfile ? (\n          <View style={styles.emptyCard}><Text style={styles.mutedHint}>Aucun profil public dans ce rayon. Élargis la jauge puis relance la recherche.</Text></View>\n"""
new_empty = """        ) : !currentProfile ? (\n          <View style={styles.emptyCard}><Text style={styles.mutedHint}>{profileQuery ? `Aucun profil ne correspond à @${profileQuery.replace(/^@/, '')}.` : hasSearched ? 'Aucun profil public dans ce rayon. Élargis la jauge puis relance la recherche.' : 'Aucun autre profil public disponible pour le moment.'}</Text></View>\n"""
if old_empty not in s:
    raise SystemExit('empty state anchor missing')
s = s.replace(old_empty, new_empty, 1)

style_anchor = "  discoveryHeader:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:5},"
style_repl = "  discoveryHeader:{flexDirection:'row',alignItems:'center',gap:7,marginBottom:5},usernameSearch:{minHeight:46,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,marginBottom:7,borderRadius:16,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},usernameSearchIcon:{color:'#D9C8F7',fontSize:20,fontWeight:'800'},usernameSearchInput:{flex:1,minHeight:44,color:'#FFFFFF',fontSize:15,fontWeight:'700'},usernameClear:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#241A2F'},usernameClearText:{color:'#FFFFFF',fontSize:22,lineHeight:24,fontWeight:'700'},"
if style_anchor not in s:
    raise SystemExit('style anchor missing')
s = s.replace(style_anchor, style_repl, 1)

p.write_text(s)

# Regression contract: Discoveries must show public profiles without mandatory GPS and allow username lookup.
t = Path('packages/mobile/src/screens/__tests__/DiscoverImmediateProfiles.contract.test.ts')
t.write_text("""// @ts-nocheck\nimport fs from 'fs';\nimport path from 'path';\n\ndescribe('KEEP Découvertes immediate public profiles', () => {\n  const source = fs.readFileSync(path.resolve(__dirname, '..', 'DiscoverScreen.tsx'), 'utf8');\n\n  it('does not require GPS before public profiles can be shown', () => {\n    expect(source).toContain('if (!hasSearched || !searchPosition) return candidates');\n    expect(source).not.toContain('if (!hasSearched || !searchPosition) return []');\n  });\n\n  it('supports direct username lookup', () => {\n    expect(source).toContain('Rechercher un pseudo KEEP');\n    expect(source).toContain("profile.username.toLowerCase().includes(needle)");\n    expect(source).toContain("profileQuery.trim().replace(/^@/, '').toLowerCase()");\n  });\n\n  it('keeps GPS as an optional proximity refinement', () => {\n    expect(source).toContain('getCurrentPositionAsync');\n    expect(source).toContain('le GPS affine ensuite la proximité');\n  });\n});\n""")
