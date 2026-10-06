-- Loki Music — supprimer les anciennes policies Storage du prototype de preuve
-- qui utilisaient le chemin paymentId/userId. Le client canonique utilise
-- userId/paymentId et les policies *_own / *_buyer_pending ci-dessous sont
-- désormais la seule voie d'écriture/suppression.

drop policy if exists playlist_payment_proofs_read_participants on storage.objects;
drop policy if exists playlist_payment_proofs_buyer_insert on storage.objects;
drop policy if exists playlist_payment_proofs_buyer_update on storage.objects;
drop policy if exists playlist_payment_proofs_buyer_delete on storage.objects;
