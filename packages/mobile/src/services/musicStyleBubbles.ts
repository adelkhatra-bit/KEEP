export function buildMusicStyleBubbles(
  sources: Array<ReadonlyArray<string> | null | undefined>,
  max = 12,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const source of sources) {
    for (const raw of source ?? []) {
      const value = String(raw || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
      if (!value) continue;
      const key = value.toLocaleLowerCase('fr-FR');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(value);
      if (result.length >= Math.max(1, max)) return result;
    }
  }
  return result;
}
