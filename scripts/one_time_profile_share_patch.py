from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'PATCH FAILED: {label}')
    return text.replace(old, new, 1)

# 1) Profil propriétaire : séparer abonnés/abonnements + ajouter copie lien.
p = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import { buildPublicProfileLink, sharePlaylist, shareProfile, shareProfileByEmail, shareProfileTrack } from '../services/sharingService';",
    "import { buildPublicProfileLink, copyProfileShareText, sharePlaylist, shareProfile, shareProfileByEmail, shareProfileTrack } from '../services/sharingService';",
    'owner share import',
)
s = replace_once(
    s,
    "  const showQr = () => {\n    if (accountRequired) return openAccount('create');\n    setShareOpen(false);\n    setQrOpen(true);\n  };",
    "  const copyProfileLink = async () => {\n    if (accountRequired) return openAccount('create');\n    try {\n      const copied = await copyProfileShareText(user.username);\n      if (copied) Alert.alert('Lien KEEP copié', `@${user.username} · KEEP — Tes goûts te ressemblent. Le lien public est prêt à coller.`);\n    } catch {\n      Alert.alert('Copie', 'Impossible de copier le lien pour le moment.');\n    }\n  };\n\n  const showQr = () => {\n    if (accountRequired) return openAccount('create');\n    setShareOpen(false);\n    setQrOpen(true);\n  };",
    'owner copy link handler',
)
s = replace_once(
    s,
    "        <View style={s.ownerActions}>\n          <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel=\"Partager mon profil\"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>\n          <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel=\"Prévisualiser mon KEEP en Swipe\"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>\n        </View>\n        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}\n        <View style={s.stats}>\n          <Stat value={profileTotalKeepCount} label=\"KEEP total\"/>\n          <Stat value={profileUserKeepCount} label=\"KEEP utilisateurs\"/>\n          <Stat value={profileFollowerCount} label=\"Abonnés\"/>\n          <Stat value={profileFollowingCount} label=\"Abonnements\"/>\n        </View>",
    "        <View style={s.ownerActions}>\n          <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel=\"Partager mon profil\"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>\n          <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel=\"Prévisualiser mon KEEP en Swipe\"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>\n        </View>\n        <View style={s.socialStats}>\n          <Stat value={profileFollowerCount} label=\"Abonnés\"/>\n          <Stat value={profileFollowingCount} label=\"Abonnements\"/>\n        </View>\n        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}\n        <View style={s.stats}>\n          <Stat value={profileTotalKeepCount} label=\"KEEP total\"/>\n          <Stat value={profileUserKeepCount} label=\"KEEP utilisateurs\"/>\n        </View>",
    'owner stats split',
)
s = replace_once(
    s,
    "          <TouchableOpacity style={s.shareAction} onPress={showQr}><Text style={s.shareActionText}>▦  Mon QR KEEP</Text><Text style={s.shareActionHint}>Carte d’identité musicale prête pour une story</Text></TouchableOpacity>\n          <TouchableOpacity style={s.cancelShare}",
    "          <TouchableOpacity style={s.shareAction} onPress={showQr}><Text style={s.shareActionText}>▦  Mon QR KEEP</Text><Text style={s.shareActionHint}>Carte d’identité musicale prête pour une story</Text></TouchableOpacity>\n          <TouchableOpacity style={s.shareAction} onPress={() => void copyProfileLink()}><Text style={s.shareActionText}>⧉  Copier mon lien KEEP</Text><Text style={s.shareActionHint}>Pseudo, slogan KEEP et lien public prêts à coller</Text></TouchableOpacity>\n          <TouchableOpacity style={s.cancelShare}",
    'owner copy link button',
)
s = replace_once(
    s,
    "accountBannerTitle:{color:'#FFF',fontSize:13,fontWeight:'900'},accountBannerText:{color:'#B9AEC6',fontSize:11,lineHeight:16,marginTop:3},stats:{marginTop:16,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:10,paddingHorizontal:2},statValue:{color:colors.textPrimary,fontSize:18,fontWeight:'800'},statLabel:{color:colors.textMuted,fontSize:8,marginTop:3,textAlign:'center'},",
    "accountBannerTitle:{color:'#FFF',fontSize:13,fontWeight:'900'},accountBannerText:{color:'#FFFFFF',fontSize:12,lineHeight:17,marginTop:3},socialStats:{marginTop:8,flexDirection:'row',backgroundColor:'#171020',borderRadius:radius.lg,borderWidth:1,borderColor:'#3F3154'},stats:{marginTop:12,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:10,paddingHorizontal:2},statValue:{color:'#FFFFFF',fontSize:18,fontWeight:'800'},statLabel:{color:'#FFFFFF',fontSize:10,marginTop:3,textAlign:'center',fontWeight:'700'},",
    'owner stat styles',
)
p.write_text(s, encoding='utf-8')

# 2) Profil visiteur : même séparation visuelle, labels blancs et plus lisibles.
p = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}\n          <View style={styles.statsRow}>\n            <Stat value={directKeepCount} label=\"KEEP\" />\n            <Stat value={socialKeepCount} label=\"KEEP utilisateurs\" />\n            <Stat value={followerCount} label=\"Abonnés\" />\n            <Stat value={followingCount} label=\"Abonnements\" />\n          </View>",
    "          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}\n          <View style={styles.socialStatsRow}>\n            <Stat value={followerCount} label=\"Abonnés\" />\n            <Stat value={followingCount} label=\"Abonnements\" />\n          </View>\n          <View style={styles.statsRow}>\n            <Stat value={directKeepCount} label=\"KEEP\" />\n            <Stat value={socialKeepCount} label=\"KEEP utilisateurs\" />\n          </View>",
    'visitor stats split',
)
s = replace_once(
    s,
    "  statsRow:{width:'100%',flexDirection:'row',marginTop:16,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:10,paddingHorizontal:2},statValue:{color:colors.textPrimary,fontSize:18,fontWeight:'800'},statLabel:{color:colors.textMuted,fontSize:8,marginTop:3,textAlign:'center'},",
    "  socialStatsRow:{width:'100%',flexDirection:'row',marginTop:10,borderRadius:radius.lg,backgroundColor:'#171020',borderWidth:1,borderColor:'#3F3154'},statsRow:{width:'100%',flexDirection:'row',marginTop:10,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:10,paddingHorizontal:2},statValue:{color:'#FFFFFF',fontSize:18,fontWeight:'800'},statLabel:{color:'#FFFFFF',fontSize:10,marginTop:3,textAlign:'center',fontWeight:'700'},",
    'visitor stat styles',
)
s = s.replace("swipeLaunchText:{color:'#E5DBF2',fontSize:9,lineHeight:13", "swipeLaunchText:{color:'#FFFFFF',fontSize:10,lineHeight:14", 1)
p.write_text(s, encoding='utf-8')

# 3) Landing public : schéma Supabase actuel, aucune requête vers anciennes tables/colonnes.
p = Path('packages/mobile/share-profile.html')
s = p.read_text(encoding='utf-8')
s = s.replace('select=id,username,bio,city,country_code,favorite_genres,social_links,avatar_url', 'select=id,username,bio,city,country_code,favorite_genres,avatar_url')
s = s.replace('profile_follows?', 'follows?')
s = s.replace('followed_id', 'followee_id')
s = s.replace('playlist_prefs?profile_id=eq.', 'playlists?owner_id=eq.')
old = "const [followerCount,followingCount,decisionRows,playlistRows]=await Promise.all([\n    publicCount(`follows?followee_id=eq.${encodeURIComponent(p.id)}&select=follower_id`),\n    publicCount(`follows?follower_id=eq.${encodeURIComponent(p.id)}&select=followee_id`),\n    get(`keep_decisions?profile_id=eq.${encodeURIComponent(p.id)}&decision=eq.KEPT&visibility=eq.PUBLIC&select=id,track_id,created_at,context,track:tracks(id,isrc,title,artist,album,artwork_url,preview_url,available_on,external_urls)&order=created_at.desc&limit=100`),\n    get(`playlists?owner_id=eq.${encodeURIComponent(p.id)}&is_public=eq.true&select=name,description,cover_url&order=updated_at.desc&limit=20`).catch(()=>[]),\n  ]);"
new = "const [followerCount,followingCount,decisionRows,playlistRows,socialRows]=await Promise.all([\n    publicCount(`follows?followee_id=eq.${encodeURIComponent(p.id)}&select=follower_id`),\n    publicCount(`follows?follower_id=eq.${encodeURIComponent(p.id)}&select=followee_id`),\n    get(`keep_decisions?profile_id=eq.${encodeURIComponent(p.id)}&decision=eq.KEPT&visibility=eq.PUBLIC&select=id,track_id,created_at,context,track:tracks(id,isrc,title,artist,album,artwork_url,preview_url,available_on,external_urls)&order=created_at.desc&limit=100`).catch(()=>[]),\n    get(`playlists?owner_id=eq.${encodeURIComponent(p.id)}&is_public=eq.true&select=name,description,cover_url&order=updated_at.desc&limit=20`).catch(()=>[]),\n    get(`social_links?profile_id=eq.${encodeURIComponent(p.id)}&visibility=eq.PUBLIC&select=platform,url&order=created_at.asc`).catch(()=>[]),\n  ]);"
s = replace_once(s, old, new, 'share landing parallel data')
s = replace_once(
    s,
    "const socials=document.getElementById('socials');socials.innerHTML='';(p.social_links||[]).filter(x=>x?.visibility==='PUBLIC'&&x?.url).forEach(x=>",
    "const socials=document.getElementById('socials');socials.innerHTML='';(socialRows||[]).filter(x=>x?.url).forEach(x=>",
    'share landing social links',
)
s = replace_once(
    s,
    "init().catch(e=>{document.getElementById('status').textContent=e.message||'Profil indisponible'});",
    "init().catch(()=>{const status=document.getElementById('status');status.innerHTML='<strong>Ce partage KEEP est momentanément indisponible.</strong><br><span style=\"display:block;margin-top:8px;color:#a99db9\">Réessaie ou ouvre directement KEEP.</span><a href=\"https://adelkhatra-bit.github.io/KEEP/\" style=\"display:inline-block;margin-top:14px;color:#fff;background:#7f5cff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:900\">OUVRIR KEEP</a>';});",
    'share friendly failure',
)
p.write_text(s, encoding='utf-8')

# 4) CI web : tester de vrais liens de partage et interdire HTTP 400/page noire dans le navigateur.
p = Path('.github/workflows/web-preview-pages.yml')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "            '/offers/', '/share-profile/?u=__keep_public_smoke__', '/admin-preview/', '/superadmin/'",
    "            '/offers/', '/share-profile/?u=adel4A&share=profile', '/share-profile/?u=adel4A&share=track&title=N%27tya%20%26%20Moi&artist=Kayliah', '/share-profile/?u=adel4A&share=vibe&label=Funk%20%26%20Soul', '/share-profile/?u=adel4A&share=session&label=Session%20soir%C3%A9e', '/share-profile/?u=adel4A&share=compare&label=inside', '/share-profile/?u=adel4A&share=event&label=Soir%C3%A9e%20KEEP', '/admin-preview/', '/superadmin/'",
    'share browser routes',
)
s = replace_once(
    s,
    "          const bad404 = text => /File not found|404 There isn't a GitHub Pages site here/i.test(text || '');",
    "          const bad404 = text => /File not found|404 There isn't a GitHub Pages site here/i.test(text || '');\n          const badShare = text => /HTTP\\s*400|KEEP_DATA_400|Bad Request/i.test(text || '');",
    'share bad response matcher',
)
s = replace_once(
    s,
    "                const ok = status >= 200 && status < 500 && !blank(text, html) && !bad404(text);",
    "                const ok = status >= 200 && status < 500 && !blank(text, html) && !bad404(text) && !badShare(text);",
    'share browser assertion',
)
p.write_text(s, encoding='utf-8')

print('PATCH_OK')
