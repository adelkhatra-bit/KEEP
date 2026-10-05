// Règle pure (sans dépendance) : membre « endormi » = aucune activité depuis plus de 7 jours ; sa bulle (sans story) DISPARAÎT de la rangée
// automatiquement et revient dès qu'il se reconnecte (Adel, 05/10/2026 : « quasi une semaine sans connexion → masque la bulle »).
export const DORMANT_AFTER_DAYS = 7;
export function isDormantMember(lastActiveAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastActiveAt) return true;
  const at = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(at)) return true;
  return now - at > DORMANT_AFTER_DAYS * 86400 * 1000;
}

/** Chronomètre 24 h d'une musique de story (Adel, 05/10/2026) : « 23:41:07 » = temps de vie restant ; 00:00:00 une fois terminée. */
export const STORY_LIFETIME_MS = 24 * 3600000;
export function formatStoryCountdown(addedAtIso: string | null | undefined, now = Date.now()): string | null {
  if (!addedAtIso) return null;
  const at = new Date(addedAtIso).getTime();
  if (!Number.isFinite(at)) return null;
  const total = Math.max(0, Math.floor((at + STORY_LIFETIME_MS - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * Âge d'une musique de story (Adel, 05/10/2026) : on dit SEULEMENT depuis quand elle est en ligne — « il y a 29 min », « il y a 2 h ».
 * L'utilisateur sait qu'une story dure 24 h : plus elle est ancienne, plus il comprend qu'elle va bientôt finir. Aucune durée restante.
 */
export function formatStoryAge(addedAtIso: string | null | undefined, now = Date.now()): string | null {
  if (!addedAtIso) return null;
  const at = new Date(addedAtIso).getTime();
  if (!Number.isFinite(at)) return null;
  const elapsedMin = Math.max(0, Math.floor((now - at) / 60000));
  if (elapsedMin < 1) return 'à l’instant';
  if (elapsedMin < 60) return `il y a ${elapsedMin} min`;
  return `il y a ${Math.floor(elapsedMin / 60)} h`;
}

/** Détail d'une vue de story pour le propriétaire (Adel 05/10/2026) : 2 lignes courtes, façon Instagram. */
export function formatWatchDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

export function formatWatchDetail(
  v: { seconds: number; tracksSeen: number; tracksTotal: number; listened: boolean; watching: boolean; leftAt: string | null; chapters?: Array<{ index: number; seconds: number }> },
  now: number = Date.now(),
): { status: string; detail: string; chaptersLine: string | null } {
  const status = v.watching
    ? 'regarde maintenant'
    : v.leftAt
      ? `parti ${formatStoryAge(v.leftAt, now)}`
      : 'a regardé';
  const parts = [formatWatchDuration(v.seconds)];
  if (v.tracksTotal > 0) parts.push(`${Math.min(v.tracksSeen, v.tracksTotal)} musique${Math.min(v.tracksSeen, v.tracksTotal) > 1 ? 's' : ''} sur ${v.tracksTotal}`);
  parts.push(v.listened ? 'écouté' : 'pas écouté');
  // Chapitres : le temps exact passé sur chaque musique (Adel 05/10/2026). Au plus 4 affichés, le reste résumé.
  const chapters = (v.chapters ?? []).filter((c) => c.seconds > 0);
  const chaptersLine = chapters.length
    ? `Chapitres : ${chapters.slice(0, 4).map((c) => `${c.index + 1} · ${formatWatchDuration(c.seconds)}`).join('  ')}${chapters.length > 4 ? ` … +${chapters.length - 4}` : ''}`
    : null;
  return { status, detail: parts.join(' · '), chaptersLine };
}

/** Badge de classement sur la bulle (Adel 05/10/2026) : top 3 = médailles, top 10 = étoile ; il faut au moins 3 points sur 7 jours pour être reconnu. */
export const RANK_MIN_SCORE = 3;
export function rankBadgeFor(rank: number | undefined | null, score: number | undefined | null): { icon: string; label: string } | null {
  if (!rank || !score || score < RANK_MIN_SCORE) return null;
  if (rank === 1) return { icon: '🥇', label: 'N°1 de la semaine' };
  if (rank === 2) return { icon: '🥈', label: 'N°2 de la semaine' };
  if (rank === 3) return { icon: '🥉', label: 'N°3 de la semaine' };
  if (rank <= 10) return { icon: '⭐', label: `Top 10 de la semaine · n°${rank}` };
  return { icon: '✨', label: 'Membre actif de la semaine' };
}

/** Durée écoulée courte : « il y a 5 h », « il y a 3 j », « il y a 2 sem. » (activité des membres, Adel 05/10/2026). */
export function formatSince(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return days < 14 ? `il y a ${days} j` : `il y a ${Math.floor(days / 7)} sem.`;
}

/** Mon badge (Adel 05/10/2026) : 🔒 tant que je n'ai pas 3 points sur 7 jours, puis ✨ (actif), ⭐ (top 10), 🥇🥈🥉 (top 3). */
export function ownBadgeFor(rank: number | null | undefined, score: number): { icon: string; label: string; locked: boolean } {
  const tier = rankBadgeFor(rank, score);
  if (tier) return { ...tier, locked: false };
  if (score >= RANK_MIN_SCORE) return { icon: '✨', label: 'Membre actif de la semaine', locked: false };
  return { icon: '🔒', label: 'Badge à débloquer', locked: true };
}

/** Texte « comment débloquer / progresser » du badge (points : 1 par partage en story, 3 par reprise de ta musique, 2 par nouvel abonné). */
export function ownBadgeMessage(stats: { shares: number; reprises: number; followers: number; score: number; rank: number | null }): { title: string; body: string } {
  const badge = ownBadgeFor(stats.rank, stats.score);
  const detail = `Cette semaine : ${stats.shares} partage${stats.shares > 1 ? 's' : ''} en story · ${stats.reprises} reprise${stats.reprises > 1 ? 's' : ''} de ta musique · ${stats.followers} nouvel${stats.followers > 1 ? 's' : ''} abonné${stats.followers > 1 ? 's' : ''} = ${stats.score} point${stats.score > 1 ? 's' : ''}.`;
  if (badge.locked) {
    const missing = Math.max(1, RANK_MIN_SCORE - stats.score);
    return {
      title: '🔒 Débloque ton badge',
      body: `Il te manque ${missing} point${missing > 1 ? 's' : ''}.\n${detail}\n\nGagne des points : mets une musique en story (+1), partage ton profil ou ton lien d’affiliation pour gagner des abonnés (+2 chacun), fais reprendre ta musique (+3). Plus tu montes, plus ta bulle est vue.`,
    };
  }
  const rankLine = stats.rank ? `Tu es n°${stats.rank} de la semaine.` : 'Tu es dans le classement de la semaine.';
  return {
    title: `${badge.icon} ${badge.label}`,
    body: `${rankLine}\n${detail}\n\nContinue : chaque partage, reprise et abonné te fait monter, et ta bulle est de plus en plus vue.`,
  };
}

/** Fenêtre « profil sans story du jour » (Adel 05/10/2026) : depuis quand la personne n'a rien partagé, en une ligne. */
export function formatLastShared(lastSharedIso: string | null | undefined, now = Date.now()): string {
  if (!lastSharedIso) return 'Rien partagé pour l’instant';
  const at = new Date(lastSharedIso).getTime();
  if (!Number.isFinite(at)) return 'Rien partagé pour l’instant';
  return `Dernier partage : ${formatSince(lastSharedIso, now)}`;
}
