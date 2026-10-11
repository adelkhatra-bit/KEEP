// @ts-nocheck
import fs from 'fs';
import path from 'path';

const readNormalized = (...segments: string[]) => fs.readFileSync(path.resolve(...segments), 'utf8').replace(/\r\n/g, '\n');

/**
 * Audit latence TestFlight (Adel, 22/09/2026) : rien ne préchargeait jamais
 * l'extrait de la manche N+1 pendant que la manche N jouait -- chaque manche
 * payait la latence réseau+décodage complète. Feu vert Adel : précharger
 * pendant la pause existante de 2,8s après une réponse, consommer le son
 * préchargé instantanément quand la manche suivante démarre, nettoyer
 * proprement en cas d'échec ou d'abandon.
 */
describe('audioPreviewService -- préchargement de la manche suivante (Battle solo)', () => {
  const preview = readNormalized(__dirname, '..', 'audioPreviewService.ts');
  const battle = readNormalized(__dirname, '..', '..', 'components', 'KeepBattleMobileGameV3.tsx');

  it('expose preloadTrackPreviewSegment (charge sans jouer, shouldPlay:false via autoPlay=false)', () => {
    expect(preview).toContain('export async function preloadTrackPreviewSegment(');
    expect(preview).toContain("createSoundWithRetry(previewUrl, effectivePosition, () => {}, false, !activePlaying);");
  });

  it('expose discardPreloadedTrackPreview pour nettoyer un préchargement abandonné', () => {
    expect(preview).toContain('export function discardPreloadedTrackPreview(key?: string): void {');
  });

  it('le préchargement ne touche jamais activeSound -- la manche en cours continue de jouer', () => {
    const fnStart = preview.indexOf('export async function preloadTrackPreviewSegment(');
    const fnEnd = preview.indexOf('\n}', fnStart);
    const fnBody = preview.slice(fnStart, fnEnd);
    expect(fnBody).not.toContain('unloadActive()');
    expect(fnBody).not.toContain('activeSound =');
  });

  it('playTrackPreviewSegment consomme un préchargement correspondant à la clé avant de recréer un son', () => {
    expect(preview).toContain('if (preloadedKey === key && preloadedSound) {');
    expect(preview).toContain('preloaded.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => onStatus(status, preloaded));');
    expect(preview).toContain('createdSound = preloaded;');
    expect(preview).toContain('await ensurePlaying(createdSound);');
  });

  it('un échec de consommation du préchargement retombe sur le chargement normal (pas de blocage)', () => {
    const fnStart = preview.indexOf('export async function playTrackPreviewSegment(');
    const fnBody = preview.slice(fnStart, preview.indexOf('\n}\n', fnStart));
    expect(fnBody).toContain('if (!createdSound) {');
    expect(fnBody).toContain('createdSound = await createSoundWithRetry(previewUrl, effectivePosition, onStatus, false);');
    expect(fnBody).toContain('await awaitNativeHandoffSilence();');
    expect(fnBody).toContain('await ensurePlaying(createdSound);');
  });

  it("KeepBattleMobileGameV3 précharge la manche N+1 dès qu'une réponse est donnée, seulement s'il en reste une", () => {
    expect(battle).toContain('if (soloIndex < solo.rounds.length - 1) {');
    expect(battle).toContain('stopTrackPreviewFast();');
    expect(battle).toContain('void preloadTrackPreviewSegment(');
    expect(battle).toContain('soloRoundPreviewKey(nextRound.trackId, soloIndex + 1),');
  });

  it("playVerified garde la clé de base au premier essai pour rencontrer un préchargement existant", () => {
    expect(battle).toContain("const attemptKey = attempt === 0 ? key : `${key}:retry${attempt}`;");
  });

  it('le démontage du composant nettoie un préchargement en attente (pas de fuite si le joueur quitte le Battle)', () => {
    expect(battle).toContain('discardPreloadedTrackPreview();');
  });
});

describe('Non-régression : le correctif micro/audio (a98868f) reste intact après le préchargement', () => {
  const preview = readNormalized(__dirname, '..', 'audioPreviewService.ts');

  it('configurePreviewAudio consulte toujours isNativeRecordingModeActive() et ne force jamais allowsRecordingIOS à false', () => {
    expect(preview).toContain('const recordingActive = isNativeRecordingModeActive();');
    expect(preview).not.toContain('allowsRecordingIOS: false,');
  });
});

describe('Accueil Loki Pulse — latence TestFlight et verrou audio global', () => {
  const home = readNormalized(__dirname, '..', '..', 'screens', 'HomeScreenCompact.tsx');
  const preview = readNormalized(__dirname, '..', 'audioPreviewService.ts');

  it("prépare l'extrait dès onPressIn sur Web et TestFlight sans jouer de second son", () => {
    expect(home).not.toContain('onPressIn={() => prewarmHomePulseTrack(item.track.id)}'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain("if (Platform.OS !== 'web') return;");
    expect(preview).toContain('const requestEpoch = ++profilePreloadEpoch;');
    expect(preview).toContain('createSoundWithRetry(previewUrl, 0, () => {}, false, !activePlaying)');
  });

  it('coupe immédiatement tout ancien extrait avant d’ouvrir le morceau choisi', () => {
    expect(home).not.toContain('stopTrackPreviewFast();'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('setHomePulseSelectedTrackId(trackId);'); // Adel 05/10/2026 : plus de bulles Loki Pulse sur Écouter (elles restent sur le profil)
    expect(home).not.toContain('setHomePulseOpen(true);');
    expect(preview).toContain('let playbackRequestEpoch = 0;');
    expect(preview).toContain('if (requestEpoch !== playbackRequestEpoch) return;');
  });
});
