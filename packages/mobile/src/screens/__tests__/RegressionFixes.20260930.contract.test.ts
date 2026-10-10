import fs from 'fs';
import path from 'path';

const read = (fileFromSrc: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', fileFromSrc), 'utf8');

describe('30/09 regression locks', () => {
  it('shows FREE transactions as FREE with balance snapshots, never as 0.00 EUR', () => {
    const service = read('services/playlistSaleService.ts');
    const panel = read('components/PlaylistSalePanel.tsx');
    expect(service).toContain('amountFree: number');
    expect(service).toContain('seller_free_balance_before');
    expect(panel).toContain("transactionAmountLabel(transaction, direction === 'SALE' ? 'RECEIVED' : 'SPENT')");
    expect(panel).toContain('Solde FREE :');
  });

  it('rechecks already published tracks after async sale state loads', () => {
    const music = read('screens/MyMusicScreen.tsx');
    expect(music).toContain('const offerId = saleEditOfferTarget?.offerId');
    expect(music).toContain('includedIds.forEach((trackId) => next.add(trackId))');
  });

  it('deduplicates notifications and routes a tap to the underlying content', () => {
    const service = read('services/notificationService.ts');
    const screen = read('screens/NotificationsScreen.tsx');
    expect(service).toContain('notificationSemanticKey');
    expect(service).toContain('deleteNotificationDuplicates');
    expect(screen).toContain("source: 'NOTIFICATION'");
    expect(screen).toContain("screen: 'Parties'");
    expect(screen).toContain("navigation.navigate('PlaylistSale'");
  });

  it('keeps the Soirées/Battle selector visible', () => {
    const parties = read('screens/PartiesScreen.tsx');
    expect(parties).toContain('accessibilityLabel="Ouvrir Soirées"');
    expect(parties).toContain('accessibilityLabel="Ouvrir directement Battle"');
    expect(parties).toContain('setPendingArenaId(undefined); setBattleOpen(true);');
    expect(parties).toContain("partiesTab === 'SOIREES'");
  });
});
