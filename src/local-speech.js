import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export class LocalRecognizer extends EventEmitter {
  constructor({ language = 'en' } = {}) {
    super();
    if (!['en', 'es'].includes(language)) throw new Error('Elegí inglés o español para reconocer audio localmente.');
    this.language = language; this.state = 'new';
    this.stats = { bytes: 0, chunks: 0, interimEvents: 0, finalEvents: 0, originalEvents: 0, firstTextMs: null, textBeforeEnd: false, pendingOriginal: false };
    this.drained = new Promise((resolve) => { this.resolveDrained = resolve; });
  }
  safe(message) { return String(message).slice(0, 500); }
  connect() {
    if (this.state !== 'new') throw new Error('La sesión ya fue iniciada.');
    this.state = 'connecting';
    return new Promise((resolve, reject) => {
      this.rejectConnect = reject;
      const python = process.env.PYTHON_PATH || fileURLToPath(new URL(process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python', import.meta.url));
      const worker = this.worker = spawn(python, [fileURLToPath(new URL('./speech-worker.py', import.meta.url)), this.language], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      const fail = (message) => { if (this.state === 'closed') return; this.emit('event', { type: 'error', message }); reject(new Error(message)); this.close(); };
      this.timer = setTimeout(() => fail('El reconocimiento local no inició. Ejecutá la preparación de voz.'), 20000);
      worker.on('error', () => fail('Falta el entorno de voz local. Ejecutá la preparación de voz.'));
      worker.stdin.on('error', () => fail('Se interrumpió el reconocimiento local.'));
      worker.on('close', (code) => { if (this.state !== 'closed' && !this.finished) fail(`El reconocimiento local se interrumpió (${code}).`); });
      createInterface({ input: worker.stdout }).on('line', (line) => {
        if (this.state === 'closed') return;
        let event;
        try { event = JSON.parse(line); } catch { fail('Respuesta inválida del reconocimiento local.'); return; }
        if (event.type === 'ready') { clearTimeout(this.timer); this.state = 'ready'; this.rejectConnect = null; this.emit('event', { type: 'ready', model: 'Vosk local', mode: 'transcribe' }); resolve(); }
        else if (event.type === 'error') fail(event.text);
        else if (event.type === 'drained') { this.finished = true; this.resolveDrained(); }
        else if (['interim', 'final'].includes(event.type)) {
          const elapsedMs = this.startedAt ? Date.now() - this.startedAt : null;
          this.stats.firstTextMs ??= elapsedMs;
          this.stats.pendingOriginal = event.type === 'interim';
          if (this.state === 'ready') this.stats.textBeforeEnd = true;
          if (event.type === 'interim') this.stats.interimEvents++;
          else { this.stats.finalEvents++; this.stats.originalEvents++; }
          this.emit('event', { ...event, elapsedMs });
        }
      });
    });
  }
  sendAudio(data) {
    if (this.state !== 'ready') throw new Error('La sesión no está lista para audio.');
    if (!data.length || data.length % 2 || data.length > 6400) throw new Error('Fragmento PCM inválido.');
    if (this.worker.stdin.writableLength > 64000) throw new Error('El equipo no está procesando el audio a tiempo.');
    this.startedAt ??= Date.now();
    this.stats.bytes += data.length; this.stats.chunks++;
    const header = Buffer.alloc(4); header.writeUInt32LE(data.length);
    this.worker.stdin.write(Buffer.concat([header, data]));
  }
  endAudio() { if (this.state === 'ready') { this.state = 'draining'; this.worker.stdin.end(); } }
  async flush() { await this.drained; }
  report() { return { ...this.stats, audioSeconds: this.stats.bytes / 32000 }; }
  close() { this.state = 'closed'; clearTimeout(this.timer); this.rejectConnect?.(new Error('Sesión cancelada.')); this.rejectConnect = null; this.worker?.kill(); this.resolveDrained(); }
}
