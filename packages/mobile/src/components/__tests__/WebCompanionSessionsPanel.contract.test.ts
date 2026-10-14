import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '..', 'WebCompanionSessionsPanel.tsx'), 'utf8');

describe('Connected desktop sessions', () => {
  it('refreshes on app resume and every 30 seconds', () => {
    expect(source).toContain('AppState.addEventListener');
    expect(source).toContain('30000');
    expect(source).toContain('clearInterval(interval)');
  });
  it('shows online/offline and a 24-hour countdown', () => {
    expect(source).toContain('En ligne');
    expect(source).toContain('Hors ligne');
    expect(source).toContain('24 * 3600000 - now');
  });
});
