-- Test account bypass for Adel's marketplace QA without enabling the feature globally.
insert into public.feature_flag_test_accounts(profile_id, flag_key, created_by)
select p.id, 'playlist_marketplace', null
from public.profiles p
where lower(p.username) = 'adel4a'
on conflict (profile_id, flag_key) do nothing;