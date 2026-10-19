/**
 * Clé unique « même chanson » pour détecter les doublons (Adel 18/10/2026 : « Bob Marley – Is This Love en double »).
 *
 * Un même titre existe sous plusieurs ISRC (album, single, remaster, compilation) : s'appuyer sur l'ISRC
 * faisait apparaître la chanson deux fois et ne supprimait qu'une copie. La clé repose donc uniquement sur
 * le titre + l'artiste principal, sans accents, sans mention « remastered / live / feat. » entre parenthèses.
 */
function clean(value: string | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\(\[][^\)\]]*[\)\]]/g, ' ')
    .replace(/\s[-–]\s(?:\d{4}\s)?(?:remaster(?:ed)?|mono|stereo|single version|album version|radio edit|live)\b.*$/i, ' ')
    .replace(/\b(?:feat|ft|featuring)\b.*$/i, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function songDuplicateKey(title: string | undefined, artist: string | undefined): string {
  const mainArtist = String(artist || '').split(/,|;|\sx\s|\s&\s|\sfeat\.?\s|\sft\.?\s/i)[0];
  return `${clean(title)}|${clean(mainArtist)}`;
}
