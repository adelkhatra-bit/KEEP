-- Les anonymous sign-ins Supabase utilisent le rôle authenticated.
-- Le journal FREE est réservé aux comptes permanents concernés.
drop policy if exists "playlist_sale_free_transfers_read_own"
on public.playlist_sale_free_transfers;

create policy "playlist_sale_free_transfers_read_own"
on public.playlist_sale_free_transfers
for select
to authenticated
using (
  (select (auth.jwt()->>'is_anonymous')::boolean) is false
  and ((select auth.uid()) = seller_id or (select auth.uid()) = buyer_id)
);
