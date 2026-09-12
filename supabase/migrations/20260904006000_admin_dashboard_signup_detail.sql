-- Adel (04/09/2026) : "un bouton pour supprimer un utilisateur precis
-- directement depuis cette liste, sans passer par la page Utilisateurs" --
-- "Inscriptions par jour" n'affichait qu'un total par date. Ce RPC liste les
-- comptes crees un jour precis (meme filtre pays que le reste du dashboard)
-- pour permettre un clic "deplier" -> "supprimer" directement dans la carte.
-- La suppression reelle reste geree par keep-admin-user-control (action
-- "delete"), deja audite et reserve aux roles habilites -- ce RPC ne fait
-- que LISTER, jamais supprimer lui-meme.
create or replace function public.admin_dashboard_signup_detail(p_date date, p_country text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_from timestamptz;
  v_to timestamptz;
  v_country text := nullif(upper(btrim(coalesce(p_country,''))), '');
  v_result jsonb;
begin
  if not exists(select 1 from public.admin_users a where a.id=v_uid and a.is_active=true) then
    raise exception 'admin_required' using errcode='42501';
  end if;
  if p_date is null then raise exception 'invalid_date'; end if;
  v_from := p_date::timestamptz;
  v_to := (p_date + 1)::timestamptz;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'email', u.email,
    'createdAt', p.created_at
  ) order by p.created_at desc), '[]'::jsonb)
  into v_result
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.created_at >= v_from and p.created_at < v_to
    and (v_country is null or p.country_code::text = v_country);

  return v_result;
end;
$$;
revoke all on function public.admin_dashboard_signup_detail(date,text) from public;
grant execute on function public.admin_dashboard_signup_detail(date,text) to authenticated;
