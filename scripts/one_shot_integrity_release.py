from pathlib import Path

profile = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
audit = Path('.github/workflows/mobile-full-loop-audit.yml')

p = profile.read_text(encoding='utf-8')
a = audit.read_text(encoding='utf-8')

# The first number on the owner's profile must represent ALL public music.
# Previously it showed only direct microphone KEEP (4 for adel4A), while 3
# public KEEP coming from other users were listed below but excluded from the
# headline count. Nothing was deleted: this was a display/counting split.
old = "  const profileOwnKeepCount = publicSnapshot?.directPublicKeeps ?? localPublicOwnKeepCount;\n  const profileUserKeepCount = publicSnapshot?.socialPublicKeeps ?? localPublicUserKeepCount;"
new = "  const profileOwnKeepCount = publicSnapshot?.directPublicKeeps ?? localPublicOwnKeepCount;\n  const profileUserKeepCount = publicSnapshot?.socialPublicKeeps ?? localPublicUserKeepCount;\n  const profileTotalKeepCount = publicSnapshot?.totalPublicKeeps ?? (localPublicOwnKeepCount + localPublicUserKeepCount);"
if old not in p:
    raise SystemExit('profile counter anchor missing')
p = p.replace(old, new, 1)

old = "          <Stat value={profileOwnKeepCount} label=\"KEEP\"/>\n          <Stat value={profileUserKeepCount} label=\"KEEP utilisateurs\"/>"
new = "          <Stat value={profileTotalKeepCount} label=\"KEEP total\"/>\n          <Stat value={profileUserKeepCount} label=\"KEEP utilisateurs\"/>"
if old not in p:
    raise SystemExit('profile stat anchor missing')
p = p.replace(old, new, 1)

# Strengthen the existing 390x844 loop so a release cannot silently ship an
# older Discover/Profile layout again. These checks run BEFORE we accept a
# release commit in the one-shot job below.
old = """            for (const [label, file] of [['Découvertes','04-discover'],['Playlists','05-playlists'],['Soirées','06-parties'],['Profil','07-profile']]) {
              await textLast(label, { exact: true }).click();
              await page.waitForTimeout(350);
              await shot(file);
            }

            await page.getByLabel('Notifications').last().waitFor({ state: 'visible', timeout: 10000 });"""
new = """            for (const [label, file] of [['Découvertes','04-discover'],['Playlists','05-playlists'],['Soirées','06-parties'],['Profil','07-profile']]) {
              await textLast(label, { exact: true }).click();
              await page.waitForTimeout(350);
              await shot(file);
            }

            // Garde-fou produit : Découvertes doit toujours livrer la recherche
            // locale + jauge dans le build réellement testé en 390x844.
            await textLast('Découvertes', { exact: true }).click();
            const discoverSearch = textLast('⌖ RECHERCHER', { exact: true });
            await assertInViewport(discoverSearch, 'Découvertes / Rechercher', 844);
            await textLast('100', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
            await textLast('Monde', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
            await shot('04b-discover-search-radius');

            // Garde-fou produit : sur SON propre profil, pas de faux +Suivre.
            // Le partage descend dans les actions et le menu reste visible.
            await textLast('Profil', { exact: true }).click();
            await page.getByLabel('Menu du profil').last().waitFor({ state: 'visible', timeout: 10000 });
            await textLast('PARTAGER', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
            if (await textLast('+ Suivre', { exact: true }).isVisible().catch(() => false)) throw new Error('Profil propriétaire: + Suivre ne doit jamais être affiché');

            await page.getByLabel('Notifications').last().waitFor({ state: 'visible', timeout: 10000 });"""
if old not in a:
    raise SystemExit('mobile loop discover/profile anchor missing')
a = a.replace(old, new, 1)

# Existing edit-profile checks must accept the new owner action label.
a = a.replace("page.getByLabel('Modifier le profil').last().click()", "page.getByLabel(/Modifier (mon|le) profil/).last().click()")

# Report explicit new gates.
old = "              'Location helpers: PASS',\n              'Advanced settings -> Playlists: PASS',"
new = "              'Location helpers: PASS',\n              'Discover search + radius visible 390x844: PASS',\n              'Owner profile header no self-follow: PASS',\n              'Advanced settings -> Playlists: PASS',"
if old not in a:
    raise SystemExit('mobile loop report anchor missing')
a = a.replace(old, new, 1)

profile.write_text(p, encoding='utf-8')
audit.write_text(a, encoding='utf-8')
print('integrity release patch ready')
