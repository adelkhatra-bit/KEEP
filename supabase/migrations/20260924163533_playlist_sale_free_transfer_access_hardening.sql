-- Durcissement du journal de transferts FREE : aucune lecture anonyme.
-- Seuls les utilisateurs authentifiés concernés peuvent lire leurs propres transferts.
revoke all on table public.playlist_sale_free_transfers from anon, authenticated;
grant select on table public.playlist_sale_free_transfers to authenticated;

drop policy if exists "playlist_sale_free_transfers_read_own"
on public.playlist_sale_free_transfers;

create policy "playlist_sale_free_transfers_read_own"
on public.playlist_sale_free_transfers
for select
to authenticated
using ((select auth.uid()) = seller_id or (select auth.uid()) = buyer_id);
