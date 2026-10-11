-- Existing Loki accounts that predate the default-availability trigger did not
-- necessarily receive a keep_battle_solo_presence row. Bring only those
-- missing accounts onto the same default as new signups. Existing rows are
-- deliberately preserved so a user who explicitly switched Battle OFF stays OFF.
insert into public.keep_battle_solo_presence(profile_id, theme_code, status, manual_available, last_seen_at)
select p.id, 'MIX', 'SOLO', true, now()
from public.profiles p
left join public.keep_battle_solo_presence k on k.profile_id = p.id
where k.profile_id is null
on conflict (profile_id) do nothing;
