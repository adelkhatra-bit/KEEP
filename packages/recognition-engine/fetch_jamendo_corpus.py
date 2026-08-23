"""
Récupère un corpus QA réel depuis Jamendo (catalogue Creative Commons,
400 000 morceaux réels, licence claire -- voir developer.jamendo.com).
PRÊT À EXÉCUTER dès qu'un client_id est fourni (gratuit, auto-inscription
sur developer.jamendo.com/v3.0 -- action humaine, je ne crée pas de compte
à la place d'Adel).

Usage : JAMENDO_CLIENT_ID=xxx python fetch_jamendo_corpus.py [--count 200]

Télécharge les métadonnées (titre, artiste, licence, ID Jamendo) + l'audio
MP3 de chaque piste dans qa-corpus-jamendo/, écrit un sidecar JSON
(titre/artiste/licence) exploitable directement par
packages/backend/scripts (indexation audfprint) -- même format que
qa-corpus-metadata.json déjà utilisé en production.
"""
import os
import sys
import json
import time
import urllib.request
import urllib.parse

CLIENT_ID = os.environ.get('JAMENDO_CLIENT_ID')
OUT_DIR = os.path.join(os.path.dirname(__file__), 'qa-corpus-jamendo')
BATCH_SIZE = 50


def fetch_batch(offset: int, limit: int) -> list[dict]:
    params = urllib.parse.urlencode({
        'client_id': CLIENT_ID,
        'format': 'json',
        'limit': limit,
        'offset': offset,
        'include': 'musicinfo',
        'audioformat': 'mp32',
        'order': 'popularity_total',  # pistes réellement écoutées -- pas du bruit aléatoire.
    })
    url = f'https://api.jamendo.com/v3.0/tracks/?{params}'
    with urllib.request.urlopen(url, timeout=20) as res:
        data = json.loads(res.read())
    if data.get('headers', {}).get('status') != 'success':
        raise RuntimeError(f"Jamendo API error: {data.get('headers')}")
    return data.get('results', [])


def download(url: str, dest: str) -> None:
    urllib.request.urlretrieve(url, dest)


def main():
    if not CLIENT_ID:
        print('ERREUR : JAMENDO_CLIENT_ID manquant -- inscription gratuite sur developer.jamendo.com/v3.0', file=sys.stderr)
        sys.exit(1)

    target_count = 200
    if '--count' in sys.argv:
        target_count = int(sys.argv[sys.argv.index('--count') + 1])

    os.makedirs(OUT_DIR, exist_ok=True)
    metadata: dict[str, dict] = {}
    fetched = 0
    offset = 0

    while fetched < target_count:
        batch = fetch_batch(offset, min(BATCH_SIZE, target_count - fetched))
        if not batch:
            print(f'Jamendo: plus de résultats après {fetched} pistes.')
            break

        for track in batch:
            track_id = f"jamendo-{track['id']}"
            audio_url = track.get('audiodownload') or track.get('audio')
            if not audio_url:
                continue
            dest = os.path.join(OUT_DIR, f'{track_id}.mp3')
            try:
                download(audio_url, dest)
            except Exception as e:
                print(f'  échec téléchargement {track_id}: {e}', file=sys.stderr)
                continue

            metadata[f'{track_id}.mp3'] = {
                'title': track.get('name', 'Inconnu'),
                'artist': track.get('artist_name', 'Inconnu'),
                'jamendoId': track['id'],
                'license': track.get('license_ccurl', ''),
            }
            fetched += 1
            print(f'[{fetched}/{target_count}] {track.get("artist_name")} - {track.get("name")}')

        offset += len(batch)
        time.sleep(0.5)  # respecte le rate limit Jamendo -- pas de martèlement.

    with open(os.path.join(OUT_DIR, 'metadata.json'), 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f'\nTerminé : {fetched} pistes réelles Creative Commons dans {OUT_DIR}')
    print('Prochaine étape : script backend pour indexer ce corpus dans audfprint (voir scripts/index-qa-corpus.ts, à adapter pour ce dossier).')


if __name__ == '__main__':
    main()
