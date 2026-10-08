-- Solo quota counts completed games, never screens opened or abandoned packs.
create or replace function public.keep_battle_solo_daily_status()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); lim integer; used integer:=0; plan text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 plan:=public.keep_active_plan_code(uid);
 if plan <> 'FREE' then return jsonb_build_object('plan',plan,'used',0,'limit',null,'remaining',null,'unlimited',true,'resetsAt',null); end if;
 lim:=public.keep_battle_solo_daily_limit_for_profile(uid);
 select count(*)::integer into used from public.keep_battle_solo_history where profile_id=uid and completed_at>=current_date::timestamptz and completed_at<(current_date+1)::timestamptz;
 return jsonb_build_object('plan',plan,'used',used,'limit',lim,'remaining',greatest(0,lim-used),'unlimited',false,'resetsAt',(current_date+1)::timestamptz);
end $$;
create or replace function public.keep_battle_solo_consume_daily_start()
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); v_limit integer; v_used integer:=0; v_plan text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 v_plan:=public.keep_active_plan_code(uid);
 if v_plan <> 'FREE' then return jsonb_build_object('used',0,'limit',null,'remaining',null,'unlimited',true,'plan',v_plan); end if;
 v_limit:=public.keep_battle_solo_daily_limit_for_profile(uid);
 select count(*)::integer into v_used from public.keep_battle_solo_history where profile_id=uid and completed_at>=current_date::timestamptz and completed_at<(current_date+1)::timestamptz;
 if v_used>=v_limit then raise exception 'BATTLE_SOLO_DAILY_LIMIT_REACHED:%',v_limit; end if;
 return jsonb_build_object('used',v_used,'limit',v_limit,'remaining',greatest(0,v_limit-v_used),'unlimited',false,'plan',v_plan);
end $$;