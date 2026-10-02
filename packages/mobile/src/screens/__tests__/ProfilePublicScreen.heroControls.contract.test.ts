// @ts-nocheck
import fs from 'fs';
import path from 'path';

const source = fs
  .readFileSync(path.resolve(__dirname, '..', 'ProfilePublicScreen.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

describe('ProfilePublicScreen — owner actions stay together in the hero', () => {
  it('keeps preview, collections and Battle aligned before the collection content', () => {
    const actions = source.indexOf('<View style={s.ownerQuickActions}>');
    const preview = source.indexOf('▶ APERÇU', actions);
    const sales = source.indexOf('◆ PÉPITES', actions);
    const battle = source.indexOf('⚡ BATTLE', actions);
    const collection = source.indexOf('<View style={s.collectionHeader}>');

    expect(actions).toBeGreaterThanOrEqual(0);
    expect(preview).toBeGreaterThan(actions);
    expect(sales).toBeGreaterThan(preview);
    expect(battle).toBeGreaterThan(sales);
    expect(collection).toBeGreaterThan(battle);
  });

  it('keeps the Battle availability control visible beside the owner identity', () => {
    expect(source).toContain('<BattleGlowButton');
    expect(source).toContain("label={battleAvailable ? '⚡ BATTLE ON' : '⚡ BATTLE OFF'}");
    expect(source).toContain('accessibilityRole="switch"');
    expect(source).toContain("accessibilityLabel={battleAvailable ? 'Ne plus recevoir de défis Battle' : 'Recevoir des défis Battle'}");
  });

  it('uses the shared animated action component for the owner quick actions', () => {
    expect(source).toContain("import MotionActionButton from '../components/MotionActionButton';");
    expect(source).toContain('containerStyle={s.ownerQuickActionFull}');
    expect(source).toContain('accessibilityLabel="Voir aperçu"');
    expect(source).toContain("accessibilityLabel={accountRequired ? 'Comprendre comment publier une Pépite' : 'Gérer pépites'}");
    expect(source).toContain('accessibilityLabel="Jouer Battle"');
  });

  it('does not reintroduce the old duplicate sales status block below the hero', () => {
    expect(source).not.toContain('style={s.ownOffersStatus}');
    expect(source).not.toContain('Gérer mes découvertes en vente');
  });

  it('owner profile: no duplicate « Mes sélections » card, the PÉPITES button shows the published count (Adel 29/09/2026)', () => {
    expect(source).not.toContain('style={s.ownerCollectionRail}');
    expect(source).not.toContain('Mes sélections');
    expect(source).toContain('<Text style={s.ownerQuickActionBadgeText}>{playlistSaleOffers.length}</Text>');
  });

  it('keeps style listening directly on the immersive style card', () => {
    expect(source).toContain("import ProfileStyleCard from '../components/ProfileStyleCard';");
    expect(source).toContain("onPress={() => openSelectionSwipe({ title: folder.genre");
    expect(source).toContain("fullWidth={genreFolders.length % 2 === 1 && index === genreFolders.length - 1}");
  });
});
