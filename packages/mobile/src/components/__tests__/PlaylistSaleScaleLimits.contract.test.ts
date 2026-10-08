import fs from 'fs';
import path from 'path';

describe('Playlist marketplace scale limits', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', '..', 'services', 'playlistSaleService.ts'), 'utf8');
  const panel = fs.readFileSync(path.resolve(__dirname, '..', 'PlaylistSalePanel.tsx'), 'utf8');
  const migration = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261001021000_playlist_sale_scale_limits.sql'), 'utf8');

  it('exposes the server-side active collection budget in the UI', () => {
    expect(service).toContain('activeOffers: number');
    expect(service).toContain('maxActiveOffers: number');
    expect(panel).toContain('Collections actives : {access.activeOffers} / {access.maxActiveOffers}');
    expect(panel).toContain('if (current.size >= 200)');
    expect(panel).toContain('Une collection peut contenir au maximum 200 morceaux.');
  });

  it('enforces both collection and per-collection track limits in PostgreSQL', () => {
    expect(migration).toContain('PLAYLIST_SALE_ACTIVE_LIMIT');
    expect(migration).toContain('playlist_sale_active_limit_guard');
    expect(migration).toContain('playlist_sale_offer_track_limit_guard');
    expect(migration).toContain('if v_count >= 200');
  });

  it('adds the two missing foreign-key support indexes from the live advisor audit', () => {
    expect(migration).toContain('playlist_sale_track_requests_response_offer_idx');
    expect(migration).toContain('music_agora_message_reports_reporter_idx');
  });
});
