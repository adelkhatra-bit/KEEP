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
w = w.replace("const vibesTab = page.getByText('Vibes', { exact: true }).first();", "const vibesTab = page.getByLabel('Profil Vibes');")
w = w.replace("const albumsTab = page.getByText('Albums', { exact: true }).first();", "const albumsTab = page.getByLabel('Profil Albums');")
w = w.replace("const keepTab = page.getByText('KEEP', { exact: true }).last();", "const keepTab = page.getByLabel('Profil KEEP');")
old_check = """if (await page.getByText(/KEEP construit ton univers/i).count() === 0) {
              throw new Error('KEEP tab did not remount immediately; browser refresh would still be required');
            }"""
new_check = """const keepSelected = await keepTab.getAttribute('aria-selected');
            if (keepSelected !== 'true') {
              throw new Error(`KEEP tab did not become selected immediately: aria-selected=${keepSelected}`);
            }
            const keepContentPresent = (await page.getByText(/KEEP construit ton univers/i).count()) > 0 || (await page.getByText(/Tes morceaux KEEP apparaîtront ici/i).count()) > 0;
            if (!keepContentPresent) {
              throw new Error('KEEP tab selected but neither populated nor empty KEEP content was mounted');
            }"""
if old_check in w:
    w = w.replace(old_check, new_check, 1)
elif "KEEP tab did not remount immediately" in w:
    raise SystemExit('KEEP assertion anchor found with unexpected formatting')
if "getByLabel('Profil KEEP')" not in w or 'aria-selected' not in w:
    raise SystemExit('browser workflow patch incomplete')
wf.write_text(w)
