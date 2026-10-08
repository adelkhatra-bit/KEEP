import fs from 'fs';
import path from 'path';

describe('Collection delivery keeps the seller-chosen title', () => {
  const music = fs.readFileSync(path.resolve(__dirname, '..', 'MyMusicScreen.tsx'), 'utf8');
  const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20260921220000_playlist_sale_history_accounting_fields.sql'), 'utf8');

  it('requires a collection name before publication', () => {
    expect(music).toContain('placeholder="Nom de la collection"');
    expect(music).toContain('Nom de la collection exclusive');
  });

  it('creates the buyer playlist with exactly the offer title', () => {
    expect(migration).toContain('insert into public.playlists(owner_id, provider, provider_playlist_id, name, description, is_public, is_smart, cover_url)');
    expect(migration).toContain('v_offer.playlist_name,');
    expect(migration).toContain("'purchase:' || v_payment.id::text");
    expect(migration).toContain("'playlistName', v_offer.playlist_name");
  });
});
