import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen — séparation écoute / utilisateurs', () => {
  const screen = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const row = readNormalized(__dirname, '..', '..', 'components', 'TrackActionRow.tsx');
  const core = readNormalized(__dirname, '..', '..', 'services', 'keepMusicCoreRecognition.ts');

  it('sépare la bibliothèque selon sourceProfileId', () => {
    expect(screen).toContain("localKeptEntries.filter((entry) => !entry.sourceProfileId)");
    expect(screen).toContain("localKeptEntries.filter((entry) => Boolean(entry.sourceProfileId))");
  });

  it('garde des filtres courts sans compteurs dans les boutons', () => {
    expect(screen).toContain('Mes découvertes');
    expect(screen).toContain("🔒 Reprises d'autres utilisateurs");
    expect(screen).toContain("useState<'ALL' | 'PRIVATE' | 'LISTEN' | 'SESSION' | 'USERS' | 'IDENTIFIED' | 'PULSE'>('ALL')");
    expect(screen).toContain("['ALL', 'TOUT']");
    expect(screen).toContain("['LISTEN', 'DÉCOUVERTE']");
    expect(screen).toContain("['SESSION', 'SESSION']");
    expect(screen).toContain("['USERS', '🔒 REPRISE']");
    expect(screen).toContain("['IDENTIFIED', 'IDENTIFIÉ']");
    expect(screen).toContain("['PULSE', 'LOKI']");
    expect(screen).not.toContain("TOUT · ${localKeptEntries.length}");
    expect(screen).not.toContain("DÉCOUVERTES · ${ownDiscoveryEntries.length}");
    expect(screen).not.toContain("REPRISES · ${socialRepriseEntries.length}");
    expect(screen).toContain("originFilter === 'USERS' ? socialRepriseTracks");
    expect(screen).toContain("originFilter === 'PULSE' ? lokiPulseEntries.map((entry) => entry.track)");
  });

  it('rend l’origine visible sur chaque ligne sans ouvrir le détail', () => {
    expect(screen).toContain("label: localEntry.sourceProfileId");
    expect(screen).toContain(": 'IDENTIFIÉ PAR LOKI'");
    expect(screen).toContain("'social' : 'listen'");
    expect(row).toContain('originBadge?:');
    expect(row).toContain('originBadgeTextSocial');
    expect(row).toContain('originBadgeTextListen');
  });

  it('recharge aussi la provenance serveur après reconnexion/reload', () => {
    expect(core).toContain('source_user_id');
    expect(core).toContain('context.sourceProfileId');
    expect(core).toContain("sourceNames.get(sourceProfileId)");
    expect(core).toContain("context.creditPolicy === 'SOCIAL_ZERO_CREDIT' ? 'SOCIAL_ZERO_CREDIT' : 'LISTEN_KEEP'");
  });
});
