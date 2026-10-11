-- KEEP / Loki — une collection en euros ne peut jamais être publiée sans
-- destination de paiement du créateur. Le client applique déjà ce garde-fou ;
-- ce trigger le rend également non contournable côté base/RPC.

create or replace function public.keep_playlist_sale_require_money_payout()
returns trigger
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_link text;
begin
  if new.payment_mode = 'MONEY' and new.is_active then
    select nullif(btrim(p.payout_link), '')
      into v_link
    from public.profiles p
    where p.id = new.seller_id;

    if v_link is null then
      raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
    end if;
    if v_link !~* '^https://' then
      raise exception 'SELLER_PAYOUT_LINK_INSECURE';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_playlist_sale_money_requires_payout on public.playlist_sale_offers;
create trigger trg_playlist_sale_money_requires_payout
before insert or update of payment_mode, is_active, seller_id
on public.playlist_sale_offers
for each row
execute function public.keep_playlist_sale_require_money_payout();

revoke all on function public.keep_playlist_sale_require_money_payout() from public, anon, authenticated;
