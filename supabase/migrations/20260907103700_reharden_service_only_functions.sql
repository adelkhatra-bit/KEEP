-- Audit multi-agent 07/09/2026 (juge securite) : ces deux fonctions "service_*" avaient
-- deja ete correctement verrouillees a la creation (REVOKE ALL FROM PUBLIC + GRANT
-- service_role uniquement, voir 20260827223000_music_usage_accounting_and_admin_profile.sql
-- pour service_record_recognition_success), mais une regrant globale posterieure
-- (probablement un `grant execute on all functions in schema public to anon, authenticated`
-- lance ailleurs) leur a redonne EXECUTE pour anon ET authenticated. Verifie en direct via
-- has_function_privilege() : les deux sont actuellement executables sans etre service_role.
--
-- service_lookup_fingerprint_hashes : permet de contourner le rate-limit (12/60s) applique
-- par l'edge function keep-music-memory et d'aspirer en masse les 510k lignes de
-- keep_fingerprint_hashes directement depuis un client avec la seule cle anon.
-- service_record_recognition_success : IDOR, p_profile_id non verifie contre auth.uid(),
-- permet de gonfler le compteur de reconnaissance d'un profil tiers.
--
-- Seul appelant legitime dans le repo pour les deux : supabase/functions/keep-music-memory
-- (verifie par grep), qui utilise le client service_role -- non affecte par ce REVOKE.

revoke execute on function public.service_lookup_fingerprint_hashes(bigint[]) from anon, authenticated;
revoke execute on function public.service_record_recognition_success(uuid) from anon, authenticated;

grant execute on function public.service_lookup_fingerprint_hashes(bigint[]) to service_role;
grant execute on function public.service_record_recognition_success(uuid) to service_role;
