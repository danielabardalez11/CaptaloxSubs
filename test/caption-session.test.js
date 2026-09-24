import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CaptionSession, translateText } from '../src/caption-session.js';

class Recognizer extends EventEmitter {
  state = 'ready'; startedAt = Date.now();
  safe(message) { return String(message).replaceAll('fake-key', '[CLAVE OCULTA]'); }
  report() { return { originalEvents: 2 }; }
  close() { this.state = 'closed'; }
}
test('traduce solo segmentos confirmados, conserva orden y separa sesiones', async () => {
  const originals = [new Recognizer(), new Recognizer()];
  const requests = [], events = [[], []];
  const sessions = originals.map((upstream, i) => {
    const session = new CaptionSession({ apiKey: 'fake-key', mode: 'translate', upstream, translate: async ({ text }) => { requests.push(`${i}:${text}`); return `ES ${i} ${text}`; } });
    session.on('event', (event) => events[i].push(event)); return session;
  });
  originals[0].emit('event', { type: 'interim', text: 'tentative' });
  originals[0].emit('event', { type: 'final', text: 'alpha' });
  originals[0].emit('event', { type: 'final', text: 'next' });
  originals[1].emit('event', { type: 'final', text: 'beta' });
  await Promise.all(sessions.map((session) => session.flush()));
  assert.ok(!requests.some((text) => text.includes('tentative')));
  assert.deepEqual(events[0].filter((e) => e.type === 'translation-final').map((e) => e.text), ['ES 0 alpha', 'ES 0 next']);
  assert.deepEqual(events[1].filter((e) => e.type === 'translation-final').map((e) => e.text), ['ES 1 beta']);
  assert.equal(sessions[0].report().translationBeforeEnd, true);
  assert.equal(sessions[0].report().pendingTranslations, 0);
  sessions.forEach((session) => session.close());
});
test('fallo de traducción es visible y no detiene el original', async () => {
  const upstream = new Recognizer(); const events = [];
  const session = new CaptionSession({ apiKey: 'fake-key', mode: 'translate', upstream, translate: async () => { throw new Error('error fake-key'); } });
  session.on('event', (event) => events.push(event));
  upstream.emit('event', { type: 'final', text: 'Keep original' }); await session.flush();
  assert.equal(session.state, 'ready');
  assert.equal(events[0].text, 'Keep original');
  assert.equal(events[1].type, 'translation-error');
  assert.ok(!events[1].message.includes('fake-key'));
  assert.equal(session.report().translationErrors, 1); session.close();
});
test('cola tiene límite y cerrar descarta respuestas tardías', async () => {
  const upstream = new Recognizer(); const events = []; let finish;
  const session = new CaptionSession({ apiKey: 'fake-key', mode: 'translate', upstream, translate: () => new Promise((resolve) => { finish = resolve; }) });
  session.on('event', (event) => events.push(event));
  for (let i = 0; i < 12; i++) upstream.emit('event', { type: 'final', text: `line ${i}` });
  assert.ok(session.report().pendingTranslations <= 9);
  assert.ok(session.report().translationErrors > 0);
  session.close(); finish('late'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.filter((e) => e.type === 'translation-final').length, 0);
});
test('REST: clave solo en cabecera, instrucción separada y salida completa', async () => {
  let request;
  const translated = await translateText({ apiKey: 'fake-key', text: 'twenty', fetchImpl: async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'veinte' }] } }] }) }; } });
  assert.equal(translated, 'veinte');
  assert.ok(!request.url.includes('fake-key'));
  assert.equal(request.headers['x-goog-api-key'], 'fake-key');
  assert.equal(JSON.parse(request.body).contents[0].parts[0].text, 'twenty');
  await assert.rejects(translateText({ text: 'a', apiKey: 'fake-key', fetchImpl: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
  await assert.rejects(translateText({ text: 'a', apiKey: 'fake-key', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'incompleta' }] } }] }) }) }), /no terminó/);
});
