-- Follow-up to 20261004000100: preserve push-token history and row identity.
-- A valid Expo token can move to the account currently authenticated on the
-- same device, but the existing row is updated rather than deleted.

create or replace function public.keep_push_token_register(
  p_token text,
  p_platform text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  normalized_platform text:=lower(coalesce(nullif(trim(p_platform),''),'unknown'));
  clean_token text:=trim(coalesce(p_token,''));
  row_id uuid;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(clean_token)<10 then raise exception 'PUSH_TOKEN_REQUIRED'; end if;

  if not (
    clean_token like 'ExpoPushToken[%]'
    or clean_token like 'ExponentPushToken[%]'
  ) or right(clean_token,1) <> ']' then
    raise exception 'PUSH_TOKEN_INVALID';
  end if;

  if normalized_platform not in ('ios','android','unknown') then
    normalized_platform:='unknown';
  end if;

  update public.push_tokens
  set profile_id=uid,
      platform=normalized_platform,
      updated_at=now()
  where token=clean_token
  returning id into row_id;

  if row_id is null then
    insert into public.push_tokens(profile_id,token,platform,updated_at)
    values(uid,clean_token,normalized_platform,now())
    on conflict(profile_id,token) do update
      set platform=excluded.platform,
          updated_at=now()
    returning id into row_id;
  end if;

  return jsonb_build_object('ok',true,'id',row_id,'platform',normalized_platform);
end
$function$;
