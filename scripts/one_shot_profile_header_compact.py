from pathlib import Path
import re

path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
text = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'anchor missing: {label}')
    text = text.replace(old, new, 1)

# Own-profile top bar: remove the redundant title/share/settings clutter.
# Keep only plan, notifications and one menu entry, Instagram-style.
replace_once(
"""      <View style={s.topBar}>
        <View style={s.topSpacer} />
        <View style={s.actions}>
          <TouchableOpacity style={[s.plan, planStyle]} onPress={() => navigation.navigate('Offers')} accessibilityLabel="Offre et crédits"><Text style={s.planText}>{planLabel}</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('Notifications')} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ''}`}>
            <Text style={s.bell}>🔔</Text>
            {unreadCount > 0 ? <View style={s.notificationBadge}><Text style={s.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={openShare} accessibilityLabel="Partager le profil"><Text style={s.iconText}>↗</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Modifier le profil"><Text style={s.iconText}>⚙</Text></TouchableOpacity>
        </View>
      </View>""",
"""      <View style={s.topBar}>
        <TouchableOpacity style={[s.plan, planStyle]} onPress={() => navigation.navigate('Offers')} accessibilityLabel="Offre et crédits"><Text style={s.planText}>{planLabel}</Text></TouchableOpacity>
        <View style={s.actions}>
          <TouchableOpacity style={s.iconButton} onPress={() => navigation.navigate('Notifications')} accessibilityLabel={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ''}`}>
            <Text style={s.bell}>🔔</Text>
            {unreadCount > 0 ? <View style={s.notificationBadge}><Text style={s.notificationBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}
          </TouchableOpacity>
          <TouchableOpacity style={s.menuButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Menu du profil"><Text style={s.menuText}>☰</Text></TouchableOpacity>
        </View>
      </View>""",
'own profile top bar',
)

# Identity: never show a fake +Suivre button on the account owner's own profile.
# Move role/location below the pseudo, then place the useful actions below the bio.
replace_once(
"""            <View style={s.usernameLine}><Text style={s.username}>@{user.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
            <View style={s.profileMetaRow}>
              <View style={s.profileMetaLeft}>
                <View style={s.kindBadge}><Text style={s.kindBadgeText}>{PROFILE_KIND_LABELS[user.kind]}</Text></View>
                {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
              </View>
              <View style={s.identityMeta}>
                <TouchableOpacity style={s.followPreview} onPress={() => Alert.alert('Aperçu du profil', 'C’est ici que les autres utilisateurs verront le bouton + Suivre.')} accessibilityLabel="Aperçu bouton suivre"><Text style={s.followPreviewText}>+ Suivre</Text></TouchableOpacity>
                <TouchableOpacity style={s.swipePreview} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.swipePreviewText}>▶ SWIPE</Text></TouchableOpacity>
              </View>
            </View>""",
"""            <View style={s.usernameLine}><Text style={s.username}>@{user.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
            <View style={s.profileMetaLeft}>
              <View style={s.kindBadge}><Text style={s.kindBadgeText}>{PROFILE_KIND_LABELS[user.kind]}</Text></View>
              {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
            </View>""",
'own profile identity row',
)

replace_once(
"""        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}""",
"""        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        <View style={s.ownerActions}>
          <TouchableOpacity style={s.ownerEditButton} onPress={() => navigation.navigate('ProfileSettings')} accessibilityLabel="Modifier mon profil"><Text style={s.ownerActionText}>MODIFIER</Text></TouchableOpacity>
          <TouchableOpacity style={s.ownerShareButton} onPress={openShare} accessibilityLabel="Partager mon profil"><Text style={s.ownerActionText}>PARTAGER</Text></TouchableOpacity>
          <TouchableOpacity style={s.ownerSwipeButton} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.ownerActionText}>▶ SWIPE</Text></TouchableOpacity>
        </View>
        {!accountRequired ? <CommunityConnectionsPanel userId={user.id} navigation={navigation} /> : null}""",
'own profile actions under bio',
)

# Compact only the circled header/identity area. Do not touch community, stats, DNA, tabs or navigation.
text, count = re.subn(
    r"topBar:\{paddingHorizontal:18,paddingTop:8,paddingBottom:5,flexDirection:'row',alignItems:'center',justifyContent:'space-between'\},topSpacer:\{flex:1\},kindBadge:",
    "topBar:{minHeight:46,paddingHorizontal:18,paddingTop:5,paddingBottom:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kindBadge:",
    text,
    count=1,
)
if count != 1:
    raise SystemExit('anchor missing: compact topBar style')

text, count = re.subn(
    r"actions:\{flexDirection:'row',gap:6,alignItems:'center'\},iconButton:\{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:colors\.backgroundCard,borderWidth:1,borderColor:colors\.border,position:'relative'\},iconText:\{color:colors\.textPrimary,fontSize:18,fontWeight:'700'\},bell:\{fontSize:17\},",
    "actions:{flexDirection:'row',gap:7,alignItems:'center'},iconButton:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'#21182F',borderWidth:1,borderColor:'#6E4BA5',position:'relative'},iconText:{color:colors.textPrimary,fontSize:18,fontWeight:'700'},bell:{fontSize:16},menuButton:{width:38,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},menuText:{color:'#FFFFFF',fontSize:22,lineHeight:24,fontWeight:'900'},",
    text,
    count=1,
)
if count != 1:
    raise SystemExit('anchor missing: compact action styles')

text, count = re.subn(
    r"hero:\{paddingHorizontal:18,paddingBottom:12\},identity:\{flexDirection:'row',alignItems:'center'\},avatar:\{width:68,height:68,borderRadius:34,backgroundColor:colors\.backgroundCard\},",
    "hero:{paddingHorizontal:18,paddingBottom:10},identity:{flexDirection:'row',alignItems:'center'},avatar:{width:62,height:62,borderRadius:31,backgroundColor:colors.backgroundCard},",
    text,
    count=1,
)
if count != 1:
    raise SystemExit('anchor missing: compact hero styles')

# Replace the old own-profile metadata/action style block; public visitor styles are separate.
text, count = re.subn(
    r"identityText:\{flex:1,marginLeft:12\},usernameLine:\{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'\},username:\{\.\.\.typography\.h2,color:colors\.textPrimary\},profileMetaRow:\{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:6\},profileMetaLeft:\{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',flexShrink:1\},identityMeta:\{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5\},followPreview:\{.*?\},followPreviewText:\{.*?\},swipePreview:\{.*?\},swipePreviewText:\{.*?\},location:\{color:'#FFFFFF',fontSize:10,fontWeight:'800'\},bio:\{color:colors\.textSecondary,fontSize:14,lineHeight:20,marginTop:12\},",
    "identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',marginTop:6},location:{color:'#FFFFFF',fontSize:10,fontWeight:'800'},bio:{color:colors.textSecondary,fontSize:13,lineHeight:18,marginTop:9},ownerActions:{flexDirection:'row',alignItems:'center',gap:7,marginTop:10},ownerEditButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:'#21182F',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},ownerShareButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:'#123D2C',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},ownerSwipeButton:{flex:1,minHeight:34,borderRadius:10,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},ownerActionText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},",
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit('anchor missing: own profile compact styles')

path.write_text(text, encoding='utf-8')
print('compact own-profile header applied')
