import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CaptionSession, translateText } from '../src/caption-session.js';

test('traducción usa un segundo modelo ante 503 sin alterar el texto confirmado', async () => {
  const requests = [];
  const text = await translateText({ apiKey: 'fake-key', model: 'gemini-3.1-flash-lite', text: 'Hello.', fetchImpl: async (url, options) => {
    requests.push({ url, text: JSON.parse(options.body).contents[0].parts[0].text });
    return requests.length === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Hola.' }] } }] }) };
  } });
  assert.equal(text, 'Hola.'); assert.equal(requests.length, 2);
  assert.match(requests[1].url, /gemini-3.5-flash-lite/);
  assert.deepEqual(requests.map((r) => r.text), ['Hello.', 'Hello.']);
});

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

test('una respuesta lenta agrupa solo confirmados pendientes sin perder texto ni esperar más audio', async () => {
  const upstream = new Recognizer(); const requests = []; const events = []; let finish;
  const session = new CaptionSession({ apiKey: 'fake-key', mode: 'translate', upstream, translate: async ({ text }) => {
    requests.push(text);
    if (requests.length === 1) await new Promise((resolve) => { finish = resolve; });
    return `ES ${text}`;
  } });
  session.on('event', (event) => events.push(event));
  for (const text of ['One.', 'Two.', 'Three.']) upstream.emit('event', { type: 'final', text });
  upstream.emit('event', { type: 'interim', text: 'Tentative' });
  finish(); await session.flush();
  assert.deepEqual(requests, ['One.', 'Two. Three.']);
  assert.deepEqual(events.filter((e) => e.type === 'translation-final').map((e) => e.text), ['ES One.', 'ES Two. Three.']);
  assert.equal(session.report().pendingTranslations, 0); session.close();
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
  assert.equal(JSON.parse(request.body).generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  await assert.rejects(translateText({ text: 'a', apiKey: 'fake-key', fetchImpl: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
  await assert.rejects(translateText({ text: 'a', apiKey: 'fake-key', fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'incompleta' }] } }] }) }) }), /no terminó/);
});
test('REST: soporte bidireccional ES a EN con glosario técnico', async () => {
  let request;
  const translated = await translateText({
    apiKey: 'fake-key',
    text: 'Hacemos un deploy en Kubernetes y abrimos un pull request',
    from: 'es',
    to: 'en',
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'We deploy to Kubernetes and open a pull request' }] } }]
        })
      };
    }
  });
  assert.equal(translated, 'We deploy to Kubernetes and open a pull request');
  const body = JSON.parse(request.body);
  const sysInst = body.systemInstruction.parts[0].text;
  assert.match(sysInst, /Spanish to English/);
  assert.match(sysInst, /Kubernetes/);
  assert.match(sysInst, /pull request/);
});
