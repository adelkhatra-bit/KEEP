-- Audit du 01/09/2026 : admin_feature_flag_set() et les policies RLS de
-- support_tickets/support_ticket_messages utilisaient le contrôle générique
-- is_admin(uid) (vrai pour N'IMPORTE QUEL admin actif), alors que team.tsx
-- permet de créer des rôles volontairement restreints (FINANCE, MARKETING,
-- MODERATOR, TECH, SUPPORT). Résultat réel : un admin MARKETING ou FINANCE
-- pouvait déjà activer/désactiver n'importe quelle fonctionnalité globale de
-- l'app, et lire/répondre aux conversations de support de n'importe quel
-- utilisateur -- alors que d'autres fonctions équivalentes (ex.
-- admin_set_usage_limit) restreignent déjà correctement par rôle.
-- Corrige les deux en réutilisant le même principe de liste de rôles
-- autorisés, sans changer le comportement pour SUPER_ADMIN/ADMIN.

create or replace function public.admin_has_role(p_uid uuid, p_roles text[])
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.admin_users au
    where au.id = p_uid and au.is_active = true and au.role::text = any(p_roles)
  );
$$;

create or replace function public.admin_feature_flag_set(p_key text, p_enabled boolean)
returns table(key text, description text, is_enabled_globally boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  before_row jsonb;
begin
  if uid is null or not public.admin_has_role(uid, array['SUPER_ADMIN','ADMIN','TECH']) then
    raise exception 'admin_required';
  end if;

  select to_jsonb(f) into before_row
  from public.feature_flags f
  where f.key = p_key;

  if before_row is null then
    raise exception 'unknown_feature_flag';
  end if;

  update public.feature_flags f
  set is_enabled_globally = p_enabled,
      updated_at = now(),
      updated_by = uid
  where f.key = p_key;

  insert into public.audit_logs(actor_admin_id, action, target_type, target_id, before, after)
  select uid,
         'feature_flag.set',
         'feature_flag',
         p_key,
         before_row,
         to_jsonb(f)
  from public.feature_flags f
  where f.key = p_key;

  return query
  select f.key, f.description, f.is_enabled_globally, f.updated_at
  from public.feature_flags f
  where f.key = p_key;
end;
$$;

drop policy if exists support_messages_participant_select on public.support_ticket_messages;
create policy support_messages_participant_select on public.support_ticket_messages
  for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_ticket_messages.ticket_id
        and (t.profile_id = auth.uid() or public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','SUPPORT','MODERATOR']))
    )
  );

drop policy if exists support_tickets_owner_select on public.support_tickets;
create policy support_tickets_owner_select on public.support_tickets
  for select
  using (
    profile_id = auth.uid()
    or public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','SUPPORT','MODERATOR'])
  );

drop policy if exists support_tickets_admin_update on public.support_tickets;
create policy support_tickets_admin_update on public.support_tickets
  for update
  using (public.admin_has_role(auth.uid(), array['SUPER_ADMIN','ADMIN','SUPPORT','MODERATOR']));
