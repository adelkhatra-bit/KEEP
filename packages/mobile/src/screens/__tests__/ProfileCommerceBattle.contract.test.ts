// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Profile commerce + Battle contract', () => {
  const salePanel = read(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');
  const myMusic = read(__dirname, '..', 'MyMusicScreen.tsx');
  const publicProfile = read(__dirname, '..', 'PublicUserProfileScreen.tsx');

  it('lets a seller edit the tracks of an existing offer without recreating it', () => {
    expect(salePanel).toContain('accessibilityLabel={`Modifier les morceaux de ${item.playlistName}`}');
    expect(salePanel).toContain("screen: 'Playlists'");
    expect(salePanel).toContain('manageSaleOfferId: item.offerId || item.playlistId');
    expect(salePanel).toContain('manageSaleOfferName: item.playlistName');

    expect(myMusic).toContain("const offerId = String(route?.params?.manageSaleOfferId || '').trim();");
    expect(myMusic).toContain('setSaleEditOfferTarget({ offerId, playlistName });');
    expect(myMusic).toContain('setSaleSelectionMode(true);');
    expect(myMusic).toContain("Pour en retirer un déjà vendu, touche son badge prix puis “Retirer de la vente”.");
  });

  it('keeps price editing separate from track-content editing', () => {
    expect(salePanel).toContain('accessibilityLabel={`Changer le prix de ${item.playlistName}`}');
    expect(salePanel).toContain('<Text style={s.manageTracksBtnText}>♫ Morceaux</Text>');
    expect(salePanel).toContain('<Text style={s.editBtnText}>€ Prix</Text>');
  });

  it('lets a signed-in visitor challenge the viewed profile directly to a Battle', () => {
    expect(publicProfile).toContain("import { sendBattleChallenge } from '../services/keepBattleLiveService';");
    expect(publicProfile).toContain("await sendBattleChallenge(profile.id, 'MIX', 8);");
    expect(publicProfile).toContain('accessibilityLabel={`Défier ${profile.username} en Battle`}');
    expect(publicProfile).toContain('⚡ DÉFIER EN BATTLE');
  });

  it('keeps Battle safety gates and clear failure feedback', () => {
    expect(publicProfile).toContain("if (!viewer || isLocalGuest || isDemoMode)");
    expect(publicProfile).toContain("message.includes('BATTLE_TARGET_NO_CREDIT')");
    expect(publicProfile).toContain("message.includes('BATTLE_CHALLENGER_NO_CREDIT')");
    expect(publicProfile).toContain("message.includes('BATTLE_DECLINE_THROTTLED')");
    expect(publicProfile).toContain("message.includes('BATTLE_TARGET_NOT_AVAILABLE')");
  });
});
