create or replace function public.keep_battle_pending_requires_decision()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.status = 'PENDING' then
    new.expires_at := least(
      coalesce(new.expires_at, now() + interval '90 seconds'),
      now() + interval '90 seconds'
    );
  end if;
  return new;
end;
$function$;

update public.keep_battle_challenges
set
  status = case when created_at + interval '90 seconds' <= now() then 'EXPIRED' else status end,
  expires_at = least(expires_at, created_at + interval '90 seconds'),
  updated_at = now()
where status = 'PENDING'
  and expires_at > created_at + interval '5 minutes';
