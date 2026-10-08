-- Lecture seule : agrégats admin sur les tables existantes, aucune nouvelle table.
create or replace function public.admin_music_overview()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_stats_schema text;
  v_latency numeric;
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','TECH']), false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  with real_profiles as materialized (
    select p.id, p.username from public.profiles p
    where not public.keep_is_test_profile(p.id)
  ),
  styles as (
    select s.taste_key, min(s.display_label) label, count(*) profiles, sum(s.score) score
    from public.profile_music_taste_scores s join real_profiles p on p.id = s.profile_id
    where s.taste_type = 'GENRE' and s.score > 0
    group by s.taste_key
    order by profiles desc, score desc, s.taste_key
    limit 10
  ),
  discoverers as (
    select p.id, p.username, count(*) tracks
    from public.keep_track_first_discoveries d join real_profiles p on p.id = d.profile_id
    group by p.id, p.username
    order by tracks desc, p.id
    limit 10
  ),
  platforms as (
    select i.provider, count(*) items
    from public.music_library_items i join real_profiles p on p.id = i.profile_id
    where i.removed_at is null
    group by i.provider
  ),
  pulse as (
    select count(*) pairs,
      count(*) filter (where e.last_shown_at > e.first_shown_at) repeated
    from public.profile_loki_pulse_events e join real_profiles p on p.id = e.profile_id
  )
  select jsonb_build_object(
    'catalog', (select jsonb_build_object(
      'total', count(*),
      'added24h', count(*) filter (where t.created_at >= now() - interval '24 hours'),
      'added7d', count(*) filter (where t.created_at >= now() - interval '7 days')
    ) from public.tracks t),
    'queue', (select jsonb_build_object(
      'pending', count(*) filter (where q.status in ('PENDING','RETRY')),
      'processing', count(*) filter (where q.status = 'PROCESSING')
    ) from public.keep_world_catalog_expansion_queue q),
    'styles', coalesce((select jsonb_agg(jsonb_build_object(
      'key', s.taste_key, 'label', s.label, 'profiles', s.profiles, 'score', s.score
    ) order by s.profiles desc, s.score desc, s.taste_key) from styles s), '[]'::jsonb),
    'discoverers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'username', d.username, 'tracks', d.tracks
    ) order by d.tracks desc, d.id) from discoverers d), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object(
      'provider', p.provider, 'items', p.items
    ) order by p.items desc, p.provider) from platforms p), '[]'::jsonb),
    'pulse', (select jsonb_build_object(
      'pairs', p.pairs, 'repeated', p.repeated,
      'repeatPercent', round(100.0 * p.repeated / nullif(p.pairs, 0), 1)
    ) from pulse p),
    'observedAt', now()
  ) into v_result;

  -- keep_loki_pulse écrit les expositions/notifications : ne jamais l'appeler
  -- pour une sonde admin. pg_stat_statements mesure le serveur sans mutation.
  select n.nspname into v_stats_schema
  from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pg_stat_statements';
  if v_stats_schema is not null then
    begin
      execute format(
        'select round((sum(total_exec_time) / nullif(sum(calls), 0))::numeric, 1)
         from %I.pg_stat_statements
         where dbid = (select oid from pg_catalog.pg_database where datname = current_database())
           and query ~ ''\mkeep_loki_pulse"?\s*\(''',
        v_stats_schema
      ) into v_latency;
    exception when object_not_in_prerequisite_state or undefined_table or insufficient_privilege then
      v_latency := null;
    end;
  end if;
  return v_result || jsonb_build_object('pulseLatencyMs', v_latency);
end;
$function$;
revoke all on function public.admin_music_overview() from public, anon;
grant execute on function public.admin_music_overview() to authenticated;
