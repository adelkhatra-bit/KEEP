-- Loki Battle: tous les profils existants doivent avoir un état de présence.
-- Les nouveaux profils sont déjà créés disponibles par le trigger
-- keep_battle_default_available_on_signup. Ce backfill ne réactive jamais
-- un utilisateur qui a explicitement coupé Battle : il ne touche qu'aux
-- profils sans ligne de présence.
insert into public.keep_battle_solo_presence(
  profile_id,
  theme_code,
  status,
  manual_available,
  last_seen_at
)
select
  p.id,
  'MIX',
  'SOLO',
  true,
  now()
from public.profiles p
where not exists (
  select 1
  from public.keep_battle_solo_presence sp
  where sp.profile_id = p.id
)
on conflict (profile_id) do nothing;
