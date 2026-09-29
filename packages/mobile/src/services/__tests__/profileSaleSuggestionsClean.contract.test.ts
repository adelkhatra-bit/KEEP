import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : « l'algorithme des ventes n'est pas propre ».
const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260929220000_profile_sale_suggestions_clean.sql'), 'utf8');
const rail = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'ProfileOpportunityRail.tsx'), 'utf8');

describe('suggestions de ventes du profil', () => {
  it('ne propose jamais une sélection déjà débloquée, ni sa propre offre, ni une offre inactive', () => {
    expect(sql).toContain("pay.buyer_id=auth.uid() and pay.status='COMPLETED'");
    expect(sql).toContain('o.seller_id<>auth.uid()');
    expect(sql).toContain('o.is_active=true');
    expect(sql).toContain('genre_match_count>0');
  });
  it('tient à grande échelle : part des vendeurs actifs, 2 sélections max par vendeur', () => {
    expect(sql).toContain('active_sellers as (');
    expect(sql).not.toContain('legacy_affinity_unused');
    expect(sql).toContain('seller_rank<=2');
  });
  it('rubrique : slogan, lignes compactes partagées, aucune carte vide ni bouton en doublon', () => {
    expect(rail).toContain('Choisi pour ton oreille');
    expect(rail).not.toContain('>POUR TOI<');
    expect(rail).toContain('<SaleCollectionRow');
    expect(rail).toContain('if (!suggestions.length) return null;');
    expect(rail).not.toContain('onParticipatePress');
    expect(rail).not.toContain('onOffersPress');
  });
});
