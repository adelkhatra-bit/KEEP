// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('PlaylistSaleHistoryScreen (Adel, 21/09/2026, mission 3/3 : historique des ventes)', () => {
  const source = readNormalized(__dirname, '..', 'PlaylistSaleHistoryScreen.tsx');
  const service = readNormalized(__dirname, '..', '..', 'services', 'playlistSaleService.ts');
  const nav = readNormalized(__dirname, '..', '..', 'navigation', 'Navigation.tsx');
  const panel = readNormalized(__dirname, '..', '..', 'components', 'PlaylistSalePanel.tsx');

  it('exposes the accounting-ready fields from the mission spec (seller_id implicit via auth, buyer_id, playlist_id, amount, currency, status, dates, payment reference)', () => {
    expect(service).toContain('export type PlaylistSaleHistoryEntry = {');
    expect(service).toContain('buyerId: string;');
    expect(service).toContain('playlistId: string;');
    expect(service).toContain('amountCents: number;');
    expect(service).toContain('currencyCode: string;');
    expect(service).toContain("status: 'PENDING' | 'COMPLETED';");
    expect(service).toContain('createdAt: string;');
    expect(service).toContain('deliveredAt: string | null;');
    expect(service).toContain('paymentReference: string | null;');
  });

  it('reuses the existing keep_playlist_sale_my_sales RPC instead of a new table', () => {
    expect(service).toContain('export async function loadMySalesHistory(): Promise<PlaylistSaleHistoryEntry[]> {');
    expect(service).toContain("supabase.rpc('keep_playlist_sale_my_sales')");
  });

  it('supports an optional payment reference on confirmation, without changing the confirmation UX', () => {
    expect(service).toContain('export async function markPlaylistSalePaid(paymentId: string, paymentReference?: string): Promise<PlaylistDeliveryResult> {');
  });

  it('is a read-only screen: no call to markPlaylistSalePaid or clearPlaylistSalePrice from here', () => {
    expect(source).not.toContain('markPlaylistSalePaid');
    expect(source).not.toContain('clearPlaylistSalePrice');
  });

  it('shows status as text + color, never color alone (Design System)', () => {
    expect(source).toContain("item.status === 'COMPLETED' ? '✓ Payée' : '⏳ En attente'");
  });

  it('is registered as its own route, reachable from the seller management panel', () => {
    expect(nav).toContain("import PlaylistSaleHistoryScreen from '../screens/PlaylistSaleHistoryScreen';");
    expect(nav).toContain('<RootStack.Screen name="PlaylistSaleHistory" component={PlaylistSaleHistoryScreen} />');
    expect(panel).toContain("navigation.navigate('PlaylistSaleHistory')");
  });
});
