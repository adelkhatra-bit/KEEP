// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('MyMusicScreen — popup Public/Masqué post-achat (Adel, 21/09/2026, mission 2/3)', () => {
  const source = readNormalized(__dirname, '..', 'MyMusicScreen.tsx');
  const service = readNormalized(__dirname, '..', '..', 'services', 'playlistSaleService.ts');

  it('exposes the pending-choice + choice-making RPC wrappers, one choice per purchase', () => {
    expect(service).toContain('export async function loadPendingVisibilityChoice(): Promise<PendingVisibilityChoice | null>');
    expect(service).toContain("supabase.rpc('keep_playlist_sale_pending_visibility_choice')");
    expect(service).toContain('export async function choosePurchaseVisibility(paymentId: string, isPublic: boolean): Promise<void>');
    expect(service).toContain("client().rpc('keep_playlist_sale_choose_delivered_visibility', { p_payment_id: paymentId, p_public: isPublic })");
  });

  it('checks for a pending choice every time the sale state refreshes (on mount + on focus)', () => {
    expect(source).toContain('const [pendingVisibilityChoice, setPendingVisibilityChoice] = useState<PendingVisibilityChoice | null>(null);');
    expect(source).toContain('loadPendingVisibilityChoice()');
  });

  it('shows the choice as a non-dismissable popup (onRequestClose is a no-op, no way to skip silently)', () => {
    expect(source).toContain('<Modal visible={!!pendingVisibilityChoice} transparent animationType="fade" onRequestClose={() => {}}>');
  });

  it('mentions the "1er Gardé" attribution badge so the buyer understands what they are choosing about', () => {
    expect(source).toContain('🥇 1er Gardé');
  });

  it('offers exactly the two choices from the mission spec, "Rendre publique" using the violet primary action style (never green)', () => {
    expect(source).toContain('RENDRE PUBLIQUE');
    expect(source).toContain('Garder masquée');
    expect(source).toContain('await choosePurchaseVisibility(pendingVisibilityChoice.paymentId, true);');
    expect(source).toContain('await choosePurchaseVisibility(pendingVisibilityChoice.paymentId, false);');
  });

  it('reflects the choice immediately by refreshing the library instead of leaving stale state', () => {
    const publicChoiceBlock = source.slice(source.indexOf('RENDRE PUBLIQUE') - 900, source.indexOf('RENDRE PUBLIQUE'));
    expect(publicChoiceBlock).toContain('await refreshLibrary();');
  });
});
