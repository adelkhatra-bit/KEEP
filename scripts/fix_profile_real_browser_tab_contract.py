# KEEP real-browser profile tab contract patch. Reapply after branch reconciliation; verify generated source before rerunning browser QA.
from pathlib import Path

profile = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
s = profile.read_text()
old = "<View style={s.tabs}>{TABS.map((tab)=><TouchableOpacity key={tab.key} style={s.tab} onPress={()=>switchProfileTab(tab.key)}><Text style={[s.tabText,activeTab===tab.key&&s.tabTextOn]}>{tab.label}</Text>{activeTab===tab.key ? <View style={s.indicator}/> : null}</TouchableOpacity>)}</View>"
new = "<View style={s.tabs}>{TABS.map((tab)=><TouchableOpacity key={tab.key} accessibilityRole=\"tab\" accessibilityLabel={`Profil ${tab.label}`} accessibilityState={{ selected: activeTab === tab.key }} style={s.tab} onPress={()=>switchProfileTab(tab.key)}><Text style={[s.tabText,activeTab===tab.key&&s.tabTextOn]}>{tab.label}</Text>{activeTab===tab.key ? <View style={s.indicator}/> : null}</TouchableOpacity>)}</View>"
if old in s:
    profile.write_text(s.replace(old, new, 1))
elif 'accessibilityLabel={`Profil ${tab.label}`}' not in s:
    raise SystemExit('profile tabs anchor not found')

wf = Path('.github/workflows/mobile-web-importmeta-diagnostic.yml')
w = wf.read_text()
w = w.replace("const vibesTab = page.getByText('Vibes', { exact: true }).first();\n          const albumsTab = page.getByText('Albums', { exact: true }).first();\n          const keepTab = page.getByText('KEEP', { exact: true }).last();", "const vibesTab = page.getByLabel('Profil Vibes');\n          const albumsTab = page.getByLabel('Profil Albums');\n          const keepTab = page.getByLabel('Profil KEEP');")
w = w.replace("if (await page.getByText(/KEEP construit ton univers/i).count() === 0) {\n            throw new Error('KEEP tab did not remount immediately; browser refresh would still be required');\n          }", "const keepSelected = await keepTab.getAttribute('aria-selected');\n          if (keepSelected !== 'true') {\n            throw new Error(`KEEP tab did not become selected immediately: aria-selected=${keepSelected}`);\n          }\n          const keepContentPresent = (await page.getByText(/KEEP construit ton univers/i).count()) > 0 || (await page.getByText(/Tes morceaux KEEP apparaîtront ici/i).count()) > 0;\n          if (!keepContentPresent) {\n            throw new Error('KEEP tab selected but neither populated nor empty KEEP content was mounted');\n          }")
wf.write_text(w)
