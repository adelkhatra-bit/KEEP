"""
Service audfprint PERSISTANT (cf. demande explicite du 23/08/2026 -- "8,8s
est trop lent... transforme audfprint en service persistant : processus
Python démarré une seule fois, index chargé en mémoire une seule fois").

AVANT : chaque reconnaissance relançait `python audfprint.py match ...` en
sous-processus -- redémarrage complet de l'interpréteur Python + RELECTURE
ENTIÈRE du fichier .pklz depuis le disque à CHAQUE appel (visible dans les
logs : "Reading hash table ..." à chaque requête). C'était la vraie cause
des ~8-9s de latence, pas audfprint lui-même.

APRÈS : ce service charge le HashTable UNE SEULE FOIS au démarrage (voir
hash_table.HashTable, audfprint_analyze.Analyzer, audfprint_match.Matcher --
API interne réelle du projet, pas un wrapper CLI) et le garde en mémoire.
Chaque requête HTTP suivante ne paie plus que le coût réel de l'analyse du
NOUVEL extrait -- plus de redémarrage Python, plus de relecture disque.

Utilise SEULEMENT la bibliothèque standard (http.server) -- aucune nouvelle
dépendance pip à installer.
"""
import json
import os
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'audfprint'))
import hash_table  # noqa: E402
import audfprint_analyze  # noqa: E402
import audfprint_match  # noqa: E402

DB_DIR = os.environ.get('KEEP_LOCAL_INDEX_DIR') or os.path.join(os.path.dirname(__file__), '..', 'backend', 'data', 'keep-local-index')
DB_PATH = os.path.join(DB_DIR, 'fingerprints.pklz')
PORT = int(os.environ.get('KEEP_AUDFPRINT_SERVICE_PORT', '5051'))

os.makedirs(DB_DIR, exist_ok=True)

analyzer = audfprint_analyze.Analyzer()
matcher = audfprint_match.Matcher()
matcher.verbose = False

# Un seul HashTable en mémoire pour toute la durée de vie du service --
# c'est PRÉCISÉMENT ce qui élimine la relecture disque à chaque requête.
if os.path.exists(DB_PATH):
    ht = hash_table.HashTable(DB_PATH)
    print(f'[audfprint-service] base chargée : {len(ht.names)} pistes, {sum(ht.counts)} hashes')
else:
    ht = hash_table.HashTable(hashbits=20, depth=100, maxtime=16384)
    ht.params['samplerate'] = 11025
    print('[audfprint-service] nouvelle base vide créée')

# TOUT accès (lecture ET écriture) sérialisé -- bug réel trouvé le
# 23/08/2026 : un `write_lock` protégeant seulement les ajouts entre eux
# laissait un /match tourner PENDANT qu'un /add mutait ht.names/ht.counts en
# mémoire (aucune protection contre lecture-pendant-écriture) -- confirmé en
# conditions réelles : un même extrait, correctement identifié quand testé
# seul, retombait en NO MATCH dès que le lot d'indexation tournait en
# parallèle en fond. ThreadingHTTPServer traite les requêtes sur des
# threads séparés -- ce verrou unique les sérialise complètement, coût
# négligeable vu la latence déjà très faible (données réelles : p50 < 1s).
service_lock = threading.Lock()


def do_match(tmp_path: str):
    with service_lock:
        return _do_match_locked(tmp_path)


def _do_match_locked(tmp_path: str):
    rslts, dur, nhash = matcher.match_file(analyzer, ht, tmp_path, 0)
    # `rslts` peut être un tableau numpy (pas une liste Python) -- `if not
    # rslts:` lève "truth value of an array is ambiguous" dès qu'il y a plus
    # d'un candidat. `len(...) == 0` fonctionne pour les deux types. Bug réel
    # trouvé le 23/08/2026 : le service renvoyait "no_match" pour TOUS les
    # morceaux pourtant déjà indexés, à cause de cette seule ligne.
    if len(rslts) == 0:
        return None
    tophitid, nhashaligned, aligntime, nhashraw, rank, min_time, max_time = rslts[0]
    # ht.names stocke le chemin TEL QUE reçu à l'ajout -- des entrées plus
    # anciennes (ajoutées via l'ancien chemin CLI, chemin absolu complet) et
    # plus récentes (via ce service, voir do_add ci-dessous) peuvent
    # coexister. basename() normalise les deux vers la même clé stable,
    # celle attendue par keep_fingerprints.audfprint_key côté Node -- bug
    # réel trouvé le 23/08/2026 : sans ça, chaque résolution échouait car la
    # clé renvoyée ne correspondait jamais à ce qui était enregistré en base.
    return {
        'matched': True,
        'key': os.path.basename(ht.names[tophitid]),
        'commonHashes': int(nhashaligned),
        'totalHashes': int(nhash),
    }


SAVE_INTERVAL_SEC = 3.0


def do_add(tmp_path: str, key: str):
    with service_lock:
        # analyzer.ingest enregistre les empreintes sous le nom `tmp_path`
        # TEL QUEL (chemin complet) dans ht.names -- normalisé vers la clé
        # propre juste après, pour que keep_fingerprints.audfprint_key
        # (Node) corresponde exactement à ce qui est stocké ici. Même bug
        # que côté lecture (do_match), trouvé et corrigé le 23/08/2026.
        dur, nhash = analyzer.ingest(ht, tmp_path)
        ht.names[-1] = key
        # PAS de ht.save() ici -- bug réel trouvé le 23/08/2026 (cf. "Internet
        # Archive ne doit jamais être dans le chemin critique d'une
        # reconnaissance utilisateur") : save() réécrit TOUT le .pklz sur
        # disque, et le tenir dans CE verrou pendant l'indexation en masse
        # (100-500 pistes d'affilée) faisait attendre un /match utilisateur
        # concurrent 5 à 16s, mesuré en conditions réelles. `_periodic_saver`
        # (thread séparé, voir plus bas) flush le disque toutes les
        # SAVE_INTERVAL_SEC -- le verrou n'est plus tenu ici que le temps de
        # l'ingestion elle-même (rapide), jamais celui de l'écriture disque.
        ht.dirty = True
    return {'key': key, 'hashesAdded': int(nhash)}


def _periodic_saver():
    while True:
        time.sleep(SAVE_INTERVAL_SEC)
        with service_lock:
            if getattr(ht, 'dirty', False):
                ht.save(DB_PATH)


threading.Thread(target=_periodic_saver, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f'[audfprint-service] {self.address_string()} {fmt % args}')

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            self._send_json(200, {'status': 'ok', 'tracks': len(ht.names), 'hashes': int(sum(ht.counts))})
        else:
            self._send_json(404, {'error': 'not_found'})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        audio = self.rfile.read(length)

        if self.path == '/match':
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                f.write(audio)
                tmp_path = f.name
            try:
                result = do_match(tmp_path)
                self._send_json(200, result or {'matched': False})
            except Exception as e:
                self._send_json(500, {'error': str(e)})
            finally:
                os.unlink(tmp_path)
            return

        if self.path == '/add':
            key = self.headers.get('X-Track-Key')
            if not key:
                self._send_json(400, {'error': 'X-Track-Key header manquant'})
                return
            # Renommé AVANT ingest -- voir commentaire do_add.
            tmp_dir = tempfile.mkdtemp()
            tmp_path = os.path.join(tmp_dir, key)
            with open(tmp_path, 'wb') as f:
                f.write(audio)
            try:
                result = do_add(tmp_path, key)
                self._send_json(200, result)
            except Exception as e:
                self._send_json(500, {'error': str(e)})
            finally:
                os.unlink(tmp_path)
                os.rmdir(tmp_dir)
            return

        self._send_json(404, {'error': 'not_found'})


if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'[audfprint-service] écoute sur le port {PORT}, base: {DB_PATH}')
    server.serve_forever()
