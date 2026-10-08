-- Compléter le suivi existant, sans nouvelle table ni mutation historique.
create or replace function public.admin_problem_reports_with_evidence(
  p_status text default 'NEW', p_limit integer default 200
)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']), false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(
      to_jsonb(r) || jsonb_build_object(
        'fixed_in_sha', e.fixed_in_sha, 'regression_test_path', e.regression_test_path,
        'ai_note', e.ai_note, 'device', e.device, 'os_version', e.os_version
      ) order by r.created_at desc, r.id
    )
    from public.admin_problem_reports(p_status, p_limit) r
    join public.app_problem_reports e on e.id = r.id
  ), '[]'::jsonb);
end;
$function$;

-- Un SHA et un chemin documentés par l'admin ne prouvent pas une publication.
-- L'agent ajoute ce marqueur uniquement après fusion, CI et livraison vérifiées.
create or replace function public.keep_my_report_updates()
returns table(id uuid, screen text, status text, ai_note text, fixed_in_sha text, resolved_at timestamptz)
language sql stable security definer set search_path to 'public' as $function$
  select r.id, r.screen, r.status, r.ai_note, r.fixed_in_sha, r.resolved_at
  from public.app_problem_reports r
  where r.user_id = auth.uid() and r.notified_at is null
    and (
      r.status = 'NOT_A_BUG'
      or (
        r.status in ('FIXED', 'NEEDS_UPDATE')
        and r.fixed_in_sha ~ '^[0-9a-f]{40}$'
        and r.regression_test_path is not null
        and r.resolved_at is not null
        and strpos(r.ai_note, '<!-- keep-published:' || r.fixed_in_sha || ' -->') > 0
      )
    )
  order by r.resolved_at desc nulls last, r.id limit 5;
$function$;

revoke all on function public.admin_problem_reports_with_evidence(text, integer) from public, anon;
grant execute on function public.admin_problem_reports_with_evidence(text, integer) to authenticated;
revoke all on function public.keep_my_report_updates() from public, anon;
grant execute on function public.keep_my_report_updates() to authenticated;
