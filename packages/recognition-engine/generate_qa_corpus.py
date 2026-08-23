"""
Génère un corpus QA de test 100% original (composé ici, pas téléchargé) --
aucun souci de droits d'auteur, utilisé uniquement pour valider mécaniquement
le pipeline micro -> audfprint -> titre/artiste. Chaque piste = une vraie
mélodie (notes distinctes avec de vrais onsets, pas un ton pur ou un simple
chirp lisse) + une basse -- assez de contenu spectral pour de vrais
landmarks audfprint. Voir packages/backend/data/keep-local-index/qa-corpus-metadata.json
pour le mapping clé -> titre/artiste utilisé par recognition.ts.
"""
import subprocess
import os
import tempfile

TMP = tempfile.gettempdir()
OUT_DIR = os.path.join(os.path.dirname(__file__), 'qa-corpus')
os.makedirs(OUT_DIR, exist_ok=True)

TRACKS = {
    'track_sunrise_loop': [262, 294, 330, 349, 392, 440, 392, 349],
    'track_night_drive': [220, 220, 262, 220, 196, 220, 262, 294],
    'track_ocean_keys': [349, 392, 440, 494, 440, 392, 349, 330],
    'track_desert_bells': [294, 330, 294, 262, 294, 330, 349, 392],
}
NOTE_DUR = 0.9


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def gen_track(name: str, notes: list[int]) -> str:
    note_files = []
    for i, freq in enumerate(notes):
        f = os.path.join(TMP, f'{name}_note_{i}.wav')
        run('ffmpeg', '-y', '-f', 'lavfi', '-i', f'sine=frequency={freq}:duration={NOTE_DUR}', '-ar', '44100', f)
        note_files.append(f)

    concat_list = os.path.join(TMP, f'{name}_concat.txt')
    with open(concat_list, 'w') as fh:
        for f in note_files:
            fh.write(f"file '{f}'\n")

    melody = os.path.join(TMP, f'{name}_melody.wav')
    run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', concat_list, '-c', 'copy', melody)

    total_dur = NOTE_DUR * len(notes)
    bass_freq = notes[0] / 2
    bass = os.path.join(TMP, f'{name}_bass.wav')
    run('ffmpeg', '-y', '-f', 'lavfi', '-i', f'sine=frequency={bass_freq}:duration={total_dur}', '-ar', '44100', bass)

    out = os.path.join(OUT_DIR, f'{name}.wav')
    run(
        'ffmpeg', '-y', '-i', melody, '-i', bass,
        '-filter_complex', '[0:a]volume=0.8[a];[1:a]volume=0.3[b];[a][b]amix=inputs=2:duration=first',
        '-ar', '44100', out,
    )

    for f in note_files + [concat_list, melody, bass]:
        os.remove(f)
    return out


for name, notes in TRACKS.items():
    path = gen_track(name, notes)
    size = os.path.getsize(path)
    print(f'{name}.wav -> {size} octets')
