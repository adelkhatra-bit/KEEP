-- Loki Music · garde-fou serveur des paiements marketplace.
-- Une validation visuelle côté client ne suffit pas : tout débit FREE,
-- création de paiement ou confirmation doit avoir une acceptation CGU/CGV
-- enregistrée pour la version active.

create or replace function public.keep_playlist_sale_require_marketplace_terms()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_terms_version constant text := '2026-10-01-chat-payments-v1';
  v_profile_id uuid;
  v_requires_check boolean := false;
begin
  if tg_op = 'INSERT' then
    v_requires_check := true;
    v_profile_id := new.buyer_id;
  elsif tg_op = 'UPDATE' then
    v_profile_id := new.buyer_id;
    v_requires_check :=
      (new.buyer_marked_paid_at is not null and old.buyer_marked_paid_at is null)
      or (upper(coalesce(new.status::text,'')) = 'COMPLETED' and upper(coalesce(old.status::text,'')) <> 'COMPLETED');
  end if;

  if v_requires_check and v_profile_id is not null and not exists (
    select 1
    from public.marketplace_terms_acceptances a
    where a.profile_id = v_profile_id
      and a.terms_version = v_terms_version
  ) then
    raise exception 'TERMS_ACCEPTANCE_REQUIRED' using errcode = '42501';
  end if;

  return new;
end;
$function$;

revoke all on function public.keep_playlist_sale_require_marketplace_terms() from public, anon, authenticated;

drop trigger if exists trg_playlist_sale_require_marketplace_terms on public.playlist_sale_payments;
create trigger trg_playlist_sale_require_marketplace_terms
before insert or update on public.playlist_sale_payments
for each row execute function public.keep_playlist_sale_require_marketplace_terms();
