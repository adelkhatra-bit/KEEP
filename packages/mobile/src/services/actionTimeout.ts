/**
 * Garde-fou commun pour les actions qui attendent le réseau ou une fenêtre native (Adel, 06/10/2026 : Apple Music bloqué sur
 * « PATIENTER… » indéfiniment). Cause racine : `await` sans échéance ; si la réponse ne revient jamais, le bouton reste
 * occupé pour toujours. Ici l'attente est bornée : au-delà, l'action échoue proprement (ACTION_TIMEOUT) et l'écran se libère.
 */
export class ActionTimeoutError extends Error {
  constructor(public readonly step: string) { super(`ACTION_TIMEOUT:${step}`); }
}

export function withActionTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ActionTimeoutError(step)), ms); });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); }) as Promise<T>;
}

export const isActionTimeout = (error: unknown) => String((error as any)?.message || '').startsWith('ACTION_TIMEOUT');
