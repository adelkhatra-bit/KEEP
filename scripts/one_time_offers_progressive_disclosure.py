from pathlib import Path

path = Path('packages/mobile/src/screens/OffersScreen.tsx')
text = path.read_text()

state_anchor = "  const [error, setError] = useState('');"
if state_anchor not in text:
    raise SystemExit('offers state anchor missing')
text = text.replace(
    state_anchor,
    state_anchor + "\n  const [freeExpanded, setFreeExpanded] = useState(false);\n  const [battleExpanded, setBattleExpanded] = useState(false);\n  const [rulesExpanded, setRulesExpanded] = useState(false);",
    1,
)

old_visible = """  const visiblePlans = useMemo(() => {
    if (!focusPlan) return plans;
    const allowed = new Set(compatibleCodes);
    return plans.filter((plan) => allowed.has(plan.code));
  }, [compatibleCodes, focusPlan, plans]);"""
new_visible = """  const visiblePlans = useMemo(() => {
    // La formule Free possède son propre bloc compact au-dessus. Les cartes
    // ci-dessous restent donc réservées aux offres Premium / Pro.
    const paidPlans = plans.filter((plan) => plan.code !== 'FREE');
    if (!focusPlan || focusPlan === 'FREE') return paidPlans;
    const allowed = new Set(compatibleCodes);
    return paidPlans.filter((plan) => allowed.has(plan.code));
  }, [compatibleCodes, focusPlan, plans]);"""
if old_visible not in text:
    raise SystemExit('visiblePlans anchor missing')
text = text.replace(old_visible, new_visible, 1)

old_promise = """          <View style={s.promiseCard}>
            <Text style={s.promiseEyebrow}>KEEP</Text>
            <Text style={s.promiseTitle}>Écoute. Garde. Partage. Recharge.</Text>
            <Text style={s.promiseBody}>Les Free servent à GARDER les morceaux détectés avec Écouter. L’écoute, la reconnaissance et PASSER restent gratuits.</Text>
          </View>
"""
new_promise = """          <View style={s.promiseCard}>
            <Text style={s.promiseEyebrow}>KEEP</Text>
            <Text style={s.promiseTitle}>Écoute. Garde. Partage. Recharge.</Text>
            <Text style={s.promiseCommunity}>Fais grandir ta communauté musicale.</Text>
          </View>
"""
if old_promise not in text:
    raise SystemExit('promise anchor missing')
text = text.replace(old_promise, new_promise, 1)

start_marker = "          <View style={s.creditCard}>"
end_marker = "        </>}"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('credit block anchors missing')

new_blocks = """          <View style={s.creditCard}>
            <View style={s.creditTop}>
              <View><Text style={s.sectionTitle}>Tes Free</Text><Text style={s.creditBig}>{freeTotal}</Text></View>
              <View style={s.freePill}><Text style={s.freePillText}>FREE</Text></View>
            </View>

            <TouchableOpacity
              style={s.disclosureButton}
              onPress={() => setFreeExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="En savoir plus sur les Free"
              accessibilityState={{ expanded: freeExpanded }}
            >
              <Text style={s.disclosureText}>{freeExpanded ? 'Réduire' : 'En savoir plus'}</Text>
              <Text style={s.disclosureChevron}>{freeExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>

            {freeExpanded ? <>
              <Text style={s.creditText}>{funnel.guestSuccessLimit} avant inscription + {funnel.signupBonusSuccesses} après création du compte{growth?.bonusFreeCredits ? ` + ${growth.bonusFreeCredits} gagnés avec ta communauté` : ''}.</Text>
              <Text style={s.creditRule}>Écouter / reconnaître / PASSER = 0 Free. GARDER un morceau détecté avec Écouter = 1 Free. Prendre un morceau sur le profil d’un autre membre = 0 Free.</Text>
              {growth ? <View style={s.growthGrid}>
                <View style={s.growthStat}><Text style={s.growthValue}>{growth.qualifiedShares}</Text><Text style={s.growthLabel}>partages qualifiés</Text></View>
                <View style={s.growthStat}><Text style={s.growthValue}>{growth.followers}</Text><Text style={s.growthLabel}>abonnés</Text></View>
                <View style={s.growthStat}><Text style={s.growthValue}>+{growth.bonusFreeCredits}</Text><Text style={s.growthLabel}>Free gagnés</Text></View>
              </View> : null}

              <View style={s.rechargeBox}>
                <Text style={s.rechargeEyebrow}>RECHARGER MES FREE</Text>
                <Text style={s.rechargeTitle}>Pas besoin de payer pour continuer.</Text>
                <Text style={s.rechargeIntro}>Partage KEEP et fais grandir ta communauté : certaines actions te redonnent réellement des Free.</Text>

                <View style={s.rechargeItem}>
                  <Text style={s.rechargeIcon}>↗</Text>
                  <View style={s.rechargeCopy}>
                    <Text style={s.rechargeItemTitle}>Partage KEEP</Text>
                    <Text style={s.rechargeItemText}>{s2} partages qualifiés → +{sr.tier2Credits} Free · {s3} partages → +{sr.tier3Credits} Free.</Text>
                    <Text style={s.rechargeHint}>Limite actuelle : {rules.shareDailyCap} partages comptabilisés par jour.</Text>
                  </View>
                </View>

                <View style={s.rechargeItem}>
                  <Text style={s.rechargeIcon}>＋</Text>
                  <View style={s.rechargeCopy}>
                    <Text style={s.rechargeItemTitle}>Fais grandir tes abonnés</Text>
                    <Text style={s.rechargeItemText}>{f3} abonnés → +{fr.tier3Credits} Free · {f5} abonnés → +{fr.tier5Credits} Free.</Text>
                    <Text style={s.rechargeHint}>Les autres paliers peuvent aussi donner des Découvertes ou des essais Vibes.</Text>
                  </View>
                </View>

                <View style={s.startBonus}>
                  <Text style={s.startBonusTitle}>BONUS DE DÉPART</Text>
                  <Text style={s.startBonusText}>{funnel.guestSuccessLimit} Free avant inscription + {funnel.signupBonusSuccesses} après création du compte. C’est un bonus de démarrage, pas une recharge répétable.</Text>
                </View>
              </View>

              <View style={s.otherRewards}>
                <Text style={s.otherRewardsTitle}>BONUS GRATUITS EN PLUS DE TON OFFRE</Text>
                <Text style={s.otherRewardsIntro}>Tu les gagnes en faisant vivre ta communauté musicale et en partageant KEEP.</Text>
                <Text style={s.otherRewardsLine}>{f1} abonnés → +{fr.tier1Discovery} profils Découvertes</Text>
                <Text style={s.otherRewardsLine}>{f2} abonnés → +{fr.tier2Sort} essai Vibes</Text>
                <Text style={s.otherRewardsLine}>{f4} abonnés → +{fr.tier4Discovery} Découvertes + {fr.tier4Sort} essai Vibes</Text>
                <Text style={s.otherRewardsLine}>{s1} partages → +{sr.tier1Discovery} Découvertes</Text>
                <Text style={s.otherRewardsLine}>{s3} partages → +{sr.tier3Sort} essai Vibes en plus des Free</Text>
                <Text style={s.vibesDefinition}>Vibes = KEEP range automatiquement tes morceaux par styles et ambiances pour créer des sélections musicales intelligentes.</Text>
              </View>

              <View style={s.communityOpportunity}>
                <Text style={s.communityOpportunityEyebrow}>TA COMMUNAUTÉ</Text>
                <Text style={s.communityOpportunityTitle}>Tes goûts musicaux peuvent devenir ton influence.</Text>
                <Text style={s.communityOpportunityText}>Ta communauté se construit autour de tes goûts, de tes découvertes et des morceaux que tu choisis de partager.</Text>
                <Text style={s.communityOpportunityText}>À partir de {f4} abonnés, la création d’événements peut se débloquer selon ta formule.</Text>
                <Text style={s.communityOpportunityNote}>Les collaborations éventuelles restent directes entre toi et tes partenaires.</Text>
              </View>
            </> : null}
          </View>

          <View style={s.battleCard}>
            <View style={s.battleHeader}>
              <View style={s.battleHeaderCopy}>
                <Text style={s.battleEyebrow}>KEEP BATTLES</Text>
                <Text style={s.battleTitle}>⚡ Affronte. Gagne des Free.</Text>
              </View>
            </View>
            <TouchableOpacity
              style={s.disclosureButton}
              onPress={() => setBattleExpanded((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel="En savoir plus sur les KEEP Battles"
              accessibilityState={{ expanded: battleExpanded }}
            >
              <Text style={s.disclosureText}>{battleExpanded ? 'Réduire' : 'En savoir plus'}</Text>
              <Text style={s.disclosureChevron}>{battleExpanded ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>
            {battleExpanded ? <View style={s.battleDetails}>
              <Text style={s.battleDetailText}>Battle de 2 à {battleRules.maxPlayers} joueurs : le vainqueur gagne {battleRules.stakeFree} Free par adversaire battu.</Text>
              <Text style={s.battleDetailHint}>Il faut au moins {battleRules.minimumFreeRequired} Free pour entrer. À {battleRules.maxPlayers} joueurs, le gain peut atteindre +{battleRules.fullArenaNetPrize} Free. Si tu perds, -{battleRules.stakeFree} Free.</Text>
            </View> : null}
          </View>
"""
text = text[:start] + new_blocks + text[end:]

old_rules = """        <View style={s.subscriptionCard}>
          <Text style={s.subscriptionTitle}>Règles simples</Text>
          <Text style={s.subscriptionText}>Ta formule définit tes fonctions de base. Les bonus gagnés grâce aux partages, aux abonnés et aux Battles viennent s’ajouter gratuitement à cette formule. Premium donne l’usage quotidien confortable. Creator Pro ajoute Vibes illimité et les outils créateur. Venue Pro ajoute les outils professionnels et les événements illimités selon les règles affichées.</Text>
        </View>"""
new_rules = """        <View style={s.subscriptionCard}>
          <Text style={s.subscriptionTitle}>Règles simples</Text>
          <TouchableOpacity
            style={s.disclosureButton}
            onPress={() => setRulesExpanded((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel="En savoir plus sur les règles"
            accessibilityState={{ expanded: rulesExpanded }}
          >
            <Text style={s.disclosureText}>{rulesExpanded ? 'Réduire' : 'En savoir plus'}</Text>
            <Text style={s.disclosureChevron}>{rulesExpanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          {rulesExpanded ? <Text style={s.subscriptionText}>Ta formule définit tes fonctions de base. Les bonus gagnés grâce aux partages, aux abonnés et aux Battles viennent s’ajouter gratuitement à cette formule. Premium donne l’usage quotidien confortable. Creator Pro ajoute Vibes illimité et les outils créateur. Venue Pro ajoute les outils professionnels et les événements illimités selon les règles affichées.</Text> : null}
        </View>"""
if old_rules not in text:
    raise SystemExit('rules card anchor missing')
text = text.replace(old_rules, new_rules, 1)

style_anchor = "  promiseTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '900', lineHeight: 25, marginTop: 5 },"
if style_anchor not in text:
    raise SystemExit('promise style anchor missing')
text = text.replace(
    style_anchor,
    style_anchor + "\n  promiseCommunity: { color: colors.keep, fontSize: 16, fontWeight: '900', lineHeight: 21, marginTop: 7 },",
    1,
)

credit_style_anchor = "  creditRule: { color:'#FFFFFF', fontSize: 10, lineHeight: 15, marginTop: 7, fontWeight: '700' },"
if credit_style_anchor not in text:
    raise SystemExit('credit style anchor missing')
text = text.replace(
    credit_style_anchor,
    credit_style_anchor + "\n  disclosureButton: { minHeight: 42, marginTop: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#493369', backgroundColor: '#151020', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },\n  disclosureText: { color: colors.textPrimary, fontSize: 12, fontWeight: '900' },\n  disclosureChevron: { color: colors.primaryLight, fontSize: 18, fontWeight: '900' },",
    1,
)

community_style_anchor = "  communityOpportunityNote: { color: '#FFFFFF', fontSize: 9, lineHeight: 14, fontWeight: '800', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#493369' },"
if community_style_anchor not in text:
    raise SystemExit('community style anchor missing')
text = text.replace(
    community_style_anchor,
    community_style_anchor + "\n  battleCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#17130B', borderWidth: 1, borderColor: '#D6AA36' },\n  battleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },\n  battleHeaderCopy: { flex: 1 },\n  battleEyebrow: { color: '#FFF4C2', fontSize: 9, fontWeight: '900', letterSpacing: 1 },\n  battleTitle: { color: colors.textPrimary, fontSize: 16, lineHeight: 21, fontWeight: '900', marginTop: 4 },\n  battleDetails: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#5B4A19' },\n  battleDetailText: { color: colors.textPrimary, fontSize: 11, lineHeight: 17, fontWeight: '800' },\n  battleDetailHint: { color: '#FFF4C2', fontSize: 10, lineHeight: 15, fontWeight: '700', marginTop: 5 },\n  paidSectionTitle: { color: colors.primaryLight, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginTop: 2 },",
    1,
)

plans_anchor = "        {loading ? <ActivityIndicator color={colors.primaryLight} /> : error ? <Text style={s.error}>{error}</Text> : visiblePlans.map((plan) => {"
if plans_anchor not in text:
    raise SystemExit('plans render anchor missing')
text = text.replace(
    plans_anchor,
    "        {!focusPlan ? <Text style={s.paidSectionTitle}>PREMIUM & PRO</Text> : null}\n\n" + plans_anchor,
    1,
)

path.write_text(text)
