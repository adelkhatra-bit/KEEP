-- Loki Music · anti-spam créateur + préférences respectées.
-- Les plans payants apportent du confort, mais aucun plan n'est requis pour
-- refuser une notification marketing. La nouveauté musicale reste prioritaire
-- sur la Boutique musicale du même créateur.

drop trigger if exists trg_notification_preferences_paid_opt_out_guard
  on public.notification_preferences;
drop function if exists public.keep_notification_preferences_paid_opt_out_guard();

create or replace function public.keep_boutique_notification_insert_guard()
returns trigger
language plpgsql
security definer
set search_path='public'
as $guard$
declare
  v_seller text;
  v_marketing boolean := true;
begin
  if upper(coalesce(new.type,''))<>'PLAYLIST_SALE_OFFER_CREATED' then
    return new;
  end if;

  v_seller:=nullif(coalesce(new.data->>'sellerId',''),'');
  if v_seller is null then return new; end if;

  select coalesce(np.marketing_enabled,false)
  into v_marketing
  from public.notification_preferences np
  where np.profile_id=new.profile_id;

  -- Pas de ligne de préférences = réglage par défaut du produit : marketing OFF.
  if not coalesce(v_marketing,false) then
    return null;
  end if;

  -- Une seule alerte Boutique par créateur et destinataire sur 24 h.
  if exists (
    select 1 from public.notifications n
    where n.profile_id=new.profile_id
      and n.type='PLAYLIST_SALE_OFFER_CREATED'
      and coalesce(n.data->>'sellerId','')=v_seller
      and n.created_at>=now()-interval '24 hours'
  ) then
    return null;
  end if;

  -- Une nouveauté musique récente est prioritaire : pas de deuxième alerte
  -- commerciale du même créateur dans la journée.
  if exists (
    select 1 from public.notifications n
    where n.profile_id=new.profile_id
      and n.type='NEW_PUBLIC_KEEP'
      and coalesce(n.data->>'ownerProfileId','')=v_seller
      and n.created_at>=now()-interval '24 hours'
  ) then
    return null;
  end if;

  return new;
end;
$guard$;

revoke all on function public.keep_boutique_notification_insert_guard()
  from public,anon,authenticated;

-- Historique utilisateur préservé : aucune notification existante n'est
-- supprimée. Le garde ci-dessus empêche seulement les NOUVELLES alertes
-- Boutique redondantes lorsque la même personne a déjà reçu une nouveauté
-- musicale récente du même créateur.
