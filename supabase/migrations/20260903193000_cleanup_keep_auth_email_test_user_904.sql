-- Nettoyage du compte de test utilise pour verifier en direct le fallback
-- "ne pas bloquer l'utilisateur" de keep-auth-email (Brevo indisponible).
delete from auth.users where email = 'keep-auth-email-test-904@mailinator.com';
