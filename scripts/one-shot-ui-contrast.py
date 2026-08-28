from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def must_replace(rel, old, new, count=1):
    path = ROOT / rel
    text = path.read_text(encoding='utf-8')
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{rel}: expected at least {count} occurrence(s), found {found}: {old[:120]!r}')
    text = text.replace(old, new, count)
    path.write_text(text, encoding='utf-8')

# 1) Barre du bas : libellés parfaitement lisibles en blanc.
must_replace(
    'packages/mobile/src/navigation/Navigation.tsx',
    "  active: '#A884FA',\n  inactive: '#756B84',",
    "  active: '#FFFFFF',\n  inactive: '#FFFFFF',",
)

# 2) Ma communauté quitte Découvertes et rejoint le profil.
must_replace(
    'packages/mobile/src/screens/DiscoverScreen.tsx',
    "import CommunityConnectionsPanel from '../components/CommunityConnectionsPanel';\n",
    '',
)
must_replace(
    'packages/mobile/src/screens/DiscoverScreen.tsx',
    "        {user && !isLocalGuest && !isDemoMode ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}\n\n",
    '',
)
# Actions Découvertes : jamais gris sur gris.
must_replace(
    'packages/mobile/src/screens/DiscoverScreen.tsx',
    "profileAction:{minHeight:46,paddingHorizontal:18,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},profileActionText:{color:'#FFF',fontSize:10,fontWeight:'900'},",
    "profileAction:{minHeight:46,paddingHorizontal:18,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},profileActionText:{color:'#FFF',fontSize:10,fontWeight:'900'},",
)
must_replace(
    'packages/mobile/src/screens/DiscoverScreen.tsx',
    "locationHint:{marginTop:16,padding:12,borderRadius:14,backgroundColor:'#151020',borderWidth:1,borderColor:'#312348'},locationHintText:{color:'#B9AEC6',fontSize:11,lineHeight:16,textAlign:'center'},",
    "locationHint:{marginTop:16,padding:12,borderRadius:14,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},locationHintText:{color:'#FFFFFF',fontSize:11,lineHeight:16,textAlign:'center',fontWeight:'800'},",
)

# 3) Profil : badge Utilisateur vert, provenance utilisateur plus visible,
# communauté compacte juste au-dessus des compteurs.
must_replace(
    'packages/mobile/src/screens/ProfilePublicScreen.tsx',
    "import ProfileCertificationBadge from '../components/ProfileCertificationBadge';\n",
    "import ProfileCertificationBadge from '../components/ProfileCertificationBadge';\nimport CommunityConnectionsPanel from '../components/CommunityConnectionsPanel';\n",
)
must_replace(
    'packages/mobile/src/screens/ProfilePublicScreen.tsx',
    "        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}\n        <View style={s.stats}>",
    "        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}\n        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}\n        <View style={s.stats}>",
)
must_replace(
    'packages/mobile/src/screens/ProfilePublicScreen.tsx',
    "kindBadge:{minHeight:21,paddingHorizontal:7,borderRadius:11,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#493369',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#BFA9FF',fontSize:8,fontWeight:'900'},",
    "kindBadge:{minHeight:21,paddingHorizontal:8,borderRadius:11,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#7CF2B9',fontSize:8,fontWeight:'900'},",
)
must_replace(
    'packages/mobile/src/screens/ProfilePublicScreen.tsx',
    "trackShare:{minHeight:25,paddingHorizontal:8,borderRadius:13,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',alignItems:'center',justifyContent:'center'},trackShareText:{color:'#FFFFFF',fontSize:9,fontWeight:'800'},originInline:{flexDirection:'row',alignItems:'center',gap:4},originLabel:{color:'#FFFFFF',fontSize:8,fontWeight:'700',letterSpacing:.2},originUserLink:{minHeight:23,paddingHorizontal:8,borderRadius:12,backgroundColor:'#21182F',borderWidth:1,borderColor:'#6E4BA5',alignItems:'center',justifyContent:'center'},originUserText:{color:'#D9C7FF',fontSize:9,fontWeight:'900'},",
    "trackShare:{minHeight:25,paddingHorizontal:8,borderRadius:13,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},trackShareText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},originInline:{flexDirection:'row',alignItems:'center',gap:4},originLabel:{color:'#FFFFFF',fontSize:8,fontWeight:'800',letterSpacing:.2},originUserLink:{minHeight:23,paddingHorizontal:8,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},originUserText:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},",
)
must_replace(
    'packages/mobile/src/screens/ProfilePublicScreen.tsx',
    "playlistShareButton:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',alignItems:'center',justifyContent:'center'},playlistShareText:{color:colors.primaryLight,fontSize:9,fontWeight:'800'},",
    "playlistShareButton:{minHeight:27,paddingHorizontal:9,borderRadius:14,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},playlistShareText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},",
)
must_replace(
    'packages/mobile/src/screens/ProfilePublicScreen.tsx',
    "socialButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E'},socialButtonOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},",
    "socialButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'#24163A',borderWidth:1,borderColor:'#8B5CF6'},socialButtonOn:{backgroundColor:'#5B3F8C',borderColor:'#C5ACFF'},",
)

# 4) Ma communauté : deux boutons clairement colorés, actions visibles.
must_replace(
    'packages/mobile/src/components/CommunityConnectionsPanel.tsx',
    "<TouchableOpacity style={[s.tab, mode === 'following' && s.tabOn]}",
    "<TouchableOpacity style={[s.tab, s.tabPurple, mode === 'following' && s.tabOn]}",
)
must_replace(
    'packages/mobile/src/components/CommunityConnectionsPanel.tsx',
    "<TouchableOpacity style={[s.tab, mode === 'followers' && s.tabOn]}",
    "<TouchableOpacity style={[s.tab, s.tabGreen, mode === 'followers' && s.tabOn]}",
)
must_replace(
    'packages/mobile/src/components/CommunityConnectionsPanel.tsx',
    "  shell:{marginTop:spacing.lg,padding:12,borderRadius:18,backgroundColor:'#151020',borderWidth:1,borderColor:'#312348'},",
    "  shell:{marginTop:10,padding:10,borderRadius:16,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},",
)
must_replace(
    'packages/mobile/src/components/CommunityConnectionsPanel.tsx',
    "  tabs:{flexDirection:'row',gap:7,marginTop:10},\n  tab:{flex:1,minHeight:36,borderRadius:18,borderWidth:1,borderColor:'#40354E',alignItems:'center',justifyContent:'center',backgroundColor:'#21182F'},\n  tabOn:{backgroundColor:colors.primary,borderColor:colors.primaryLight},\n  tabText:{color:'#B9AEC6',fontSize:9,fontWeight:'900'},\n  tabTextOn:{color:'#FFF'},",
    "  tabs:{flexDirection:'row',gap:7,marginTop:8},\n  tab:{flex:1,minHeight:34,borderRadius:17,borderWidth:1,alignItems:'center',justifyContent:'center'},\n  tabPurple:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},\n  tabGreen:{backgroundColor:'#123D2C',borderColor:'#38D990'},\n  tabOn:{borderWidth:2},\n  tabText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},\n  tabTextOn:{color:'#FFFFFF'},",
)
must_replace(
    'packages/mobile/src/components/CommunityConnectionsPanel.tsx',
    "  view:{minHeight:30,paddingHorizontal:11,borderRadius:15,borderWidth:1,borderColor:'#493369',alignItems:'center',justifyContent:'center'},\n  viewText:{color:'#D7C7FF',fontSize:8,fontWeight:'900'},",
    "  view:{minHeight:30,paddingHorizontal:11,borderRadius:15,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},\n  viewText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},",
)

# 5) Modifier profil : localisation/recherche et liens d'action colorés.
must_replace(
    'packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx',
    "locationButton:{minHeight:46,borderRadius:23,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:16,backgroundColor:colors.backgroundElevated},locationButtonText:{color:colors.primaryLight,fontSize:13,fontWeight:'900'},lookupButton:{minHeight:40,marginTop:8,borderRadius:20,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',backgroundColor:colors.background},lookupText:{color:colors.textSecondary,fontSize:12,fontWeight:'800'},",
    "locationButton:{minHeight:46,borderRadius:23,borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',paddingHorizontal:16,backgroundColor:'#5B3F8C'},locationButtonText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},lookupButton:{minHeight:40,marginTop:8,borderRadius:20,borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center',backgroundColor:'#123D2C'},lookupText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},",
)
must_replace(
    'packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx',
    "playlists:{minHeight:48,marginTop:12,borderRadius:24,borderWidth:1,borderColor:colors.primary,alignItems:'center',justifyContent:'center'},playlistsText:{color:colors.primaryLight,fontSize:13,fontWeight:'800'},advanced:{minHeight:44,marginTop:8,alignItems:'center',justifyContent:'center'},advancedText:{color:colors.textMuted,fontSize:12,fontWeight:'700'},",
    "playlists:{minHeight:48,marginTop:12,borderRadius:24,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},playlistsText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},advanced:{minHeight:44,marginTop:8,borderRadius:22,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#24163A',alignItems:'center',justifyContent:'center'},advancedText:{color:'#FFFFFF',fontSize:12,fontWeight:'900'},",
)

# 6) Règle projet persistante pour les prochains écrans.
rule = ROOT / 'docs' / 'UI_CONTRAST_RULE.md'
rule.parent.mkdir(parents=True, exist_ok=True)
rule.write_text('''# KEEP — règle stricte de contraste des actions\n\nCette règle s’applique à tous les écrans Mobile KEEP.\n\n- Un élément cliquable actif ne doit jamais être gris sur fond gris.\n- Action principale : fond violet KEEP (`#5B3F8C` / `#8B5CF6`) + texte blanc.\n- Action secondaire positive : fond vert sombre (`#123D2C`) + contour vert (`#38D990`) + texte blanc/vert clair.\n- Un bouton en contour doit avoir un contour coloré et un texte blanc lisible.\n- Le gris est réservé aux états réellement désactivés ou aux textes non interactifs.\n- Les libellés de la barre des 5 onglets restent blancs.\n- Les actions importantes doivent conserver un contraste lisible sur mobile 390×844.\n\nToute nouvelle action doit respecter cette règle avant validation QA.\n''', encoding='utf-8')

# Le workflow est volontairement one-shot : supprimer les deux fichiers techniques
# après application afin de ne laisser aucun mécanisme de modification automatique.
for rel in ['scripts/one-shot-ui-contrast.py', '.github/workflows/one-shot-ui-contrast.yml']:
    p = ROOT / rel
    if p.exists():
        p.unlink()

print('KEEP UI contrast migration applied.')
