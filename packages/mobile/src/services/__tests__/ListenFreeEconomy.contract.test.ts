// @ts-nocheck
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const read = (...parts: string[]) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

describe('[ECONOMIE-FREE-LISTEN] — quota, consentement et coût réseau', () => {
  const source = read('packages','mobile','src','store','useSessionStore.ts');
  const recognition = read('packages','mobile','src','services','keepMusicCoreRecognition.ts');
  const home = read('packages','mobile','src','screens','HomeScreenCompact.tsx');
  const economy = read('packages','mobile','src','services','listenEconomyService.ts');
  const rules = read('supabase','migrations','20261004233000_free_economy_single_source.sql');
  const core = read('supabase','migrations','20261004235000_free_economy_unify_listen_core.sql');

  it('verrouille les quotas produit 3 / 5 / 30 / 60 / 150 et 1 FREE après quota', () => {
    expect(rules).toContain("('guest_recognition_limit','3'::jsonb");
    expect(rules).toContain("('signup_bonus_recognitions','5'::jsonb");
    expect(rules).toContain("('listen_over_quota_free_cost','1'::jsonb");
    expect(rules).toContain("when 'PREMIUM' then 30");
    expect(rules).toContain("when 'CREATOR_PRO' then 60");
    expect(rules).toContain("when 'VENUE_PRO' then 150");
    expect(rules).toContain("else 5");
  });

  it('compte uniquement une reconnaissance réellement acceptée', () => {
    expect(source).toContain("await applyDetectedTrack(set, get, recognition, 'listen')");
    expect(source).toContain("recordListenSuccess('listen:' + sessionIdAtDetection + ':' + entry.id");
    expect(source).toContain("if (!recognition) {");
  });

  it('n appelle aucun moteur distant quand la fenêtre locale est parole ou silence', () => {
    const guard = source.indexOf("presence.verdict === 'speech' || presence.verdict === 'silence'");
    const provider = source.indexOf('musicEngine.recognitionProvider.recognize(audioSample)', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(guard);
    expect(source.slice(guard, provider)).toContain('return;');
  });

  it('espace les fournisseurs payants de 20 secondes minimum', () => {
    expect(recognition).toContain('const PAID_PROVIDER_MIN_GAP_MS = 20 * 1000;');
    expect(recognition).toContain('Date.now() - lastPaidProviderAttemptAt >= PAID_PROVIDER_MIN_GAP_MS');
  });

  it('garde le consentement 1 FREE actif jusqu au succès ou annulation explicite', () => {
    expect(recognition).toContain('function paidListenAuthorizationActive(): boolean');
    expect(recognition).not.toContain('function consumePaidListenAuthorization');
    expect(source).toContain('listenFreeAuthorizedForNextSuccess = true;');
    expect(source).toContain('clearNextPaidListenFreeAuthorization();');
    expect(home).toContain('UTILISER ${listenEconomyStatus.overQuotaFreeCost} FREE');
  });

  it('fait passer mobile et Edge Functions par un même coeur membre', () => {
    expect(core).toContain('service_listen_status_for_profile');
    expect(core).toContain('return public.service_listen_status_for_profile(uid,p_timezone);');
    expect(core).toContain('return public.service_record_listen_success(uid,p_source_key,p_timezone,p_allow_free);');
    expect(economy).toContain("supabase.rpc('keep_record_listen_success'");
  });
});
