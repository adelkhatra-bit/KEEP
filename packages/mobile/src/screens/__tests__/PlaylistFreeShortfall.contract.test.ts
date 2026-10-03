import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Playlist FREE shortfall UX', () => {
  const profile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const preview = read(__dirname, '..', '..', 'components', 'PlaylistSaleImmersivePreview.tsx');
  const service = read(__dirname, '..', '..', 'services', 'playlistSaleService.ts');

  it('checks the real FREE balance before attempting the unlock', () => {
    expect(profile).toContain("import { loadFreeCreditBreakdown } from '../services/creditService';");
    expect(profile).toContain('breakdown.remaining < requiredFree');
    expect(profile).toContain("setFreePurchaseMessage('Solde insuffisant");
    expect(profile).toContain('freeBalance={freeBalance}');
    expect(profile).toContain('purchaseError={freePurchaseMessage}');
  });

  it('keeps the popup open with a red shortage message and recharge action', () => {
    expect(preview).toContain('FREE INSUFFISANTS');
    expect(preview).toContain('RECHARGER MES FREE');
    expect(preview).toContain("backgroundColor: 'rgba(255,92,114,0.10)'");
    expect(preview).toContain('disabled={!waiverAccepted || busy || freeBlocked || allAlreadyOwned}');
    expect(profile).toContain("navigation.navigate('Offers', { sourceFeature: 'PLAYLIST_FREE_SHORTFALL' })");
  });

  it('aligns the profile link and price on one clean row', () => {
    expect(preview).toContain('sellerPriceRow');
    expect(preview).toContain('<Text style={s.profileLinkText}>{normalizedUsername}</Text>');
    expect(preview).toContain('totalPricePill');
    expect(profile).toContain("navigation.navigate('PublicProfile', { username: sellerUsername })");
  });

  it('normalizes Supabase shortage details', () => {
    expect(service).toContain('[error.message, error.details, error.hint, error.code]');
    expect(service).toContain('NOT_ENOUGH_FREE\\s*:\\s*(\\d+)\\s*:\\s*(\\d+)');
  });
});
