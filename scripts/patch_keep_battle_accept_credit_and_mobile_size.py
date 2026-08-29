from pathlib import Path

p=Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s=p.read_text()

s=s.replace("    } catch {\n      Alert.alert('Battle', `@${player.username} n’est plus disponible.`);\n      void refreshSocial();\n    }", "    } catch (e: any) {\n      const message = String(e?.message || e || '');\n      if (message.includes('BATTLE_CHALLENGER_NO_CREDIT')) Alert.alert('Battle', 'Il te faut au moins 3 Free pour lancer un Battle.');\n      else if (message.includes('BATTLE_TARGET_NO_CREDIT')) Alert.alert('Battle', `@${player.username} n’a pas assez de Free pour jouer maintenant.`);\n      else Alert.alert('Battle', `@${player.username} n’est plus disponible.`);\n      void refreshSocial();\n    }",1)

s=s.replace("    } catch {\n      await refreshSocial();\n      Alert.alert('Battle', 'Impossible de traiter cette invitation. Réessaie immédiatement.');\n    }", "    } catch (e: any) {\n      await refreshSocial();\n      const message = String(e?.message || e || '');\n      if (message.includes('BATTLE_CHALLENGER_NO_CREDIT')) Alert.alert('Battle', `@${item.username} n’a plus les 3 Free nécessaires. Le Battle ne peut pas démarrer.`);\n      else if (message.includes('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED')) Alert.alert('Battle', 'Il te faut au moins 3 Free pour accepter ce Battle.');\n      else Alert.alert('Battle', 'Impossible de traiter cette invitation. Réessaie immédiatement.');\n    }",1)

repls={
"invite: { marginTop: 6, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 13":"invite: { marginTop: 7, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 15",
"inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }":"inviteLine: { flexDirection: 'row', alignItems: 'center', gap: 9 }",
"inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14, fontWeight: '800' }":"inviteQuestion: { color: '#F3EDF7', fontSize: 12, lineHeight: 16, fontWeight: '800' }",
"inviteName: { color: '#FFF', fontSize: 12, fontWeight: '900' }":"inviteName: { color: '#FFF', fontSize: 13, fontWeight: '900' }",
"inviteLabel: { color: '#E5F266', fontSize: 11, lineHeight: 14, fontWeight: '900', marginTop: 2 }":"inviteLabel: { color: '#E5F266', fontSize: 12, lineHeight: 16, fontWeight: '900', marginTop: 3 }",
"no: { minHeight: 44, minWidth: 70, paddingHorizontal: 9, borderRadius: 22":"no: { minHeight: 48, minWidth: 84, paddingHorizontal: 12, borderRadius: 24",
"noText: { color: '#FFF', fontSize: 11, fontWeight: '900' }":"noText: { color: '#FFF', fontSize: 12, fontWeight: '900' }",
"yes: { minHeight: 44, minWidth: 76, paddingHorizontal: 9, borderRadius: 22":"yes: { minHeight: 48, minWidth: 92, paddingHorizontal: 12, borderRadius: 24",
"yesText: { color: '#17130B', fontSize: 11, fontWeight: '900' }":"yesText: { color: '#17130B', fontSize: 12, fontWeight: '900' }",
}
for old,new in repls.items():
    if old not in s: raise SystemExit('missing style anchor '+old)
    s=s.replace(old,new,1)

p.write_text(s)

p=Path('packages/mobile/src/components/__tests__/KeepBattleMobileGameV3.compact.test.ts')
t=p.read_text()
t=t.replace("expect(source).toContain('minHeight: 44, minWidth: 70');","expect(source).toContain('minHeight: 48, minWidth: 84');")
t=t.replace("expect(source).toContain('minHeight: 44, minWidth: 76');","expect(source).toContain('minHeight: 48, minWidth: 92');")
t=t.replace("expect(source).toContain(\"inviteQuestion: { color: '#F3EDF7', fontSize: 11, lineHeight: 14\");","expect(source).toContain(\"inviteQuestion: { color: '#F3EDF7', fontSize: 12, lineHeight: 16\");")
t=t.replace("expect(source).toContain(\"inviteName: { color: '#FFF', fontSize: 12\");","expect(source).toContain(\"inviteName: { color: '#FFF', fontSize: 13\");")
if "BATTLE_CHALLENGER_NO_CREDIT" not in t:
    insert="""\n  it('explains credit failures instead of leaving accept/challenge apparently dead', () => {\n    expect(source).toContain('BATTLE_CHALLENGER_NO_CREDIT');\n    expect(source).toContain('BATTLE_TARGET_NO_CREDIT');\n    expect(source).toContain('BATTLE_ARENA_MINIMUM_THREE_FREE_REQUIRED');\n    expect(source).toContain('Il te faut au moins 3 Free');\n  });\n"""
    t=t.replace("\n});\n",insert+"\n});\n")
p.write_text(t)
