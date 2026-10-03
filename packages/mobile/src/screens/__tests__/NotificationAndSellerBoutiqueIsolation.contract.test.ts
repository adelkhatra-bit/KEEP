import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.resolve(...parts), 'utf8');

describe('Notifications inline actions + seller boutique isolation', () => {
  const notifications = read(__dirname, '..', 'NotificationsScreen.tsx');
  const publicProfile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');
  const boutique = read(__dirname, '..', '..', 'components', 'SellerBoutique.tsx');
  const saleService = read(__dirname, '..', '..', 'services', 'playlistSaleService.ts');

  it('keeps generic social/profile notifications inside Notifications until the user explicitly opens the profile', () => {
    expect(notifications).toContain("if (profileUsername || notificationProfileId(item)) return 'OUVRIR ICI';");
    expect(notifications).toContain('setGenericDetailProfileUsername(profileUsername);');
    expect(notifications).toContain('setGenericDetailItem(item);');
    expect(notifications).toContain('VOIR LE PROFIL · @{genericDetailProfileUsername}');
    expect(notifications).toContain("'+ SUIVRE'");
    expect(notifications).toContain('Actions avec @{profileUsername} ›');
  });

  it('never substitutes another seller recommendation for the visited profile boutique', () => {
    expect(publicProfile).toContain('profileSaleSuggestions.length > 0 && isOwner');
    expect(publicProfile).not.toContain('(isOwner || profileBoutiqueOffers.length === 0)');
    expect(publicProfile).toContain('offers={profileBoutiqueOffers}');
  });

  it('keeps every active collection returned for the seller and only caps presentation layers', () => {
    expect(saleService).toContain("keep_playlist_sale_offers_for_profile");
    expect(publicProfile).toContain('const profileBoutiqueOffers = useMemo(');
    expect(boutique).toContain('const visibleOffers = useMemo(() => offers, [offers]);');
    expect(boutique).toContain('Tout voir · {visibleOffers.length} ›');
    expect(boutique).toContain('.slice(0, DROP_FEATURED_MAX)');
    expect(boutique).toContain('.slice(0, SHELF_MAX)');
  });
});
