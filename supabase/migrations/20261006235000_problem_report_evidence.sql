-- Additif : conserver les rapports, leurs politiques RLS et les preuves existantes.
-- Une référence SHA/test documente un correctif ; elle ne prouve ni exécution du
-- test, ni livraison, ni installation. latest_app est le dernier rapport natif.
alter table public.app_problem_reports
  add column if not exists regression_test_path text;

create or replace function public.admin_problem_reports_with_evidence(
  p_status text default 'NEW', p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']), false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- Réutiliser exactement le filtre, la borne et les champs de la RPC historique.
  return coalesce((
    select jsonb_agg(
      to_jsonb(r) || jsonb_build_object(
        'fixed_in_sha', e.fixed_in_sha,
        'regression_test_path', e.regression_test_path
      ) order by r.created_at desc, r.id
    )
    from public.admin_problem_reports(p_status, p_limit) r
    join public.app_problem_reports e on e.id = r.id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.admin_problem_report_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_open_count bigint;
  v_fixed_count bigint;
  v_documented_count bigint;
  v_latest_app jsonb;
  v_fixes jsonb;
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']), false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select
    count(*) filter (where r.status not in ('FIXED','NEEDS_UPDATE','NOT_A_BUG')),
    count(*) filter (where r.status in ('FIXED','NEEDS_UPDATE')),
    count(*) filter (
      where r.status in ('FIXED','NEEDS_UPDATE')
        and r.fixed_in_sha ~ '^[0-9A-Fa-f]{40}$'
        and strpos(r.regression_test_path, '..') = 0
        and r.regression_test_path ~ '^(packages/([A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*[.]test[.](ts|tsx|js|cjs)|scripts/([A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*[.]test[.]cjs|scripts/verify-[a-z0-9-]+[.]cjs)$'
    )
    into v_open_count, v_fixed_count, v_documented_count
    from public.app_problem_reports r;

  select jsonb_build_object(
    'app_version', r.app_version, 'build_sha', r.build_sha,
    'platform', r.platform, 'created_at', r.created_at
  )
    into v_latest_app
    from public.app_problem_reports r
    where r.platform in ('ios','android')
    order by r.created_at desc, r.id
    limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', f.id, 'screen', f.screen, 'status', f.status,
      'fixed_in_sha', f.fixed_in_sha,
      'regression_test_path', f.regression_test_path,
      'resolved_at', f.resolved_at
    ) order by f.resolved_at desc nulls last, f.created_at desc, f.id
  ), '[]'::jsonb)
    into v_fixes
    from (
      select r.id, r.screen, r.status, r.fixed_in_sha,
             r.regression_test_path, r.resolved_at, r.created_at
      from public.app_problem_reports r
      where r.status in ('FIXED','NEEDS_UPDATE')
      order by r.resolved_at desc nulls last, r.created_at desc, r.id
      limit 100
    ) f;

  return jsonb_build_object(
    'open_count', v_open_count,
    'fixed_count', v_fixed_count,
    'documented_count', v_documented_count,
    'latest_app', v_latest_app,
    'fixes', v_fixes,
    'fixes_limit', 100
  );
end;
$function$;

create or replace function public.admin_problem_report_record_fix(p_id uuid, p_sha text, p_test text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']), false) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not coalesce(p_sha ~ '^[0-9A-Fa-f]{40}$', false) then
    raise exception 'INVALID_FIX_SHA';
  end if;
  if not coalesce(
    strpos(p_test, '..') = 0
    and p_test ~ '^(packages/([A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*[.]test[.](ts|tsx|js|cjs)|scripts/([A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*[.]test[.]cjs|scripts/verify-[a-z0-9-]+[.]cjs)$',
    false
  ) then
    raise exception 'INVALID_REGRESSION_TEST_PATH';
  end if;
  update public.app_problem_reports
     set status = 'FIXED', resolved_at = now(),
         fixed_in_sha = lower(p_sha), regression_test_path = p_test
   where id = p_id;
  return found;
end;
$function$;

-- Signature/résultat inchangés. NEW/SEEN conservent SHA et chemin ; leur
-- resolved_at revient à null comme avant. Verrouiller la ligne avant validation
-- évite de valider une preuve qui change entre la lecture et l'UPDATE.
create or replace function public.admin_problem_report_set_status(p_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sha text;
  v_test text;
begin
  if not coalesce(public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','MODERATOR','SUPPORT','TECH']), false) then
    raise exception 'ADMIN_ROLE_REQUIRED';
  end if;
  if p_status not in ('NEW','SEEN','FIXED') then raise exception 'INVALID_STATUS'; end if;
  if p_status = 'FIXED' then
    select r.fixed_in_sha, r.regression_test_path into v_sha, v_test
      from public.app_problem_reports r where r.id = p_id for update;
    if not found then return false; end if;
    if not coalesce(
      v_sha ~ '^[0-9A-Fa-f]{40}$'
      and strpos(v_test, '..') = 0
      and v_test ~ '^(packages/([A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*[.]test[.](ts|tsx|js|cjs)|scripts/([A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*[.]test[.]cjs|scripts/verify-[a-z0-9-]+[.]cjs)$',
      false
    ) then
      raise exception 'FIX_EVIDENCE_REQUIRED';
    end if;
  end if;
  update public.app_problem_reports
     set status = p_status,
         resolved_at = case when p_status = 'FIXED' then now() else null end
   where id = p_id;
  return found;
end;
$function$;

revoke all on function public.admin_problem_reports_with_evidence(text, integer) from public, anon;
revoke all on function public.admin_problem_report_overview() from public, anon;
revoke all on function public.admin_problem_report_record_fix(uuid, text, text) from public, anon;
revoke all on function public.admin_problem_report_set_status(uuid, text) from public, anon;
grant execute on function public.admin_problem_reports_with_evidence(text, integer) to authenticated;
grant execute on function public.admin_problem_report_overview() to authenticated;
grant execute on function public.admin_problem_report_record_fix(uuid, text, text) to authenticated;
grant execute on function public.admin_problem_report_set_status(uuid, text) to authenticated;
