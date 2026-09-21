// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

/**
 * AUDIT (Adel, 21/09/2026) : "L'offre s'affiche avec un identifiant
 * technique incompréhensible : keep-selection:bca8c268-...". Vérifié en
 * base par requête directe avant tout code : le code de création (v1 du
 * 18/09 ET v2 du 20/09) sépare TOUJOURS playlist_name de playlist_id --
 * ce n'était pas un bug reproductible aujourd'hui, mais une donnée
 * orpheline du 15/09 (avant même que ces migrations existent). Corrigée
 * quand même, avec une contrainte pour empêcher toute récidive future,
 * quelle que soit la voie d'insertion.
 */
describe('AUDIT + correctif : nom d\'offre illisible (UUID affiché au lieu d\'un titre)', () => {
  const migration = readNormalized(repoRoot, 'supabase', 'migrations', '20260921250000_fix_playlist_sale_offer_name_data_bug.sql');
  const v1 = readNormalized(repoRoot, 'supabase', 'migrations', '20260918090000_keep_playlist_sale_track_selection.sql');
  const v2 = readNormalized(repoRoot, 'supabase', 'migrations', '20260920190000_playlist_marketplace_delivery.sql');

  it('confirms the creation RPCs (v1 and v2) never confuse playlist_name with playlist_id -- the bug was in stale data, not in current code', () => {
    expect(v1).toContain("values (new_offer_id, uid, 'keep-selection:' || new_offer_id::text, clean_name,");
    expect(v2).toContain("values (new_offer_id, uid, 'keep-selection:' || new_offer_id::text, clean_name,");
  });

  it('regenerates a readable auto-name for any existing offer whose name was left equal to its technical id', () => {
    expect(migration).toContain("where playlist_name = playlist_id or playlist_name like 'keep-selection:%';");
    expect(migration).toContain("'Sélection du ' || to_char(created_at, 'DD/MM') || ' · '");
  });

  it('adds a database-level guarantee this can never happen again, regardless of the insertion path', () => {
    expect(migration).toContain('playlist_sale_offers_name_not_technical_id');
    expect(migration).toContain("check (playlist_name !~ '^keep-selection:' and length(trim(playlist_name)) > 0)");
  });

  it('masks the real offer name and cover for the PUBLIC (buyer-facing) listing -- a second, more serious leak found in the same audit ("on ne dévoile rien avant achat")', () => {
    expect(migration).toContain("'Découverte musicale',");
    expect(migration).toContain('null::text,');
    expect(migration).toContain('where o.seller_id = p_profile_id and o.is_active = true');
  });

  it('never touches the seller\'s own authenticated view -- the seller must always see their real title', () => {
    const sellerFn = readNormalized(repoRoot, 'supabase', 'migrations', '20260914080000_keep_playlist_sale_foundation.sql');
    expect(sellerFn).toContain('select playlist_id, playlist_name, price_cents, currency_code, is_active, updated_at\n  from public.playlist_sale_offers\n  where seller_id = auth.uid()');
  });
});
