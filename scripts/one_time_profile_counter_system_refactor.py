from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'PATCH FAILED: {label}')
    return text.replace(old, new, 1)

# Owner profile: use the shared counter row.
p = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import CommunityConnectionsPanel from '../components/CommunityConnectionsPanel';",
    "import CommunityConnectionsPanel from '../components/CommunityConnectionsPanel';\nimport ProfileCounterRow from '../components/ProfileCounterRow';",
    'owner shared counter import',
)
s = replace_once(
    s,
    "        <View style={s.connectionStats}>\n          <Stat value={profileFollowerCount} label=\"Abonnés\"/>\n          <Stat value={profileFollowingCount} label=\"Abonnements\"/>\n        </View>",
    "        <ProfileCounterRow kind=\"connections\" items={[\n          { value: profileFollowerCount, label: 'Abonnés' },\n          { value: profileFollowingCount, label: 'Abonnements' },\n        ]} />",
    'owner connection counters',
)
s = replace_once(
    s,
    "        <View style={s.stats}>\n          <Stat value={profileTotalKeepCount} label=\"KEEP total\"/>\n          <Stat value={profileUserKeepCount} label=\"KEEP utilisateurs\"/>\n        </View>",
    "        <ProfileCounterRow kind=\"keeps\" items={[\n          { value: profileTotalKeepCount, label: 'KEEP total' },\n          { value: profileUserKeepCount, label: 'KEEP utilisateurs' },\n        ]} />",
    'owner keep counters',
)
s = s.replace("\nfunction Stat({value,label}:{value:number;label:string}){return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>}\n", "\n", 1)
s = replace_once(
    s,
    "connectionStats:{marginTop:8,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},stats:{marginTop:10,flexDirection:'row',backgroundColor:colors.backgroundCard,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:10,paddingHorizontal:2},statValue:{color:colors.textPrimary,fontSize:18,fontWeight:'800'},statLabel:{color:'#FFFFFF',fontSize:10,marginTop:3,textAlign:'center',fontWeight:'700'},",
    "",
    'owner duplicate counter styles',
)
p.write_text(s, encoding='utf-8')

# Visitor profile: same component and exact same visual contract.
p = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')
s = p.read_text(encoding='utf-8')
s = replace_once(
    s,
    "import ProfileCertificationBadge from '../components/ProfileCertificationBadge';",
    "import ProfileCertificationBadge from '../components/ProfileCertificationBadge';\nimport ProfileCounterRow from '../components/ProfileCounterRow';",
    'visitor shared counter import',
)
s = replace_once(
    s,
    "          <View style={styles.connectionStatsRow}>\n            <Stat value={followerCount} label=\"Abonnés\" />\n            <Stat value={followingCount} label=\"Abonnements\" />\n          </View>\n          <View style={styles.statsRow}>\n            <Stat value={directKeepCount} label=\"KEEP\" />\n            <Stat value={socialKeepCount} label=\"KEEP utilisateurs\" />\n          </View>",
    "          <ProfileCounterRow kind=\"connections\" items={[\n            { value: followerCount, label: 'Abonnés' },\n            { value: followingCount, label: 'Abonnements' },\n          ]} />\n          <ProfileCounterRow kind=\"keeps\" items={[\n            { value: directKeepCount, label: 'KEEP' },\n            { value: socialKeepCount, label: 'KEEP utilisateurs' },\n          ]} />",
    'visitor counter rows',
)
s = s.replace("\nfunction Stat({ value, label }: { value: number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }\n", "\n", 1)
s = replace_once(
    s,
    "  connectionStatsRow:{width:'100%',flexDirection:'row',marginTop:10,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},statsRow:{width:'100%',flexDirection:'row',marginTop:8,borderRadius:radius.lg,backgroundColor:colors.backgroundCard,borderWidth:1,borderColor:colors.border},stat:{flex:1,alignItems:'center',paddingVertical:10,paddingHorizontal:2},statValue:{color:colors.textPrimary,fontSize:18,fontWeight:'800'},statLabel:{color:'#FFFFFF',fontSize:10,marginTop:3,textAlign:'center',fontWeight:'700'},",
    "",
    'visitor duplicate counter styles',
)
p.write_text(s, encoding='utf-8')

# Public permanent share page: same hierarchy and readable white labels.
p = Path('packages/mobile/share-profile.html')
s = p.read_text(encoding='utf-8')
s = replace_once(s, ".connection span{display:block;font-size:10px;color:#fff;font-weight:800;margin-top:2px}", ".connection span{display:block;font-size:11px;color:#fff;font-weight:800;margin-top:2px}", 'public follower label')
s = replace_once(s, ".stat span{display:block;font-size:10px;color:#fff;font-weight:800;margin-top:2px}", ".stat span{display:block;font-size:11px;color:#fff;font-weight:800;margin-top:2px}", 'public keep label')
p.write_text(s, encoding='utf-8')

print('PROFILE_COUNTER_SYSTEM_OK')
