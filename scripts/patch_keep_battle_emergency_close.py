from pathlib import Path
p=Path('packages/mobile/src/components/KeepBattleMobileGameV3.tsx')
s=p.read_text()
anchor="""  const answerArena = async (choice: string) => {"""
helper="""  const closeBattleArena = React.useCallback(() => {\n    void stopTrackPreview();\n    setAudioReady(false);\n    setPending(null);\n    setArena(null);\n    setBrowseOnline(false);\n    setSolo(null);\n    if (onExit) onExit();\n  }, [onExit]);\n\n  const answerArena = async (choice: string) => {"""
if anchor not in s: raise SystemExit('answerArena anchor missing')
s=s.replace(anchor,helper,1)
old1="""      return <View style={s.root}>\n        <View style={s.header}>"""
new1="""      return <View style={s.root}>\n        <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Fermer le Battle\" hitSlop={8} style={s.closeBattle} onPress={closeBattleArena}><Text style={s.closeBattleText}>×</Text></TouchableOpacity>\n        <View style={s.header}>"""
# only replace arena finished branch: use rfind before arena main body
arena_pos=s.index('  if (arena) {')
pos=s.find(old1, arena_pos)
if pos<0: raise SystemExit('arena finished root anchor missing')
s=s[:pos]+s[pos:].replace(old1,new1,1)
old2="""    return <View style={s.root}>\n      <Animated.View pointerEvents=\"none\""""
new2="""    return <View style={s.root}>\n      <TouchableOpacity accessibilityRole=\"button\" accessibilityLabel=\"Fermer le Battle\" hitSlop={8} style={s.closeBattle} onPress={closeBattleArena}><Text style={s.closeBattleText}>×</Text></TouchableOpacity>\n      <Animated.View pointerEvents=\"none\""""
if old2 not in s: raise SystemExit('arena active root anchor missing')
s=s.replace(old2,new2,1)
style_anchor="""root: { width: '100%', flex: 1, paddingBottom: 4 },"""
style_repl="""root: { width: '100%', flex: 1, paddingBottom: 4, position: 'relative' }, closeBattle: { position: 'absolute', top: 0, right: 0, zIndex: 60, width: 48, height: 48, borderRadius: 24, backgroundColor: '#17121D', borderWidth: 1, borderColor: '#51445E', alignItems: 'center', justifyContent: 'center' }, closeBattleText: { color: '#FFF', fontSize: 30, lineHeight: 32, fontWeight: '700', marginTop: -2 },"""
if style_anchor not in s: raise SystemExit('root style anchor missing')
s=s.replace(style_anchor,style_repl,1)
p.write_text(s)
