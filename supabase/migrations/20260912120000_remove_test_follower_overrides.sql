-- Adel (12/09/2026) : "Débloqué à partir de 100 abonnés -- tu en as 4 pour l'instant"
-- Le nombre "4" est hardcodé via follower_count_override sur le profil de test
--
-- Les overrides were meant for testing only (to avoid needing 500 real followers
-- to test event creation). But if left in production, they HIDE the real follower
-- count from all growth calculations, making it impossible for users to reach
-- actual thresholds.
--
-- Solution: Clear all overrides. The override system is still available for
-- Super Admin to use via admin_set_follower_count_override() if needed for future testing.

update public.profiles
set follower_count_override = null
where follower_count_override is not null;
