-- Adel (02/09/2026) : "si tu peux rajouter russe turc tous les pays qui
-- pourraient etre interessants a toucher pour les Battle ... elargir un tres
-- large culture musical". Ajoute de nouveaux styles/cultures au theme Battle
-- deja existant (aucun changement de schema, meme table que
-- 20260829034000_keep_battle_arena_foundation.sql).
insert into public.keep_battle_themes(code,label,enabled,sort_order)
values
  ('RUSSE','Russe',true,100),
  ('TURC','Turc',true,101),
  ('KPOP','K-Pop',true,102),
  ('ARABE','Arabe / Golfe',true,103),
  ('BRESIL','Brésil',true,104),
  ('INDE','Bollywood / Inde',true,105)
on conflict (code) do nothing;
