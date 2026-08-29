create or replace function public.keep_push_token_register(p_token text,p_platform text default 'unknown')
returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
 uid uuid:=auth.uid();
 normalized_platform text:=lower(coalesce(nullif(trim(p_platform),''),'unknown'));
 clean_token text:=trim(coalesce(p_token,''));
 row_id uuid;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 if length(clean_token)<10 then raise exception 'PUSH_TOKEN_REQUIRED'; end if;
 if clean_token !~ '^(Exponent|Expo)PushToken\[.+\]$' then raise exception 'PUSH_TOKEN_INVALID'; end if;
 if normalized_platform not in ('ios','android','unknown') then normalized_platform:='unknown'; end if;
 delete from public.push_tokens where token=clean_token and profile_id<>uid;
 insert into public.push_tokens(profile_id,token,platform,updated_at)
 values(uid,clean_token,normalized_platform,now())
 on conflict(profile_id,token) do update set platform=excluded.platform,updated_at=now()
 returning id into row_id;
 return jsonb_build_object('ok',true,'id',row_id,'platform',normalized_platform);
end
$function$;
revoke all on function public.keep_push_token_register(text,text) from public,anon;
grant execute on function public.keep_push_token_register(text,text) to authenticated;
