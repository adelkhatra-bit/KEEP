from pathlib import Path
import subprocess


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'anchor missing: {label}')
    return text.replace(old, new, 1)


# Rejoue le polish mobile precedent (profil compact, partage, micro, export services)
# puis corrige son unique incompatibilite TypeScript expo-av.
subprocess.run(['python3', 'scripts/one_shot_mobile_polish.py'], check=True)

path = 'packages/mobile/src/services/micCapture.ts'
text = read(path)
text = text.replace("        interruptionModeIOS: Audio.InterruptionModeIOS.MixWithOthers,\n", "", 1)
write(path, text)

# ---------------------------------------------------------------------------
# QR KEEP : carte noire, contour violet, texte blanc/violet, QR inverse.
# ---------------------------------------------------------------------------
path = 'packages/mobile/src/screens/ProfilePublicScreen.tsx'
text = read(path)
text = text.replace(
    '<View style={s.qrBox}><QRCode value={publicProfileLink} size={164} color="#0E0A14" backgroundColor="#FFFFFF" /></View>',
    '<View style={s.qrBox}><QRCode value={publicProfileLink} size={164} color="#FFFFFF" backgroundColor="#0E0A14" /></View>',
    1,
)
text = text.replace(
    "qrCard:{width:'100%',backgroundColor:'#F7F4FF',borderRadius:26,padding:20}",
    "qrCard:{width:'100%',backgroundColor:'#0E0A14',borderRadius:26,padding:20,borderWidth:1,borderColor:'#8B5CF6'}",
    1,
)
text = text.replace("qrLogo:{color:'#171020'", "qrLogo:{color:'#FFFFFF'", 1)
text = text.replace("qrDnaLabel:{color:'#6A4BA5'", "qrDnaLabel:{color:'#B79CFF'", 1)
text = text.replace("qrAvatar:{width:64,height:64,borderRadius:32,backgroundColor:'#E7DFFF'}", "qrAvatar:{width:64,height:64,borderRadius:32,backgroundColor:'#241936',borderWidth:1,borderColor:'#8B5CF6'}", 1)
text = text.replace("qrAvatarText:{color:'#6A4BA5'", "qrAvatarText:{color:'#B79CFF'", 1)
text = text.replace("qrUsername:{color:'#171020'", "qrUsername:{color:'#FFFFFF'", 1)
text = text.replace("qrKind:{color:'#6A4BA5'", "qrKind:{color:'#B79CFF'", 1)
text = text.replace("qrLocation:{color:'#6B6377'", "qrLocation:{color:'#E1D8EA'", 1)
text = text.replace("qrBio:{color:'#4D4655'", "qrBio:{color:'#F4EFF8'", 1)
text = text.replace("qrGenre:{backgroundColor:'#E9E0FF',borderRadius:999,paddingHorizontal:8,paddingVertical:4}", "qrGenre:{backgroundColor:'#211831',borderRadius:999,paddingHorizontal:8,paddingVertical:4,borderWidth:1,borderColor:'#6E4BA5'}", 1)
text = text.replace("qrGenreText:{color:'#5B3E94'", "qrGenreText:{color:'#D9C7FF'", 1)
text = text.replace("qrBox:{alignSelf:'center',marginTop:18,padding:12,backgroundColor:'#FFF',borderRadius:16}", "qrBox:{alignSelf:'center',marginTop:18,padding:12,backgroundColor:'#0E0A14',borderRadius:16,borderWidth:2,borderColor:'#8B5CF6'}", 1)
text = text.replace("qrScan:{color:'#171020'", "qrScan:{color:'#FFFFFF'", 1)
text = text.replace("qrTagline:{color:'#6A4BA5'", "qrTagline:{color:'#B79CFF'", 1)
text = text.replace("qrWebsite:{color:'#171020'", "qrWebsite:{color:'#FFFFFF'", 1)
write(path, text)

# ---------------------------------------------------------------------------
# Decouvertes : recherche autour de moi + jauge kilometres + carte compacte.
# ---------------------------------------------------------------------------
path = 'packages/mobile/src/screens/DiscoverScreen.tsx'
text = read(path)
text = replace_once(
    text,
    "import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';\n",
    "import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';\nimport * as Location from 'expo-location';\n",
    'discover location import',
)
text = replace_once(
    text,
    "  favoriteGenres: string[];\n  favoriteArtists: string[];\n};",
    "  favoriteGenres: string[];\n  favoriteArtists: string[];\n  approxLat?: number;\n  approxLng?: number;\n};",
    'discover profile coordinates type',
)
text = replace_once(
    text,
    "    favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres : [],\n    favoriteArtists: Array.isArray(row.favorite_artists) ? row.favorite_artists : [],\n  };",
    "    favoriteGenres: Array.isArray(row.favorite_genres) ? row.favorite_genres : [],\n    favoriteArtists: Array.isArray(row.favorite_artists) ? row.favorite_artists : [],\n    approxLat: Number.isFinite(Number(row.approx_lat)) ? Number(row.approx_lat) : undefined,\n    approxLng: Number.isFinite(Number(row.approx_lng)) ? Number(row.approx_lng) : undefined,\n  };",
    'discover normalize coordinates',
)
text = replace_once(
    text,
    "const FREE_LOCAL_DISCOVERY_LIMIT = 3;\n",
    """const FREE_LOCAL_DISCOVERY_LIMIT = 3;
const DISCOVERY_RADII = [10, 50, 100, 300, 1000, 20000] as const;

type SearchPosition = { latitude: number; longitude: number };

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
""",
    'discover distance helpers',
)
text = replace_once(
    text,
    "  const [currentProfileSnapshot, setCurrentProfileSnapshot] = useState<PublicProfileSnapshot | null>(null);\n",
    """  const [currentProfileSnapshot, setCurrentProfileSnapshot] = useState<PublicProfileSnapshot | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(100);
  const [searchPosition, setSearchPosition] = useState<SearchPosition | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
""",
    'discover search state',
)
text = text.replace(
    ".select('id,username,avatar_url,bio,city,country_code,kind,favorite_genres,favorite_artists')",
    ".select('id,username,avatar_url,bio,city,country_code,kind,favorite_genres,favorite_artists,approx_lat,approx_lng')",
    1,
)
text = replace_once(
    text,
    "  const currentProfile = profiles.length ? profiles[profileIndex % profiles.length] : null;\n",
    """  const filteredProfiles = useMemo(() => {
    if (!searchPosition) return profiles;
    const ranked = profiles.map((profile) => {
      const hasCoordinates = Number.isFinite(profile.approxLat) && Number.isFinite(profile.approxLng);
      const distance = hasCoordinates
        ? distanceKm(searchPosition.latitude, searchPosition.longitude, profile.approxLat as number, profile.approxLng as number)
        : null;
      return { profile, distance };
    }).filter((item) => radiusKm >= 20000 ? true : item.distance !== null && item.distance <= radiusKm);
    ranked.sort((a, b) => {
      if (a.distance === null && b.distance === null) return a.profile.username.localeCompare(b.profile.username);
      if (a.distance === null) return 1;
      if (b.distance === null) return -1;
      return a.distance - b.distance;
    });
    return ranked.map((item) => item.profile);
  }, [profiles, radiusKm, searchPosition]);

  const currentProfile = filteredProfiles.length ? filteredProfiles[profileIndex % filteredProfiles.length] : null;
""",
    'discover filtered profiles',
)
text = replace_once(
    text,
    "  const nextProfile = () => {\n    setFollowNotice('');\n    if (profiles.length) setProfileIndex((value) => (value + 1) % profiles.length);\n  };",
    """  const searchAroundMe = async () => {
    if (searchBusy) return;
    setSearchBusy(true);
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
      if (supabase && user?.id && !isLocalGuest && !isDemoMode) {
        await supabase.from('profiles').update({
          approx_lat: Math.round(next.latitude * 1000) / 1000,
          approx_lng: Math.round(next.longitude * 1000) / 1000,
          location_opt_in: true,
        }).eq('id', user.id);
      }
    } catch {
      Alert.alert('Localisation', 'Impossible de récupérer ta position pour le moment.');
    } finally {
      setSearchBusy(false);
    }
  };

  const nextProfile = () => {
    setFollowNotice('');
    if (filteredProfiles.length) setProfileIndex((value) => (value + 1) % filteredProfiles.length);
  };""",
    'discover search action',
)
text = replace_once(
    text,
    "  const proximity = currentProfile\n    ? user?.city && currentProfile.city && user.city.toLowerCase() === currentProfile.city.toLowerCase()",
    "  const currentDistance = currentProfile && searchPosition && Number.isFinite(currentProfile.approxLat) && Number.isFinite(currentProfile.approxLng)\n    ? distanceKm(searchPosition.latitude, searchPosition.longitude, currentProfile.approxLat as number, currentProfile.approxLng as number)\n    : null;\n\n  const proximity = currentProfile\n    ? currentDistance !== null\n      ? `${currentDistance < 1 ? '< 1' : Math.round(currentDistance)} km · ${[currentProfile.city, currentProfile.countryCode].filter(Boolean).join(' · ') || 'autour de toi'}`\n      : user?.city && currentProfile.city && user.city.toLowerCase() === currentProfile.city.toLowerCase()",
    'discover proximity distance',
)
text = replace_once(
    text,
    "        </View>\n\n        {accessLoading || loadingProfiles ? <ActivityIndicator color={colors.primaryLight} />",
    """        </View>

        <View style={styles.searchPanel}>
          <View style={styles.searchTopRow}>
            <TouchableOpacity style={styles.searchButton} onPress={() => void searchAroundMe()} disabled={searchBusy} accessibilityLabel="Rechercher des profils autour de moi">
              {searchBusy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.searchButtonText}>⌖ RECHERCHER</Text>}
            </TouchableOpacity>
            <View style={styles.radiusValue}><Text style={styles.radiusValueText}>{radiusKm >= 20000 ? 'MONDE' : `${radiusKm} KM`}</Text></View>
          </View>
          <View style={styles.radiusTrack}><View style={[styles.radiusFill, { width: `${(DISCOVERY_RADII.indexOf(radiusKm as any) / (DISCOVERY_RADII.length - 1)) * 100}%` }]} /></View>
          <View style={styles.radiusChoices}>{DISCOVERY_RADII.map((value) => (
            <TouchableOpacity key={value} style={[styles.radiusChoice, radiusKm === value && styles.radiusChoiceOn]} onPress={() => { setRadiusKm(value); setProfileIndex(0); }}>
              <Text style={[styles.radiusChoiceText, radiusKm === value && styles.radiusChoiceTextOn]}>{value >= 20000 ? 'Monde' : value}</Text>
            </TouchableOpacity>
          ))}</View>
          <Text style={styles.searchHint}>{searchPosition ? `${filteredProfiles.length} profil${filteredProfiles.length > 1 ? 's' : ''} dans ce rayon` : 'Choisis un rayon puis appuie sur Rechercher.'}</Text>
        </View>

        {accessLoading || loadingProfiles ? <ActivityIndicator color={colors.primaryLight} />""",
    'discover search UI',
)
text = text.replace("<Text style={styles.bio} numberOfLines={3}>{currentProfile.bio}</Text>", "<Text style={styles.bio} numberOfLines={2}>{currentProfile.bio}</Text>", 1)
text = text.replace("[...currentProfile.favoriteGenres,...currentProfile.favoriteArtists].slice(0,5)", "[...currentProfile.favoriteGenres,...currentProfile.favoriteArtists].slice(0,4)", 1)
text = text.replace(
    "<View style={styles.emptyCard}><Text style={styles.mutedHint}>Aucun profil public disponible pour le moment.</Text></View>",
    "<View style={styles.emptyCard}><Text style={styles.mutedHint}>{searchPosition ? 'Aucun profil public dans ce rayon. Élargis la jauge puis relance la recherche.' : 'Aucun profil public disponible pour le moment.'}</Text></View>",
    1,
)
text = text.replace(
    "container:{flex:1,backgroundColor:colors.background},content:{padding:spacing.xl,flexGrow:1,paddingBottom:spacing.xxxl},title:{...typography.h1,color:colors.textPrimary,marginBottom:spacing.xl},section:{marginTop:spacing.xxl}",
    "container:{flex:1,backgroundColor:colors.background},content:{padding:14,flexGrow:1,paddingBottom:18},title:{...typography.h2,color:colors.textPrimary,marginBottom:8},section:{marginTop:14}",
    1,
)
text = text.replace("discoveryHeader:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:spacing.md}", "discoveryHeader:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8}", 1)
text = replace_once(
    text,
    "  lockCard:{padding:20,borderRadius:22,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',alignItems:'center'},",
    "  searchPanel:{marginBottom:9,padding:9,borderRadius:16,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},searchTopRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},searchButton:{minHeight:34,paddingHorizontal:14,borderRadius:17,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},searchButtonText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},radiusValue:{minHeight:30,paddingHorizontal:11,borderRadius:15,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},radiusValueText:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},radiusTrack:{height:4,borderRadius:2,backgroundColor:'#332A3C',marginTop:9,overflow:'hidden'},radiusFill:{height:4,borderRadius:2,backgroundColor:'#A884FA'},radiusChoices:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:6},radiusChoice:{minWidth:31,minHeight:24,paddingHorizontal:4,borderRadius:12,alignItems:'center',justifyContent:'center'},radiusChoiceOn:{backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA'},radiusChoiceText:{color:'#A99DB9',fontSize:8,fontWeight:'800'},radiusChoiceTextOn:{color:'#FFFFFF'},searchHint:{color:'#C8C0D3',fontSize:8,textAlign:'center',marginTop:4},\n  lockCard:{padding:16,borderRadius:20,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369',alignItems:'center'},",
    'discover search styles',
)
text = text.replace(
    "swipeCard:{height:430,borderRadius:26",
    "swipeCard:{height:300,borderRadius:22",
    1,
)
text = text.replace("heroLetter:{color:colors.primaryLight,fontSize:82,fontWeight:'900'}", "heroLetter:{color:colors.primaryLight,fontSize:64,fontWeight:'900'}", 1)
text = text.replace("heroInfo:{padding:18,paddingTop:90", "heroInfo:{padding:12,paddingTop:58", 1)
text = text.replace("heroName:{color:'#FFF',fontSize:26,fontWeight:'900'}", "heroName:{color:'#FFF',fontSize:21,fontWeight:'900'}", 1)
text = text.replace("bio:{color:'#C8C0D3',fontSize:12,lineHeight:18,marginTop:8}", "bio:{color:'#C8C0D3',fontSize:10,lineHeight:14,marginTop:5}", 1)
text = text.replace("chips:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:10}", "chips:{flexDirection:'row',flexWrap:'wrap',gap:4,marginTop:6}", 1)
text = text.replace("chip:{paddingHorizontal:8,paddingVertical:5", "chip:{paddingHorizontal:7,paddingVertical:3", 1)
text = text.replace("swipeActions:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:16,marginTop:14}", "swipeActions:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,marginTop:8}", 1)
text = text.replace("roundAction:{width:54,height:54,borderRadius:27", "roundAction:{width:44,height:44,borderRadius:22", 1)
text = text.replace("profileAction:{minHeight:46,paddingHorizontal:18,borderRadius:23", "profileAction:{minHeight:40,paddingHorizontal:16,borderRadius:20", 1)
text = text.replace("locationHint:{marginTop:16,padding:12", "locationHint:{marginTop:9,padding:9", 1)
text = text.replace("footerNote:{color:colors.textMuted,fontSize:10,lineHeight:15,textAlign:'center',marginTop:spacing.xxl}", "footerNote:{color:colors.textMuted,fontSize:8,lineHeight:11,textAlign:'center',marginTop:12}", 1)
write(path, text)

# ---------------------------------------------------------------------------
# Reglages profil : quand l'utilisateur choisit sa position, enregistrer aussi
# les coordonnees approximatives pour que la jauge Decouvertes fonctionne.
# ---------------------------------------------------------------------------
path = 'packages/mobile/src/screens/ProfileSettingsMobileScreen.tsx'
text = read(path)
text = replace_once(
    text,
    "      const places = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });\n      applyPlace(places[0]);",
    """      const places = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      applyPlace(places[0]);
      if (supabase && hasRealAccount) {
        await supabase.from('profiles').update({
          approx_lat: Math.round(position.coords.latitude * 1000) / 1000,
          approx_lng: Math.round(position.coords.longitude * 1000) / 1000,
          location_opt_in: true,
        }).eq('id', user.id);
      }""",
    'persist approximate GPS',
)
write(path, text)

# ---------------------------------------------------------------------------
# Apercu de lien social : logo KEEP dans les metadonnees de partage.
# ---------------------------------------------------------------------------
path = 'packages/mobile/share-profile.html'
text = read(path)
text = replace_once(
    text,
    '  <meta property="og:description" content="Découvre son univers musical et son KEEP DNA." />\n',
    '  <meta property="og:description" content="Découvre son univers musical et son KEEP DNA." />\n  <meta property="og:image" content="https://adelkhatra-bit.github.io/KEEP/share-profile/keep-logo.png" />\n',
    'share profile og image',
)
text = text.replace('  <meta name="twitter:card" content="summary" />', '  <meta name="twitter:card" content="summary_large_image" />', 1)
text = replace_once(
    text,
    '  <meta name="twitter:description" content="Découvre son univers musical et son KEEP DNA." />\n',
    '  <meta name="twitter:description" content="Découvre son univers musical et son KEEP DNA." />\n  <meta name="twitter:image" content="https://adelkhatra-bit.github.io/KEEP/share-profile/keep-logo.png" />\n',
    'share profile twitter image',
)
write(path, text)

path = '.github/workflows/web-preview-pages.yml'
text = read(path)
text = replace_once(
    text,
    "          cp packages/mobile/share-profile.html _site/share-profile/index.html\n",
    "          cp packages/mobile/share-profile.html _site/share-profile/index.html\n          cp packages/mobile/assets/icon.png _site/share-profile/keep-logo.png\n",
    'copy KEEP social image',
)
write(path, text)

print('discovery + QR + mobile listen finish applied')
