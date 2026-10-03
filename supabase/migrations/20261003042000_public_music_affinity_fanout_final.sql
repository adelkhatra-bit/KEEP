-- Loki Music — fan-out musique final.
-- Audience : abonnés OU utilisateurs ayant déjà repris/aimé ce créateur.
-- Filtrage par goûts musicaux, respect de music_enabled, blocages, possession
-- existante et anti-spam créateur (30 minutes).

create or replace function public.keep_process_public_track_notification_fanout(
  p_jobs integer default 40,
  p_batch integer default 2000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.public_track_notification_fanout_jobs%rowtype;
  v_recipient_count integer;
  v_notification_count integer;
  v_last_recipient uuid;
  v_total integer := 0;
begin
  p_jobs := greatest(1, least(coalesce(p_jobs,40),100));
  p_batch := greatest(100, least(coalesce(p_batch,2000),5000));

  for v_job in
    select j.*
    from public.public_track_notification_fanout_jobs j
    where j.completed_at is null
    order by j.created_at asc
    limit p_jobs
    for update skip locked
  loop
    if not exists (
      select 1 from public.keep_decisions kd
      where kd.id=v_job.decision_id
        and kd.profile_id=v_job.owner_profile_id
        and kd.decision='KEPT'
        and kd.visibility='PUBLIC'
    ) then
      update public.public_track_notification_fanout_jobs
      set completed_at=now(),updated_at=now(),attempt_count=attempt_count+1
      where decision_id=v_job.decision_id;
      continue;
    end if;

    with track_genres as materialized (
      select distinct lower(trim(g.genre)) genre
      from public.tracks t
      cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
      where t.id::text=v_job.track_id
        and nullif(trim(g.genre),'') is not null
    ),
    related as materialized (
      select f.follower_id recipient_id
      from public.follows f
      where f.followee_id=v_job.owner_profile_id
        and f.created_at<=v_job.audience_cutoff

      union

      select kd.profile_id recipient_id
      from public.keep_decisions kd
      where kd.source_user_id=v_job.owner_profile_id
        and kd.decision='KEPT'
        and kd.profile_id<>v_job.owner_profile_id
        and kd.created_at<=v_job.audience_cutoff

      union

      select tl.profile_id recipient_id
      from public.track_likes tl
      join public.keep_track_first_discoveries fd on fd.track_id=tl.track_id
      where fd.profile_id=v_job.owner_profile_id
        and tl.profile_id<>v_job.owner_profile_id
        and tl.created_at<=v_job.audience_cutoff
    ),
    candidate_page as materialized (
      select r.recipient_id
      from related r
      where v_job.last_follower_id is null or r.recipient_id>v_job.last_follower_id
      order by r.recipient_id
      limit p_batch
    ),
    viewer_genres as materialized (
      select distinct cp.recipient_id,lower(trim(g.genre)) genre
      from candidate_page cp
      join public.profiles vp on vp.id=cp.recipient_id
      cross join lateral unnest(
        coalesce(vp.favorite_genres,'{}'::text[]) ||
        coalesce(vp.inferred_genres,'{}'::text[])
      ) g(genre)
      where nullif(trim(g.genre),'') is not null

      union

      select distinct cp.recipient_id,lower(trim(g.genre)) genre
      from candidate_page cp
      join public.keep_decisions kd
        on kd.profile_id=cp.recipient_id
       and kd.decision='KEPT'
      join public.tracks t on t.id=kd.track_id
      cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
      where nullif(trim(g.genre),'') is not null

      union

      select distinct cp.recipient_id,lower(trim(g.genre)) genre
      from candidate_page cp
      join public.track_likes tl on tl.profile_id=cp.recipient_id
      join public.tracks t on t.id=tl.track_id
      cross join lateral unnest(coalesce(t.genres,'{}'::text[])) g(genre)
      where nullif(trim(g.genre),'') is not null
    ),
    eligible as materialized (
      select cp.recipient_id
      from candidate_page cp
      left join public.notification_preferences np on np.profile_id=cp.recipient_id
      where coalesce(np.music_enabled,true)=true
        and not exists (
          select 1
          from public.keep_decisions own_kd
          where own_kd.profile_id=cp.recipient_id
            and own_kd.track_id::text=v_job.track_id
            and own_kd.decision='KEPT'
        )
        and not exists (
          select 1
          from public.user_blocks b
          where (b.blocker_id=cp.recipient_id and b.blocked_id=v_job.owner_profile_id)
             or (b.blocker_id=v_job.owner_profile_id and b.blocked_id=cp.recipient_id)
        )
        and not exists (
          select 1
          from public.notifications n
          where n.profile_id=cp.recipient_id
            and n.type='NEW_PUBLIC_KEEP'
            and coalesce(n.data->>'ownerProfileId','')=v_job.owner_profile_id::text
            and n.created_at>=now()-interval '30 minutes'
        )
        and (
          not exists(select 1 from track_genres)
          or not exists(select 1 from viewer_genres vg where vg.recipient_id=cp.recipient_id)
          or exists (
            select 1
            from track_genres tg
            join viewer_genres vg on vg.recipient_id=cp.recipient_id
            where vg.genre=tg.genre
               or (
                 length(vg.genre)>=4
                 and length(tg.genre)>=4
                 and (
                   position(vg.genre in tg.genre)>0
                   or position(tg.genre in vg.genre)>0
                 )
               )
          )
        )
    ),
    new_sends as (
      insert into public.profile_music_notification_sends(decision_id,follower_id)
      select v_job.decision_id,e.recipient_id
      from eligible e
      on conflict do nothing
      returning follower_id
    ),
    created_notifications as (
      insert into public.notifications(profile_id,type,title,body,data)
      select
        s.follower_id,
        'NEW_PUBLIC_KEEP',
        'Nouveau morceau chez '||coalesce(nullif(v_job.owner_username,''),'Loki'),
        'Titre et artiste masqués · écoute le morceau puis ajoute-le gratuitement pour les découvrir.',
        jsonb_build_object(
          'ownerProfileId',v_job.owner_profile_id,
          'username',v_job.owner_username,
          'sourceProfileId',coalesce(v_job.source_profile_id,v_job.owner_profile_id),
          'sourceUsername',coalesce(v_job.source_username,v_job.owner_username),
          'trackId',v_job.track_id,
          'decisionId',v_job.decision_id,
          'masked',true,
          'freeKeep',true,
          'kind','new_public_keep',
          'targetedByMusicTaste',true
        )
      from new_sends s
      returning profile_id
    )
    select
      (select count(*)::integer from candidate_page),
      (select max(recipient_id) from candidate_page),
      (select count(*)::integer from created_notifications)
    into v_recipient_count,v_last_recipient,v_notification_count;

    v_total:=v_total+coalesce(v_notification_count,0);

    update public.public_track_notification_fanout_jobs
    set last_follower_id=coalesce(v_last_recipient,last_follower_id),
        processed_count=processed_count+coalesce(v_recipient_count,0),
        attempt_count=attempt_count+1,
        completed_at=case when coalesce(v_recipient_count,0)<p_batch then now() else null end,
        updated_at=now()
    where decision_id=v_job.decision_id;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.keep_process_public_track_notification_fanout(integer,integer)
  from public,anon,authenticated;
grant execute on function public.keep_process_public_track_notification_fanout(integer,integer)
  to service_role;
