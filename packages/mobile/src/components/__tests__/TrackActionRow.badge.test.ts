// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('TrackActionRow — badge de statut (Adel, 21/09/2026, Partie 3, Problème 2 : "le morceau en vente doit rester visible dans la liste avec un badge, il ne doit pas être caché")', () => {
  const component = readNormalized(__dirname, '..', 'TrackActionRow.tsx');
  const myMusic = readNormalized(__dirname, '..', '..', 'screens', 'MyMusicScreen.tsx');

  it('the badge renders on the title line, never a 3rd row -- the fixed row height stays untouched', () => {
    expect(component).toContain('badge?: { label: string; onPress?: () => void };');
    expect(component).toContain('<View style={styles.titleRow}>');
    expect(component).toContain('<Text style={styles.title} numberOfLines={1}>{title}</Text>');
    expect(component).toContain('{badge ? (');
  });

  it('the title keeps flexShrink so it still truncates correctly next to a fixed-width badge', () => {
    expect(component).toContain("title: { flexShrink: 1, color: colors.textPrimary");
    expect(component).toContain("badge: { flexShrink: 0,");
  });

  it('MyMusicScreen shows the sale price as a badge directly in the row (not hidden behind the chevron), tappable to manage the offer', () => {
    expect(myMusic).toContain('badge={offered ? { label: `🏷️ ${(offered.priceCents / 100).toFixed(2)}€`, onPress: () => editExistingTrackOffer(track) } : undefined}');
  });
});
