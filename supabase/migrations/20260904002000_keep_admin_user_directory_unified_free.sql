-- Adel a repere plusieurs fois la meme incoherence (profil vs Offres) : ici
-- c'est admin_user_directory qui recalculait le Free restant avec sa PROPRE
-- formule inline (guest+signup - keeps, jamais pour un plan payant, jamais
-- au courant des Free de Battle/croissance/bonus mensuel/dons manuels). Un
-- Super Admin qui va bientot pouvoir crediter un utilisateur (admin_credit_grants)
-- doit voir l'effet de son propre geste dans son propre tableau -- meme
-- fonction unifiee que le reste de l'application (keep_theoretical_free_credit_remaining_for_profile),
-- pour TOUS les plans desormais, pas seulement FREE.
create or replace function public.admin_user_directory()
returns table(id uuid, email text, email_confirmed_at timestamp with time zone, username text, display_name text, support_number bigint, country_code character, kind text, created_at timestamp with time zone, plan_code text, keeps_this_month bigint, avatar_url text, free_keeps_used integer, social_keeps integer, credit_consumed integer, credit_limit integer, credit_remaining integer, playlist_tracks integer, recognized_count integer, account_verified boolean, certification_tier text)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  guest_limit integer := 3;
  signup_bonus integer := 20;
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid() and a.is_active = true
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  guest_limit := coalesce((select (value #>> '{}')::integer from public.remote_config where key='guest_success_limit' limit 1), 3);
  signup_bonus := coalesce((select (value #>> '{}')::integer from public.remote_config where key='signup_bonus_successes' limit 1), 20);

  return query
  select
    p.id,
    case when u.email like '%@keep.local' then null else u.email::text end,
    case when u.email like '%@keep.local' then null else u.email_confirmed_at end,
    p.username::text,
    p.display_name::text,
    p.support_number,
    p.country_code,
    p.kind::text,
    p.created_at,
    coalesce(active_plan.code, 'FREE')::text,
    coalesce(monthly.keeps, 0)::bigint,
    p.avatar_url::text,
    public.keep_chargeable_keep_count(p.id),
    public.keep_social_keep_count(p.id),
    greatest(coalesce(d.consumed_count, 0), public.keep_chargeable_keep_count(p.id)),
    case when coalesce(active_plan.code, 'FREE')::text = 'FREE' then guest_limit + signup_bonus else null end,
    public.keep_theoretical_free_credit_remaining_for_profile(p.id),
    coalesce(library.track_count, 0),
    coalesce(mu.recognized_count, 0),
    coalesce(not u.is_anonymous, false),
    case
      when not coalesce(not u.is_anonymous, false) then 'UNVERIFIED'
      when coalesce(active_plan.code, 'FREE') = 'VENUE_PRO' then 'VENUE_PRO'
      when coalesce(active_plan.code, 'FREE') = 'CREATOR_PRO' then 'CREATOR_PRO'
      when coalesce(active_plan.code, 'FREE') = 'PREMIUM' then 'PREMIUM'
      else 'FREE'
    end::text
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join lateral (
    select pl.code::text as code
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p.id
      and s.status in ('ACTIVE','TRIALING')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_start desc nulls last, s.created_at desc
    limit 1
  ) active_plan on true
  left join lateral (
    select count(*)::bigint as keeps
    from public.keep_decisions kd
    where kd.profile_id = p.id
      and kd.decision = 'KEPT'
      and kd.created_at >= date_trunc('month', now())
  ) monthly on true
  left join public.download_credit_usage d on d.profile_id = p.id
  left join public.music_usage_counters mu on mu.profile_id = p.id
  left join lateral (
    select count(distinct pt.track_id)::integer as track_count
    from public.playlists pl
    join public.playlist_tracks pt on pt.playlist_id = pl.id
    where pl.owner_id = p.id
  ) library on true
  order by p.created_at desc;
end;
$function$;
