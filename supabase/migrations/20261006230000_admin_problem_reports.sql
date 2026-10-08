-- Super Admin › Modération › Signalements (06/10/2026).
-- 59 signalements « secousse » / diagnostics auto (app_problem_reports, statut NEW) étaient invisibles : la table
-- n'est lisible que par son auteur. Additif : 2 fonctions réservées aux rôles de modération, aucune donnée modifiée
-- hors du statut choisi par l'admin. Statuts : NEW (à voir), SEEN (vu), FIXED (corrigé).
create or replace function public.admin_problem_reports(p_status text default 'NEW', p_limit integer default 200)
returns table(
  id uuid, created_at timestamptz, kind text, status text, message text, screen text, platform text,
  app_version text, build_sha text, username text, flagged boolean, resolved_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id, r.created_at, r.kind, r.status, r.message, r.screen, r.platform,
         r.app_version, r.build_sha, r.username, coalesce(r.flagged, false), r.resolved_at
  from public.app_problem_reports r
  where public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH'])
    and (p_status is null or p_status = 'ALL' or r.status = p_status)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$function$;

create or replace function public.admin_problem_report_set_status(p_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']) then
    raise exception 'ADMIN_ROLE_REQUIRED';
  end if;
  if p_status not in ('NEW','SEEN','FIXED') then raise exception 'INVALID_STATUS'; end if;
  update public.app_problem_reports
     set status = p_status,
         resolved_at = case when p_status = 'FIXED' then now() else null end
   where id = p_id;
  return found;
end;
$function$;

revoke all on function public.admin_problem_reports(text, integer) from public, anon;
revoke all on function public.admin_problem_report_set_status(uuid, text) from public, anon;
grant execute on function public.admin_problem_reports(text, integer) to authenticated;
grant execute on function public.admin_problem_report_set_status(uuid, text) to authenticated;
