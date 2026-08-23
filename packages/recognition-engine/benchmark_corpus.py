"""
Benchmark réel "comme Shazam" (cf. demande explicite du 23/08/2026) --
sélectionne aléatoirement N morceaux déjà indexés, télécharge leur source
réelle, découpe des extraits 3s/5s/8s/10s, envoie chacun au VRAI endpoint
/api/recognition/identify, et classe chaque résultat en TRUE MATCH / NO
MATCH / WRONG MATCH -- distinction explicitement demandée : "un mauvais
titre est bien plus grave qu'un NO MATCH".

Usage : python benchmark_corpus.py --sample 20
"""
import argparse
import json
import os
import random
import subprocess
import sys
import time
import urllib.request

BACKEND_URL = 'http://localhost:3010'
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY')
WORK_DIR = os.path.join(os.path.dirname(__file__), '.benchmark-work')
DURATIONS = [3, 5, 8, 10]


def http_json(url, headers=None, data=None, method='GET'):
    req = urllib.request.Request(url, headers=headers or {}, data=data, method=method)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read())


def get_sample_tracks(n: int) -> list:
    """Morceaux réellement indexés (source=internet_archive) avec leur URL source."""
    token = new_guest_session()
    url = f'{SUPABASE_URL}/rest/v1/tracks?source=eq.internet_archive&select=id,title,artist,source_url&limit=500'
    tracks = http_json(url, headers={'apikey': SUPABASE_ANON_KEY, 'Authorization': f'Bearer {token}'})
    random.shuffle(tracks)
    return tracks[:n]


def new_guest_session() -> str:
    req = urllib.request.Request(
        f'{SUPABASE_URL}/auth/v1/signup', data=b'{}',
        headers={'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'}, method='POST',
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())['access_token']


def get_mp3_url(identifier: str):
    meta = http_json(f'https://archive.org/metadata/{identifier}')
    for f in meta.get('files', []):
        if f.get('format') == 'VBR MP3' and f.get('name', '').endswith('.mp3'):
            return f'https://archive.org/download/{identifier}/{urllib.request.quote(f["name"])}'
    return None


def identify(token: str, wav_path: str) -> dict:
    with open(wav_path, 'rb') as f:
        audio = f.read()
    req = urllib.request.Request(
        f'{BACKEND_URL}/api/recognition/identify', data=audio,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'audio/wav'}, method='POST',
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', type=int, default=20)
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print('ERREUR: SUPABASE_URL / SUPABASE_ANON_KEY manquants.', file=sys.stderr)
        sys.exit(1)

    os.makedirs(WORK_DIR, exist_ok=True)
    sample = get_sample_tracks(args.sample)
    print(f'{len(sample)} morceaux tirés au hasard pour le benchmark.\n')

    results = {d: {'true': 0, 'no_match': 0, 'wrong': 0, 'latencies': [], 'request_errors': 0} for d in DURATIONS}

    for i, track in enumerate(sample):
        identifier = track['source_url'].rstrip('/').split('/')[-1]
        expected_title = track['title']
        try:
            mp3_url = get_mp3_url(identifier)
            if not mp3_url:
                print(f'  [{i+1}/{len(sample)}] {identifier}: source introuvable, ignoré')
                continue
            raw_path = os.path.join(WORK_DIR, f'{identifier}.mp3')
            urllib.request.urlretrieve(mp3_url, raw_path)

            for dur in DURATIONS:
                wav_path = os.path.join(WORK_DIR, f'{identifier}_{dur}s.wav')
                # Offset 20s -- évite silence/intro de début de piste, plus
                # représentatif d'une vraie capture "au milieu du morceau".
                subprocess.run(
                    ['ffmpeg', '-y', '-ss', '20', '-i', raw_path, '-t', str(dur), '-ac', '1', '-ar', '11025', wav_path],
                    capture_output=True, timeout=30,
                )
                if not os.path.exists(wav_path) or os.path.getsize(wav_path) < 5000:
                    os.remove(wav_path) if os.path.exists(wav_path) else None
                    continue

                # Bug réel trouvé le 23/08/2026 : UN SEUL jeton invité réutilisé
                # pour tout le run -- la limite serveur réelle est 2 essais
                # par invité (routes/recognition.ts), donc tout appel après
                # le 2e échouait en guest_limit_reached (rapide, ~10ms) et
                # était silencieusement compté comme "NO MATCH" au lieu
                # d'une vraie erreur de méthode de test. Un jeton FRAIS par
                # appel élimine le problème à la racine.
                token = new_guest_session()
                start = time.time()
                try:
                    resp = identify(token, wav_path)
                except Exception as e:
                    resp = {'status': 'error', 'error': str(e)}
                latency_ms = (time.time() - start) * 1000

                if resp.get('status') == 'success':
                    results[dur]['latencies'].append(latency_ms)
                    got_title = resp.get('title', '')
                    if got_title.strip().lower() == expected_title.strip().lower():
                        results[dur]['true'] += 1
                        verdict = 'TRUE MATCH'
                    else:
                        results[dur]['wrong'] += 1
                        verdict = f'WRONG MATCH (attendu "{expected_title[:40]}", reçu "{got_title[:40]}")'
                elif resp.get('status') == 'no_match':
                    results[dur]['no_match'] += 1
                    verdict = 'NO MATCH'
                else:
                    # Vraie erreur (guest_limit_reached, HTTP, etc.) -- JAMAIS
                    # confondue avec un NO MATCH honnête (cf. demande
                    # explicite du 23/08/2026 -- distinction essentielle).
                    results[dur]['request_errors'] += 1
                    verdict = f'ERREUR REQUÊTE ({resp})'

                print(f'  [{i+1}/{len(sample)}] {dur}s "{expected_title[:40]}" -> {verdict} ({latency_ms:.0f}ms)')
                os.remove(wav_path)

            os.remove(raw_path)
        except Exception as e:
            print(f'  [{i+1}/{len(sample)}] {identifier}: échec {e}', file=sys.stderr)
        # Pacing -- bug réel trouvé le 23/08/2026 : Internet Archive impose
        # sa PROPRE limite de débit sur les téléchargements rapprochés (HTTP
        # 429), indépendante de KEEP -- une pause courte entre morceaux
        # (pas entre durées, déjà téléchargé une fois par morceau) évite de
        # perdre des échantillons entiers du benchmark pour cette raison.
        time.sleep(1.5)

    print('\n=== RÉSULTATS ===')
    for dur in DURATIONS:
        r = results[dur]
        total = r['true'] + r['no_match'] + r['wrong']
        if total == 0:
            continue
        p50 = sorted(r['latencies'])[len(r['latencies']) // 2] if r['latencies'] else 0
        p95 = sorted(r['latencies'])[int(len(r['latencies']) * 0.95)] if r['latencies'] else 0
        print(
            f"{dur}s : TRUE={r['true']}/{total} ({100*r['true']/total:.0f}%) "
            f"NO_MATCH={r['no_match']}/{total} WRONG={r['wrong']}/{total} "
            f"(erreurs requête hors total: {r['request_errors']}) "
            f"latence p50={p50:.0f}ms p95={p95:.0f}ms"
        )


if __name__ == '__main__':
    main()
