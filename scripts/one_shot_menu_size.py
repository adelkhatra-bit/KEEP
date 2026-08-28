from pathlib import Path

home = Path('packages/mobile/src/screens/HomeScreenCompact.tsx')
profile = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')

home_text = home.read_text(encoding='utf-8')
profile_text = profile.read_text(encoding='utf-8')

# Standard KEEP mobile menu size inspired by Instagram: 44x44 touch target,
# large high-contrast hamburger glyph. Same dimensions everywhere we expose ☰.
old = "round: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#120D1B' },\n  roundText: { color: C.text, fontSize: 17 },"
new = "round: { width: 44, height: 44, borderRadius: 16, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: '#120D1B' },\n  roundText: { color: C.text, fontSize: 28, lineHeight: 30, fontWeight: '700' },"
if old not in home_text:
    raise SystemExit('anchor missing: listen hamburger size')
home_text = home_text.replace(old, new, 1)

old = "menuButton:{width:38,height:36,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},menuText:{color:'#FFFFFF',fontSize:22,lineHeight:24,fontWeight:'900'},"
new = "menuButton:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},menuText:{color:'#FFFFFF',fontSize:28,lineHeight:30,fontWeight:'900'},"
if old not in profile_text:
    raise SystemExit('anchor missing: profile hamburger size')
profile_text = profile_text.replace(old, new, 1)

# Make sure there are no other literal hamburger buttons silently using a smaller size.
other_hits = []
for path in Path('packages/mobile/src').rglob('*.tsx'):
    text = path.read_text(encoding='utf-8')
    if '☰' in text and path not in {home, profile}:
        other_hits.append(str(path))
if other_hits:
    raise SystemExit('other hamburger buttons need standardization: ' + ', '.join(other_hits))

home.write_text(home_text, encoding='utf-8')
profile.write_text(profile_text, encoding='utf-8')
print('KEEP hamburger size standardized to 44x44 / 28px')
