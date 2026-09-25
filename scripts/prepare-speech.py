from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request
import zipfile

root = Path(__file__).resolve().parent.parent / '.cache' / 'speech'
root.mkdir(parents=True, exist_ok=True)
def download(name):
    if (root / name / 'am' / 'final.mdl').exists():
        print(name + ': listo', flush=True)
        return
    archive = root / (name + '.zip')
    print('Descargando ' + name, flush=True)
    urllib.request.urlretrieve('https://alphacephei.com/vosk/models/' + name + '.zip', archive)
    with zipfile.ZipFile(archive) as files:
        for member in files.infolist():
            if not (root / member.filename).resolve().is_relative_to(root.resolve()):
                raise ValueError('Ruta de archivo no valida')
        files.extractall(root)
    archive.unlink()
    print(name + ': listo', flush=True)

with ThreadPoolExecutor(max_workers=2) as executor:
    list(executor.map(download, ['vosk-model-small-en-us-0.15', 'vosk-model-small-es-0.42']))
