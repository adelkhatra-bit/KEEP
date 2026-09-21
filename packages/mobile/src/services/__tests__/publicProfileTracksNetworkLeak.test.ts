// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

describe('FUITE RÉSEAU RÉELLE corrigée (Adel, 21/09/2026) : keep_public_profile_tracks renvoyait titre/artiste/jaquette en clair pour des morceaux masqués en vente', () => {
  const migration = readNormalized(repoRoot, 'supabase', 'migrations', '20260921240000_public_profile_tracks_mask_marketplace_sales.sql');

  it('excludes tracks currently masked for a marketplace sale directly in the SQL response, not just client-side afterward', () => {
    expect(migration).toContain('create or replace function public.keep_public_profile_tracks(p_profile_id uuid, p_limit integer DEFAULT 250, p_offset integer DEFAULT 0)');
    expect(migration).toContain('public.keep_playlist_sale_masked_track_ids(p_profile_id)');
    expect(migration).toContain('and not (track_id = any(masked.ids))');
  });

  it('never masks the profile owner\'s own view of their own tracks (auth.uid() = p_profile_id -> empty mask)', () => {
    expect(migration).toContain('case when auth.uid() = p_profile_id then array[]::uuid[] else public.keep_playlist_sale_masked_track_ids(p_profile_id) end as ids');
  });

  it('reuses the existing masking function instead of duplicating the sale-offer logic', () => {
    expect(migration).not.toContain('playlist_sale_offer_tracks'); // pas de logique dupliquée ici -- délègue entièrement
  });
});
