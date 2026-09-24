// Original and translated speech arrive at independent boundaries.
class Captions {
  constructor() { this.history = []; this.current = ''; this.interim = ''; }
  commit(text) {
    if (text.trim()) this.history.push(text.trim().slice(-2000));
    this.history = this.history.slice(-30);
  }
  append(delta) {
    this.current = (this.current + delta).slice(-4000);
    const sentences = this.current.split(/(?<=[.!?])\s+/);
    this.current = sentences.pop();
    for (const sentence of sentences) this.commit(sentence);
  }
  final(text) { this.commit(text); this.current = ''; this.interim = ''; }
  snapshot() { return { history: [...this.history], current: this.current, interim: this.interim }; }
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
    this.spanish = new Captions();
  }
  accept(event) {
    if (['interim', 'final', 'original', 'translation', 'translation-final'].includes(event.type)) this.lastTextAt = Date.now();
    if (event.type === 'ready') this.status = 'live';
    if (event.type === 'interim') this.original.interim = event.text;
    if (event.type === 'final') this.original.final(event.text);
    if (event.type === 'original') this.original.append(event.text);
    if (event.type === 'translation') this.spanish.append(event.text);
    if (event.type === 'translation-final') this.spanish.final(event.text);
    if (event.type === 'translation-error') this.translationError = event.message;
    if (event.type === 'error') { this.status = 'error'; this.message = event.message; }
    if (event.type === 'done') { this.status = 'ended'; this.stats = event.stats; }
  }
  summary() { return { session: this.id, status: this.status, language: this.language, message: this.message, startedAt: this.startedAt, lastAudioAt: this.lastAudioAt, lastTextAt: this.lastTextAt, audioSeconds: this.audioBytes / 32000 }; }
  snapshot() {
    return { type: 'snapshot', session: this.id, run: this.run, language: this.language, translate: this.translate, translationError: this.translationError, status: this.status, message: this.message, stats: this.stats, original: this.original.snapshot(), spanish: (this.language === 'es' ? this.original : this.spanish).snapshot() };
  }
}
