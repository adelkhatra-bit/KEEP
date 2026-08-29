from pathlib import Path

# Public share landing: use the native KEEP scheme that matches React Navigation,
# while preserving the profile/referral context in query params.
p = Path('packages/mobile/share-profile.html')
s = p.read_text()
old = "const routeProfile=u=>`${KEEP_ROOT}?__keep_route=${encodeURIComponent('/profile/'+u)}`;"
new = "const routeProfile=u=>{const clean=String(u||'').replace(/^@+/,'').trim();return `keep://profile/${encodeURIComponent(clean)}?u=${encodeURIComponent(clean)}&share=profile`;};"
if old not in s:
    if new not in s:
        raise SystemExit('share-profile routeProfile anchor missing')
else:
    s = s.replace(old, new, 1)
if '__keep_route' in s:
    raise SystemExit('obsolete __keep_route still present in share-profile.html')
p.write_text(s)

# Global link lifecycle already mounted by KEEP: stage referral context from both
# cold-start and warm deep links, then claim it after an authenticated session exists.
p = Path('packages/mobile/src/components/SharedMusicHandoff.tsx')
s = p.read_text()
imp = "import { ingestExternalRecognition } from '../services/externalRecognitionIngest';\n"
add = "import { ingestExternalRecognition } from '../services/externalRecognitionIngest';\nimport { claimPendingReferral, stageReferralFromUrl } from '../services/referralService';\nimport { supabase } from '../services/supabaseClient';\n"
if "stageReferralFromUrl" not in s:
    if imp not in s:
        raise SystemExit('SharedMusicHandoff import anchor missing')
    s = s.replace(imp, add, 1)

anchor = "  const handledRef = useRef('');\n\n"
lifecycle = """  const handledRef = useRef('');\n\n  // Profile/referral deep links must keep their attribution even when iOS/Android\n  // hands the URL directly to the already-running app. Navigation consumes the\n  // profile path; this listener only persists/claims the referral context.\n  useEffect(() => {\n    let alive = true;\n    const stage = async (url?: string | null) => {\n      if (!alive || !url) return;\n      const code = await stageReferralFromUrl(url).catch(() => '');\n      if (code) await claimPendingReferral().catch(() => false);\n    };\n    void Linking.getInitialURL().then(stage).catch(() => {});\n    const linkSub = Linking.addEventListener('url', ({ url }) => { void stage(url); });\n    const authSub = supabase?.auth.onAuthStateChange((event) => {\n      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {\n        void claimPendingReferral().catch(() => false);\n      }\n    });\n    return () => {\n      alive = false;\n      linkSub.remove();\n      authSub?.data.subscription.unsubscribe();\n    };\n  }, []);\n\n"""
if "Profile/referral deep links must keep their attribution" not in s:
    if anchor not in s:
        raise SystemExit('SharedMusicHandoff lifecycle anchor missing')
    s = s.replace(anchor, lifecycle, 1)
p.write_text(s)

# Contract tests: lock direct profile routing + referral preservation and prohibit
# the dead __keep_route query router from coming back.
p = Path('packages/mobile/src/screens/__tests__/SharedProfileFollow.contract.test.ts')
s = p.read_text()
if "opens the native app directly on the shared profile" not in s:
    insert = """\n  it('opens the native app directly on the shared profile and preserves referral context', () => {\n    expect(share).toContain('keep://profile/${encodeURIComponent(clean)}');\n    expect(share).toContain('?u=${encodeURIComponent(clean)}&share=profile');\n    expect(share).not.toContain('__keep_route');\n  });\n"""
    s = s.replace("\n  it('preserves the shared profile context across login', () => {", insert + "\n  it('preserves the shared profile context across login', () => {", 1)
p.write_text(s)

p = Path('packages/mobile/src/components/__tests__/ProfileDeepLinkReferral.contract.test.ts')
p.write_text("""// @ts-nocheck\nimport fs from 'fs';\nimport path from 'path';\n\ndescribe('KEEP profile deep-link + referral lifecycle', () => {\n  const handoff = fs.readFileSync(path.resolve(__dirname, '..', 'SharedMusicHandoff.tsx'), 'utf8');\n  const referral = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'referralService.ts'), 'utf8');\n  const navigation = fs.readFileSync(path.resolve(__dirname, '..', '..', 'navigation', 'Navigation.tsx'), 'utf8');\n  const sharing = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'sharingService.ts'), 'utf8');\n\n  it('maps native profile links to the existing public profile route without changing navigation', () => {\n    expect(navigation).toContain("PublicProfile: 'profile/:username'");\n    expect(sharing).toContain("buildShareLanding({ u: cleanUsername(username), share: 'profile' })");\n    expect(sharing).toContain('`${WEB_URL}/share-profile/');\n  });\n\n  it('stages both cold and warm profile/referral links', () => {\n    expect(handoff).toContain('Linking.getInitialURL()');\n    expect(handoff).toContain("Linking.addEventListener('url'");\n    expect(handoff).toContain('stageReferralFromUrl(url)');\n    expect(handoff).toContain("event === 'SIGNED_IN' || event === 'INITIAL_SESSION'");\n    expect(handoff).toContain('claimPendingReferral()');\n  });\n\n  it('recognizes profile-share usernames as referral aliases', () => {\n    expect(referral).toContain("decodeURIComponent(share[1]).toLowerCase() === 'profile'");\n    expect(referral).toContain('decodeURIComponent(profile[1])');\n  });\n});\n""")
