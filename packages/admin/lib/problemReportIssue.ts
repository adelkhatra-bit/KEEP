// Aucun message, pseudo ou contexte privé n'est envoyé au brouillon GitHub.
export function problemReportIssueUrl(group: { group_key: string; report_count: number }) {
  if (!/^[a-f0-9]{32}$/.test(group.group_key) || !Number.isSafeInteger(group.report_count) || group.report_count < 1) return null;
  const params = new URLSearchParams({
    title: `Bug Loki Music · groupe ${group.group_key}`,
    body: [
      'Base : reconcile/claude-main-20260825. Lire les règles et réutiliser les implémentations existantes.',
      '',
      `Groupe Super Admin : ${group.group_key}`,
      `Signalements : ${group.report_count}`,
      'Détails privés à consulter dans le Super Admin › Bugs (non copiés sur GitHub).',
      '',
      'Copilot : diagnostiquer ce groupe, ajouter un test anti-régression et associer le SHA complet du correctif.',
      'Préserver les données utilisateur et le design ; vérifier mobile 390 et ordinateur 1440.',
    ].join('\n'),
  });
  return `https://github.com/adelkhatra-bit/KEEP/issues/new?${params}`;
}
