-- CORRECTIF DE CONFIANCE (Adel, 20/09/2026, audit demandé : "regarde que
-- tu as bien crédité et envoyé des notifications... de ce qu'on devait").
--
-- Vérification en direct sur la base réelle : la migration
-- 20260919110000_credit_flo_teyou_solo_bug_compensation.sql, qui prétendait
-- créditer 6 Free à floadelissa et 3 Free à Teyou pour le bug SOLO 8/8,
-- N'A JAMAIS ÉTÉ APPLIQUÉE EN PRODUCTION -- même schéma de dérive Git/base
-- que 20260919001000 (voir 20260920211500). Preuve : 0 ligne
-- admin_credit_grants avec reason contenant 'SOLO' pour ces 2 profils ;
-- floadelissa n'a STRICTEMENT AUCUN admin_credit_grants, jamais ; les 5
-- lignes trouvées pour Teyou datent toutes du 03/09 (avant l'incident,
-- reason vide, sans rapport). 0 notification de type SOLO_BUG_FIX envoyée
-- à qui que ce soit.
--
-- Cette migration exécute réellement ce qui avait été annoncé comme fait.

insert into public.admin_credit_grants (profile_id, amount, reason, created_at)
values ('d15ba595-350b-4bbe-b594-e45adbecd71a', 6, 'SOLO 8/8 perfect score bug compensation (18-19 sep) - 2 perfect solos', now());

insert into public.admin_credit_grants (profile_id, amount, reason, created_at)
values ('fb655bf8-0da2-4b95-b7b4-46fb4ab7952d', 3, 'SOLO 8/8 perfect score bug compensation (18-19 sep)', now());

insert into public.notifications (profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
values (
  'd15ba595-350b-4bbe-b594-e45adbecd71a',
  'SOLO_BUG_FIX',
  '🎁 Compensation SOLO 8/8 - 6 Free',
  'On a trouvé et fixé le bug qui empêchait tes scores 8/8 d''être crédités. On t''a crédité 6 Free pour tes 2 solos parfaits. Désolé du désagrément! À bientôt pour de nouveaux solos. 🎵',
  jsonb_build_object('event', 'SOLO_BUG_COMPENSATION', 'free_credited', 6, 'reason', 'Perfect 8/8 scores not credited due to database schema conflict - 2 perfect solos'),
  'pending',
  0
);

insert into public.notifications (profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
values (
  'fb655bf8-0da2-4b95-b7b4-46fb4ab7952d',
  'SOLO_BUG_FIX',
  '🎁 Compensation SOLO 8/8',
  'On a trouvé et fixé le bug qui empêchait tes scores 8/8 d''être crédités. On t''a crédité 3 Free. Désolé du désagrément! À bientôt pour de nouveaux solos. 🎵',
  jsonb_build_object('event', 'SOLO_BUG_COMPENSATION', 'free_credited', 3, 'reason', 'Perfect 8/8 scores not credited due to database schema conflict'),
  'pending',
  0
);

-- Vérification : preuve que ça a réellement été écrit cette fois.
select p.username, acg.amount, acg.reason, acg.created_at
from public.admin_credit_grants acg
join public.profiles p on p.id = acg.profile_id
where acg.reason ilike '%SOLO 8/8%'
order by acg.created_at desc;
