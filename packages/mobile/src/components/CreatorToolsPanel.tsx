import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/keepAlert';
import { getEventCreationAccess, QuotaAccess } from '../services/growthAccessService';
import { hasFeature, requiredPlan } from '../services/entitlementService';
import { isFeatureEnabled } from '../services/featureFlagService';
import { loadCurrentPlanCode } from '../services/planService';
import { getPayoutLinkForProfile, setMyPayoutLink } from '../services/payoutLinkService';
import { createProfileService } from '../services/profileService';
import { supabase } from '../services/supabaseClient';
import { useUserStore } from '../store/useUserStore';
import { ProfileKind } from '../types';
import { colors } from '../theme/colors';
import { radius } from '../theme/spacing';

const CREATOR_KINDS: { key: ProfileKind; label: string }[] = [
  { key: 'CREATOR', label: 'Créateur' },
  { key: 'DJ', label: 'DJ' },
  { key: 'ARTIST', label: 'Artiste' },
  { key: 'PRODUCER', label: 'Producteur' },
];

const KIND_LABELS: Record<ProfileKind, string> = {
  USER: 'Utilisateur', CREATOR: 'Créateur', DJ: 'DJ', ARTIST: 'Artiste', PRODUCER: 'Producteur', VENUE: 'Lieu / établissement',
};

export default function CreatorToolsPanel({ navigation }: any) {
  const user = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const isLocalGuest = useUserStore((state) => state.isLocalGuest);
  const isDemoMode = useUserStore((state) => state.isDemoMode);
  const [planCode, setPlanCode] = useState('FREE');
  const [eventAccess, setEventAccess] = useState<QuotaAccess | null>(null);
  const [busy, setBusy] = useState(false);
  // Adel : brancher le flag "events" pour de vrai plutôt que de laisser un
  // interrupteur décoratif dans Super Admin -- coupe-circuit d'urgence réel.
  const [eventsFeatureEnabled, setEventsFeatureEnabled] = useState(false);
  useEffect(() => { let live = true; isFeatureEnabled('events').then((enabled) => live && setEventsFeatureEnabled(enabled)); return () => { live = false; }; }, []);

  const [payoutLinkInput, setPayoutLinkInput] = useState('');
  const [savingPayoutLink, setSavingPayoutLink] = useState(false);
  useEffect(() => {
    let live = true;
    if (!user || isLocalGuest || isDemoMode) { setPayoutLinkInput(''); return undefined; }
    getPayoutLinkForProfile(user.id).then((v) => live && setPayoutLinkInput(v)).catch(() => {});
    return () => { live = false; };
  }, [user?.id, isLocalGuest, isDemoMode]);
  const savePayoutLink = async () => {
    setSavingPayoutLink(true);
    try {
      await setMyPayoutLink(payoutLinkInput);
      Alert.alert('Lien enregistré', 'Ton lien de paiement personnel est prêt à recevoir des paiements.');
    } catch (e: any) {
      Alert.alert('Lien invalide', e?.message === 'PAYOUT_LINK_MUST_BE_A_URL' ? 'Colle un lien complet (commençant par https://).' : (e?.message || 'Impossible d’enregistrer ce lien.'));
    } finally {
      setSavingPayoutLink(false);
    }
  };

  useEffect(() => {
    let live = true;
    const loadAccess = async () => {
      if (!user || isLocalGuest || isDemoMode) {
        if (live) { setPlanCode('FREE'); setEventAccess(null); }
        return;
      }
      const code = await loadCurrentPlanCode(user.id).catch(() => 'FREE');
      if (!live) return;
      setPlanCode(code || 'FREE');
      const access = await getEventCreationAccess().catch(() => null);
      if (live) setEventAccess(access);
    };
    void loadAccess();
    const unsubscribe = navigation?.addListener?.('focus', () => { void loadAccess(); });
    return () => { live = false; unsubscribe?.(); };
  }, [user?.id, isLocalGuest, isDemoMode, navigation]);

  if (!user) return null;

  const creatorKindEnabled = hasFeature(planCode, 'CREATOR_KIND');
  const venueKindEnabled = hasFeature(planCode, 'VENUE_KIND');
  const creatorEnabled = hasFeature(planCode, 'CREATE_EVENT');
  const eventCanCreate = Boolean(eventAccess?.allowed || eventAccess?.unlimited);

  const openPaywall = (feature: 'PROFILE_SHARE' | 'CREATOR_KIND' | 'VENUE_KIND' | 'CREATE_EVENT' = 'CREATE_EVENT', forcedPlan?: 'PREMIUM' | 'CREATOR_PRO' | 'VENUE_PRO') => {
    navigation.navigate('Offers', { focusPlan: forcedPlan || requiredPlan(feature), sourceFeature: feature });
  };

  const changeKind = async (kind: ProfileKind, feature?: 'CREATOR_KIND' | 'VENUE_KIND') => {
    if (feature && !hasFeature(planCode, feature)) return openPaywall(feature);
    if (isLocalGuest || isDemoMode || !supabase) return void Alert.alert('Compte requis', 'Crée ton compte Loki Music avant de modifier le type de profil.');
    if (kind === user.kind) return;
    setBusy(true);
    try {
      const next = { ...user, kind };
      await createProfileService(supabase).saveOwnProfile(next);
      setUser(next);
      Alert.alert('Type de profil', `Ton profil est maintenant « ${KIND_LABELS[kind]} ».`);
    } catch (e: any) { Alert.alert('Type de profil', e?.message || 'Impossible de modifier le type de profil.'); }
    finally { setBusy(false); }
  };

  // Adel (15/09/2026) : "j'ai créé ma soirée du mois. Quand je clique
  // dessus, ça ne me propose pas la même chose que quand je clique sur
  // Soirée -- il faut le même design et les mêmes fonctions" -- BUG RÉEL :
  // une fois la soirée du mois déjà créée (quota utilisé), ce bouton
  // redirigeait vers l'offre Venue Pro au lieu de montrer l'événement déjà
  // créé. Le seul cas où le quota est épuisé pour un compte déjà
  // creatorEnabled (seule condition d'affichage de ce bouton), c'est
  // "déjà utilisé ce mois-ci" -- direction vers Soirées (même écran que
  // l'onglet), jamais un nouveau paywall pour un évènement qui existe déjà.
  // Adel (15/09/2026) : "comment ça se fait qu'on n'a pas le même pop-up
  // que dans la rubrique Soirée ... je veux le même des deux côtés" -- ce
  // panneau avait sa propre création d'événement simplifiée (nom/date/lieu/
  // description seulement), divergente de celle de l'onglet Soirées (qui
  // vérifie en plus le seuil d'abonnés, gère l'édition, les images, le
  // QR...). Un seul formulaire désormais : ce bouton délègue à Soirées au
  // lieu de maintenir une deuxième version qui dérive.
  const openEventComposer = () => {
    if (!eventsFeatureEnabled) return Alert.alert('Événements', "La création d'événements est temporairement suspendue.");
    if (!creatorEnabled) return openPaywall('CREATE_EVENT', 'CREATOR_PRO');
    // Soirée du mois déjà utilisée ce mois-ci (Creator Pro) : montrer
    // l'événement existant dans Soirées, jamais rouvrir un formulaire de
    // création qui redirigerait vers un palier payant pour rien.
    if (!eventCanCreate && !eventAccess?.unlimited) return navigation.navigate('Main', { screen: 'Parties' });
    navigation.navigate('Main', { screen: 'Parties', params: { openCreateEvent: true } });
  };

  const eventLabel = eventAccess?.unlimited ? '+ Créer une soirée · illimité' : eventAccess?.planCode === 'CREATOR_PRO' ? (eventCanCreate ? '+ Créer ma soirée du mois' : '👉 Voir ma soirée du mois dans Soirées') : '+ Créer un événement';

  // Adel (16-17/09/2026) : "tu as mis les offres, on n'a pas besoin de les
  // mettre à ce niveau-là, on les a déjà ailleurs" -- ce panneau vivait
  // avant en plein écran (d'où son propre gros en-tête + les 3 cartes de
  // prix Premium/Creator Pro/Venue Pro). Maintenant embarqué DANS la
  // section "Type de profil & outils créateur" du menu, dont le titre
  // fait déjà doublon avec l'en-tête -- et les prix font doublon avec
  // "Offres & crédits", sa propre entrée du menu. Retirés : il ne reste
  // que ce que cette section a d'unique (choix du type de profil, soirée
  // du mois, lien de paiement).
  return <View style={s.card}>
    <Text style={s.planSectionTitle}>Type de profil</Text>
    {creatorKindEnabled ? (
      <View style={s.kindWrap}>{CREATOR_KINDS.map((item) => <TouchableOpacity key={item.key} style={[s.kindChip, user.kind === item.key && s.kindChipOn]} onPress={() => changeKind(item.key, 'CREATOR_KIND')} disabled={busy}><Text style={[s.kindText, user.kind === item.key && s.kindTextOn]}>{item.label}</Text></TouchableOpacity>)}</View>
    ) : <Text style={s.hint}>🔒 DJ, Artiste, Créateur, Producteur -- nécessite Creator Pro (voir "Offres & crédits").</Text>}

    {venueKindEnabled ? (
      <TouchableOpacity style={[s.kindChip, user.kind === 'VENUE' && s.kindChipOn, { marginTop: 8 }]} onPress={() => changeKind('VENUE', 'VENUE_KIND')} disabled={busy}><Text style={[s.kindText, user.kind === 'VENUE' && s.kindTextOn]}>Lieu / établissement</Text></TouchableOpacity>
    ) : <Text style={[s.hint, { marginTop: 8 }]}>🔒 Lieu / établissement -- nécessite Venue Pro (voir "Offres & crédits").</Text>}

    {/* Adel (15/09/2026) : "il y a un bouton qui ne sert à rien, revenir au
        profil utilisateur ... en haut on a un bouton pour revenir" -- pris
        pour un doublon du bouton de retour en haut de l'écran, alors qu'il
        fait tout autre chose : repasser le TYPE de profil (DJ/Artiste/
        Créateur/Producteur) à Utilisateur standard, jamais une navigation.
        Libellé désambiguïsé + vrai contour de bouton pour ne plus le
        confondre avec un lien de navigation. */}
    {user.kind !== 'USER' ? <TouchableOpacity style={s.standardProfileLink} onPress={() => changeKind('USER')} disabled={busy} accessibilityLabel="Redevenir un profil Utilisateur standard"><Text style={s.standardProfileLinkText}>↩ Redevenir un profil Utilisateur standard</Text></TouchableOpacity> : null}

    <Text style={s.subscriptionNote}>{"Le plan actif pilote réellement les cadenas. Si l'abonnement s'arrête, les données restent mais les fonctions payantes se reverrouillent."}</Text>

    {creatorEnabled && eventsFeatureEnabled ? <><TouchableOpacity style={[s.eventButton, !eventCanCreate && !eventAccess?.unlimited && s.eventButtonLocked]} onPress={() => void openEventComposer()}><Text style={s.eventButtonText}>{eventLabel}</Text></TouchableOpacity><Text style={s.hint}>{eventAccess?.unlimited ? "Venue Pro : créations illimitées." : eventAccess?.planCode === 'CREATOR_PRO' ? "Creator Pro : 1 création de soirée par mois. Venue Pro retire cette limite." : "Les réponses Oui / Peut-être / Non restent dans l'onglet Soirées."}</Text></> : null}

    {/* Adel (16-17/09/2026) : "vérifie qu'il n'y a pas des boutons un peu
        de partout ... tout part du pop-up, je clique ça me dirige
        directement, pas besoin de re-rencontrer une info déjà dans le
        pop-up" -- "Vendre mes playlists" a désormais sa propre entrée
        directe dans le menu accordéon du profil (ProfilePublicScreen.tsx).
        Bouton retiré d'ici, seul le lien de paiement personnel (unique,
        partagé par les deux ventes) reste dans ce panneau. */}

    {/* Adel (16-17/09/2026) : "l'idéal c'est que l'utilisateur se fait payer
        directement ... KEEP encaisse rien" -- après vérification (TikTok
        encaisse en réalité TOUT et reverse en différé avec une grosse
        commission, l'inverse de ce qu'Adel veut), le seul modèle qui garantit
        que KEEP ne touche jamais l'argent : chaque vendeur colle SON PROPRE
        lien de paiement (PayPal.me, Lydia, lien Stripe personnel...), une
        seule fois, ici. Sert à la fois la vente de playlists ET la vente de
        musique originale -- un seul emplacement, jamais dupliqué. Toujours
        visible (pas caché derrière une formule), comme demandé le 15/09. */}
    <View style={s.paymentTeaser}>
      <Text style={s.paymentTeaserTitle}>🔗 Mon lien de paiement personnel</Text>
      <Text style={s.paymentTeaserText}>Colle ton lien PayPal.me, Lydia, ou un lien de paiement Stripe personnel. Loki Music ne touche jamais cet argent -- l'acheteur paie directement sur ce lien, toi seul confirmes la vente pour débloquer l'accès.</Text>
      <TextInput
        style={s.payoutLinkInput}
        value={payoutLinkInput}
        onChangeText={setPayoutLinkInput}
        placeholder="https://paypal.me/tonpseudo"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TouchableOpacity style={s.payoutLinkSaveButton} disabled={savingPayoutLink} onPress={() => void savePayoutLink()}>
        {savingPayoutLink ? <ActivityIndicator color="#0E0A14" /> : <Text style={s.payoutLinkSaveButtonText}>Enregistrer ce lien</Text>}
      </TouchableOpacity>
    </View>

    {/* Adel (17-18/09/2026) : "construis tout ce qui manque" -- l'entrée
        payante d'évènement est construite : le prix se fixe directement
        dans le formulaire de création de soirée (onglet Soirées), même
        modèle de paiement direct que le reste (lien personnel ci-dessus). */}
    {creatorEnabled ? (
      <View style={s.paymentTeaser}>
        <Text style={s.paymentTeaserTitle}>🎟 Entrée payante d'évènement</Text>
        <Text style={s.paymentTeaserText}>Fixe le prix directement en créant ta soirée du mois (onglet Soirées) -- même lien de paiement personnel que ci-dessus.</Text>
      </View>
    ) : null}

  </View>;
}

const s = StyleSheet.create({
  // Adel (15/09/2026) : correction d'une cascade sed maladroite (un premier
  // passage avait re-transforme certaines tailles deja augmentees) --
  // valeurs reprises a la main, avec un lineHeight qui depasse toujours le
  // fontSize (jamais egal, sinon texte multi-lignes trop serre).
  card:{marginHorizontal:18,marginTop:10,padding:14,borderRadius:radius.lg,backgroundColor:'#151020',borderWidth:1,borderColor:'#493369'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},eyebrow:{color:colors.primaryLight,fontSize:13,fontWeight:'900',letterSpacing:1.1},title:{color:colors.textPrimary,fontSize:16,fontWeight:'900',marginTop:3},planSectionTitle:{color:colors.primaryLight,fontSize:15,fontWeight:'900',marginTop:10,marginBottom:7},kindWrap:{flexDirection:'row',flexWrap:'wrap',gap:6},kindChip:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:8,borderRadius:999,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#40354E',marginBottom:7},kindChipOn:{backgroundColor:'#5B3F8C',borderColor:'#A884FA'},kindText:{color:'#FFFFFF',fontSize:14,fontWeight:'800'},kindTextOn:{color:'#FFF'},planChoiceLocked:{minHeight:62,borderRadius:14,backgroundColor:'#211A2B',borderWidth:1,borderColor:'#493369',paddingHorizontal:12,paddingVertical:9,marginBottom:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},planChoiceActive:{borderColor:colors.primaryLight,backgroundColor:'#34234F'},planChoiceText:{flex:1,paddingRight:8},planHeadingRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7},unlockedHeading:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:7,marginTop:9,marginBottom:5},planPrice:{color:'#E9DFFF',fontSize:15,fontWeight:'900'},tierBadge:{minHeight:24,borderRadius:999,borderWidth:1,paddingHorizontal:8,flexDirection:'row',alignItems:'center',gap:5},tierPremium:{backgroundColor:'#2A203A',borderColor:'#B993FF'},tierCreator:{backgroundColor:'#2C2530',borderColor:'#D5B46A'},tierVenue:{backgroundColor:'#1C2A34',borderColor:'#7DC5E8'},tierBadgeText:{color:'#FFFFFF',fontSize:13,fontWeight:'900',letterSpacing:.55},tierDot:{width:6,height:6,borderRadius:3,backgroundColor:'#6D6376'},tierDotActive:{backgroundColor:'#FFFFFF'},planChoiceSubtitle:{color:'#FFFFFF',fontSize:14,lineHeight:19,marginTop:4},planChoiceArrow:{color:colors.primaryLight,fontSize:24,fontWeight:'700'},standardProfileLink:{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:9,borderRadius:22,borderWidth:1,borderColor:'#40354E',backgroundColor:'#211A2B',paddingHorizontal:14},standardProfileLinkText:{color:'#FFFFFF',fontSize:14,fontWeight:'800'},subscriptionNote:{color:'#FFFFFF',fontSize:14,lineHeight:19,marginTop:6,paddingTop:9,borderTopWidth:1,borderTopColor:'#3D324A'},hint:{color:colors.textMuted,fontSize:14,lineHeight:19,marginTop:7},eventButton:{minHeight:45,borderRadius:23,alignItems:'center',justifyContent:'center',backgroundColor:colors.primary,marginTop:13},eventButtonLocked:{backgroundColor:'#21182F',borderWidth:1,borderColor:'#493369'},eventButtonText:{color:'#FFF',fontSize:15,fontWeight:'900'},paymentTeaser:{marginTop:10,padding:12,borderRadius:14,backgroundColor:'#17121D',borderWidth:1,borderColor:'#3B2E4E'},paymentTeaserTitle:{color:'#FFD166',fontSize:15,fontWeight:'900'},paymentTeaserText:{color:colors.textMuted,fontSize:14,lineHeight:19,marginTop:4},
  payoutLinkInput:{minHeight:44,borderRadius:12,backgroundColor:'#1A1225',borderWidth:1,borderColor:'#3F3154',paddingHorizontal:12,color:colors.textPrimary,fontSize:14,marginTop:9},payoutLinkSaveButton:{minHeight:40,borderRadius:20,backgroundColor:'#E5F266',alignItems:'center',justifyContent:'center',marginTop:9},payoutLinkSaveButtonText:{color:'#0E0A14',fontSize:13,fontWeight:'900'},
});
