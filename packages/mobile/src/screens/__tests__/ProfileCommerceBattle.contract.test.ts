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
    expect(salePanel).toContain('accessibilityLabel={`Modifier les musiques de ${item.playlistName}`}');
    expect(salePanel).toContain("screen: 'MyMusic'");
    expect(salePanel).toContain('manageSaleOfferId: item.offerId || item.playlistId');
    expect(salePanel).toContain('manageSaleOfferName: item.playlistName');

    expect(myMusic).toContain("const offerId = String(route?.params?.manageSaleOfferId || '').trim();");
    expect(myMusic).toContain('setSaleEditOfferTarget({ offerId, playlistName });');
    expect(myMusic).toContain('setSaleSelectionMode(true);');
    expect(myMusic).toContain("PRIX · PAIEMENT · STATUT");
    expect(myMusic).toContain("badge={offered ? { label: saleSelectionMode ? '◆ DÉJÀ PUBLIÉE' : `◆ Collection · ${offered.playlistName}`");
  });

  it('keeps access-mode editing separate from track-content editing', () => {
    expect(salePanel).toContain('accessibilityLabel={`Modifier le mode d’accès de ${item.playlistName}`}');
    expect(salePanel).toContain('<Text style={s.manageTracksBtnText}>✎ MODIFIER</Text>');
    expect(salePanel).toContain('<Text style={s.editBtnText}>€ / FREE</Text>');
  });

  it('lets a signed-in visitor challenge the viewed profile directly to a Battle', () => {
    expect(publicProfile).toContain("import { sendBattleChallenge } from '../services/keepBattleLiveService';");
    expect(publicProfile).toContain("await sendBattleChallenge(profile.id, 'MIX', 8);");
    expect(publicProfile).toContain('accessibilityLabel={`Défier ${profile.username} en Battle`}');
    expect(publicProfile).toContain("{battleInviteBusy ? '⚡ ENVOI…' : '⚡ BATTLE'}");
    expect(publicProfile).toContain("accessibilityLabel={`Défier ${profile.username} en Battle`}");
  });

  it('keeps Battle safety gates and clear failure feedback', () => {
    expect(publicProfile).toContain("if (!effectiveViewerId) {");
    expect(publicProfile).toContain("message.includes('BATTLE_TARGET_NO_CREDIT')");
    expect(publicProfile).toContain("message.includes('BATTLE_CHALLENGER_NO_CREDIT')");
    expect(publicProfile).toContain("message.includes('BATTLE_DECLINE_THROTTLED')");
    expect(publicProfile).toContain("message.includes('BATTLE_TARGET_NOT_AVAILABLE')");
  });
});
