#!/usr/bin/env node
const query = process.argv.slice(2).filter((arg) => !arg.startsWith('--')).join(' ').trim();

if (process.argv.includes('--help') || !query) {
  console.log('Usage: npm run public-api:search -- <besoin>');
  console.log('Examples: music, geocoding, events, lyrics, images, translation');
  console.log('Source: GitHub public-apis/public-apis (developer discovery only)');
  process.exit(0);
}

const normalizedTerms = query
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean);

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
const headers = {
  Accept: 'application/vnd.github.raw+json',
  'User-Agent': 'KEEP-Public-API-Discovery/1.0',
};
if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;

try {
  const response = await fetch(
    'https://api.github.com/repos/public-apis/public-apis/contents/README.md?ref=master',
    { headers, signal: controller.signal },
  );
  if (!response.ok) throw new Error('GitHub catalog HTTP ' + response.status);
  const markdown = await response.text();

  const rows = markdown.split(/\r?\n/)
    .filter((line) => line.startsWith('|') && !/^\|\s*:?-+/.test(line))
    .filter((line) => {
      const haystack = line.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return normalizedTerms.every((term) => haystack.includes(term));
    })
    .slice(0, 30);

  if (!rows.length) {
    console.log('Aucune entrée exacte pour: ' + query);
    console.log('Essaie un mot plus large, par exemple: music, geocoding, events, translation.');
    process.exit(0);
  }

  console.log('Public APIs — résultats GitHub pour: ' + query);
  rows.forEach((row) => console.log(row));
  console.log('');
  console.log('IMPORTANT: une entrée du catalogue n’est pas automatiquement approuvée pour Loki Music.');
  console.log('Vérifier avant intégration: HTTPS, licence/CGU, quota, CORS, confidentialité, disponibilité et fallback.');
} catch (error) {
  console.error('Public API catalog unavailable: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
} finally {
  clearTimeout(timeout);
}
