// @ts-nocheck
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve(__dirname, '../../components/WebCompanionSessionsPanel.tsx'), 'utf8');
const session = { id: 'computer', device_label: 'PC de test', last_seen_at: '2026-01-01', revoked_at: null };

function harness({ guest = false, failed = false } = {}) {
  const alerts = [];
  const send = jest.fn().mockResolvedValue(undefined);
  const revoke = jest.fn().mockResolvedValue(true);
  const list = jest.fn().mockResolvedValue([session]);
  const gate = jest.fn();
  const state = { user: { id: 'owner' }, isLocalGuest: guest, isDemoMode: false };
  const hooks = [[session], false, null, false, failed];
  let index = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: () => [hooks[index++], jest.fn()],
    useRef: () => ({ current: 0 }),
    useCallback: (callback) => callback,
    useEffect: jest.fn(),
  };
  const modules = {
    react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: (value) => value } },
    '../theme/colors': { colors: {} },
    '../utils/keepAlert': { Alert: { alert: (title, message, buttons) => alerts.push({ title, message, buttons }) } },
    '../store/useUserStore': { useUserStore: (select) => select(state) },
    '../store/useAccountGateStore': { useAccountGateStore: { getState: () => ({ requestAccount: gate }) } },
    '../services/webPairingService': { sendDesktopLinkEmail: send, revokeWebCompanionSession: revoke, listWebCompanionSessions: list },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, { exports: exported, require: (name) => modules[name] });
  const tree = exported.default({ showEmailLink: true });
  const flatten = (node) => node == null ? [] : Array.isArray(node) ? node.flatMap(flatten)
    : typeof node === 'object' ? [node, ...node.children.flatMap(flatten)] : [node];
  return { nodes: flatten(tree), alerts, send, revoke, list, gate };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('Ordinateur controls share one mobile/web panel', () => {
  it('M’envoyer le lien invokes the existing server flow and confirms only successful send', async () => {
    const h = harness();
    h.nodes.find((node) => node.props?.accessibilityLabel === 'M’envoyer le lien').props.onPress();
    await settle();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.alerts[0].title).toBe('Lien envoyé');
    expect(h.alerts[0].message).toContain('scanne le QR');
  });

  it('revocation requires explicit confirmation and targets the selected computer', async () => {
    const h = harness();
    h.nodes.find((node) => node.props?.accessibilityLabel === 'Déconnecter PC de test').props.onPress();
    expect(h.revoke).not.toHaveBeenCalled();
    h.alerts[0].buttons.find((button) => button.text === 'Déconnecter').onPress();
    await settle();
    expect(h.revoke).toHaveBeenCalledWith('computer');
    expect(h.list).toHaveBeenCalledTimes(1);
  });

  it('guests get a real account action, never email or computer session controls', () => {
    const h = harness({ guest: true });
    expect(h.nodes.some((node) => node.props?.accessibilityLabel === 'M’envoyer le lien')).toBe(false);
    h.nodes.find((node) => node.type === 'Button').props.onPress();
    expect(h.gate).toHaveBeenCalledWith('login');
    expect(h.send).not.toHaveBeenCalled();
    expect(h.list).not.toHaveBeenCalled();
  });

  it('a failed list is unavailable, not falsely empty', () => {
    const h = harness({ failed: true });
    expect(h.nodes).toContain('Liste indisponible. Réessaie avec Actualiser.');
    expect(h.nodes).not.toContain('Aucun ordinateur connecté.');
  });
});
