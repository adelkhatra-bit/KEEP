-- Nettoyage des comptes de test utilises pour verifier en direct
-- keep_battle_arena_spectate (lecture seule confirmee, aucune ligne
-- keep_battle_arena_members creee pour le spectateur).
delete from auth.users where email in ('keep-spectate-test-905@mailinator.com', 'keep-spectate-test-906@mailinator.com');
