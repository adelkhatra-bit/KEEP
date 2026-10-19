/**
 * Adresse + clé PUBLIQUE (publishable, protégée par RLS) du projet Supabase de production.
 * Filet de sécurité (Adel 18/10/2026 : « les utilisateurs n'arrivent plus à se connecter, tout le monde est
 * déconnecté ») : une mise à jour OTA publiée sans variables EXPO_PUBLIC_* produisait une app SANS adresse
 * Supabase. Les variables d'environnement restent prioritaires ; sinon ces valeurs publiques s'appliquent.
 */
export const PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rrhqsqzcplvmwxizqnla.supabase.co';
export const PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_TUz-oaWk8QZDl4pTfCvkPw_3_iwJJru';
