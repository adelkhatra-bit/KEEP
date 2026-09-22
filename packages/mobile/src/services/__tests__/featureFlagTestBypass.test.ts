// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

describe('Bug réel (Adel, 21/09/2026) : "J\'ai donné 1000 abonnés à adel4A, et les fonctions ont disparu au lieu de se débloquer"', () => {
  const service = readNormalized(__dirname, '..', 'featureFlagService.ts');
  const bypassMigration = readNormalized(repoRoot, 'supabase', 'migrations', '20260921230000_feature_flag_test_account_bypass.sql');
  const accessMigration = readNormalized(repoRoot, 'supabase', 'migrations', '20260914080000_keep_playlist_sale_foundation.sql');

  it('a compte avec un nombre d\'abonnés forcé (réel ou virtuel) a toujours accès au seuil de vente, indépendamment de tout flag global -- keep_playlist_sale_access() lit follower_count_override sans condition', () => {
    expect(accessMigration).toContain("select p.follower_count_override into override from public.profiles p where p.id = uid;");
    expect(accessMigration).toContain('if override is not null then follower_count := override; end if;');
    // Rien dans cette fonction ne référence feature_flags -- le seuil
    // d'abonnés (100) et le flag d'activation globale (playlist_marketplace)
    // sont deux mécanismes INDÉPENDANTS. C'est exactement pour ça que forcer
    // les abonnés seul ne suffisait pas : le flag global coupait quand même
    // tout le monde en amont, côté client (isFeatureEnabled), avant même que
    // cette fonction soit appelée.
    expect(accessMigration).not.toContain('feature_flags');
  });

  it('un compte avec un bypass de test garde accès à une fonctionnalité même si son flag global est désactivé pour tout le monde (keep_feature_flag_enabled_for_me)', () => {
    expect(bypassMigration).toContain('create table if not exists public.feature_flag_test_accounts (');
    expect(bypassMigration).toContain('create or replace function public.keep_feature_flag_enabled_for_me(p_key text)');
    // Le bypass par compte doit pouvoir renvoyer true MEME quand le flag
    // global est false -- c'est la correction du bug (avant, rien ne
    // pouvait débloquer un compte de test une fois le flag global coupé).
    expect(bypassMigration).toContain('if v_global is true and coalesce(v_rollout, 0) > 0 then return true; end if;');
    expect(bypassMigration).toContain('select exists(\n      select 1 from public.feature_flag_test_accounts\n      where profile_id = uid and flag_key = p_key\n    ) into v_bypass;');
    expect(bypassMigration).toContain('return coalesce(v_bypass, false);');
  });

  it('adel4A reçoit immédiatement le bypass marketplace dans cette même migration (déblocage réel, pas seulement le mécanisme)', () => {
    expect(bypassMigration).toContain("select id, 'playlist_marketplace' from public.profiles where lower(username) = lower('adel4A')");
  });

  it('le client mobile passe par la RPC consciente du bypass au lieu de ne lire que le flag global brut', () => {
    expect(service).toContain("supabase.rpc('keep_feature_flag_enabled_for_me', { p_key: key })");
  });

  it('un admin peut activer/retirer ce bypass sans toucher directement la base (admin_set_feature_flag_test_bypass, réservé aux admin_users actifs)', () => {
    expect(bypassMigration).toContain('create or replace function public.admin_set_feature_flag_test_bypass(p_profile_id uuid, p_flag_key text, p_enabled boolean)');
    expect(bypassMigration).toContain("if not exists(select 1 from public.admin_users a where a.id = v_uid and a.is_active = true) then");
  });
});
