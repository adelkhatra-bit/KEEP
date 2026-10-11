-- Loki Music — une vente en monnaie peut utiliser soit un lien PayPal,
-- soit le QR PayPal déjà enregistré sur le profil vendeur.
-- Le précédent trigger ne regardait que payout_link et rejetait à tort les
-- vendeurs configurés uniquement avec leur QR.

create or replace function public.keep_playlist_sale_require_money_payout()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link text;
  v_qr text;
begin
  if new.payment_mode = 'MONEY' and new.is_active then
    select
      nullif(btrim(p.payout_link), ''),
      nullif(btrim(p.payout_qr_url), '')
    into v_link, v_qr
    from public.profiles p
    where p.id = new.seller_id;

    if v_link is null and v_qr is null then
      raise exception 'SELLER_PAYOUT_NOT_CONFIGURED';
    end if;

    if v_link is not null and v_link !~* '^https://' then
      raise exception 'SELLER_PAYOUT_LINK_INSECURE';
    end if;

    if v_qr is not null and v_qr !~* '^https://' then
      raise exception 'SELLER_PAYOUT_QR_INSECURE';
    end if;
  end if;

  return new;
end;
$function$;
