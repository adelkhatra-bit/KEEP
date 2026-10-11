// Adel (29/09/2026) : musique jouée par l'iPhone lui-même + écoute dans
// Safari = "Aucun son détecté". Ce n'est pas un mauvais branchement : dès
// qu'une page web ouvre le micro, iOS active son traitement "anti-écho"
// (celui des appels) qui retire du micro tout ce que l'iPhone joue lui-même,
// et Safari iOS ignore echoCancellation:false. L'utilisateur doit le savoir.
// Module pur (sans dépendance native) pour être testable.

export function isIosWebBrowser(nav: { userAgent?: string; maxTouchPoints?: number } | undefined =
  typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  const iPadOs = /Macintosh/.test(ua) && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOs;
}

export function noSoundMessage(nav?: { userAgent?: string; maxTouchPoints?: number }): string {
  return isIosWebBrowser(nav ?? (typeof navigator === 'undefined' ? undefined : navigator))
    ? 'Aucun son capté. Sur iPhone, le site ne peut pas entendre la musique jouée par ce même iPhone : iOS la filtre du micro. Joue-la sur une enceinte ou un autre appareil, ou utilise l’app Loki Music.'
    : 'Aucun son détecté -- vérifie que le micro capte bien la musique (volume, autorisation navigateur).';
}
