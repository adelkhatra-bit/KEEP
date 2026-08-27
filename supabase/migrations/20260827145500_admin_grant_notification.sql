-- In-app notification for subscriptions offered from KEEP Super Admin.
create or replace function public.keep_notify_admin_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_label text;
  duration_label text;
begin
  if new.source <> 'admin_grant' or new.status::text not in ('ACTIVE','TRIALING') then
    return new;
  end if;

  select coalesce(name, code::text) into plan_label from public.plans where id = new.plan_id;
  duration_label := case
    when new.current_period_end is null then 'sans limite de durée'
    else 'jusqu’au ' || to_char(new.current_period_end at time zone 'Europe/Paris', 'DD/MM/YYYY')
  end;

  insert into public.notifications(profile_id,type,title,body,data)
  values (
    new.profile_id,
    'PLAN_GIFTED',
    'Un avantage KEEP pour toi',
    'Félicitations ! ' || coalesce(plan_label, 'Un abonnement KEEP') || ' t’est offert ' || duration_label || '. Merci pour ta confiance et profite de toutes les fonctions incluses.',
    jsonb_build_object('subscription_id',new.id,'plan_id',new.plan_id,'ends_at',new.current_period_end,'source','admin_grant')
  );
  return new;
end;
$$;
revoke all on function public.keep_notify_admin_grant() from public, anon, authenticated;

drop trigger if exists trg_keep_notify_admin_grant on public.subscriptions;
create trigger trg_keep_notify_admin_grant
after insert on public.subscriptions
for each row execute function public.keep_notify_admin_grant();
