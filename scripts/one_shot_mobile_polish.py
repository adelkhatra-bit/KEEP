from pathlib import Path


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


# ---------------------------------------------------------------------------
# Mes musiques : une Vibe peut être préparée directement pour un service.
# ---------------------------------------------------------------------------
path = 'packages/mobile/src/screens/MyMusicScreen.tsx'
text = read(path)
text = replace_once(
    text,
    "import { sharePlaylist } from '../services/sharingService';\n",
    "import { sharePlaylist } from '../services/sharingService';\nimport { prepareKeylessMusicExport } from '../services/keylessMusicBridge';\n",
    'MyMusic import keyless bridge',
)
text = replace_once(
    text,
    "        {!isAllKeepView ? <TouchableOpacity style={styles.shareMini} onPress={() => sharePlaylist(item.id, item.name).catch(() => Alert.alert('Partager', 'Partage indisponible pour le moment.'))}><Text style={styles.shareMiniText}>↗ PARTAGER</Text></TouchableOpacity> : null}",
    """        {!isAllKeepView ? <View style={styles.collectionActions}>
          <TouchableOpacity style={styles.serviceMini} onPress={async () => {
            try {
              const exportTracks = tracks.length ? tracks : await loadTracks(item);
              if (!exportTracks.length) return Alert.alert('Services musicaux', 'Cette Vibe ne contient encore aucun morceau.');
              await prepareKeylessMusicExport(item.name, exportTracks);
              navigation.navigate('MusicConnections');
            } catch (e: any) {
              Alert.alert('Services musicaux', e?.message ?? 'Impossible de préparer cette Vibe.');
            }
          }}><Text style={styles.serviceMiniText}>♫ SERVICES</Text></TouchableOpacity>
          <TouchableOpacity style={styles.shareMini} onPress={() => sharePlaylist(item.id, item.name).catch(() => Alert.alert('Partager', 'Partage indisponible pour le moment.'))}><Text style={styles.shareMiniText}>↗ PARTAGER</Text></TouchableOpacity>
        </View> : null}""",
    'MyMusic collection actions',
)
text = replace_once(
    text,
    "shareMini:{alignSelf:'flex-end',minHeight:28,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center'},shareMiniText:{color:colors.textSecondary,fontSize:8,fontWeight:'900'},",
    "collectionActions:{flexDirection:'row',justifyContent:'flex-end',gap:6,marginTop:2},serviceMini:{minHeight:28,paddingHorizontal:10,borderRadius:14,borderWidth:1,borderColor:'#A884FA',backgroundColor:'#5B3F8C',alignItems:'center',justifyContent:'center'},serviceMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},shareMini:{minHeight:28,paddingHorizontal:9,borderRadius:14,borderWidth:1,borderColor:'#38D990',backgroundColor:'#123D2C',alignItems:'center',justifyContent:'center'},shareMiniText:{color:'#FFFFFF',fontSize:8,fontWeight:'900'},",
    'MyMusic action styles',
)
write(path, text)


# ---------------------------------------------------------------------------
# Micro natif : plus sensible + session audio qui reste active quand KEEP passe
# derrière TikTok/Snapchat. Aucun faux mouvement sous le plancher de bruit.
# ---------------------------------------------------------------------------
path = 'packages/mobile/src/services/micCapture.ts'
text = read(path)
text = text.replace('const NATIVE_VISUAL_NOISE_FLOOR_DB = -44;', 'const NATIVE_VISUAL_NOISE_FLOOR_DB = -52;', 1)
text = replace_once(
    text,
    "      await Audio.setAudioModeAsync({ allowsRecordingIOS: target, playsInSilentModeIOS: true });",
    """      await Audio.setAudioModeAsync({
        allowsRecordingIOS: target,
        playsInSilentModeIOS: true,
        staysActiveInBackground: target,
        interruptionModeIOS: Audio.InterruptionModeIOS.MixWithOthers,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });""",
    'native background audio mode',
)
text = replace_once(
    text,
    """  const { recording } = await Audio.Recording.createAsync(
    { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },""",
    """  const preset = Audio.RecordingOptionsPresets.HIGH_QUALITY;
  const recognitionOptions = {
    ...preset,
    isMeteringEnabled: true,
    android: { ...preset.android, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000 },
    ios: { ...preset.ios, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000 },
  };

  const { recording } = await Audio.Recording.createAsync(
    recognitionOptions,""",
    'native mono recording options',
)
text = text.replace('Math.pow(Math.max(0, normalized), 0.42) * 1.2', 'Math.pow(Math.max(0, normalized), 0.38) * 1.24', 1)
text = text.replace('    50\n  );', '    40\n  );', 1)
write(path, text)


# Préparer l'autorisation de notification AVANT que l'utilisateur quitte KEEP.
path = 'packages/mobile/src/store/useSessionStore.ts'
text = read(path)
text = replace_once(
    text,
    "import { clearSharedMusicSource, getSharedMusicSource } from '../services/sharedMusicSourceService';\n",
    "import { clearSharedMusicSource, getSharedMusicSource } from '../services/sharedMusicSourceService';\nimport { prepareRecognitionNotifications } from '../services/recognitionNotificationService';\n",
    'session notification import',
)
text = replace_once(
    text,
    "    void cancelAudioCapture();\n    // Une écoute lancée normalement ne doit jamais reprendre une ancienne URL",
    "    void cancelAudioCapture();\n    void prepareRecognitionNotifications();\n    // Une écoute lancée normalement ne doit jamais reprendre une ancienne URL",
    'session notification preparation',
)
write(path, text)


# ---------------------------------------------------------------------------
# Profil propriétaire : alléger la barre haute, déplacer Utilisateur + Suivre +
# Swipe sous le pseudo, QR toujours fermable et transformé en carte d'identité.
# ---------------------------------------------------------------------------
path = 'packages/mobile/src/screens/ProfilePublicScreen.tsx'
text = read(path)
text = replace_once(
    text,
    """      <View style={s.topBar}>
        <View style={s.topTitleRow}><Text style={s.topTitle}>Profil</Text><View style={s.kindBadge}><Text style={s.kindBadgeText}>{PROFILE_KIND_LABELS[user.kind]}</Text></View></View>
        <View style={s.actions}>""",
    """      <View style={s.topBar}>
        <View style={s.topSpacer} />
        <View style={s.actions}>""",
    'own profile compact top bar',
)
text = replace_once(
    text,
    """            <View style={s.usernameLine}><Text style={s.username}>@{user.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
            <View style={s.identityMeta}>
              <TouchableOpacity style={s.followPreview} onPress={() => Alert.alert('Aperçu du profil', 'C’est ici que les autres utilisateurs verront le bouton + Suivre.')} accessibilityLabel="Aperçu bouton suivre"><Text style={s.followPreviewText}>+ Suivre</Text></TouchableOpacity>
              <TouchableOpacity style={s.swipePreview} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.swipePreviewText}>▶ SWIPE</Text></TouchableOpacity>
            </View>
            {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}""",
    """            <View style={s.usernameLine}><Text style={s.username}>@{user.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
            <View style={s.profileMetaRow}>
              <View style={s.profileMetaLeft}>
                <View style={s.kindBadge}><Text style={s.kindBadgeText}>{PROFILE_KIND_LABELS[user.kind]}</Text></View>
                {(user.city || user.countryCode) ? <Text style={s.location}>{[user.city,user.countryCode].filter(Boolean).join(' · ')}</Text> : null}
              </View>
              <View style={s.identityMeta}>
                <TouchableOpacity style={s.followPreview} onPress={() => Alert.alert('Aperçu du profil', 'C’est ici que les autres utilisateurs verront le bouton + Suivre.')} accessibilityLabel="Aperçu bouton suivre"><Text style={s.followPreviewText}>+ Suivre</Text></TouchableOpacity>
                <TouchableOpacity style={s.swipePreview} onPress={openProfileSwipe} accessibilityLabel="Prévisualiser mon KEEP en Swipe"><Text style={s.swipePreviewText}>▶ SWIPE</Text></TouchableOpacity>
              </View>
            </View>""",
    'own profile identity actions',
)
text = replace_once(
    text,
    """        <View style={s.qrShell}>
          <View style={s.qrCard}>""",
    """        <View style={s.qrShell}>
          <TouchableOpacity style={s.qrCloseTop} onPress={() => setQrOpen(false)} accessibilityLabel="Fermer le QR KEEP"><Text style={s.qrCloseTopText}>✕</Text></TouchableOpacity>
          <ScrollView style={s.qrScroll} contentContainerStyle={s.qrScrollContent} showsVerticalScrollIndicator={false}>
          <View style={s.qrCard}>""",
    'QR top close and scroll open',
)
text = replace_once(
    text,
    """            <Text style={s.qrTagline}>Tes goûts te ressemblent.</Text>
          </View>
          <Text style={s.screenshotHint}>Fais une capture d’écran : la carte est pensée pour être partagée en story, message ou affichage.</Text>
          <TouchableOpacity style={s.shareActionPrimary} onPress={shareNative}><Text style={s.shareActionPrimaryText}>PARTAGER MON PROFIL</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setQrOpen(false)}><Text style={s.cancelShareText}>Fermer</Text></TouchableOpacity>
        </View>""",
    """            <Text style={s.qrTagline}>Tes goûts te ressemblent.</Text>
            <Text style={s.qrWebsite}>KEEP · adelkhatra-bit.github.io/KEEP</Text>
          </View>
          <Text style={s.screenshotHint}>Ta carte d’identité musicale : photo, bio, ville, styles et QR. Fais une capture ou partage-la pour donner envie de découvrir ton univers.</Text>
          <TouchableOpacity style={s.shareActionPrimary} onPress={() => { setQrOpen(false); void shareNative(); }}><Text style={s.shareActionPrimaryText}>PARTAGER MON UNIVERS</Text></TouchableOpacity>
          <TouchableOpacity style={s.cancelShare} onPress={() => setQrOpen(false)}><Text style={s.cancelShareText}>FERMER</Text></TouchableOpacity>
          </ScrollView>
        </View>""",
    'QR identity card close',
)
text = text.replace(
    "<Text style={s.shareSubtitle}>Le lien ouvre directement ton profil public. KEEP n’envoie aucun e-mail à ta place.</Text>",
    "<Text style={s.shareSubtitle}>Ton univers musical tient dans un lien. Fais découvrir ton KEEP DNA, tes Vibes, tes réseaux et ce qui te ressemble.</Text>",
    1,
)
text = text.replace(
    "<TouchableOpacity style={s.shareActionPrimary} onPress={shareNative}><Text style={s.shareActionPrimaryText}>PARTAGER LE LIEN</Text></TouchableOpacity>",
    "<TouchableOpacity style={s.shareActionPrimary} onPress={shareNative}><Text style={s.shareActionPrimaryText}>FAIRE DÉCOUVRIR MON KEEP</Text></TouchableOpacity>",
    1,
)
text = text.replace(
    "topBar:{paddingHorizontal:18,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},topTitleRow:{flexDirection:'row',alignItems:'center',gap:7},topTitle:{...typography.h2,color:colors.textPrimary},kindBadge:",
    "topBar:{paddingHorizontal:18,paddingTop:8,paddingBottom:5,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},topSpacer:{flex:1},kindBadge:",
    1,
)
text = text.replace(
    "identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},identityMeta:{flexDirection:'row',alignItems:'center',gap:6,marginTop:5,flexWrap:'wrap'},followPreview:{minHeight:28,paddingHorizontal:11,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},followPreviewText:{color:'#FFF',fontSize:10,fontWeight:'900'},swipePreview:{minHeight:28,paddingHorizontal:11,borderRadius:14,backgroundColor:'#21182F',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},swipePreviewText:{color:'#D9C7FF',fontSize:10,fontWeight:'900'},location:{color:colors.textMuted,fontSize:13,marginTop:5},",
    "identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:6},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',flexShrink:1},identityMeta:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5},followPreview:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#123D2C',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},followPreviewText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},swipePreview:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},swipePreviewText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},location:{color:'#FFFFFF',fontSize:10,fontWeight:'800'},",
    1,
)
text = text.replace(
    "qrShell:{width:'100%',maxWidth:520,alignItems:'center'},qrCard:",
    "qrShell:{width:'100%',maxWidth:520,maxHeight:'96%',alignItems:'center',backgroundColor:'#0E0A14',borderRadius:24,paddingTop:42,paddingHorizontal:4,paddingBottom:6,position:'relative'},qrCloseTop:{position:'absolute',right:10,top:8,width:34,height:34,borderRadius:17,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center',zIndex:20},qrCloseTopText:{color:'#FFFFFF',fontSize:16,fontWeight:'900'},qrScroll:{width:'100%'},qrScrollContent:{alignItems:'center',paddingHorizontal:4,paddingBottom:8},qrCard:",
    1,
)
text = text.replace(
    "qrTagline:{color:'#6A4BA5',fontSize:12,fontWeight:'900',textAlign:'center',marginTop:5},screenshotHint:",
    "qrTagline:{color:'#6A4BA5',fontSize:12,fontWeight:'900',textAlign:'center',marginTop:5},qrWebsite:{color:'#171020',fontSize:8,fontWeight:'900',textAlign:'center',marginTop:8,letterSpacing:.25},screenshotHint:",
    1,
)
write(path, text)


# ---------------------------------------------------------------------------
# Profil d'un autre utilisateur : partager avec la même feuille système,
# alléger le titre et aligner Suivre / Swipe face à la localisation.
# ---------------------------------------------------------------------------
path = 'packages/mobile/src/screens/PublicUserProfileScreen.tsx'
text = read(path)
text = replace_once(
    text,
    "import { shareProfileTrack } from '../services/sharingService';",
    "import { shareProfile, shareProfileTrack } from '../services/sharingService';",
    'public profile share import',
)
text = replace_once(
    text,
    "  const goToOwnProfile = () => navigation.navigate('Main', { screen: 'Profile' });\n",
    """  const goToOwnProfile = () => navigation.navigate('Main', { screen: 'Profile' });
  const shareThisProfile = async () => {
    if (!profile) return;
    try { await shareProfile(profile.username); }
    catch { Alert.alert('Partage', 'Impossible d’ouvrir le partage pour le moment.'); }
  };
""",
    'public profile share function',
)
text = replace_once(
    text,
    """        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View style={styles.topTitleRow}><Text style={styles.topTitle}>Profil</Text><View style={styles.kindBadge}><Text style={styles.kindBadgeText}>{kindLabel}</Text></View></View>
          <View style={styles.placeholder} />
        </View>""",
    """        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Retour"><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View style={styles.topSpacer} />
          <TouchableOpacity style={styles.shareTopButton} onPress={() => void shareThisProfile()} accessibilityLabel="Partager ce profil"><Text style={styles.shareTopText}>↗</Text></TouchableOpacity>
        </View>""",
    'public profile compact top',
)
text = replace_once(
    text,
    """              <View style={styles.usernameLine}><Text style={styles.username}>@{profile.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
              <View style={styles.identityMeta}>
                {viewer?.id !== profile.id && (
                  <TouchableOpacity style={[styles.followButton, isFollowing && styles.followButtonActive]} onPress={toggleFollow} disabled={followBusy} accessibilityLabel={isFollowing ? 'Ne plus suivre' : 'Suivre'}>
                    <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>{isFollowing ? 'Abonné(e)' : '+ Suivre'}</Text>
                  </TouchableOpacity>
                )}
                {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipePreview} onPress={() => setSwipeOpen(true)}><Text style={styles.swipePreviewText}>▶ SWIPE</Text></TouchableOpacity> : null}
              </View>
              {(profile.city || profile.countryCode) && <Text style={styles.location}>{[profile.city, profile.countryCode].filter(Boolean).join(' · ')}</Text>}""",
    """              <View style={styles.usernameLine}><Text style={styles.username}>@{profile.username}</Text><ProfileCertificationBadge tier={certificationTier} compact /></View>
              <View style={styles.profileMetaRow}>
                <View style={styles.profileMetaLeft}>
                  <View style={styles.kindBadge}><Text style={styles.kindBadgeText}>{kindLabel}</Text></View>
                  {(profile.city || profile.countryCode) && <Text style={styles.location}>{[profile.city, profile.countryCode].filter(Boolean).join(' · ')}</Text>}
                </View>
                <View style={styles.identityMeta}>
                  {viewer?.id !== profile.id && (
                    <TouchableOpacity style={[styles.followButton, isFollowing && styles.followButtonActive]} onPress={toggleFollow} disabled={followBusy} accessibilityLabel={isFollowing ? 'Ne plus suivre' : 'Suivre'}>
                      <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>{isFollowing ? 'Abonné(e)' : '+ Suivre'}</Text>
                    </TouchableOpacity>
                  )}
                  {tracks.length > 0 && viewer?.id !== profile.id ? <TouchableOpacity style={styles.swipePreview} onPress={() => setSwipeOpen(true)}><Text style={styles.swipePreviewText}>▶ SWIPE</Text></TouchableOpacity> : null}
                </View>
              </View>""",
    'public profile identity actions',
)
text = text.replace(
    "topBar:{minHeight:56,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{color:colors.textPrimary,fontSize:38,lineHeight:42},topTitleRow:{flexDirection:'row',alignItems:'center',gap:7},topTitle:{...typography.h2,color:colors.textPrimary},kindBadge:{minHeight:21,paddingHorizontal:7,borderRadius:11,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#493369',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#BFA9FF',fontSize:8,fontWeight:'900'},placeholder:{width:34},",
    "topBar:{minHeight:48,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{color:colors.textPrimary,fontSize:38,lineHeight:42},topSpacer:{flex:1},shareTopButton:{width:36,height:36,borderRadius:18,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},shareTopText:{color:'#FFFFFF',fontSize:18,fontWeight:'900'},kindBadge:{minHeight:21,paddingHorizontal:7,borderRadius:11,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},kindBadgeText:{color:'#7CF2B9',fontSize:8,fontWeight:'900'},",
    1,
)
text = text.replace(
    "identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},identityMeta:{flexDirection:'row',alignItems:'center',gap:6,marginTop:5,flexWrap:'wrap'},location:{color:colors.textMuted,fontSize:13,marginTop:5},bio:",
    "identityText:{flex:1,marginLeft:12},usernameLine:{flexDirection:'row',alignItems:'center',gap:7,flexWrap:'wrap'},username:{...typography.h2,color:colors.textPrimary},profileMetaRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:7,marginTop:6},profileMetaLeft:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',flexShrink:1},identityMeta:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:5},location:{color:'#FFFFFF',fontSize:10,fontWeight:'800'},bio:",
    1,
)
text = text.replace(
    "followButton:{minHeight:28,paddingHorizontal:11,borderRadius:14,backgroundColor:colors.primary,borderWidth:1,borderColor:colors.primaryLight,alignItems:'center',justifyContent:'center'},followButtonActive:{backgroundColor:colors.backgroundCard,borderColor:colors.border},followButtonText:{color:'#FFFFFF',fontSize:10,fontWeight:'900'},followButtonTextActive:{color:colors.textSecondary},swipePreview:{minHeight:28,paddingHorizontal:11,borderRadius:14,backgroundColor:'#21182F',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},swipePreviewText:{color:'#D9C7FF',fontSize:10,fontWeight:'900'},",
    "followButton:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#123D2C',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},followButtonActive:{backgroundColor:'#173529',borderColor:'#38D990'},followButtonText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},followButtonTextActive:{color:'#FFFFFF'},swipePreview:{minHeight:28,paddingHorizontal:10,borderRadius:14,backgroundColor:'#5B3F8C',borderWidth:1,borderColor:'#A884FA',alignItems:'center',justifyContent:'center'},swipePreviewText:{color:'#FFFFFF',fontSize:9,fontWeight:'900'},",
    1,
)
write(path, text)

print('one-shot mobile polish applied')
