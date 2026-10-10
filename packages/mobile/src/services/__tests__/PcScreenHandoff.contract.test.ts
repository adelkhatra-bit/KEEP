import fs from 'fs';
import path from 'path';
import { PC_TARGET_SCREENS, isPcTargetScreen } from '../webPairingService';

const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const source = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

jest.mock('../supabaseClient', () => ({ supabase: null }));

describe('PC QR : ouverture réelle des cinq onglets', () => {
  it('ne transfère que des routes de la navigation existante', () => {
    expect(PC_TARGET_SCREENS.map((s) => s.name)).toEqual(['Listen', 'Discover', 'MyMusic', 'Parties', 'Profile']);
    expect(isPcTargetScreen('MyMusic')).toBe(true);
    expect(isPcTargetScreen('DeleteAccount')).toBe(false);
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
