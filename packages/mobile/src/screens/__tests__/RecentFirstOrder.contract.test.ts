import fs from 'fs';
import path from 'path';

const src = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('règle Adel 05/10/2026 : le plus récent est toujours en haut', () => {
  it('session recap lists tracks by detectedAt desc, not grouped by status', () => {
    const recap = src('SessionRecapScreen.tsx');
    const block = recap.slice(recap.indexOf('const sortedTracks'), recap.indexOf('const passedTracks'));
    expect(block).toContain('new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()');
    expect(block).not.toContain('rank(');
  });
  it('session history lists the most recent session first', () => {
    const hist = src('SessionHistoryScreen.tsx');
    const block = hist.slice(hist.indexOf('const visibleSessions'), hist.indexOf('const deleteSession'));
    expect(block).toContain('new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()');
    expect(block).not.toContain('aPending');
  });
});
