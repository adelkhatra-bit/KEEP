create or replace function public.keep_track_discovery_impact(p_track_id uuid, p_origin_profile_id uuid)
returns table(recovery_count integer, unique_users integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    count(*)::integer as recovery_count,
    count(distinct kd.profile_id)::integer as unique_users
  from public.keep_decisions kd
  where kd.decision = 'KEPT'
    and kd.track_id = p_track_id
    and kd.source_user_id = p_origin_profile_id
    and kd.profile_id <> p_origin_profile_id;
$function$;

grant execute on function public.keep_track_discovery_impact(uuid, uuid) to anon, authenticated;

create or replace function public.keep_notify_discovery_recovery()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor_username text;
  v_track_title text;
  v_social_enabled boolean := true;
begin
  if new.decision <> 'KEPT' or new.source_user_id is null or new.source_user_id = new.profile_id then
    return new;
  end if;

  select np.social_enabled
    into v_social_enabled
  from public.notification_preferences np
  where np.profile_id = new.source_user_id;
  v_social_enabled := coalesce(v_social_enabled, true);
  if not v_social_enabled then
    return new;
  end if;

  select p.username into v_actor_username
  from public.profiles p
  where p.id = new.profile_id;

  select t.title into v_track_title
  from public.tracks t
  where t.id = new.track_id;

  insert into public.notifications(profile_id, type, title, body, data)
  values (
    new.source_user_id,
    'MUSIC_TAKEN',
    'Ta découverte a été récupérée',
    case
      when nullif(v_actor_username, '') is not null then '@' || v_actor_username || ' a gardé « ' || coalesce(v_track_title, 'une de tes découvertes') || ' » grâce à ton KEEP.'
      else 'Un utilisateur a gardé « ' || coalesce(v_track_title, 'une de tes découvertes') || ' » grâce à ton KEEP.'
    end,
    jsonb_build_object(
      'actorProfileId', new.profile_id,
      'actorUsername', v_actor_username,
      'trackId', new.track_id,
      'decisionId', new.id,
      'originProfileId', new.source_user_id,
      'sourceType', new.source_type
    )
  );

  return new;
end;
$function$;

drop trigger if exists trg_keep_notify_discovery_recovery on public.keep_decisions;
create trigger trg_keep_notify_discovery_recovery
after insert on public.keep_decisions
for each row
when (new.decision = 'KEPT' and new.source_user_id is not null)
execute function public.keep_notify_discovery_recovery();

comment on function public.keep_track_discovery_impact(uuid, uuid) is 'Returns viral impact for one track and its original KEEP discoverer.';
comment on function public.keep_notify_discovery_recovery() is 'Notifies the original discoverer when another user creates a new KEEP attributed to that discovery, respecting social notification preference.';
