-- KEEP — 0020: sépare le quota MARKETING (nombre de morceaux réellement
-- RÉVÉLÉS, ce qui pilote "Créer ton profil") du plafond d'ABUS backend
-- (nombre de TENTATIVES brutes, protection de coût AcoustID/AudD) -- cf.
-- bug réel du 24/08/2026 : "la session affiche 0 morceaux détectés mais
-- KEEP affiche déjà Crée ton profil -- l'UI doit être pilotée par le nombre
-- RÉEL de morceaux reconnus, jamais par le fait qu'une session tourne".
-- L'ancien `guest_recognition_limit`/`signup_bonus_recognitions` comptait
-- CHAQUE tentative (même un no_match) -- un guest pouvait épuiser ses "3
-- essais" sans jamais voir un seul morceau reconnu.

-- Nouveau : quota RÉEL (succès), lu côté client -- pilote guestLimitReached/
-- freeLimitReached ET la décision d'appeler AudD (jamais gaspiller un appel
-- payant une fois le quota de révélation déjà atteint).
insert into remote_config (key, value, description) values
  ('guest_success_limit', '3'::jsonb, 'Nombre de morceaux RÉELLEMENT reconnus (pas de tentatives) offerts à un invité avant incitation à créer un profil.'),
  ('signup_bonus_successes', '3'::jsonb, 'Morceaux reconnus supplémentaires débloqués après inscription (total = guest_success_limit + ceci, jamais additionné deux fois).')
on conflict (key) do nothing;

-- L'ancien plafond devient un filet anti-abus pur (coût AcoustID/AudD) --
-- relevé largement au-dessus du quota marketing pour ne plus jamais être
-- l'obstacle rencontré en usage normal (un utilisateur légitime qui
-- n'obtient que des no_match ne doit pas être bloqué avant même d'avoir vu
-- un seul morceau).
update remote_config set value = '20'::jsonb, description = 'Plafond ANTI-ABUS (tentatives brutes, succès ou non) -- protection de coût, jamais le quota affiché à l''utilisateur (voir guest_success_limit).' where key = 'guest_recognition_limit';
update remote_config set value = '20'::jsonb, description = 'Plafond ANTI-ABUS (tentatives brutes) après inscription -- voir signup_bonus_successes pour le vrai quota affiché.' where key = 'signup_bonus_recognitions';
