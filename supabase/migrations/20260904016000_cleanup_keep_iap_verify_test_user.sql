-- Adel (04/09/2026) : nettoyage du compte de test jetable créé pour vérifier
-- en conditions réelles que keep-iap-verify authentifie correctement un
-- utilisateur et rejette proprement (400, pas un crash) une transaction
-- invalide -- même pratique que les comptes de test précédents
-- (20260903193000, 20260903210500) : créé, utilisé, puis supprimé.
delete from auth.users where email = 'claude-iap-test-1788539679@mailinator.com';
