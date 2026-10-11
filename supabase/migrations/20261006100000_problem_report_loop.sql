-- Boucle de réparation par secousse (Adel 06/10/2026, IDEA-125). ADDITIF : aucune ligne supprimée, aucune politique retirée.
-- Une secousse envoie l'écran exact + le fil des dernières actions ; une IA lit le journal, répare, note le résultat ; le robot l'annonce à l'utilisateur.
alter table public.app_problem_reports add column if not exists kind text not null default 'MANUAL';
alter table public.app_problem_reports add column if not exists context jsonb;
alter table public.app_problem_reports add column if not exists ai_note text;
alter table public.app_problem_reports add column if not exists fixed_in_sha text;
alter table public.app_problem_reports add column if not exists resolved_at timestamptz;
alter table public.app_problem_reports add column if not exists notified_at timestamptz;
alter table public.app_problem_reports add column if not exists flagged boolean not null default false;
create index if not exists app_problem_reports_status_idx on public.app_problem_reports (status, created_at desc);

-- Mes signalements réglés dont je n'ai pas encore été prévenu (le robot les annonce une seule fois).
create or replace function public.keep_my_report_updates()
returns table(id uuid, screen text, status text, ai_note text, fixed_in_sha text, resolved_at timestamptz)
language sql stable security definer set search_path to 'public' as $function$
  select r.id, r.screen, r.status, r.ai_note, r.fixed_in_sha, r.resolved_at
  from public.app_problem_reports r
  where r.user_id = auth.uid() and r.notified_at is null and r.status in ('FIXED', 'NEEDS_UPDATE', 'NOT_A_BUG')
  order by r.resolved_at desc nulls last limit 5;
$function$;

create or replace function public.keep_report_ack(p_ids uuid[])
returns void language sql security definer set search_path to 'public' as $function$
  update public.app_problem_reports set notified_at = now() where user_id = auth.uid() and id = any (p_ids) and notified_at is null;
$function$;

revoke all on function public.keep_my_report_updates() from public, anon;
grant execute on function public.keep_my_report_updates() to authenticated;
revoke all on function public.keep_report_ack(uuid[]) from public, anon;
grant execute on function public.keep_report_ack(uuid[]) to authenticated;
