import { runWhenNoGameInProgress } from '../updateGameGuard';
import { useGameSessionStore } from '../../store/useGameSessionStore';

// Adel (02/10/2026) : une mise à jour ne doit jamais s'installer en pleine
// partie (3 questions manquées = mise perdue). Elle attend la fin du Solo /
// Battle puis s'installe seule.
describe('mise à jour jamais pendant une partie', () => {
  afterEach(() => useGameSessionStore.getState().clearGameSession());

  it('applies immediately when no game is in progress', () => {
    const apply = jest.fn();
    runWhenNoGameInProgress(apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('waits during a Battle en ligne and applies once right after it ends', () => {
    useGameSessionStore.getState().setGameInProgress(true, 'EN_LIGNE', 'x');
    const apply = jest.fn();
    runWhenNoGameInProgress(apply);
    expect(apply).not.toHaveBeenCalled();
    useGameSessionStore.getState().setGameInProgress(true, 'EN_LIGNE', 'manche suivante');
    expect(apply).not.toHaveBeenCalled();
    useGameSessionStore.getState().clearGameSession();
    expect(apply).toHaveBeenCalledTimes(1);
    useGameSessionStore.getState().setGameInProgress(true, 'SOLO', 'y');
    useGameSessionStore.getState().clearGameSession();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('waits during a Solo too, and can be cancelled', () => {
    useGameSessionStore.getState().setGameInProgress(true, 'SOLO', 'x');
    const apply = jest.fn();
    const cancel = runWhenNoGameInProgress(apply);
    cancel();
    useGameSessionStore.getState().clearGameSession();
    expect(apply).not.toHaveBeenCalled();
  });

  it('every reload path of the silent updater goes through the guard', () => {
    const fs = require('fs');
    const path = require('path');
    const banner: string = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'AppUpdateBanner.tsx'), 'utf8');
    expect(banner.match(/runWhenNoGameInProgress\(/g)?.length).toBe(2);
    // Chaque rechargement est à l'intérieur d'un rappel du garde.
    expect(banner).toMatch(/runWhenNoGameInProgress\(\(\) => \{\s+if \(webReloadingRef\.current\) return;\s+webReloadingRef\.current = true;\s+reloadToLatest\(\);/);
    expect(banner).toMatch(/runWhenNoGameInProgress\(\(\) => \{\s+if \(!active\) return;\s+Updates\.reloadAsync\(\)/);
  });
});
