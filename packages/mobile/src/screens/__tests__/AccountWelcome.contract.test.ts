const fs = require('fs');
const path = require('path');

const read = (...parts: string[]) => fs.readFileSync(path.join(...parts), 'utf8');

describe('authenticated welcome popup contract', () => {
  const form = read(__dirname, '..', '..', 'components', 'UsernameAccountForm.tsx');
  const modal = read(__dirname, '..', '..', 'components', 'AccountGateModal.tsx');
  const store = read(__dirname, '..', '..', 'store', 'useAccountGateStore.ts');

  it('celebrates every successful interactive authentication', () => {
    expect(form).toContain('useAccountGateStore.getState().handleSuccess()');
    expect(form).toContain('finishAuthenticatedFlow');
    expect(modal).toContain('Bienvenue sur Loki Music !');
    expect(modal).toContain('celebrate');
    expect(store).toContain('handleSuccess: () => set({ visible: true, celebrate: true })');
  });

  it('closes the celebration automatically without navigating away', () => {
    expect(modal).toContain('setTimeout(close, 1800)');
    expect(modal).not.toContain("navigation.navigate");
  });
});
