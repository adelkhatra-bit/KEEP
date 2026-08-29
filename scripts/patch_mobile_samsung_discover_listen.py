from pathlib import Path

# 1) Samsung/Android web viewport: keep the app root pinned to the visible dynamic viewport.
p = Path('packages/mobile/index.js')
s = p.read_text()
anchor = "import AuthEmailLinkLifecycle from './src/components/AuthEmailLinkLifecycle';\n"
if anchor not in s:
    raise SystemExit('index import anchor missing')
addition = """

// Samsung Internet / Chrome Android changent la hauteur du viewport lorsque
// la barre du navigateur apparaît/disparaît pendant un swipe. Sans ce verrou,
// la racine React Native Web peut devenir plus haute que la zone visible et la
// barre KEEP des 5 onglets se retrouve sous le viewport. On ne touche ni à
// Navigation.tsx ni au design : on stabilise seulement le conteneur web.
if (typeof document !== 'undefined') {
  const styleId = 'keep-mobile-viewport-lock';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      html, body, #root { margin:0; width:100%; height:100%; min-height:100%; }
      html, body { overflow:hidden; overscroll-behavior:none; background:#090610; }
      #root { position:fixed; inset:0; height:100dvh; min-height:100dvh; max-height:100dvh; overflow:hidden; }
      @supports not (height: 100dvh) { #root { height:100vh; min-height:100vh; max-height:100vh; } }
    `;
    document.head.appendChild(style);
  }
  const syncViewport = () => {
    const h = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--keep-visible-height', `${Math.round(h)}px`);
  };
  syncViewport();
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', syncViewport, { passive: true });
}
"""
s = s.replace(anchor, anchor + addition, 1)
p.write_text(s)

# 2) Discovery: immediate feedback, persisted-position fallback first, GPS with timeout.
p = Path('packages/mobile/src/screens/DiscoverScreen.tsx')
s = p.read_text()
old = """  const searchAroundMe = async () => {
    if (searchBusy) return;
    setSearchBusy(true);
    setHasSearched(false);
    setDiscoveryAccess(null);
    setCurrentProfileSnapshot(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Localisation', 'Autorise la localisation pour rechercher les profils autour de toi.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setSearchPosition(next);
      setProfileIndex(0);
      setHasSearched(true);
      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
        await supabase.from('profiles').update({
          approx_lat: Math.round(next.latitude * 1000) / 1000,
          approx_lng: Math.round(next.longitude * 1000) / 1000,
          location_opt_in: true,
        }).eq('id', user.id);
      }
    } catch {
      // A returning/new account can still discover from its last persisted KEEP position
      // when iOS/Android cannot return a fresh GPS fix at this exact moment.
      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
        const { data } = await supabase.from('profiles').select('approx_lat,approx_lng').eq('id', user.id).maybeSingle();
        const lat = normalizeOptionalCoordinate(data?.approx_lat);
        const lng = normalizeOptionalCoordinate(data?.approx_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setSearchPosition({ latitude: lat as number, longitude: lng as number });
          setProfileIndex(0);
          setHasSearched(true);
          setSearchBusy(false);
          return;
        }
      }
      resetSearchResults();
      Alert.alert('Localisation', 'Impossible de récupérer ta position pour le moment. Vérifie l’autorisation GPS puis réessaie.');
    } finally {
      setSearchBusy(false);
    }
  };
"""
new = """  const searchAroundMe = async () => {
    if (searchBusy) return;
    setSearchBusy(true);
    setProfileIndex(0);
    setDiscoveryAccess(null);
    setCurrentProfileSnapshot(null);
    // Retour tactile/visuel immédiat : le bouton ne doit jamais sembler mort.
    setHasSearched(true);

    let persisted: SearchPosition | null = null;
    if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
      try {
        const { data } = await supabase.from('profiles').select('approx_lat,approx_lng').eq('id', user.id).maybeSingle();
        const lat = normalizeOptionalCoordinate(data?.approx_lat);
        const lng = normalizeOptionalCoordinate(data?.approx_lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          persisted = { latitude: lat as number, longitude: lng as number };
          setSearchPosition(persisted);
        }
      } catch {}
    }

    try {
      const permission = await Promise.race([
        Location.requestForegroundPermissionsAsync(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GPS_PERMISSION_TIMEOUT')), 7000)),
      ]);
      if (permission.status !== 'granted') {
        if (!persisted) setSearchPosition(null);
        Alert.alert('Localisation', persisted
          ? 'KEEP utilise ta dernière position enregistrée. Tu peux autoriser le GPS plus tard pour l’actualiser.'
          : 'Le GPS n’est pas autorisé. Les profils publics restent disponibles et tu peux rechercher un pseudo directement.');
        return;
      }
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('GPS_FIX_TIMEOUT')), 9000)),
      ]);
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setSearchPosition(next);
      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
        await supabase.from('profiles').update({
          approx_lat: Math.round(next.latitude * 1000) / 1000,
          approx_lng: Math.round(next.longitude * 1000) / 1000,
          location_opt_in: true,
        }).eq('id', user.id);
      }
    } catch {
      if (!persisted) setSearchPosition(null);
      Alert.alert('Localisation', persisted
        ? 'Position GPS lente : KEEP utilise ta dernière position enregistrée pour cette recherche.'
        : 'Position GPS indisponible. Les profils publics restent visibles et la recherche par pseudo fonctionne quand même.');
    } finally {
      setSearchBusy(false);
    }
  };
"""
if old not in s:
    raise SystemExit('discover search function anchor missing')
s = s.replace(old, new, 1)
# Make touch targets mobile-grade without redesign.
s = s.replace("searchButton:{height:32,", "searchButton:{minHeight:48,", 1)
s = s.replace("searchButtonText:{color:'#FFFFFF',fontSize:9,", "searchButtonText:{color:'#FFFFFF',fontSize:14,", 1)
s = s.replace("radiusChoice:{minWidth:29,minHeight:21,", "radiusChoice:{minWidth:44,minHeight:44,", 1)
s = s.replace("radiusChoiceText:{color:'#FFFFFF',fontSize:7,", "radiusChoiceText:{color:'#FFFFFF',fontSize:12,", 1)
p.write_text(s)

# 3) Listen: prime WebAudio synchronously from the tap before async permission/capture.
p = Path('packages/mobile/src/services/micCapture.ts')
s = p.read_text()
insert_anchor = "function getWebAudioCtx(): AudioContext {\n"
if insert_anchor not in s:
    raise SystemExit('mic web context anchor missing')
prime = """export function prepareAudioCaptureFromUserGesture(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const ctx = getWebAudioCtx();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  } catch {
    // La capture réelle remontera une erreur lisible si le navigateur refuse.
  }
}

"""
# insert after getWebAudioCtx function block
needle = """function getWebAudioCtx(): AudioContext {
  if (webAudioCtx && webAudioCtx.state !== 'closed') return webAudioCtx;
  const AudioCtxCtor: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  webAudioCtx = new AudioCtxCtor();
  return webAudioCtx;
}

"""
if needle not in s:
    raise SystemExit('mic context block missing')
s = s.replace(needle, needle + prime, 1)
p.write_text(s)

p = Path('packages/mobile/src/store/useSessionStore.ts')
s = p.read_text()
s = s.replace(
    "import { cancelAudioCapture, captureAudioSample, MicCaptureCancelledError } from '../services/micCapture';",
    "import { cancelAudioCapture, captureAudioSample, MicCaptureCancelledError, prepareAudioCaptureFromUserGesture } from '../services/micCapture';",
    1,
)
start_anchor = """  startSession: () => {
    clearTimers();
"""
if start_anchor not in s:
    raise SystemExit('start session anchor missing')
s = s.replace(start_anchor, """  startSession: () => {
    // Doit être appelé dans le geste tactile d'origine pour Samsung Internet /
    // Chrome Android, sinon WebAudio peut rester suspendu après le clic.
    prepareAudioCaptureFromUserGesture();
    clearTimers();
""", 1)
p.write_text(s)

# Regression contracts.
p = Path('packages/mobile/src/screens/__tests__/MobileSamsungReliability.contract.test.ts')
p.write_text("""// @ts-nocheck
import fs from 'fs';
import path from 'path';

describe('KEEP Samsung mobile reliability', () => {
  const index = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'index.js'), 'utf8');
  const discover = fs.readFileSync(path.resolve(__dirname, '..', 'DiscoverScreen.tsx'), 'utf8');
  const mic = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'micCapture.ts'), 'utf8');
  const session = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useSessionStore.ts'), 'utf8');

  it('pins React Native Web to the dynamic Android viewport', () => {
    expect(index).toContain('height:100dvh');
    expect(index).toContain('position:fixed; inset:0');
    expect(index).toContain('visualViewport');
    expect(index).toContain('overscroll-behavior:none');
  });

  it('keeps Discover responsive even when Samsung GPS is slow or denied', () => {
    expect(discover).toContain("setHasSearched(true)");
    expect(discover).toContain('GPS_PERMISSION_TIMEOUT');
    expect(discover).toContain('GPS_FIX_TIMEOUT');
    expect(discover).toContain('dernière position enregistrée');
    expect(discover).toContain('minHeight:48');
    expect(discover).toContain('minWidth:44,minHeight:44');
  });

  it('primes WebAudio directly from the Listen tap', () => {
    expect(mic).toContain('prepareAudioCaptureFromUserGesture');
    expect(mic).toContain("if (ctx.state === 'suspended') void ctx.resume()");
    expect(session).toContain('prepareAudioCaptureFromUserGesture();');
  });
});
""")
