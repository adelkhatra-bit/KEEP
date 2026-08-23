"""
Amorçage RÉEL du KEEP Local Index avec un corpus Creative Commons légal (cf.
demande explicite du 23/08/2026 -- "objectif 100 puis 500 morceaux").

Source : Internet Archive, collection "netlabels" -- 61 135+ morceaux
explicitement sous licence Creative Commons (vérifié le 23/08/2026 via
advancedsearch.php, licenseurl=creativecommons.org), API PUBLIQUE SANS CLÉ
(pas besoin d'inscription -- contrairement à Jamendo dont la clé de test
partagée "709fa152" s'est révélée suspendue le jour même). Musique réelle de
netlabels (labels qui distribuent explicitement sous CC), pas du contenu
piraté -- cf. règle absolue de ce projet.

Pipeline complet par morceau :
  1. recherche métadonnées (titre, artiste, licence) via advancedsearch.php
  2. récupération de la liste de fichiers réels via /metadata/<id>
  3. téléchargement du MP3
  4. normalisation FFmpeg (mono, 11025Hz -- ce qu'audfprint utilise en interne)
  5. ajout au service audfprint persistant (voir audfprint_service.py)
  6. INDEXATION SUPABASE (tracks + keep_fingerprints) via l'API REST directe
     -- respecte RLS (session invité réelle), source='internet_archive',
     source_url=lien de la page Archive.org (migration 0010).

AUCUN AUDIO N'EST GARDÉ après indexation -- seules les empreintes (déjà
dans le .pklz du service) et les métadonnées (Supabase) persistent.

Usage : python fetch_and_index_corpus.py --count 20
"""
import argparse
import os
import sys
import json
import time
import urllib.request
import urllib.parse

AUDFPRINT_SERVICE = os.environ.get('KEEP_AUDFPRINT_SERVICE_URL', 'http://localhost:5051')
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
WORK_DIR = os.path.join(os.path.dirname(__file__), '.corpus-work')


def http_json(url: str, headers: dict = None) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read())


def search_tracks(rows: int, page: int) -> list:
    q = 'collection:netlabels AND mediatype:audio AND licenseurl:*creativecommons* AND format:"VBR MP3"'
    params = urllib.parse.urlencode({
        'q': q,
        'fl[]': ['identifier', 'title', 'creator', 'licenseurl'],
        'rows': rows,
        'page': page,
        'output': 'json',
        'sort[]': 'downloads desc',  # morceaux réellement téléchargés -- pas du bruit aléatoire.
    }, doseq=True)
    data = http_json(f'https://archive.org/advancedsearch.php?{params}')
    return data.get('response', {}).get('docs', [])


def get_mp3_url(identifier: str) -> tuple:
    meta = http_json(f'https://archive.org/metadata/{identifier}')
    for f in meta.get('files', []):
        if f.get('format') == 'VBR MP3' and f.get('name', '').endswith('.mp3'):
            return f'https://archive.org/download/{identifier}/{urllib.parse.quote(f["name"])}', f.get('length')
    return None, None


def new_guest_session() -> str:
    req = urllib.request.Request(
        f'{SUPABASE_URL}/auth/v1/signup',
        data=b'{}',
        headers={'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    return data['access_token']


def supabase_upsert_track(token: str, track: dict) -> str:
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/tracks',
        data=json.dumps(track).encode('utf-8'),
        headers={
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    return data[0]['id']


def supabase_insert_fingerprint(token: str, track_id: str, audfprint_key: str):
    body = {'track_id': track_id, 'audfprint_key': audfprint_key, 'source_provider': 'manual'}
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/keep_fingerprints',
        data=json.dumps(body).encode('utf-8'),
        headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as e:
        if e.code == 409:  # clé déjà enregistrée -- pas une vraie erreur.
            return
        raise


def audfprint_add(wav_path: str, key: str):
    with open(wav_path, 'rb') as f:
        audio = f.read()
    req = urllib.request.Request(
        f'{AUDFPRINT_SERVICE}/add',
        data=audio,
        headers={'X-Track-Key': key},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--count', type=int, default=20)
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print('ERREUR: SUPABASE_URL / SUPABASE_ANON_KEY manquants dans l\'environnement.', file=sys.stderr)
        sys.exit(1)

    os.makedirs(WORK_DIR, exist_ok=True)
    token = new_guest_session()
    print(f'session invité créée pour l\'indexation.')

    # Bug réel évité le 23/08/2026 : sans ça, une 2e passe (100 -> 500)
    # re-téléchargeait et essayait de ré-indexer les MÊMES 100 premiers
    # morceaux (tri par popularité = mêmes résultats en tête à chaque run),
    # créant des doublons `tracks` au lieu de faire réellement grossir le
    # corpus. `seen` est pré-rempli avec tout ce qui est DÉJÀ en base.
    already = http_json(
        f'{SUPABASE_URL}/rest/v1/tracks?source=eq.internet_archive&select=source_url',
        headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}'},
    )
    seen = {row['source_url'].rstrip('/').split('/')[-1] for row in already}
    print(f'{len(seen)} morceaux déjà indexés -- ignorés, on cherche uniquement du nouveau.')

    indexed = 0
    page = 1
    while indexed < args.count:
        docs = search_tracks(rows=50, page=page)
        if not docs:
            print('Plus de résultats Internet Archive.')
            break

        for doc in docs:
            if indexed >= args.count:
                break
            identifier = doc['identifier']
            if identifier in seen:
                continue
            seen.add(identifier)
            title = doc.get('title', 'Inconnu')
            artist = doc.get('creator', 'Inconnu')
            license_url = doc.get('licenseurl', '')

            # Vérification RÉELLE, pas supposée (cf. demande explicite du
            # 23/08/2026 -- "ne considère pas automatiquement toute la
            # collection comme réutilisable, n'indexe que les éléments dont
            # la licence est clairement exploitable"). La recherche filtre
            # déjà licenseurl:*creativecommons* mais un champ vide/mal
            # formé reste possible côté métadonnées Archive.org -- rejeté
            # ici explicitement plutôt que supposé correct.
            if 'creativecommons.org/licenses/' not in license_url:
                continue

            # Bug réel trouvé le 23/08/2026 : initialisés à None AVANT le try
            # -- sans ça, une exception levée avant leur affectation (ex.
            # get_mp3_url en échec) faisait planter tout le script dans le
            # `finally` lui-même (UnboundLocalError), arrêtant tout le lot
            # au lieu de continuer honnêtement sur le morceau suivant.
            raw_path = None
            wav_path = None
            try:
                mp3_url, _ = get_mp3_url(identifier)
                if not mp3_url:
                    continue

                raw_path = os.path.join(WORK_DIR, f'{identifier}.mp3')
                urllib.request.urlretrieve(mp3_url, raw_path)

                wav_path = os.path.join(WORK_DIR, f'{identifier}.wav')
                os.system(f'ffmpeg -y -i "{raw_path}" -ac 1 -ar 11025 -t 30 "{wav_path}" -loglevel error')

                if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 10000:
                    print(f'  échec normalisation: {identifier}')
                    continue

                track_id = supabase_upsert_track(token, {
                    'title': title[:200],
                    'artist': (artist or 'Inconnu')[:200],
                    'source': 'internet_archive',
                    'source_url': f'https://archive.org/details/{identifier}',
                    'license_url': license_url,
                })

                audfprint_key = f'{track_id}.wav'
                audfprint_add(wav_path, audfprint_key)
                supabase_insert_fingerprint(token, track_id, audfprint_key)

                indexed += 1
                print(f'[{indexed}/{args.count}] {artist} - {title}')

            except Exception as e:
                print(f'  échec {identifier}: {e}', file=sys.stderr)
            finally:
                for p in (raw_path, wav_path):
                    if p and os.path.exists(p):
                        os.remove(p)  # aucun audio gardé -- voir en-tête.

        page += 1
        time.sleep(0.3)

    print(f'\nTerminé : {indexed} morceaux réels indexés dans KEEP Local Index.')


if __name__ == '__main__':
    main()
