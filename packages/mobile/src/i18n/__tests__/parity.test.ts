import fr from '../locales/fr.json';
import en from '../locales/en.json';

/**
 * Test réel (pas un placeholder) : garantit qu'aucune langue ACTIVE ne
 * retombe silencieusement sur une clé manquante (mauvaise UX + contraire à
 * la règle "aucun texte coupé / aucun faux résultat").
 */
function flattenKeys(obj: Record<string, any>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null ? flattenKeys(value, path) : [path];
  });
}

describe('i18n parity FR/EN', () => {
  it('a exactement les mêmes clés dans fr.json et en.json', () => {
    const frKeys = flattenKeys(fr).sort();
    const enKeys = flattenKeys(en).sort();

    const missingInEn = frKeys.filter((k) => !enKeys.includes(k));
    const missingInFr = enKeys.filter((k) => !frKeys.includes(k));

    expect(missingInEn).toEqual([]);
    expect(missingInFr).toEqual([]);
  });

  it('ne contient aucune valeur vide (texte manquant)', () => {
    const values = [...flattenKeys(fr).map((k) => getPath(fr, k)), ...flattenKeys(en).map((k) => getPath(en, k))];
    expect(values.every((v) => typeof v === 'string' && v.trim().length > 0)).toBe(true);
  });
});

function getPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}
