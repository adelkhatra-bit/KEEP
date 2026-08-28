from pathlib import Path

owner_path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
owner = owner_path.read_text(encoding='utf-8')
old_owner = '''      <ProfileCounterRow kind="keeps" items={[
        { value: profileTotalKeepCount, label: 'KEEP total' },
        { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
      ]} />

      <View style={s.tabs}>'''
new_owner = '''      <View style={s.keepCounters}>
        <ProfileCounterRow kind="keeps" items={[
          { value: profileTotalKeepCount, label: 'KEEP total' },
          { value: profileUserKeepCount, label: 'KEEP utilisateurs' },
        ]} />
      </View>

      <View style={s.tabs}>'''
if owner.count(old_owner) != 1:
    raise SystemExit(f'Owner KEEP counter block expected exactly once, found {owner.count(old_owner)}')
owner = owner.replace(old_owner, new_owner, 1)

old_style = "  tabs:{marginTop:16,paddingHorizontal:10,flexDirection:'row',borderBottomWidth:1,borderBottomColor:colors.border},"
new_style = "  keepCounters:{marginHorizontal:18},\n  tabs:{marginTop:16,paddingHorizontal:10,flexDirection:'row',borderBottomWidth:1,borderBottomColor:colors.border},"
if owner.count(old_style) != 1:
    raise SystemExit(f'Owner tabs style anchor expected exactly once, found {owner.count(old_style)}')
owner = owner.replace(old_style, new_style, 1)
owner_path.write_text(owner, encoding='utf-8')

contract_path = Path('packages/mobile/scripts/verify-profile-hierarchy.cjs')
contract = contract_path.read_text(encoding='utf-8')
old_contract_owner = '''  '<Text style={s.dnaTitle}>Ton empreinte musicale</Text>',
  "{ value: profileTotalKeepCount, label: 'KEEP total' }",
  '<View style={s.tabs}>','''
new_contract_owner = '''  '<Text style={s.dnaTitle}>Ton empreinte musicale</Text>',
  '<View style={s.keepCounters}>',
  "{ value: profileTotalKeepCount, label: 'KEEP total' }",
  '<View style={s.tabs}>','''
if contract.count(old_contract_owner) != 1:
    raise SystemExit('Owner hierarchy contract anchor not found exactly once')
contract = contract.replace(old_contract_owner, new_contract_owner, 1)
old_contract_visitor = '''  '<Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SON KEEP EN SWIPE</Text>',
  "{ value: directKeepCount, label: 'KEEP' }",
  '<View style={styles.publicMusicSection}>','''
new_contract_visitor = '''  '<Text style={styles.swipeLaunchTitle}>▶ DÉCOUVRIR SON KEEP EN SWIPE</Text>',
  '<View style={styles.visitorKeepCounters}>',
  "{ value: directKeepCount, label: 'KEEP' }",
  '<View style={styles.publicMusicSection}>','''
if contract.count(old_contract_visitor) != 1:
    raise SystemExit('Visitor hierarchy contract anchor not found exactly once')
contract = contract.replace(old_contract_visitor, new_contract_visitor, 1)
contract_path.write_text(contract, encoding='utf-8')

print('Profile KEEP counter alignment patch applied')
