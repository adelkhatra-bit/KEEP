// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) =>
  fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Playlist payment proof and delivery contract', () => {
  const checkout = read(__dirname, '..', 'PayoutCheckoutSheet.tsx');
  const panel = read(__dirname, '..', 'PlaylistSalePanel.tsx');
  const publicProfile = read(__dirname, '..', '..', 'screens', 'PublicUserProfileScreen.tsx');
  const notifications = read(__dirname, '..', '..', 'screens', 'NotificationsScreen.tsx');
  const myMusic = read(__dirname, '..', '..', 'screens', 'MyMusicScreen.tsx');
  const proofService = read(__dirname, '..', '..', 'services', 'playlistPaymentProofService.ts');
  const migration = read(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '20261002133000_playlist_sale_payment_proof.sql');

  it('forces the buyer to attach a private proof before signalling payment', () => {
    expect(checkout).toContain('JOINDRE MA PREUVE');
    expect(checkout).toContain('J’AI PAYÉ · ENVOYER AU VENDEUR');
    expect(checkout).toContain('if (!proof)');
    expect(proofService).toContain("const BUCKET = 'playlist-payment-proofs'");
    expect(proofService).toContain("application/pdf");
    expect(proofService).toContain('createSignedUrl(proof.path, 300)');
    expect(migration).toContain('PAYMENT_PROOF_REQUIRED');
  });

  it('wires the QR checkout to the exact playlist payment id', () => {
    expect(publicProfile).toContain('paymentId={payoutCheckout.paymentId}');
    expect(publicProfile).toContain('markPlaylistSaleBuyerPaid(payoutCheckout.paymentId)');
    expect(notifications).toContain("paymentId={paymentCheckoutItem ? (paymentIdOf(paymentCheckoutItem) ?? '') : ''}");
  });

  it('requires the seller to verify PayPal before delivery and exposes the proof', () => {
    expect(panel).toContain('VOIR LA PREUVE DE PAIEMENT');
    expect(panel).toContain('J’AI REÇU LES FONDS · DÉBLOQUER');
    expect(panel).toContain('transaction.buyerMarkedPaidAt');
    expect(panel).toContain('transaction.paymentProofPath');
    expect(notifications).toContain('Vérifie d’abord TON compte PayPal');
    expect(notifications).toContain('FONDS REÇUS · DÉBLOQUER');
    expect(migration).toContain('BUYER_HAS_NOT_MARKED_PAID');
  });

  it('keeps delivery private until the buyer explicitly chooses Public or Private', () => {
    expect(migration).toContain("'PRIVATE'");
    expect(myMusic).toContain('loadPendingVisibilityChoice');
    expect(myMusic).toContain('choosePurchaseVisibility(pendingVisibilityChoice.paymentId, true)');
    expect(myMusic).toContain('choosePurchaseVisibility(pendingVisibilityChoice.paymentId, false)');
    expect(myMusic).toContain('RENDRE PUBLIQUE');
    expect(myMusic).toContain('Garder masquée');
  });

  it('keeps the cart validation action at the bottom after a long selection', () => {
    expect(panel).toContain('Tu es arrivé en bas : valide ici, sans jamais remonter dans la liste.');
    const listEnd = panel.indexOf('<Text style={s.collectionCartBottomCount}>');
    const bottomValidation = panel.indexOf('Tu es arrivé en bas : valide ici');
    expect(listEnd).toBeGreaterThan(-1);
    expect(bottomValidation).toBeGreaterThan(listEnd);
  });
});
