from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly once, got {count}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------------
# OFFERS: remove repetition, surface discovery attribution, collapse details.
# ---------------------------------------------------------------------------
offers_path = Path('packages/mobile/src/screens/OffersScreen.tsx')
offers = offers_path.read_text()

offers = replace_once(
    offers,
    """function benefitsFor(planCode: string, rules: CommercialRules, funnel: CreditFunnel): string[] {
  const eventFollowers = rules.followerTiers[3] || 500;
  if (planCode === 'FREE') return [
    'Écoute et reconnaissance illimitées : tes sessions continuent même sans crédit.',
    `${rules.freeDiscoveryProfiles} profils Découvertes offerts, puis Premium ou bonus gagnés avec ta communauté.`,
    `${funnel.guestSuccessLimit} KEEP avant inscription + ${funnel.signupBonusSuccesses} après création du compte.`,
    'Recharge tes Free en partageant KEEP, en faisant grandir tes abonnés et en remportant des KEEP Battles.',
  ];
  if (planCode === 'PREMIUM') return [
    'Écoute illimitée et profil musical étendu en illimité.',
    `Jusqu’à ${rules.premiumDailyDownloads} téléchargements par jour.`,
    'Découvertes de profils en illimité.',
    `${rules.premiumSmartSortTrials} essais de KEEP Vibes : KEEP classe automatiquement ta musique par ambiances et styles.`,
    'Profil reste « Utilisateur » : DJ / Artiste / Créateur se débloquent avec Creator Pro.',
  ];
  if (planCode === 'CREATOR_PRO') return [
    'Tout Premium + téléchargements illimités.',
    'KEEP Vibes illimité : classement automatique par styles/ambiances, albums intelligents et renommage libre.',
    'Choisis ton profil : DJ, Artiste, Créateur ou Producteur.',
    `À partir de ${eventFollowers} abonnés : 1 soirée créée par mois + notifications aux abonnés.`,
    'Analytics et fonctions créateur avancées.',
  ];
  if (planCode === 'VENUE_PRO') return [
    'Tout Creator Pro + téléchargements et KEEP Vibes illimités.',
    'Profil Lieu / établissement et outils professionnels.',
    `À partir de ${eventFollowers} abonnés : soirées et événements en illimité.`,
    'QR, communauté et analytics avancés.',
    `Les fonctions Audience Pro demandent aussi une vraie communauté : seuil actuel ${rules.audienceProThreshold} abonnés.`,
  ];
  return [];
}""",
    """function benefitsFor(planCode: string, rules: CommercialRules, funnel: CreditFunnel): string[] {
  const eventFollowers = rules.followerTiers[3] || 500;
  if (planCode === 'FREE') return [
    `Écouter, reconnaître et PASSER : 0 Free. GARDER depuis Écouter : 1 Free.`,
    `${rules.freeDiscoveryProfiles} profils Découvertes offerts au démarrage.`,
    `${funnel.guestSuccessLimit} Free avant inscription + ${funnel.signupBonusSuccesses} après création du compte.`,
  ];
  if (planCode === 'PREMIUM') return [
    `Jusqu’à ${rules.premiumDailyDownloads} téléchargements par jour.`,
    'Découvertes de profils en illimité.',
    `${rules.premiumSmartSortTrials} essais de KEEP Vibes.`,
  ];
  if (planCode === 'CREATOR_PRO') return [
    'Téléchargements et KEEP Vibes illimités.',
    'Profils DJ, Artiste, Créateur ou Producteur.',
    `À partir de ${eventFollowers} abonnés : 1 soirée créée par mois et notifications aux abonnés.`,
    'Analytics et outils créateur avancés.',
  ];
  if (planCode === 'VENUE_PRO') return [
    'Profil Lieu / établissement et outils professionnels.',
    `À partir de ${eventFollowers} abonnés : soirées et événements en illimité.`,
    'QR, communauté et analytics avancés.',
    `Fonctions Audience Pro à partir de ${rules.audienceProThreshold} abonnés.`,
  ];
  return [];
}

function planSummary(planCode: string): string {
  if (planCode === 'PREMIUM') return 'Pour profiter de KEEP au quotidien avec davantage de liberté.';
  if (planCode === 'CREATOR_PRO') return 'Pour les DJs, artistes et créateurs qui développent leur communauté.';
  if (planCode === 'VENUE_PRO') return 'Pour les lieux et établissements qui organisent et animent leur audience.';
  return 'Les fonctions essentielles de KEEP pour commencer.';
}""",
    'deduplicate plan benefits',
)

offers = replace_once(
    offers,
    """  const [freeExpanded, setFreeExpanded] = useState(false);
  const [battleExpanded, setBattleExpanded] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);""",
    """  const [freeExpanded, setFreeExpanded] = useState(false);
  const [battleExpanded, setBattleExpanded] = useState(false);
  const [discoveryExpanded, setDiscoveryExpanded] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState(false);
  const [expandedPlanCode, setExpandedPlanCode] = useState<string | null>(null);""",
    'offers disclosure state',
)

promise = """          <View style={s.promiseCard}>
            <Text style={s.promiseEyebrow}>KEEP</Text>
            <Text style={s.promiseTitle}>Écoute. Garde. Partage. Recharge.</Text>
            <Text style={s.promiseCommunity}>Fais grandir ta communauté musicale.</Text>
          </View>
"""
if promise not in offers:
    raise SystemExit('promise card missing')
discovery = promise + """
          <View style={s.discoveryCard}>
            <Text style={s.discoveryEyebrow}>DÉCOUVERTE KEEP</Text>
            <Text style={s.discoveryTitle}>Ta découverte reste attribuée à ton profil.</Text>
            <Text style={s.discoveryBody}>Quand tu reconnais un morceau avec Écouter puis que tu le gardes, KEEP conserve ton profil comme source de cette découverte. Si un autre membre l’ajoute depuis ton profil, son ajout ne débite aucun Free et ton attribution reste attachée au morceau.</Text>
            <TouchableOpacity
              style={s.disclosureButton}
              onPress={() => setDiscoveryExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="En savoir plus sur l’attribution des découvertes"
              accessibilityState={{ expanded: discoveryExpanded }}
            >
              <Text style={s.disclosureText}>{discoveryExpanded ? 'Réduire' : 'En savoir plus'}</Text>
              <Text style={s.disclosureChevron}>{discoveryExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            {discoveryExpanded ? <View style={s.discoveryDetails}>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>1</Text><Text style={s.discoveryStepText}>Tu identifies un titre avec Écouter et tu le gardes : ton profil devient le découvreur KEEP de cette occurrence.</Text></View>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>2</Text><Text style={s.discoveryStepText}>Un membre récupère ce titre depuis ton profil : 0 Free débité pour lui, et le morceau est identifié comme un KEEP issu de la communauté.</Text></View>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>3</Text><Text style={s.discoveryStepText}>Le titre peut ensuite circuler de profil en profil : KEEP conserve le découvreur d’origine au lieu de remplacer son attribution à chaque partage.</Text></View>
              <View style={s.discoveryStep}><Text style={s.discoveryStepNumber}>4</Text><Text style={s.discoveryStepText}>Si un membre découvre lui-même le titre avec Écouter et l’enregistre directement, sa propre découverte devient la référence des partages issus de cette écoute.</Text></View>
            </View> : null}
          </View>
"""
offers = offers.replace(promise, discovery, 1)

# Community explanation is already surfaced by the hero + discovery card. Keep the
# Free accordion focused only on credits and rewards.
community_block = """
              <View style={s.communityOpportunity}>
                <Text style={s.communityOpportunityEyebrow}>TA COMMUNAUTÉ</Text>
                <Text style={s.communityOpportunityTitle}>Tes goûts musicaux peuvent devenir ton influence.</Text>
                <Text style={s.communityOpportunityText}>Ta communauté se construit autour de tes goûts, de tes découvertes et des morceaux que tu choisis de partager.</Text>
                <Text style={s.communityOpportunityText}>À partir de {f4} abonnés, la création d’événements peut se débloquer selon ta formule.</Text>
                <Text style={s.communityOpportunityNote}>Les collaborations éventuelles restent directes entre toi et tes partenaires.</Text>
              </View>
"""
if community_block not in offers:
    raise SystemExit('community duplicate block missing')
offers = offers.replace(community_block, "", 1)

old_plan_details = """              {!!plan.description && <Text style={s.planDescription}>{plan.description}</Text>}
              <View style={s.benefitBox}>{benefitsFor(plan.code, rules, funnel).map((benefit) => <Text key={benefit} style={s.benefit}>• {benefit}</Text>)}</View>
              {plan.trialDays > 0 ? <Text style={s.trial}>Essai : {plan.trialDays} jours</Text> : null}
              {!active && plan.code !== 'FREE' ? (
                <TouchableOpacity style={[s.cta, venueUnlimited && s.ctaUnlimited]} onPress={() => navigation.setParams({ focusPlan: plan.code, sourceFeature: sourceFeature || 'PLAN_DETAILS' })} accessibilityRole="button">
                  <Text style={s.ctaText}>{venueUnlimited ? 'Voir Venue Pro · illimité' : `Voir ${planLabel(plan.code)}`}</Text>
                </TouchableOpacity>
              ) : null}"""
new_plan_details = """              <Text style={s.planSummary}>{planSummary(plan.code)}</Text>
              <TouchableOpacity
                style={s.disclosureButton}
                onPress={() => setExpandedPlanCode((current) => current === plan.code ? null : plan.code)}
                accessibilityRole="button"
                accessibilityLabel={`En savoir plus sur ${planLabel(plan.code)}`}
                accessibilityState={{ expanded: expandedPlanCode === plan.code }}
              >
                <Text style={s.disclosureText}>{expandedPlanCode === plan.code ? 'Réduire' : 'En savoir plus'}</Text>
                <Text style={s.disclosureChevron}>{expandedPlanCode === plan.code ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
              {expandedPlanCode === plan.code ? <View style={s.planDetails}>
                {!!plan.description && <Text style={s.planDescription}>{plan.description}</Text>}
                <View style={s.benefitBox}>{benefitsFor(plan.code, rules, funnel).map((benefit) => <Text key={benefit} style={s.benefit}>• {benefit}</Text>)}</View>
                {plan.trialDays > 0 ? <Text style={s.trial}>Essai : {plan.trialDays} jours</Text> : null}
              </View> : null}
              {!active && plan.code !== 'FREE' ? (
                <TouchableOpacity style={[s.cta, venueUnlimited && s.ctaUnlimited]} onPress={() => navigation.setParams({ focusPlan: plan.code, sourceFeature: sourceFeature || 'PLAN_DETAILS' })} accessibilityRole="button">
                  <Text style={s.ctaText}>{venueUnlimited ? 'Voir Venue Pro · illimité' : `Voir ${planLabel(plan.code)}`}</Text>
                </TouchableOpacity>
              ) : null}"""
offers = replace_once(offers, old_plan_details, new_plan_details, 'collapse paid plan details')

old_rules = """          {rulesExpanded ? <Text style={s.subscriptionText}>Ta formule définit tes fonctions de base. Les bonus gagnés grâce aux partages, aux abonnés et aux Battles viennent s’ajouter gratuitement à cette formule. Premium donne l’usage quotidien confortable. Creator Pro ajoute Vibes illimité et les outils créateur. Venue Pro ajoute les outils professionnels et les événements illimités selon les règles affichées.</Text> : null}"""
new_rules = """          {rulesExpanded ? <View style={s.rulesDetails}>
            <Text style={s.subscriptionText}>• Écouter, reconnaître et PASSER ne consomment aucun Free.</Text>
            <Text style={s.subscriptionText}>• GARDER un morceau découvert avec Écouter utilise 1 Free. Le récupérer depuis le profil d’un autre membre utilise 0 Free.</Text>
            <Text style={s.subscriptionText}>• Les bonus gagnés avec les partages, les abonnés et les Battles s’ajoutent à ta formule.</Text>
            <Text style={s.subscriptionText}>• La provenance d’une découverte reste rattachée au membre qui l’a reconnue avec Écouter.</Text>
          </View> : null}"""
offers = replace_once(offers, old_rules, new_rules, 'deduplicate rules')

# Styles for the professional attribution card and compact plan details.
offers = replace_once(
    offers,
    "  promiseCommunity: { color: colors.keep, fontSize: 16, fontWeight: '900', lineHeight: 21, marginTop: 7 },",
    "  promiseCommunity: { color: colors.keep, fontSize: 16, fontWeight: '900', lineHeight: 21, marginTop: 7 },\n  discoveryCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#101D17', borderWidth: 1, borderColor: '#2C8A60' },\n  discoveryEyebrow: { color: '#7CF2B9', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },\n  discoveryTitle: { color: colors.textPrimary, fontSize: 17, lineHeight: 22, fontWeight: '900', marginTop: 5 },\n  discoveryBody: { ...typography.caption, color: colors.textPrimary, lineHeight: 18, fontWeight: '700', marginTop: 7 },\n  discoveryDetails: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#254936', gap: 9 },\n  discoveryStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },\n  discoveryStepNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#173529', color: '#7CF2B9', textAlign: 'center', lineHeight: 22, fontSize: 10, fontWeight: '900' },\n  discoveryStepText: { ...typography.caption, color: colors.textPrimary, lineHeight: 18, fontWeight: '700', flex: 1 },",
    'discovery card styles',
)
offers = replace_once(
    offers,
    "  planDescription: { color: '#F8F6FC', fontSize: 12, lineHeight: 17, marginTop: 9, fontWeight: '700' },",
    "  planSummary: { ...typography.caption, color: colors.textPrimary, lineHeight: 18, marginTop: 9, fontWeight: '700' },\n  planDetails: { marginTop: 2 },\n  planDescription: { ...typography.caption, color: '#F8F6FC', lineHeight: 18, marginTop: 9, fontWeight: '700' },",
    'plan summary styles',
)
offers = replace_once(
    offers,
    "  subscriptionText: { color: '#F8F6FC', fontSize: 10, lineHeight: 16, marginTop: 5, fontWeight: '700' },",
    "  rulesDetails: { marginTop: 3, gap: 3 },\n  subscriptionText: { ...typography.caption, color: '#F8F6FC', lineHeight: 18, marginTop: 5, fontWeight: '700' },",
    'rules typography',
)
offers_path.write_text(offers)

# ---------------------------------------------------------------------------
# OWN PROFILE: show the complete discovery attribution, never a 4-char alias.
# ---------------------------------------------------------------------------
own_path = Path('packages/mobile/src/screens/ProfilePublicScreen.tsx')
own = own_path.read_text()
old_render = """  const renderCompactTrack = (track: CanonicalTrack, key: string, sourceUsername?: string | null) => (
    <View key={key} style={s.keepRow}>
      {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.keepCover} /> : <View style={[s.keepCover, s.coverFallback]}><Text style={s.keepCoverK}>K</Text></View>}
      <View style={s.keepInfo}>
        <View style={s.keepTitleRow}>
          <View style={s.keepTitleBlock}><Text style={s.keepTitle} numberOfLines={1}>{track.title}</Text><Text style={s.keepArtist} numberOfLines={1}>{track.artist}</Text></View>
          <TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} compact />
        </View>
        <View style={s.trackMetaRow}>
          <TouchableOpacity style={s.trackShare} onPress={() => void shareProfileTrack(user.username, track.title, track.artist)}><Text style={s.trackShareText}>↗ Partager</Text></TouchableOpacity>
          {sourceUsername ? (
            <View style={s.originInline}>
              <Text style={s.originLabel}>Utilisateur</Text>
              <TouchableOpacity style={s.originUserLink} onPress={() => openSourceProfile(sourceUsername)} accessibilityLabel={`Ouvrir rapidement le profil de ${sourceUsername}`}>
                <Text style={s.originUserText}>@{sourceUsername.slice(0, 4)}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );"""
new_render = """  const renderCompactTrack = (track: CanonicalTrack, key: string, sourceUsername?: string | null, originKind?: 'SELF' | 'SOCIAL' | null) => (
    <View key={key} style={s.keepRow}>
      {track.artworkUrl ? <Image source={{ uri: track.artworkUrl }} style={s.keepCover} /> : <View style={[s.keepCover, s.coverFallback]}><Text style={s.keepCoverK}>K</Text></View>}
      <View style={s.keepInfo}>
        <View style={s.keepTitleRow}>
          <View style={s.keepTitleBlock}><Text style={s.keepTitle} numberOfLines={1}>{track.title}</Text><Text style={s.keepArtist} numberOfLines={1}>{track.artist}</Text></View>
          <TrackPreviewButton trackKey={track.id || key} previewUrl={track.previewUrl} compact />
        </View>
        {originKind ? <View style={s.discoveryOriginRow}>
          <Text style={s.originLabel}>Découvert avec Écouter par</Text>
          {originKind === 'SELF' ? <View style={s.originUserLink}><Text style={s.originUserText}>@{user.username}</Text></View> : sourceUsername ? (
            <TouchableOpacity style={s.originUserLink} onPress={() => openSourceProfile(sourceUsername)} accessibilityLabel={`Ouvrir le profil du découvreur ${sourceUsername}`}>
              <Text style={s.originUserText}>@{sourceUsername}</Text>
            </TouchableOpacity>
          ) : <Text style={s.originProtected}>découvreur d’origine protégé</Text>}
        </View> : null}
        <View style={s.trackMetaRow}>
          <TouchableOpacity style={s.trackShare} onPress={() => void shareProfileTrack(user.username, track.title, track.artist)}><Text style={s.trackShareText}>↗ Partager</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );"""
own = replace_once(own, old_render, new_render, 'own discovery attribution')
own = replace_once(
    own,
    "{profileKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null))}",
    "{profileKeptTracks.map((entry) => renderCompactTrack(entry.track, entry.id, entry.sourceUsername ?? null, entry.creditSource === 'SOCIAL' || !!entry.sourceProfileId ? 'SOCIAL' : 'SELF'))}",
    'own KEEP attribution call',
)
own = replace_once(
    own,
    "originInline:{flexDirection:'row',alignItems:'center',gap:4},originLabel:{color:'#FFFFFF',fontSize:8,fontWeight:'800',letterSpacing:.2},originUserLink:{minHeight:23,paddingHorizontal:8,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},originUserText:{color:'#7CF2B9',fontSize:9,fontWeight:'900'},",
    "discoveryOriginRow:{flexDirection:'row',alignItems:'center',gap:5,marginTop:5,flexWrap:'wrap'},originLabel:{color:'#FFFFFF',fontSize:9,fontWeight:'800',letterSpacing:.1},originUserLink:{minHeight:24,paddingHorizontal:8,borderRadius:12,backgroundColor:'#10251B',borderWidth:1,borderColor:'#38D990',alignItems:'center',justifyContent:'center'},originUserText:{color:'#7CF2B9',fontSize:10,fontWeight:'900'},originProtected:{color:'#7CF2B9',fontSize:9,fontWeight:'800'},",
    'own origin styles',
)
own_path.write_text(own)

# ---------------------------------------------------------------------------
# VISITED PROFILE: expose the same original discovery attribution.
# ---------------------------------------------------------------------------
public_path = Path('packages/mobile/src/screens/PublicUserProfileScreen.tsx')
public = public_path.read_text()
public = replace_once(
    public,
    """  sourceUserId?: string;
  sourceProfileId?: string;
};""",
    """  sourceUserId?: string;
  sourceProfileId?: string;
  sourceUsername?: string;
};""",
    'public track source username type',
)
public = replace_once(
    public,
    """          sourceUserId: entry.sourceUserId,
          sourceProfileId: entry.sourceProfileId,
        } as PublicKeepTrack));""",
    """          sourceUserId: entry.sourceUserId,
          sourceProfileId: entry.sourceProfileId,
          sourceUsername: entry.sourceUsername,
        } as PublicKeepTrack));""",
    'public source username mapping',
)
public = replace_once(
    public,
    """              const adding = addingTrackIds.has(track.trackId);
              const alreadyKept = alreadyInMyKeep(track.trackId);
              return <View key={track.id} style={styles.musicRow}>""",
    """              const adding = addingTrackIds.has(track.trackId);
              const alreadyKept = alreadyInMyKeep(track.trackId);
              const directDiscovery = !track.sourceUserId && !track.sourceProfileId;
              const discoveryUsername = track.sourceUsername || (directDiscovery ? profile.username : '');
              return <View key={track.id} style={styles.musicRow}>""",
    'public discovery username calculation',
)
public = replace_once(
    public,
    """                  <View style={styles.trackTitleRow}>
                    <View style={styles.trackTitleBlock}><Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.trackArtist} numberOfLines={1}>{track.artist}{track.album ? ` · ${track.album}` : ''}</Text></View>
                    <TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} compact />
                  </View>
                  <View style={styles.trackActions}>""",
    """                  <View style={styles.trackTitleRow}>
                    <View style={styles.trackTitleBlock}><Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.trackArtist} numberOfLines={1}>{track.artist}{track.album ? ` · ${track.album}` : ''}</Text></View>
                    <TrackPreviewButton trackKey={track.trackId} previewUrl={track.previewUrl} compact />
                  </View>
                  <View style={styles.discoveryOriginRow}>
                    <Text style={styles.discoveryOriginLabel}>Découvert avec Écouter par</Text>
                    {discoveryUsername ? discoveryUsername === profile.username ? <Text style={styles.discoveryOriginUser}>@{discoveryUsername}</Text> : (
                      <TouchableOpacity onPress={() => navigation.navigate('PublicUserProfile', { username: discoveryUsername })} accessibilityLabel={`Ouvrir le profil du découvreur ${discoveryUsername}`}>
                        <Text style={styles.discoveryOriginUser}>@{discoveryUsername}</Text>
                      </TouchableOpacity>
                    ) : <Text style={styles.discoveryOriginProtected}>découvreur d’origine protégé</Text>}
                  </View>
                  <View style={styles.trackActions}>""",
    'public track attribution render',
)
public = replace_once(
    public,
    "trackArtist:{color:colors.textMuted,fontSize:10,marginTop:2},trackActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5,marginTop:7},",
    "trackArtist:{color:colors.textMuted,fontSize:10,marginTop:2},discoveryOriginRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:5,flexWrap:'wrap'},discoveryOriginLabel:{color:'#FFFFFF',fontSize:9,fontWeight:'800'},discoveryOriginUser:{color:'#7CF2B9',fontSize:10,fontWeight:'900'},discoveryOriginProtected:{color:'#7CF2B9',fontSize:9,fontWeight:'800'},trackActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:5,marginTop:7},",
    'public attribution styles',
)
public_path.write_text(public)
