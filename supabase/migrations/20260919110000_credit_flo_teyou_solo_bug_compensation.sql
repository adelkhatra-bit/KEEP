-- COMPENSATION: Créditer Flo et Teyou pour SOLO 8/8 manqués
-- Issue: SOLO 8/8 perfect scores ne donnaient pas de Free de 18/09 13:45 à 19/09
-- Root Cause: Schema conflict entre migrations

-- Créditer Flo (floadelissa)
-- Audit: 79.2% success rate → estimé 2 fois 8/8 → crédit 6 Free (2 × 3)
INSERT INTO public.admin_credit_grants (profile_id, amount, reason, created_at)
SELECT p.id, 6, 'SOLO 8/8 perfect score bug compensation (18-19 sep) - 2 perfect solos', NOW()
FROM public.profiles p
WHERE p.id = 'd15ba595-350b-4bbe-b594-e45adbecd71a'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_credit_grants g
    WHERE g.profile_id = p.id
      AND g.reason = 'SOLO 8/8 perfect score bug compensation (18-19 sep) - 2 perfect solos'
  );

-- Créditer Teyou
-- Audit: 63% success rate → estimé 0-1 fois 8/8 → crédit 3 Free
INSERT INTO public.admin_credit_grants (profile_id, amount, reason, created_at)
SELECT p.id, 3, 'SOLO 8/8 perfect score bug compensation (18-19 sep)', NOW()
FROM public.profiles p
WHERE p.id = 'fb655bf8-0da2-4b95-b7b4-46fb4ab7952d'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_credit_grants g
    WHERE g.profile_id = p.id
      AND g.reason = 'SOLO 8/8 perfect score bug compensation (18-19 sep)'
  );

-- Envoyer notification à Flo
INSERT INTO public.notifications (profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
SELECT
  p.id,
  'SOLO_BUG_FIX',
  '🎁 Compensation SOLO 8/8 - 6 Free',
  'On a trouvé et fixé le bug qui empêchait tes scores 8/8 d''être crédités. On t''a crédité 6 Free pour tes 2 solos parfaits. Désolé du désagrément! À bientôt pour de nouveaux solos. 🎵',
  jsonb_build_object(
    'event', 'SOLO_BUG_COMPENSATION',
    'free_credited', 6,
    'reason', 'Perfect 8/8 scores not credited due to database schema conflict - 2 perfect solos'
  ),
  'pending',
  0
FROM public.profiles p
WHERE p.id = 'd15ba595-350b-4bbe-b594-e45adbecd71a'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.profile_id = p.id
      AND n.type = 'SOLO_BUG_FIX'
      AND n.data->>'free_credited' = '6'
  );

-- Envoyer notification à Teyou
INSERT INTO public.notifications (profile_id, type, title, body, data, push_delivery_status, push_attempt_count)
SELECT
  p.id,
  'SOLO_BUG_FIX',
  '🎁 Compensation SOLO 8/8',
  'On a trouvé et fixé le bug qui empêchait tes scores 8/8 d''être crédités. On t''a crédité 3 Free. Désolé du désagrément! À bientôt pour de nouveaux solos. 🎵',
  jsonb_build_object(
    'event', 'SOLO_BUG_COMPENSATION',
    'free_credited', 3,
    'reason', 'Perfect 8/8 scores not credited due to database schema conflict'
  ),
  'pending',
  0
FROM public.profiles p
WHERE p.id = 'fb655bf8-0da2-4b95-b7b4-46fb4ab7952d'
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.profile_id = p.id
      AND n.type = 'SOLO_BUG_FIX'
      AND n.data->>'free_credited' = '3'
  );

-- Vérifier les crédits appliqués
SELECT
  p.username,
  acg.amount,
  acg.reason,
  acg.created_at
FROM public.admin_credit_grants acg
JOIN public.profiles p ON acg.profile_id = p.id
WHERE acg.profile_id IN ('d15ba595-350b-4bbe-b594-e45adbecd71a', 'fb655bf8-0da2-4b95-b7b4-46fb4ab7952d')
ORDER BY acg.created_at DESC;

-- Vérifier les notifications envoyées
SELECT
  p.username,
  n.type,
  n.title,
  n.body,
  n.created_at
FROM public.notifications n
JOIN public.profiles p ON n.profile_id = p.id
WHERE n.profile_id IN ('d15ba595-350b-4bbe-b594-e45adbecd71a', 'fb655bf8-0da2-4b95-b7b4-46fb4ab7952d')
AND n.type = 'SOLO_BUG_FIX'
ORDER BY n.created_at DESC;
