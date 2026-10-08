import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve(__dirname, '../../components/WebPairingLifecycle.tsx'), 'utf8');

function harness({ guest = false, userId = 'owner' } = {}) {
  const effects: Array<() => unknown> = [];
  const alerts: Array<{ title: string; buttons: Array<{ text: string; onPress: () => void }> }> = [];
  const approve = jest.fn().mockResolvedValue({ status: 'APPROVED' });
  const cancel = jest.fn().mockResolvedValue(undefined);
  const inspect = jest.fn().mockResolvedValue({ deviceLabel: 'PC Windows' });
  const state = { user: { id: userId }, isLocalGuest: guest, isDemoMode: false };
  const store = Object.assign((select: (value: typeof state) => unknown) => select(state), { getState: () => state });
  const modules: Record<string, unknown> = {
    react: {
      useState: () => [{ pairingId: 'pairing', token: 'proof' }, jest.fn()],
      useRef: () => ({ current: false }),
      useCallback: (callback: unknown) => callback,
      useEffect: (effect: () => unknown) => effects.push(effect),
    },
    'react-native': { Platform: { OS: 'ios' }, Linking: {} },
    '../utils/keepAlert': { Alert: { alert: (title: string, _message: string, buttons = []) => alerts.push({ title, buttons }) } },
    '../services/supabaseClient': { supabase: null },
    '../services/authService': { createAuthService: jest.fn() },
    '../store/useUserStore': { useUserStore: store },
    '../store/useAccountGateStore': { useAccountGateStore: {} },
    '../services/webPairingService': { approveDesktopPairing: approve, inspectDesktopPairing: inspect, cancelDesktopPairing: cancel },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exported: { default?: () => void } = {};
  vm.runInNewContext(compiled, { exports: exported, require: (name: string) => modules[name] });
  exported.default!();
  effects[1]();
  return { alerts, approve, inspect, cancel, state };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('Web pairing explicit phone confirmation', () => {
  it('scanning inspects the challenge but never authorizes before pressing Autoriser', async () => {
    const result = harness();
    await settle();
    expect(result.inspect).toHaveBeenCalledWith('pairing', 'proof');
    expect(result.approve).not.toHaveBeenCalled();
    expect(result.alerts[0].title).toBe('Autoriser cet ordinateur ?');
    const authorize = result.alerts[0].buttons.find((button) => button.text === 'Autoriser')!;
    authorize.onPress();
    authorize.onPress();
    await settle();
    expect(result.approve).toHaveBeenCalledTimes(1);
  });

  it('refusal cancels the challenge without authorizing', async () => {
    const result = harness();
    await settle();
    result.alerts[0].buttons.find((button) => button.text === 'Refuser')!.onPress();
    expect(result.cancel).toHaveBeenCalledWith('pairing', 'proof');
    expect(result.approve).not.toHaveBeenCalled();
  });

  it('a guest cannot inspect or approve', async () => {
    const result = harness({ guest: true });
    await settle();
    expect(result.inspect).not.toHaveBeenCalled();
    expect(result.approve).not.toHaveBeenCalled();
    expect(result.alerts).toEqual([]);
  });

  it('a confirmation queued before account change cannot authorize the new account', async () => {
    const result = harness();
    await settle();
    result.state.user = { id: 'another-owner' };
    result.alerts[0].buttons.find((button) => button.text === 'Autoriser')!.onPress();
    expect(result.approve).not.toHaveBeenCalled();
  });
});
