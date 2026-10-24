import fs from 'fs';
import path from 'path';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

describe('reçu GARDER (24/10/2026)', () => {
  // import tardif : le module ne dépend que de fonctions pures pour ces helpers
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'TemporaryMusicPreview.tsx'), 'utf8');
  it('affiche toujours le débit et le solde après un GARDER confirmé', () => {
    expect(src).toContain('testID="temporary-music-keep-receipt"');
    expect(src).toContain('−${r.debited} FREE débités${balance}.');
    expect(src).toContain('Inclus dans ton quota · aucun FREE débité');
  });
  it('un seul bouton vert plein : LANCER et MES SESSIONS ne sont plus verts', () => {
    expect(src).not.toMatch(/LANCER \/ RELANCER[\s\S]{0,40}#68F2B1/);
    expect(src).toContain("borderColor: '#A78BFA', backgroundColor: 'rgba(167,139,250,.10)'");
  });
});

describe('version ordinateur réservée aux développeurs', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '..', 'WebCompanionSessionsPanel.tsx'), 'utf8');
  const gate = fs.readFileSync(path.resolve(__dirname, '..', 'WebDeveloperGate.tsx'), 'utf8');
  const modal = fs.readFileSync(path.resolve(__dirname, '..', 'AccountGateModal.tsx'), 'utf8');
  it('toutes les entrées PC passent par le flag pc_connect fermé par défaut', () => {
    expect(panel).toContain('isFeatureEnabled(PC_CONNECT_FLAG_KEY)');
    expect(panel).toContain('if (!allowed) return null;');
  });
  it('le site web ne s’ouvre qu’aux comptes autorisés (flag web_app), jamais sur iPhone', () => {
    expect(gate).toContain("export const WEB_APP_FLAG_KEY = 'web_app';");
    expect(gate).toContain("const guarded = isWeb && Boolean(userId) && !isDemoMode;");
    expect(modal).toContain('<WebDeveloperGate />');
  });
});
