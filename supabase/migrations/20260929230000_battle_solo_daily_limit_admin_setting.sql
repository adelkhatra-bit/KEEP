-- Adel (29/09/2026) : « limiter le nombre de Solos pour qu'ils n'abusent pas,
-- on avait dit 10 par jour… que je puisse le modifier dans Super Admin ».
-- keep_battle_solo_daily_limit_for_profile lisait déjà
-- remote_config.battle_solo_daily_limit_free (défaut 10) mais la ligne
-- n'existait pas : l'écran Super Admin > Remote Config ne l'affichait donc
-- jamais. On la crée avec la valeur en vigueur, sans écraser un réglage
-- existant. Les formules payantes restent illimitées (fonction inchangée).
insert into public.remote_config(key, value, description, updated_at)
values (
  'battle_solo_daily_limit_free',
  '10'::jsonb,
  'Nombre de parties Battle SOLO par jour pour la formule gratuite (les formules payantes sont illimitées). Blocage serveur au-delà.',
  now()
)
on conflict (key) do nothing;
