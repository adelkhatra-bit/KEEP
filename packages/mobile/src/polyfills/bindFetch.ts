/**
 * Force `fetch` global à toujours être invoqué avec `this === globalThis`.
 *
 * Root cause confirmée sur iPhone réel (Safari, capture web) le 22/08/2026 :
 * "Can only call Window.fetch on instances of Window" persistait même après
 * avoir corrigé `fetchImpl: typeof fetch = fetch.bind(globalThis)` dans les
 * providers -- l'appel fautif était donc ailleurs : très probablement dans
 * `services/micCapture.ts` (`fetch(uri)`), où Babel/regenerator-runtime
 * transforme l'appel `await fetch(...)` d'une fonction async et peut invoquer
 * la fonction interne via `.call(thisArg, ...)` avec un `thisArg` qui n'est
 * pas `window` (documenté dans plusieurs issues Expo/React Native Web).
 * Plutôt que de traquer chaque site d'appel un par un, on repointe UNE FOIS
 * `globalThis.fetch` vers une version pré-liée dès le lancement de l'app --
 * tout appel `fetch(...)` ultérieur, où qu'il soit dans le code, hérite du
 * bon `this` automatiquement.
 *
 * DOIT être importé en tout premier dans App.tsx, avant tout autre module
 * susceptible d'appeler fetch.
 */
if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
  const alreadyBound = (globalThis.fetch as { __keepBound?: boolean }).__keepBound;
  if (!alreadyBound) {
    const bound = globalThis.fetch.bind(globalThis) as typeof fetch & { __keepBound?: boolean };
    bound.__keepBound = true;
    globalThis.fetch = bound;
  }
}

export {};
