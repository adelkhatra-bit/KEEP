from pathlib import Path

# Move the compact Battle invite inside the card, between artwork and "Qui chante ?".
p = Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s = p.read_text()
question = "        <Text style={s.question}>Qui chante ?</Text>\n"
invite = "        {incoming[0] ? <Animated.View style={[s.invite, { transform: [{ scale: pulse }] }]}><View style={s.inviteLine}><Avatar name={incoming[0].username} url={incoming[0].avatarUrl} size={24} /><View style={{ flex: 1 }}><Text style={s.inviteQuestion}><Text style={s.inviteName}>@{incoming[0].username}</Text> souhaite faire un Battle avec vous. Acceptez-vous ?</Text><Text style={s.inviteLabel}>⚡ {themeLabel(incoming[0].themeCode)} · {challengeRemaining}s</Text></View><TouchableOpacity style={s.no} onPress={() => { void respond(incoming[0], false); }}><Text style={s.noText}>REFUSER</Text></TouchableOpacity><TouchableOpacity style={s.yes} onPress={() => { void respond(incoming[0], true); }}><Text style={s.yesText}>ACCEPTER</Text></TouchableOpacity></View></Animated.View> : null}\n"
old = question + invite
new = invite + question
if old in s:
    s = s.replace(old, new, 1)
elif invite + question not in s:
    raise SystemExit('Battle invite placement anchor missing')
p.write_text(s)

# Native Battle actions must not bounce through the notification/home screen after
# REFUSER/ACCEPTER. The action itself is authoritative.
p = Path('packages/mobile/src/services/pushNotificationService.ts')
s = p.read_text()
old = """      void respondBattleChallenge(challengeId, accept)
        .then(() => Linking.openURL('keep://notifications'))
        .catch(() => Linking.openURL('keep://notifications'));
      return;"""
new = """      void respondBattleChallenge(challengeId, accept).catch(() => {});
      return;"""
if old in s:
    s = s.replace(old, new, 1)
elif "respondBattleChallenge(challengeId, accept).catch(() => {})" not in s:
    raise SystemExit('native Battle action redirect anchor missing')

# Keep explicit notification tap routing for a normal tap, but action buttons themselves
# do not redirect. REFUSER can stay background; ACCEPTER foregrounds the app so the live
# Battle screen can pick up the accepted arena without a useless notification-center hop.
s = s.replace("options: { opensAppToForeground: true, isAuthenticationRequired: false, isDestructive: true },", "options: { opensAppToForeground: false, isAuthenticationRequired: false, isDestructive: true },", 1)
p.write_text(s)

# Update the contract test to lock the requested card order and no action redirect.
p = Path('packages/mobile/src/screens/__tests__/BattleNotificationActions.contract.test.ts')
s = p.read_text()
s = s.replace("const question = battle.indexOf(\"<Text style={s.question}>Qui chante ?</Text>\");\n    const invite = battle.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?');\n    const answers = battle.indexOf('<View style={s.answers}>');\n    expect(question).toBeGreaterThan(-1);\n    expect(invite).toBeGreaterThan(question);\n    expect(answers).toBeGreaterThan(invite);", "const visual = battle.indexOf('<View style={s.visual}>');\n    const invite = battle.indexOf('souhaite faire un Battle avec vous. Acceptez-vous ?');\n    const question = battle.indexOf(\"<Text style={s.question}>Qui chante ?</Text>\");\n    const answers = battle.indexOf('<View style={s.answers}>');\n    expect(visual).toBeGreaterThan(-1);\n    expect(invite).toBeGreaterThan(visual);\n    expect(question).toBeGreaterThan(invite);\n    expect(answers).toBeGreaterThan(question);")
if "respondBattleChallenge(challengeId, accept).catch(() => {})" not in s:
    marker = "    expect(push).toContain('respondBattleChallenge(challengeId, accept)');"
    s = s.replace(marker, marker + "\n    expect(push).toContain('respondBattleChallenge(challengeId, accept).catch(() => {})');\n    expect(push).not.toContain(\".then(() => Linking.openURL('keep://notifications'))\");", 1)
p.write_text(s)
