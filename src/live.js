import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export const MODEL = 'gemini-3.5-transcribe-live';
export const TRANSLATE_MODEL = 'gemini-3.5-live-translate-preview';
const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// One instance owns one upstream connection. Never share it between sessions.
export class LiveTranscriber extends EventEmitter {
  constructor({ apiKey, mode = 'transcribe', model = mode === 'translate' ? TRANSLATE_MODEL : MODEL, language = 'auto', endpoint = ENDPOINT, setupTimeout = 15000, targetLanguage }) {
    super();
    if (!apiKey) throw new Error('Falta GEMINI_API_KEY en .env.');
    if (!['auto', 'es', 'en'].includes(language)) throw new Error('Idioma inválido.');
    if (!['transcribe', 'translate'].includes(mode)) throw new Error('Modo inválido.');
    Object.assign(this, { apiKey, model, mode, language, endpoint, setupTimeout, targetLanguage });
    this.state = 'new';
    this.stats = { bytes: 0, chunks: 0, interimEvents: 0, finalEvents: 0, originalEvents: 0, firstTextMs: null, textBeforeEnd: false, translationEvents: 0, firstTranslationMs: null, translationBeforeEnd: false };
  }

  safe(message) { return String(message).replaceAll(this.apiKey, '[CLAVE OCULTA]').slice(0, 500); }

  connect() {
    if (this.state !== 'new') throw new Error('La conexión ya fue iniciada.');
    this.state = 'connecting';
    return new Promise((resolve, reject) => {
      const url = new URL(this.endpoint);
      url.searchParams.set('key', this.apiKey);
      const ws = this.ws = new WebSocket(url, { maxPayload: 1024 * 1024 });
      let settled = false;
      this.cancelConnect = () => { if (!settled) { settled = true; reject(new Error('Conexión cancelada.')); } };
      const fail = (reason) => {
        const message = this.safe(reason);
        if (this.state === 'closed') return;
        this.emit('event', { type: 'error', message });
        if (!settled) { settled = true; reject(new Error(message)); }
        this.close();
      };
      this.setupTimer = setTimeout(() => fail('Gemini no confirmó la sesión en 15 segundos.'), this.setupTimeout);
      const targetLang = this.targetLanguage || (this.language === 'es' ? 'en' : 'es');
      const setup = this.mode === 'translate' ? {
        model: `models/${this.model.replace(/^models\//, '')}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
          translationConfig: { targetLanguageCode: targetLang, echoTargetLanguage: true },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      } : {
        model: `models/${this.model.replace(/^models\//, '')}`,
        generationConfig: { responseModalities: ['TEXT'] },
        inputAudioTranscription: { languageCodes: this.language === 'auto' ? [] : [this.language === 'es' ? 'es-419' : 'en-US'] },
      };
      ws.on('open', () => ws.send(JSON.stringify({ setup })));
      ws.on('message', (data) => {
        let message;
        try { message = JSON.parse(data.toString()); }
        catch { fail('Gemini envió un mensaje JSON inválido.'); return; }
        if (message.error) { fail(message.error.message || 'Error de Gemini.'); return; }
        if (message.setupComplete && this.state === 'connecting') {
          clearTimeout(this.setupTimer);
          this.state = 'ready';
          settled = true;
          this.emit('event', { type: 'ready', model: this.model, mode: this.mode });
          resolve();
        }
        const content = message.serverContent;
        for (const [field, type] of [['interimInputTranscription', 'interim'], ['inputTranscription', 'final']]) {
          const text = content?.[field]?.text;
          if (!text) continue;
          if (type === 'interim') this.stats.interimEvents++;
          else {
            this.stats.originalEvents++;
            if (this.mode === 'transcribe') this.stats.finalEvents++;
          }
          if (this.stats.firstTextMs === null && this.startedAt) this.stats.firstTextMs = Date.now() - this.startedAt;
          if (this.state === 'ready') this.stats.textBeforeEnd = true;
          this.emit('event', { type: type === 'final' && this.mode === 'translate' ? 'original' : type, text, elapsedMs: this.startedAt ? Date.now() - this.startedAt : null });
        }
        if (content?.outputTranscription?.text) {
          const elapsedMs = this.startedAt ? Date.now() - this.startedAt : null;
          this.stats.translationEvents++;
          this.stats.firstTranslationMs ??= elapsedMs;
          if (this.state === 'ready') this.stats.translationBeforeEnd = true;
          this.emit('event', { type: 'translation', text: content.outputTranscription.text, finished: Boolean(content.outputTranscription.finished), elapsedMs });
        }
        if (message.goAway) fail('Gemini anunció el cierre de la sesión. Reiniciá la prueba.');
      });
      ws.on('error', () => fail('No se pudo conectar con Gemini. Revisá conexión, clave y acceso al modelo.'));
      ws.on('close', (code, reason) => {
        if (this.state !== 'closed') fail(`Gemini cerró la conexión (${code}): ${reason.toString() || 'sin detalle'}`);
      });
    });
  }

  sendAudio(data) {
    if (this.state !== 'ready') throw new Error('La sesión no está lista para audio.');
    if (!data.length || data.length % 2 || data.length > 6400) throw new Error('Fragmento PCM inválido (máximo 200 ms).');
    if (this.ws.bufferedAmount > 64000) throw new Error('La conexión está atrasada. Reiniciá la prueba.');
    this.startedAt ??= Date.now();
    this.stats.bytes += data.length;
    this.stats.chunks++;
    this.ws.send(JSON.stringify({ realtimeInput: { audio: { data: data.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } }));
  }

  endAudio() {
    if (this.state !== 'ready') return;
    this.state = 'draining';
    this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  }

  report() { return { ...this.stats, audioSeconds: this.stats.bytes / 32000 }; }

  close() {
    this.state = 'closed';
    this.cancelConnect?.();
    clearTimeout(this.setupTimer);
    if (this.ws?.readyState === WebSocket.CONNECTING) this.ws.terminate();
    else this.ws?.close();
  }
}
