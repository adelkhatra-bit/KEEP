-- Paid plans are never daily-limited for Battle Solo.
-- FREE accounts keep the configurable daily limit. Battle/arena stake rules remain unchanged.
create or replace function public.keep_battle_solo_daily_limit_for_profile(p_uid uuid)
returns integer language plpgsql stable security definer set search_path='public'
as $$
declare p text:=public.keep_active_plan_code(p_uid); v integer;
begin
  if p <> 'FREE' then return null; end if;
  select greatest(1,(value #>> '{}')::integer) into v from public.remote_config where key='battle_solo_daily_limit_free';
  return coalesce(v,10);
end $$;

create or replace function public.keep_battle_solo_consume_daily_start()
returns jsonb language plpgsql security definer set search_path='public'
as $$
declare uid uuid:=auth.uid(); v_limit integer; v_starts integer; v_plan text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 v_plan:=public.keep_active_plan_code(uid);
 if v_plan <> 'FREE' then
   return jsonb_build_object('used',0,'limit',null,'remaining',null,'unlimited',true,'plan',v_plan);
 end if;
 v_limit:=public.keep_battle_solo_daily_limit_for_profile(uid);
 insert into public.keep_battle_solo_daily_usage(profile_id,usage_date,starts,updated_at)
 values(uid,current_date,1,now())
 on conflict(profile_id,usage_date) do update set starts=keep_battle_solo_daily_usage.starts+1,updated_at=now()
 where keep_battle_solo_daily_usage.starts<v_limit returning starts into v_starts;
 if v_starts is null then raise exception 'BATTLE_SOLO_DAILY_LIMIT_REACHED:%',v_limit; end if;
 return jsonb_build_object('used',v_starts,'limit',v_limit,'remaining',greatest(0,v_limit-v_starts),'unlimited',false,'plan',v_plan);
end $$;

create or replace function public.keep_battle_solo_daily_status()
returns jsonb language plpgsql stable security definer set search_path='public'
as $$
declare uid uuid:=auth.uid(); lim integer; used integer:=0; plan text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 plan:=public.keep_active_plan_code(uid);
 if plan <> 'FREE' then
   return jsonb_build_object('plan',plan,'used',0,'limit',null,'remaining',null,'unlimited',true,'resetsAt',null);
 end if;
 lim:=public.keep_battle_solo_daily_limit_for_profile(uid);
 select coalesce(starts,0) into used from public.keep_battle_solo_daily_usage where profile_id=uid and usage_date=current_date;
 return jsonb_build_object('plan',plan,'used',used,'limit',lim,'remaining',greatest(0,lim-used),'unlimited',false,'resetsAt',(current_date+1)::timestamptz);
end $$;