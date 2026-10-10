import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const source = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

jest.mock('../supabaseClient', () => ({ supabase: null }));

describe('PC QR : ouverture réelle des cinq onglets', () => {
  it('ne transfère que des routes de la navigation existante', () => {
    const service = source('packages/mobile/src/services/webPairingService.ts');
    const screens = ['Listen', 'Discover', 'MyMusic', 'Parties', 'Profile'];
    screens.forEach((screen) => expect(service).toContain("{ name: '" + screen + "'"));
    expect(service).toContain('isPcTargetScreen(screen: unknown)');
  });
  it('autorise la commande uniquement pour la session appartenant au demandeur', () => {
    const server = source('supabase/functions/keep-web-pairing/index.ts');
    expect(server).toContain('if (action === "show-screen")');
    expect(server).toContain('.eq("id", id).eq("user_id", auth.user.id)');
    expect(server).toContain('.is("revoked_at", null)');
    expect(server).toContain('PC_SHARE_DURATION_MS');
    expect(server).toContain('screenRequestId');
  });
  it('le clic téléphone écrit une commande et le PC la consomme une fois', () => {
    const service = source('packages/mobile/src/services/webPairingService.ts');
    const pc = source('packages/mobile/src/components/WebPairingLifecycle.tsx');
    const controls = source('packages/mobile/src/components/WebCompanionSessionsPanel.tsx');
    expect(service).toContain("action: 'show-screen'");
    expect(controls).toContain('requestWebCompanionScreen(session.id, screen)');
    expect(controls).toContain('PC_TARGET_SCREENS.map');
    expect(pc).toContain('handledPcScreenRef.current !== eventKey');
    expect(pc).toContain("navigationRef.navigate as any)('Main', { screen }");
    expect(pc).toContain('confirmLeaveGame');
  });
});
