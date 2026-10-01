-- Protect active marketplace collections from accidental bulk publication.
-- "TOUT PUBLIC" may publish the rest of the library, but tracks currently
-- attached to an active sale offer owned by the same profile stay PRIVATE.
create or replace function public.keep_set_all_keep_visibility(p_visibility text)
returns integer
language plpgsql
security definer
set search_path=public,auth
as $function$
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

  if p_visibility='PUBLIC' then
    update public.keep_decisions kd
       set visibility='PUBLIC'
     where kd.profile_id=uid
       and kd.decision='KEPT'
       and kd.visibility is distinct from 'PUBLIC'
       and not exists (
         select 1
         from public.playlist_sale_offer_tracks pst
         join public.playlist_sale_offers pso on pso.id=pst.offer_id
         where pst.track_id=kd.track_id
           and pso.seller_id=uid
           and pso.is_active=true
       );
  else
    update public.keep_decisions kd
       set visibility='PRIVATE'
     where kd.profile_id=uid
       and kd.decision='KEPT'
       and kd.visibility is distinct from 'PRIVATE';
  end if;

  get diagnostics changed = row_count;
  return changed;
end;
$function$;

revoke all on function public.keep_set_all_keep_visibility(text) from public,anon;
grant execute on function public.keep_set_all_keep_visibility(text) to authenticated;
