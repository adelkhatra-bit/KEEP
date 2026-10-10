import fs from 'fs';
import path from 'path';

// Adel (29/09/2026) : profil visité toujours « Hors ligne » alors que la
// personne est sur l'appli. Ce contrat verrouille les trois causes corrigées.
const root = path.resolve(__dirname, '..', '..', '..', '..', '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260929200000_public_profile_real_presence.sql'), 'utf8');
const store = fs.readFileSync(path.resolve(__dirname, '..', '..', 'store', 'useBattleAvailabilityStore.ts'), 'utf8');

describe('présence « En ligne » réelle sur le profil public', () => {
  it('la fonction de présence est lisible par un visiteur (SECURITY DEFINER) et renvoie une vraie activité récente', () => {
    const fn = migration.slice(migration.indexOf('function public.keep_public_profile_presence'));
    expect(fn.slice(0, 400)).toContain('security definer');
    expect(fn).toContain("> now() - interval '5 minutes'");
    expect(fn.slice(0, fn.indexOf('$$;'))).not.toContain('manual_available');
  });

  it('le ping enregistre la présence de tout utilisateur connecté sans jamais toucher la disponibilité Battle', () => {
    const fn = migration.slice(migration.indexOf('function public.keep_battle_manual_availability_ping'));
    expect(fn).toContain('app_last_seen_at = now()');
    expect(fn).toContain('last_seen_at = case when keep_battle_solo_presence.manual_available then now() else keep_battle_solo_presence.last_seen_at end');
    expect(fn).not.toMatch(/manual_available\s*=\s*(true|false|p_)/);
  });

  it('l’appli continue de pinguer même Battle OFF et au retour au premier plan', () => {
    expect(store).not.toContain('if (value) startPing(); else stopPing();');
    expect(store).toContain('function pingIfAvailable() {\n  if (pingTimer) {');
  });
});
