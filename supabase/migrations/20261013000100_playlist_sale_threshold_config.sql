-- Lot 5 Boutique (12/10/2026) -- seuil de vente réglable dans Super Admin.
-- FICHIER SEULEMENT : application en production soumise à l'accord explicite d'Adel.
--
-- Constat prouvé (SELECT lecture) : remote_config ne contient AUCUNE clé
-- playlist_sale_* ; keep_playlist_sale_access() retombe donc sur 100 codé en dur
-- et le Super Admin ne peut rien régler.
--
-- Cette migration (additive) :
--  1. crée les clés avec la valeur actuellement effective (comportement inchangé) :
--     - playlist_sale_follower_threshold = 100
--     - playlist_sale_max_active_offers  = 50
--     - playlist_sale_free_without_threshold = false  (NOUVEAU : si true, la vente
--       n'exige plus de seuil d'abonnés ; Adel décidera de l'assouplir)
--     - boutique_featured_count = 3, desktop_boutique_columns = 3 / _wide = 4
--  2. redéfinit keep_playlist_sale_access() pour lire la clé FREE sans seuil.
--     Les euros restent coupés par le flag playlist_marketplace (inchangé).
--
-- Réversible : remettre playlist_sale_free_without_threshold à false (aucune
-- donnée utilisateur touchée) ; l'ancienne définition est dans
-- 20261001021000_playlist_sale_scale_limits.sql.
--
-- Vérification (lecture) :
--   select key, value from public.remote_config where key like 'playlist_sale_%' or key like 'boutique_%' or key like 'desktop_boutique%';
--   select public.keep_playlist_sale_access();  -- authentifié : unlocked, threshold, freeWithoutThreshold

insert into public.remote_config(key, value, description) values
  ('playlist_sale_follower_threshold', '100'::jsonb, 'Abonnés requis pour vendre une collection. Défaut 100 (valeur effective avant ce réglage).'),
  ('playlist_sale_max_active_offers', '50'::jsonb, 'Maximum de collections actives par vendeur (garde-fou serveur).'),
  ('playlist_sale_free_without_threshold', 'false'::jsonb, 'Si true : vente autorisée sans seuil d''abonnés. Défaut false = comportement actuel.'),
  ('boutique_featured_count', '3'::jsonb, 'Nombre de collections lues en « aperçus » depuis la une de la Boutique (1 à 6).'),
  ('desktop_boutique_columns', '3'::jsonb, 'Colonnes de la Boutique sur ordinateur (2 à 4).'),
  ('desktop_boutique_columns_wide', '4'::jsonb, 'Colonnes de la Boutique sur très grand écran (2 à 4).')
on conflict (key) do nothing;

create or replace function public.keep_playlist_sale_access()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  follower_count integer := 0;
  override integer;
  threshold integer := 100;
  active_offers integer := 0;
  max_active_offers integer := 50;
  raw_limit text;
  free_open boolean := false;
begin
  if uid is null then raise exception 'authentication_required'; end if;

  select count(*)::integer into follower_count from public.follows where followee_id = uid;
  select p.follower_count_override into override from public.profiles p where p.id = uid;
  if override is not null then follower_count := override; end if;

  select value #>> '{}' into raw_limit from public.remote_config where key='playlist_sale_max_active_offers' limit 1;
  if coalesce(raw_limit, '') ~ '^[0-9]+$' then
    max_active_offers := greatest(1, least(raw_limit::integer, 500));
  end if;

  threshold := coalesce(
    (select case when (value #>> '{}') ~ '^[0-9]+$' then (value #>> '{}')::integer else null end
     from public.remote_config where key='playlist_sale_follower_threshold' limit 1),
    100
  );

  free_open := coalesce(
    (select lower(value #>> '{}') in ('true','1','on','yes') from public.remote_config where key='playlist_sale_free_without_threshold' limit 1),
    false
  );

  select count(*)::integer into active_offers
  from public.playlist_sale_offers where seller_id = uid and is_active = true;

  return jsonb_build_object(
    'followers', follower_count,
    'threshold', threshold,
    'unlocked', (follower_count >= threshold) or free_open,
    'freeWithoutThreshold', free_open,
    'activeOffers', active_offers,
    'maxActiveOffers', max_active_offers
  );
end;
$function$;

revoke all on function public.keep_playlist_sale_access() from public;
revoke all on function public.keep_playlist_sale_access() from anon;
grant execute on function public.keep_playlist_sale_access() to authenticated;
