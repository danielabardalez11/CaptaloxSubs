import json
import struct
import sys
from pathlib import Path
from vosk import Model, KaldiRecognizer, SetLogLevel

SetLogLevel(-1)
root = Path(__file__).resolve().parent.parent
names = {'en': 'vosk-model-small-en-us-0.15', 'es': 'vosk-model-small-es-0.42'}

def emit(kind, text=None):
    value = {'type': kind}
    if text is not None:
        value['text'] = text
    print(json.dumps(value, ensure_ascii=True), flush=True)

try:
    recognizer = KaldiRecognizer(Model(str(root / '.cache' / 'speech' / names[sys.argv[1]])), 16000)
    emit('ready')
    previous = ''
    while True:
        header = sys.stdin.buffer.read(4)
        if not header:
            break
        if len(header) != 4:
            raise ValueError('Truncated PCM header')
        size = struct.unpack('<I', header)[0]
        if size == 0 or size > 6400 or size % 2:
            raise ValueError('Invalid PCM frame')
        data = sys.stdin.buffer.read(size)
        if len(data) != size:
            raise ValueError('Truncated PCM frame')
        if recognizer.AcceptWaveform(data):
            text = json.loads(recognizer.Result()).get('text', '')
            if text:
                emit('final', text)
            previous = ''
        else:
            text = json.loads(recognizer.PartialResult()).get('partial', '')
            if text and text != previous:
                emit('interim', text)
                previous = text
    text = json.loads(recognizer.FinalResult()).get('text', '')
    if text:
        emit('final', text)
    emit('drained')
except Exception:
    emit('error', 'No se pudo iniciar o procesar el reconocimiento local. Ejecuta la preparacion de voz.')
    sys.exit(1)
