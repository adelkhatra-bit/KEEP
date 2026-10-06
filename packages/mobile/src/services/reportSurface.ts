/**
 * Où se trouve l'utilisateur quand il secoue (Adel, 06/10/2026) : « qu'on arrive à localiser EXACTEMENT l'emplacement et que
 * ça ouvre la fenêtre directement à l'emplacement ; si je suis sur la story, ça doit s'ouvrir directement ».
 *
 * Deux causes racines corrigées ici :
 *  1) Le signalement ne connaissait que l'écran de navigation (ex. « Profile ») : une story, un swipe ou Loki Pulse sont des
 *     fenêtres posées PAR-DESSUS, invisibles pour la navigation. Chaque fenêtre déclare maintenant sa « surface » (nom lisible,
 *     musique en cours) et elle part avec le signalement.
 *  2) Sur iPhone, une fenêtre Modal ne peut pas s'ouvrir au-dessus d'une autre : la fenêtre « Signaler » restait cachée derrière la
 *     story. Comme pour les alertes (ModalAlertLayer), chaque KeepModal ouverte porte une couche de signalement ; la plus haute
 *     affiche la fenêtre sur place. Sans fenêtre ouverte, l'hôte global s'en charge.
 * Module pur (aucun import natif) : testable.
 */
export type ReportSurface = { label: string; trackId?: string | null; trackTitle?: string | null; trackArtist?: string | null; index?: number | null; extra?: Record<string, string | number | boolean | null> };

let surfaces: Array<{ id: number; surface: ReportSurface }> = [];
let surfaceSeq = 0;
let layers: string[] = [];
let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => { try { l(); } catch { /* un abonné défaillant ne bloque pas les autres */ } });

export function subscribeReportSurface(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Une fenêtre déclare (ou met à jour) sa surface ; renvoie la fonction qui la retire. La plus récente gagne. */
export function pushReportSurface(surface: ReportSurface): { update: (next: ReportSurface) => void; remove: () => void } {
  const id = ++surfaceSeq;
  surfaces = [...surfaces, { id, surface }];
  return {
    update(next) { surfaces = surfaces.map((s) => (s.id === id ? { id, surface: next } : s)); },
    remove() { surfaces = surfaces.filter((s) => s.id !== id); },
  };
}

export function currentReportSurface(): ReportSurface | null {
  return surfaces.length ? surfaces[surfaces.length - 1].surface : null;
}

/** Texte lisible de l'emplacement : « Profile › Story de @adel › « Titre » (3) ». */
export function describeReportLocation(screen: string, surface: ReportSurface | null = currentReportSurface()): string {
  if (!surface) return screen;
  const track = surface.trackTitle ? ` › « ${surface.trackTitle} »${typeof surface.index === 'number' ? ` (${surface.index + 1})` : ''}` : '';
  return `${screen} › ${surface.label}${track}`.slice(0, 120);
}

// ── Couches de signalement dans les fenêtres ouvertes ──
export function registerReportLayer(id: string): () => void {
  layers = [...layers, id];
  emit();
  return () => { layers = layers.filter((l) => l !== id); emit(); };
}
export function topReportLayer(): string | null { return layers.length ? layers[layers.length - 1] : null; }

export function setReportOpen(next: boolean): void { if (open !== next) { open = next; emit(); } }
export function isReportOpen(): boolean { return open; }

/** Réinitialisation pour les tests. */
export function __resetReportSurfaceForTests(): void { surfaces = []; layers = []; open = false; listeners.clear(); }
