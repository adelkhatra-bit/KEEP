create or replace function public.keep_push_token_register(p_token text,p_platform text default 'unknown')
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
 uid uuid:=auth.uid();
 normalized_platform text:=lower(coalesce(nullif(trim(p_platform),''),'unknown'));
 row_id uuid;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_token is null or length(trim(p_token))<10 then raise exception 'PUSH_TOKEN_REQUIRED'; end if;
 if trim(p_token) !~ '^(Exponent|Expo)PushToken\[.+\]$' then raise exception 'PUSH_TOKEN_INVALID'; end if;
 if normalized_platform not in ('ios','android','unknown') then normalized_platform:='unknown'; end if;
 insert into public.push_tokens(profile_id,token,platform,updated_at)
 values(uid,trim(p_token),normalized_platform,now())
 on conflict(profile_id,token) do update set platform=excluded.platform,updated_at=now()
 returning id into row_id;
 return jsonb_build_object('ok',true,'id',row_id,'platform',normalized_platform);
end
$function$;

create or replace function public.keep_push_token_unregister(p_token text)
returns boolean
language plpgsql
security definer
set search_path='public'
as $function$
declare uid uuid:=auth.uid(); deleted_count integer;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 delete from public.push_tokens where profile_id=uid and token=trim(coalesce(p_token,''));
 get diagnostics deleted_count = row_count;
 return deleted_count>0;
end
$function$;

revoke all on function public.keep_push_token_register(text,text) from public,anon;
revoke all on function public.keep_push_token_unregister(text) from public,anon;
grant execute on function public.keep_push_token_register(text,text) to authenticated;
grant execute on function public.keep_push_token_unregister(text) to authenticated;
