// @ts-nocheck
import fs from 'fs';
import path from 'path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

describe('Demo mode guardrails', () => {
  const home = read(__dirname, '..', 'HomeScreenCompact.tsx');
  const discover = read(__dirname, '..', 'DiscoverScreen.tsx');
  const profile = read(__dirname, '..', 'ProfilePublicScreen.tsx');
  const plan = read(__dirname, '..', '..', 'services', 'planService.ts');
  const admin = read(__dirname, '..', '..', '..', '..', 'admin', 'pages', 'remote-config.tsx');
  const contract = JSON.parse(read(__dirname, '..', '..', '..', '..', '..', 'config', 'keep-product-contract.json'));

  it('caps demo listening with a persistent remote-configured budget', () => {
    expect(home).toContain("const DEMO_LISTEN_COUNT_KEY = '@keep/demo-listen-count-v1'");
    expect(home).toContain('loadDemoListenLimit()');
    expect(home).toContain('demoListenUsedRef.current >= demoListenLimit');
    expect(home).toContain('requestEndSession();');
    expect(plan).toContain(".eq('key', 'demo_listen_limit')");
  });

  it('locks Discover in demo and can be controlled from remote config', () => {
    expect(discover).toContain('if (isDemoMode && demoDiscoveryLocked)');
    expect(discover).toContain('loadDemoDiscoveryLocked()');
    expect(discover).toContain('CRÉER / SE CONNECTER');
    expect(plan).toContain(".eq('key', 'demo_discovery_locked')");
  });

  it('never invents a Free balance for demo users', () => {
    expect(profile).toContain("setFreeBalance(null)");
    expect(profile).not.toContain('setFreeBalance(3)');
    expect(profile).toContain("isDemoMode ? '?' : (freeBalance ?? '…')");
    expect(profile).toContain("FREE · mode démo");
  });

  it('exposes both demo controls in Super Admin', () => {
    expect(admin).toContain("demo_listen_limit: 'Mode démo · écoutes maximum avant compte'");
    expect(admin).toContain("demo_discovery_locked: 'Mode démo · verrouiller Découvertes'");
  });

  it('locks the canonical product contract', () => {
    expect(contract.demoExperience.listenRecognitionLimitDefault).toBe(3);
    expect(contract.demoExperience.discoveryRequiresRealAccountByDefault).toBe(true);
    expect(contract.demoExperience.fakeFreeBalanceForbidden).toBe(true);
    expect(contract.demoExperience.demoFreeDisplay).toBe('?');
  });
});
