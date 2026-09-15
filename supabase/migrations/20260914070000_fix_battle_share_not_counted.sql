-- Adel -- BUG RÉEL trouvé en auditant mon propre ajout du 13/09 (partage de
-- résultat Battle) : sharingService.ts appelle track_keep_event('battle_share',
-- ...) pour ce nouveau type de partage, mais product_events_event_name_chk et
-- keep_qualified_share_count() n'autorisaient/ne comptaient que les 5 types de
-- partage plus anciens. L'erreur est avalée côté client (le partage
-- fonctionne quand même pour l'utilisateur), donc silencieux : chaque partage
-- de résultat Battle n'était jamais ni stocké ni compté vers les paliers de
-- partages qualifiés (Free bonus). Corrigé ici, jamais détecté par un
-- utilisateur.
alter table public.product_events drop constraint if exists product_events_event_name_chk;
alter table public.product_events add constraint product_events_event_name_chk
  check (event_name = any (array['profile_share','profile_share_email','playlist_share','compare_share','event_share','battle_share']));

create or replace function public.keep_qualified_share_count(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select coalesce((select (value #>> '{}')::integer from public.remote_config where key='growth_share_daily_cap' limit 1),10) as cap
  ), per_day as (
    select date(created_at) as d, count(*)::integer as c
    from public.product_events
    where profile_id = p_uid
      and event_name in ('profile_share','profile_share_email','playlist_share','compare_share','event_share','battle_share')
    group by date(created_at)
  )
  select coalesce(sum(least(per_day.c, cfg.cap)),0)::integer from per_day cross join cfg;
$function$;
