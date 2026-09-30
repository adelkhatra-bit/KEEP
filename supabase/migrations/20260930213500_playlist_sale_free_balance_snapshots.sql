-- Capture le solde FREE avant/après chaque déblocage de collection.
-- Les triggers se placent autour du transfert lui-même : aucun changement
-- du débit/crédit métier, seulement un snapshot explicatif pour l'historique.
alter table public.playlist_sale_payments
  add column if not exists seller_free_balance_before integer,
  add column if not exists seller_free_balance_after integer,
  add column if not exists buyer_free_balance_before integer,
  add column if not exists buyer_free_balance_after integer;

create or replace function public.keep_playlist_sale_capture_free_balance_before()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
  update public.playlist_sale_payments
  set seller_free_balance_before=public.keep_theoretical_free_credit_remaining_for_profile(new.seller_id),
      buyer_free_balance_before=public.keep_theoretical_free_credit_remaining_for_profile(new.buyer_id)
  where id=new.payment_id;
  return new;
end $$;

create or replace function public.keep_playlist_sale_capture_free_balance_after()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
  update public.playlist_sale_payments
  set seller_free_balance_after=public.keep_theoretical_free_credit_remaining_for_profile(new.seller_id),
      buyer_free_balance_after=public.keep_theoretical_free_credit_remaining_for_profile(new.buyer_id)
  where id=new.payment_id;
  return new;
end $$;

revoke all on function public.keep_playlist_sale_capture_free_balance_before() from public, anon, authenticated;
revoke all on function public.keep_playlist_sale_capture_free_balance_after() from public, anon, authenticated;

drop trigger if exists keep_playlist_sale_capture_free_before on public.playlist_sale_free_transfers;
create trigger keep_playlist_sale_capture_free_before before insert on public.playlist_sale_free_transfers
for each row execute function public.keep_playlist_sale_capture_free_balance_before();

drop trigger if exists keep_playlist_sale_capture_free_after on public.playlist_sale_free_transfers;
create trigger keep_playlist_sale_capture_free_after after insert on public.playlist_sale_free_transfers
for each row execute function public.keep_playlist_sale_capture_free_balance_after();
