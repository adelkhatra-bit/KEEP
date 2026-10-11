-- Referral continuity: after signup/claim, keep a durable notification back to the referrer's profile.
create or replace function public.keep_notify_referred_user_of_referrer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_username text;
begin
  select username into v_username from public.profiles where id = new.referrer_profile_id;
  if v_username is null then return new; end if;

  insert into public.notifications(
    profile_id, type, title, body, data, push_delivery_status, push_attempt_count
  )
  values(
    new.referred_profile_id,
    'REFERRAL_FRIEND_READY',
    'Ton contact est sur Loki',
    'Tu as rejoint Loki grâce à @' || v_username || '. Retrouve son profil et ses découvertes ici.',
    jsonb_build_object(
      'event','REFERRAL_FRIEND_READY',
      'referrerId',new.referrer_profile_id,
      'referrerUsername',v_username,
      'referralCode',new.referral_code,
      'soundKind','social'
    ),
    'CREATED',
    0
  );
  return new;
end;
$function$;

drop trigger if exists trg_keep_referral_friend_notification on public.keep_referrals;
create trigger trg_keep_referral_friend_notification
after insert on public.keep_referrals
for each row execute function public.keep_notify_referred_user_of_referrer();

revoke all on function public.keep_notify_referred_user_of_referrer() from public, anon, authenticated;
