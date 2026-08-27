create or replace function public.keep_set_all_keep_visibility(p_visibility text)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  changed integer := 0;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;
  if p_visibility not in ('PUBLIC','PRIVATE') then
    raise exception 'invalid_visibility';
  end if;

  update public.keep_decisions
     set visibility = p_visibility
   where profile_id = uid
     and decision = 'KEPT'
     and visibility is distinct from p_visibility;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.keep_set_all_keep_visibility(text) from public;
grant execute on function public.keep_set_all_keep_visibility(text) to authenticated;
