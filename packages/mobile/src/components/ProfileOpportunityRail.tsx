import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import type { ProfileSaleSuggestion } from '../services/profileSaleSuggestionService';
import SaleCollectionRow from './SaleCollectionRow';
import { nextSaleVisibleCount, SALE_ROWS_INITIAL } from '../services/saleListPaging';

// Adel (29/09/2026) : « au lieu de POUR TOI, un petit slogan… l'algorithme
// des ventes n'est pas propre… si un bouton redirige au même endroit, tu
// n'en gardes qu'un ». Refonte :
// - titre = slogan, plus « POUR TOI » en 9 px ;
// - les sélections suggérées s'affichent avec la MÊME ligne compacte que sur
//   un profil visité (SaleCollectionRow), 3 puis +10 ;
// - la carte-astuce tournante est retirée : ses boutons menaient aux mêmes
//   écrans que ◆ PÉPITES et la pastille FREE, juste au-dessus ;
// - aucune suggestion pertinente = aucune carte vide « Ton prochain univers
//   arrive… » sans action : la rubrique n'apparaît pas.
type Props = {
  suggestions?: ProfileSaleSuggestion[];
  viewerKey?: string;
  onSuggestionPress: (suggestion: ProfileSaleSuggestion) => void;
};

function priceLabel(s: ProfileSaleSuggestion): string {
  if (s.paymentMode === 'FREE') return `${s.freePrice ?? 0} FREE`;
  return `${(s.priceCents / 100).toFixed(2).replace('.', ',')}${s.currencyCode === 'EUR' ? '€' : ` ${s.currencyCode}`}`;
}

export default function ProfileOpportunityRail({ suggestions = [], viewerKey = 'guest', onSuggestionPress }: Props) {
  const storageKey = `keep:profile-opportunity-rail:${viewerKey}`;
  const [visible, setVisible] = useState(true);
  const [visibleCount, setVisibleCount] = useState(SALE_ROWS_INITIAL);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(storageKey).then((value) => { if (live) setVisible(value !== 'hidden'); }).catch(() => {});
    return () => { live = false; };
  }, [storageKey]);
  // Une nouvelle sélection rouvre la rubrique même si elle avait été masquée :
  // le masquage vaut pour le contenu déjà vu, jamais pour une nouveauté.
  useEffect(() => {
    const newestOfferId = suggestions[0]?.offerId;
    if (!newestOfferId) return;
    const latestKey = `${storageKey}:latest-offer`;
    AsyncStorage.getItem(latestKey).then((previousOfferId) => {
      if (previousOfferId && previousOfferId !== newestOfferId) {
        setVisible(true);
        void AsyncStorage.setItem(storageKey, 'visible');
      }
      void AsyncStorage.setItem(latestKey, newestOfferId);
    }).catch(() => {});
  }, [storageKey, suggestions]);
  const hide = () => { setVisible(false); void AsyncStorage.setItem(storageKey, 'hidden'); };
  const show = () => { setVisible(true); void AsyncStorage.setItem(storageKey, 'visible'); };

  if (!suggestions.length) return null;
  if (!visible) return (
    <TouchableOpacity style={s.reopen} onPress={show} accessibilityRole="button" accessibilityLabel="Afficher les sélections choisies pour ton oreille">
      <Text style={s.reopenIcon}>✦</Text>
      <Text style={s.reopenText} numberOfLines={1}>Choisi pour ton oreille · {suggestions.length} sélection{suggestions.length > 1 ? 's' : ''}</Text>
      <Text style={s.reopenArrow}>›</Text>
    </TouchableOpacity>
  );
  return (
    <View style={s.wrapper}>
      <View style={s.header}>
        <View style={s.headerCopy}>
          <Text style={s.slogan}>Choisi pour ton oreille</Text>
          <Text style={s.why} numberOfLines={2}>D’après tes styles et les profils que tu suis · écoute avant de débloquer</Text>
        </View>
        <TouchableOpacity style={s.hide} onPress={hide} accessibilityRole="button" accessibilityLabel="Masquer les sélections choisies pour toi">
          <Text style={s.hideText}>MASQUER</Text>
        </TouchableOpacity>
      </View>
      <View style={s.list}>
        {suggestions.slice(0, visibleCount).map((suggestion, index) => (
          <SaleCollectionRow
            key={`suggestion:${suggestion.offerId}`}
            index={index}
            title={suggestion.playlistName}
            meta={`@${suggestion.sellerUsername} · ${suggestion.trackCount} pépite${suggestion.trackCount > 1 ? 's' : ''}`}
            tag={priceLabel(suggestion)}
            onPress={() => onSuggestionPress(suggestion)}
            accessibilityLabel={`Écouter la sélection ${suggestion.playlistName} de ${suggestion.sellerUsername}, ${priceLabel(suggestion)}`}
          />
        ))}
      </View>
      {suggestions.length > SALE_ROWS_INITIAL ? (
        <TouchableOpacity style={s.more} onPress={() => setVisibleCount((n) => nextSaleVisibleCount(n, suggestions.length))} accessibilityRole="button" accessibilityLabel={visibleCount >= suggestions.length ? 'Réduire les sélections' : 'Voir plus de sélections'}>
          <Text style={s.moreText}>{visibleCount >= suggestions.length ? 'RÉDUIRE' : `VOIR PLUS · ${suggestions.length - visibleCount}`}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: { marginHorizontal: 18, marginTop: 8, marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  slogan: { color: colors.textPrimary, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  why: { color: colors.textMutedGrey, fontSize: 12, lineHeight: 16, fontWeight: '700', marginTop: 2 },
  hide: { minHeight: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  hideText: { color: colors.textMutedGrey, fontSize: 11, fontWeight: '900' },
  list: { gap: 8 },
  more: { minHeight: 40, marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: colors.primaryLight, fontSize: 12, fontWeight: '900', letterSpacing: .6 },
  reopen: { marginHorizontal: 18, marginVertical: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, flexDirection: 'row', alignItems: 'center', gap: 10 },
  reopenIcon: { color: colors.primaryLight, fontSize: 16, fontWeight: '900' },
  reopenText: { flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: '800' },
  reopenArrow: { color: colors.primaryLight, fontSize: 20, fontWeight: '900' },
});
