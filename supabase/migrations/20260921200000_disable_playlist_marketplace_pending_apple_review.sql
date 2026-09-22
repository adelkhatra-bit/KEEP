-- Adel (21/09/2026) : "Le risque de suspension App Store est trop élevé.
-- Remets playlist_marketplace à false pour l'instant, on le réactivera
-- après validation Apple." -- suite à l'audit docs/PLATFORM_COMPLIANCE.md
-- §9.3 : le flag était actif à 100% en prod alors que sa propre
-- description dit "désactivé tant que non conforme Apple IAP" (Guideline
-- 3.1.1 -- débloquer du contenu numérique consommé dans l'app via un lien
-- de paiement externe). Ne PAS réactiver sans validation Apple explicite.
update public.feature_flags
set is_enabled_globally = false,
    rollout_percent = 0
where key = 'playlist_marketplace';
