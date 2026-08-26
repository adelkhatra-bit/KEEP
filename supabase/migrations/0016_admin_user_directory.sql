-- KEEP — 0016 : annuaire Super Admin sécurisé
-- Expose au seul rôle authenticated + admin_users actif les informations dont
-- l'écran Utilisateurs a réellement besoin, y compris l'e-mail Supabase Auth.

create or replace function public.admin_user_directory()
returns table (
  id uuid,
  email text,
  username text,
  display_name text,
  country_code char(2),
  kind text,
  created_at timestamptz,
  plan_code text,
  keeps_this_month bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.admin_users a
    where a.id = auth.uid() and a.is_active = true
  ) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    u.email,
    p.username,
    p.display_name,
    p.country_code,
    p.kind::text,
    p.created_at,
    coalesce(active_plan.code, 'FREE')::text as plan_code,
    coalesce(k.keeps, 0)::bigint as keeps_this_month
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join lateral (
    select pl.code
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    where s.profile_id = p.id and s.status::text = 'ACTIVE'
    order by s.updated_at desc nulls last, s.created_at desc
    limit 1
  ) active_plan on true
  left join lateral (
    select count(*)::bigint as keeps
    from public.keep_decisions kd
    where kd.profile_id = p.id
      and kd.decision = 'KEPT'
      and kd.created_at >= date_trunc('month', now())
  ) k on true
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;
