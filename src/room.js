// Original and translated speech arrive at independent boundaries.
export class Captions {
  constructor() { this.history = []; this.current = ''; this.interim = ''; this.fullLog = []; }
  commit(text, startMs, endMs) {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.history.push(trimmed.slice(-2000));
    this.history = this.history.slice(-30);
    this.fullLog.push({ text: trimmed, startMs: startMs ?? 0, endMs: endMs ?? ((startMs ?? 0) + 3500) });
  }
  append(delta, elapsedMs) {
    if (!delta) return;
    this.current = (this.current + delta).slice(-4000);
    const sentences = this.current.split(/(?<=[.!?])\s+/);
    this.current = sentences.pop();
    for (const sentence of sentences) this.commit(sentence, elapsedMs);
  }
  final(text, elapsedMs) { this.commit(text, elapsedMs); this.current = ''; this.interim = ''; }
  snapshot() { return { history: [...this.history], current: this.current, interim: this.interim, count: this.fullLog.length }; }
  exportTxt() { return this.fullLog.map((e) => e.text).join('\n'); }
  exportSrt() {
    return this.fullLog.map((entry, index) => {
      const formatTime = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const hours = String(Math.floor(totalSec / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSec % 60).padStart(2, '0');
        const millis = String(Math.floor(ms % 1000)).padStart(3, '0');
        return `${hours}:${minutes}:${seconds},${millis}`;
      };
      const start = formatTime(entry.startMs);
      const end = formatTime(Math.max(entry.endMs, entry.startMs + 3000));
      return `${index + 1}\n${start} --> ${end}\n${entry.text}\n`;
    }).join('\n');
  }
}

export class Room {
  constructor(id) { this.id = id; this.run = 0; this.reset('en', false); this.status = 'idle'; }
  reset(language, translate) {
    this.run++;
    this.language = language;
    this.translate = translate;
    this.status = 'connecting';
    this.message = '';
    this.stats = null;
    this.startedAt = Date.now();
    this.lastAudioAt = null;
    this.lastTextAt = null;
    this.audioBytes = 0;
    this.translationError = '';
    this.original = new Captions();
    this.translated = new Captions();
  }
  accept(event) {
    if (['interim', 'final', 'original', 'translation', 'translation-final'].includes(event.type)) this.lastTextAt = Date.now();
    const elapsed = event.elapsedMs ?? (this.startedAt ? Date.now() - this.startedAt : 0);
    if (event.type === 'ready') this.status = 'live';
    if (event.type === 'interim') {
      this.original.interim = event.text;
    }
    if (event.type === 'final') this.original.final(event.text, elapsed);
    if (event.type === 'original') this.original.append(event.text, elapsed);
    if (event.type === 'translation') this.translated.append(event.text, elapsed);
    if (event.type === 'translation-final') this.translated.final(event.text, elapsed);
    if (event.type === 'translation-error') this.translationError = event.message;
    if (event.type === 'error') { this.status = 'error'; this.message = event.message; }
    if (event.type === 'done') {
      if (this.original.current) this.original.final(this.original.current, elapsed);
      if (this.translated.current) this.translated.final(this.translated.current, elapsed);
      this.status = 'ended';
      this.stats = event.stats;
    }
  }
  summary() { return { session: this.id, status: this.status, language: this.language, message: this.message, startedAt: this.startedAt, lastAudioAt: this.lastAudioAt, lastTextAt: this.lastTextAt, audioSeconds: this.audioBytes / 32000 }; }
  exportTranscript(format = 'txt', lang = 'original') {
    const isSpanish = this.language === 'es';
    const target = lang === 'spanish' ? (isSpanish ? this.original : this.translated)
      : lang === 'english' ? (!isSpanish ? this.original : this.translated)
      : this.original;
    return format === 'srt' ? target.exportSrt() : target.exportTxt();
  }
  snapshot() {
    const isSpanish = this.language === 'es';
    const spanishCaptions = isSpanish ? this.original : (this.translate ? this.translated : this.original);
    const englishCaptions = !isSpanish ? this.original : (this.translate ? this.translated : this.original);
    return {
      type: 'snapshot', session: this.id, run: this.run, language: this.language, translate: this.translate,
      translationError: this.translationError, status: this.status, message: this.message, stats: this.stats,
      original: this.original.snapshot(),
      spanish: spanishCaptions.snapshot(),
      english: englishCaptions.snapshot(),
    };
  }
}
