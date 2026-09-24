import test from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { createApp } from '../src/server.js';
import { connectClient } from '../support/ws-client.js';

async function app(t, options) {
  const { server, audienceServer, wss, rooms } = createApp(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  audienceServer.listen(0, '127.0.0.1'); await once(audienceServer, 'listening');
  t.after(() => { for (const ws of wss.clients) ws.terminate(); wss.close(); server.closeAllConnections(); server.close(); audienceServer.closeAllConnections(); audienceServer.close(); });
  return { host: `127.0.0.1:${server.address().port}`, audienceHost: `127.0.0.1:${audienceServer.address().port}`, rooms };
}
class FakeLive extends EventEmitter {
  constructor(options) { super(); this.options = options; this.bytes = 0; }
  async connect() { this.state = 'ready'; this.emit('event', { type: 'ready' }); }
  sendAudio(data) {
    this.bytes += data.length;
    const name = data[0] === 1 ? 'ALFA' : 'BETA';
    this.emit('event', { type: 'final', text: name });
    if (this.options.mode === 'translate') this.emit('event', { type: 'translation', text: `${name} español` });
  }
  endAudio() { this.state = 'draining'; }
  report() { return { bytes: this.bytes }; }
  close() { this.state = 'closed'; }
  safe(message) { return message; }
}
async function producer(host, session, language = 'en') {
  const client = await connectClient(host, '/audio');
  client.send({ type: 'start', session, language, translate: true });
  await client.next((e) => e.type === 'ready'); return client;
}
test('HTTP sirve ambas vistas y nunca publica secretos ni archivos internos', async (t) => {
  const { host } = await app(t, { apiKey: '' });
  assert.equal((await (await fetch(`http://${host}/health`)).json()).configured, false);
  for (const path of ['/.env', '/package.json', '/src/live.js', '/..%2f.env']) assert.equal((await fetch(`http://${host}${path}`)).status, 404);
  assert.match(await (await fetch(`http://${host}/`)).text(), /Subtítulos en vivo/);
  assert.match(await (await fetch(`http://${host}/viewer`)).text(), /Elegí qué charla/);
});
test('dos emisores, espectadores aislados, cambio de canal y cierre independiente', async (t) => {
  const { host } = await app(t, { apiKey: 'fake', makeLive: (o) => new FakeLive(o), drainMs: 10 });
  const viewerA = await connectClient(host, '/watch');
  const viewerB = await connectClient(host, '/watch');
  viewerB.send({ type: 'watch', session: 'B' });
  await viewerB.next((e) => e.session === 'B');
  const [a, b] = await Promise.all([producer(host, 'A'), producer(host, 'B')]);
  a.send(Buffer.alloc(3200, 1)); b.send(Buffer.alloc(3200, 2));
  const snapA = await viewerA.next((e) => e.session === 'A' && e.spanish.current.includes('ALFA'));
  const snapB = await viewerB.next((e) => e.session === 'B' && e.spanish.current.includes('BETA'));
  assert.equal(snapA.original.history.join(' '), 'ALFA');
  assert.equal(snapB.original.history.join(' '), 'BETA');
  assert.ok(!JSON.stringify(snapA).includes('BETA'));
  assert.ok(!JSON.stringify(snapB).includes('ALFA'));
  viewerA.send({ type: 'watch', session: 'B' });
  const switched = await viewerA.next((e) => e.session === 'B' && e.original.history.includes('BETA'));
  assert.ok(!JSON.stringify(switched).includes('ALFA'));
  a.send({ type: 'stop' });
  assert.equal((await a.next((e) => e.type === 'done')).stats.bytes, 3200);
  const offset = viewerB.events.length;
  b.send(Buffer.alloc(3200, 2));
  await viewerB.next((e) => e.session === 'B' && e.original.history.length === 2, 5000, offset);
  b.send({ type: 'stop' });
  assert.equal((await b.next((e) => e.type === 'done')).stats.bytes, 6400);
});
test('un segundo emisor no puede reemplazar una sesión ocupada', async (t) => {
  const { host, rooms } = await app(t, { apiKey: 'fake', makeLive: (o) => new FakeLive(o) });
  const first = await producer(host, 'A');
  const duplicate = await connectClient(host, '/audio');
  duplicate.send({ type: 'start', session: 'A', language: 'en' });
  assert.match((await duplicate.next((e) => e.type === 'error')).message, /ya tiene un emisor/);
  assert.equal(rooms.get('A').status, 'live');
  first.send(Buffer.alloc(3200, 1));
  await first.next((e) => e.type === 'final');
});
test('español comparte el original sin abrir traducción', async (t) => {
  let options;
  const { host } = await app(t, { apiKey: 'fake', makeLive: (o) => { options = o; return new FakeLive(o); } });
  const emitter = await producer(host, 'A', 'es');
  emitter.send(Buffer.alloc(3200, 1));
  const snapshot = await emitter.next((e) => e.type === 'snapshot' && e.original.history.length);
  assert.equal(options.mode, 'transcribe');
  assert.deepEqual(snapshot.spanish, snapshot.original);
});
test('sin clave informa error y no deja la sesión ocupada', async (t) => {
  const { host } = await app(t, { apiKey: '' });
  for (let i = 0; i < 2; i++) {
    const client = await connectClient(host, '/audio');
    client.send({ type: 'start', language: 'en', session: 'A' });
    assert.match((await client.next((e) => e.type === 'error')).message, /GEMINI_API_KEY/);
    if (client.ws.readyState !== 3) await once(client.ws, 'close');
  }
});
test('espectador no puede enviar audio y sesión desconocida se rechaza', async (t) => {
  const { host } = await app(t, { apiKey: 'fake' });
  const spectator = await connectClient(host, '/watch'); spectator.send(Buffer.alloc(3200));
  assert.equal((await spectator.next((e) => e.type === 'error')).type, 'error');
  const emitter = await connectClient(host, '/audio'); emitter.send({ type: 'start', session: 'C', language: 'en' });
  assert.match((await emitter.next((e) => e.type === 'error')).message, /A o B/);
});
test('un error de Gemini en B no corta A y permite reiniciar B', async (t) => {
  const lives = [];
  const { host } = await app(t, { apiKey: 'fake', makeLive: (o) => { const live = new FakeLive(o); lives.push(live); return live; } });
  const a = await producer(host, 'A'); const b = await producer(host, 'B');
  lives[1].emit('event', { type: 'error', message: 'Fallo simulado en B' });
  await b.next((e) => e.type === 'error');
  if (b.ws.readyState !== 3) await once(b.ws, 'close');
  a.send(Buffer.alloc(3200, 1));
  assert.equal((await a.next((e) => e.type === 'final')).text, 'ALFA');
  const restarted = await producer(host, 'B');
  const snapshot = await restarted.next((e) => e.type === 'snapshot' && e.status === 'live');
  assert.deepEqual(snapshot.original.history, []);
  assert.equal(snapshot.spanish.current, '');
});
test('puerto de audiencia recibe subtítulos pero no expone emisor, estado interno ni claves', async (t) => {
  const { host, audienceHost } = await app(t, { apiKey: 'fake', makeLive: (o) => new FakeLive(o) });
  assert.match(await (await fetch(`http://${audienceHost}/`)).text(), /Elegí qué charla/);
  for (const path of ['/health', '/sessions', '/access', '/qr.svg', '/app.js', '/pcm-worklet.js', '/.env']) assert.equal((await fetch(`http://${audienceHost}${path}`)).status, 404);
  await assert.rejects(connectClient(audienceHost, '/audio'));
  const viewer = await connectClient(audienceHost, '/watch');
  const emitter = await producer(host, 'A'); emitter.send(Buffer.alloc(3200, 1));
  const snapshot = await viewer.next((e) => e.type === 'snapshot' && e.spanish.current.includes('ALFA'));
  assert.equal(snapshot.session, 'A');
  const state = await (await fetch(`http://${host}/sessions`)).json();
  assert.equal(state[0].viewers, 1);
  assert.equal(state[0].audioSeconds, 0.1);
  assert.ok(state[0].lastAudioAt);
});
test('QR solo codifica direcciones locales disponibles del puerto de audiencia', async (t) => {
  const { host } = await app(t, { apiKey: '' });
  const access = await (await fetch(`http://${host}/access`)).json();
  assert.equal(access.listening, true);
  assert.equal((await fetch(`http://${host}/qr.svg?ip=evil.example`)).status, 400);
  if (access.links.length) {
    assert.ok(!access.links[0].url.includes('localhost'));
    const qr = await fetch(`http://${host}/qr.svg?ip=${encodeURIComponent(access.links[0].address)}`);
    assert.equal(qr.headers.get('content-type'), 'image/svg+xml');
    assert.match(await qr.text(), /<svg/);
  }
});
