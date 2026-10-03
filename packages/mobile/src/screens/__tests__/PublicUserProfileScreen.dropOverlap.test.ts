import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'PublicUserProfileScreen.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const ownerSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const boutique = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'SellerBoutique.tsx'), 'utf8');

describe('PublicUserProfileScreen — Boutique musicale et titres nouveaux', () => {
  it('charge le chevauchement serveur sans révéler les titres masqués', () => {
    expect(source).toContain('loadPlaylistSaleOfferOverlap');
    expect(source).toContain('saleOfferOverlaps');
    expect(source).toContain('missingCount');
  });

  it('affiche avant ouverture le nombre de titres réellement absents', () => {
    // 02/10/2026 : boutique vendeur validée par Adel (SellerBoutique : Boutique musicale + étagère + boutique).
    expect(source).toContain('overlaps={saleOfferOverlaps}');
    expect(boutique).toContain("NOUVEAU{overlap.missingCount > 1 ? 'X' : ''}");
    expect(boutique).toContain('✓ DÉJÀ CHEZ TOI');
    expect(boutique).toContain("nouveau${dropNew > 1 ? 'x' : ''} pour toi");
  });

  it('affiche la Boutique musicale sans toucher aux compteurs du profil', () => {
    expect(source).toContain('BOUTIQUE MUSICALE');
    expect(boutique).toContain('BOUTIQUE MUSICALE');
  });

  it('le bouton pluriel enchaîne toutes les Pépites à la une', () => {
    expect(boutique).toContain('onOpenAllOffers?: (offers: PublicPlaylistSaleOffer[]) => void;');
    expect(boutique).toContain('▶ ÉCOUTER LES APERÇUS');
    expect(boutique).toContain('if (onOpenAllOffers) onOpenAllOffers(queue);');
    expect(source).toContain('onOpenAllOffers={(offers) => { void playFeaturedSalePreviews(offers); }}');
  });

  it('lance l’écoute en un seul clic depuis les ronds de style et la Boutique', () => {
    expect(boutique).toContain('onOpenOffer: (offer: PublicPlaylistSaleOffer) => void;');
    expect(boutique).toContain('onPress={() => onOpenOffer(offer)}');
    expect(boutique).toContain("Boutique musicale");
    expect(boutique).not.toContain("accessibilityLabel={`Afficher le drop");
  });

  it('conserve les prix unitaires dans la Boutique musicale', () => {
    expect(source).toContain('<SellerBoutique');
    expect(boutique).toContain("const free = offer.paymentMode === 'FREE';");
    expect(boutique).toContain('✓ DÉBLOQUÉE');
    expect(source).toContain('onOpenOffer={(offer) => openSaleFolder(offer)}');
    expect(boutique).toContain('PÉPITE À LA UNE');
    expect(boutique).toContain('TOUCHE POUR ÉCOUTER · TITRES PROTÉGÉS');
    expect(boutique).toContain('TOUCHE POUR ÉCOUTER TA COLLECTION');
    expect(boutique).toContain('dropPlay');
    expect(boutique).toContain('1 clic pour écouter');
    expect(boutique).toContain('▶ ÉCOUTER LES APERÇUS');
    expect(boutique).not.toContain('Afficher le drop');
    expect(boutique).not.toContain('setDropIndex');
  });

  it('affiche le total et garde achat groupé + achat individuel', () => {
    expect(boutique).toContain('TOTAL DES PÉPITES');
    expect(boutique).toContain('TOUT PRENDRE');
    expect(boutique).toContain('onOpenOffer(drop)');
    expect(source).toContain('buyAllPlaylistOffers');
    expect(source).toContain('requestPlaylistBundlePurchase');
    expect(source).toContain('purchasePlaylistBundleWithFree');
    expect(source).toContain('onOpenOffer={(offer) => openSaleFolder(offer)}');
  });

  it('partage aussi exactement le même habillage de boutique entre propriétaire et visiteur', () => {
    expect(source).toContain("SELLER_BOUTIQUE_SECTION_STYLE");
    expect(ownerSource).toContain("SELLER_BOUTIQUE_SECTION_STYLE");
    expect(boutique).toContain("export const SELLER_BOUTIQUE_SECTION_STYLE");
  });

  it('le propriétaire lance directement sa collection sans popup achat', () => {
    expect(source).toContain('loadOwnPlaylistSaleOfferTracks(offer.offerId)');
    expect(source).toContain('sale-owner:');
    expect(source).not.toContain("même aperçu masqué 15 s, mais aucun achat possible");
  });

  it('garde la même configuration d’écoute côté vendeur et réserve la gestion au bouton PÉPITES du profil', () => {
    expect(boutique).toContain('▶ ÉCOUTER LES APERÇUS');
    expect(boutique).not.toContain('◆ GÉRER MES COLLECTIONS');
    expect(boutique).toContain('TOUCHE POUR ÉCOUTER TA COLLECTION');
  });

  it('utilise exactement la même SellerBoutique sur le profil propriétaire', () => {
    expect(ownerSource).toContain("import SellerBoutique, { SELLER_BOUTIQUE_SECTION_STYLE } from '../components/SellerBoutique';");
    expect(ownerSource).toContain('<SellerBoutique');
    expect(ownerSource).toContain('ownerMode');
    expect(ownerSource).toContain("navigation.navigate('PlaylistSale'");
    expect(boutique).toContain('viewerUsername?: string;');
    expect(boutique).toContain("replace(/^@+/, '')");
    expect(boutique).toContain('Merci pour ta visite');
    expect(boutique).not.toContain('LES PÉPITES DE @');
  });
});
