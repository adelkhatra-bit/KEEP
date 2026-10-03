import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : « l'algorithme des ventes n'est pas propre ».
const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261003013000_playlist_sale_music_affinity_fanout.sql'), 'utf8');
const rail = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'ProfileOpportunityRail.tsx'), 'utf8');

describe('suggestions de ventes du profil', () => {
  it('ne propose jamais une sélection déjà débloquée, ni sa propre offre, ni une offre inactive', () => {
    expect(sql).toContain('pay.buyer_id=auth.uid()');
    expect(sql).toContain("pay.status='COMPLETED'");
    expect(sql).toContain('o.seller_id<>auth.uid()');
    expect(sql).toContain('o.is_active=true');
    expect(sql).toContain('genre_match_count>0');
  });
  it('tient à grande échelle : part des vendeurs actifs, 2 sélections max par vendeur', () => {
    expect(sql).toContain('active_sellers as (');
    expect(sql).toContain('playlist_sale_notification_fanout_jobs');
    expect(sql).toContain('track_likes');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('seller_rank<=2');
  });
  it('cible uniquement une audience liée au vendeur ET compatible en style', () => {
    expect(sql).toContain("f.followee_id=v_offer.seller_id");
    expect(sql).toContain("kd.source_user_id=v_offer.seller_id");
    expect(sql).toContain("join public.track_likes tl on tl.track_id=seller_kd.track_id");
    expect(sql).toContain("lower(trim(vg.genre))=og.genre");
    expect(sql).toContain("'targetedByMusicTaste',true");
    expect(sql).not.toContain('fallback_sellers');
  });

  it('rubrique : slogan, lignes compactes partagées, aucune carte vide ni bouton en doublon', () => {
    expect(rail).toContain('BOUTIQUE MUSICALE');
    expect(rail).toContain('BOUTIQUE_MARKETING_HOOKS');
    expect(rail).not.toContain('>POUR TOI<');
    expect(rail).toContain('1 TAP · ÉCOUTER 15 s');
    expect(rail).toContain('setInterval(() => setIndex');
    expect(rail).toContain('if (!suggestions.length) return null;');
    expect(rail).toContain('waveStage');
    expect(rail).not.toContain('setDropIndex');
    expect(rail).not.toContain('onParticipatePress');
    expect(rail).not.toContain('onOffersPress');
  });
});
