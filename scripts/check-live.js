// Explicit opt-in integration check. Calls the real API and consumes quota.
import { once } from 'node:events';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { readPcmWav } from '../src/wav.js';
import { connectClient } from '../support/ws-client.js';
import { captionText } from '../public/render.js';

const { server, audienceServer, wss } = createApp();
const clients = [];
const report = { date: new Date().toISOString(), source: 'Dos voces sintéticas inglesas enviadas a velocidad real; API real; clientes WebSocket programáticos.', passed: false, sessions: {} };
async function connect(host, route) { const client = await connectClient(host, route); clients.push(client); return client; }
async function stream(client, pcm) {
  const start = performance.now();
  for (let offset = 0; offset < pcm.length; offset += 3200) {
    await sleep(Math.max(0, start + offset / 32 - performance.now()));
    const error = client.events.find((e) => e.type === 'error');
    if (error) throw new Error(error.message);
    if (client.ws.readyState !== 1) throw new Error('El emisor perdió la conexión.');
    client.send(pcm.subarray(offset, offset + 3200));
  }
  await sleep(Math.max(0, start + pcm.length / 32 - performance.now()));
  client.send({ type: 'stop' });
  return client.next((e) => e.type === 'done', 35000);
}
try {
  const audios = await Promise.all(['demo-en.wav', 'demo-b-en.wav'].map(async (name) => readPcmWav(await readFile(new URL(`../recordings/${name}`, import.meta.url)))));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  audienceServer.listen(0, '0.0.0.0'); await once(audienceServer, 'listening');
  const host = `127.0.0.1:${server.address().port}`;
  const audienceHost = `127.0.0.1:${audienceServer.address().port}`;
  const [viewerA, viewerB] = await Promise.all([connect(audienceHost, '/watch'), connect(audienceHost, '/watch')]);
  viewerB.send({ type: 'watch', session: 'B' }); await viewerB.next((e) => e.session === 'B');
  const [a, b] = await Promise.all([connect(host, '/audio'), connect(host, '/audio')]);
  for (const [client, session] of [[a, 'A'], [b, 'B']]) client.send({ type: 'start', session, language: 'en', translate: true });
  for (const client of [a, b]) {
    const event = await client.next((e) => e.type === 'ready' || e.type === 'error', 20000);
    if (event.type === 'error') throw new Error(event.message);
  }
  console.log('Ambas conexiones Gemini listas. Enviando A y B en paralelo…');
  const [doneA, doneB] = await Promise.all([stream(a, audios[0]), stream(b, audios[1])]);
  const snapA = await viewerA.next((e) => e.session === 'A' && e.status === 'ended');
  const snapB = await viewerB.next((e) => e.session === 'B' && e.status === 'ended');
  for (const [id, snapshot, done] of [['A', snapA, doneA], ['B', snapB, doneB]]) {
    report.sessions[id] = { stats: done.stats, original: captionText(snapshot.original), spanish: captionText(snapshot.spanish), translationError: snapshot.translationError };
    assert.ok(done.stats.textBeforeEnd, `${id}: faltó original durante audio`);
    assert.ok(done.stats.translationBeforeEnd, `${id}: faltó traducción durante audio`);
    assert.equal(done.stats.translationErrors, 0, `${id}: errores de traducción`);
    assert.equal(done.stats.pendingTranslations, 0, `${id}: traducciones pendientes`);
  }
  assert.match(report.sessions.A.original, /workshop/i);
  assert.match(report.sessions.A.spanish, /taller/i);
  assert.doesNotMatch(report.sessions.A.original, /bicycle/i);
  assert.doesNotMatch(report.sessions.A.spanish, /bicicleta/i);
  assert.match(report.sessions.B.original, /bicycle/i);
  assert.match(report.sessions.B.spanish, /bicicleta/i);
  assert.doesNotMatch(report.sessions.B.original, /workshop/i);
  assert.doesNotMatch(report.sessions.B.spanish, /taller/i);
  assert.match(report.sessions.A.original, /joining us today/i, 'A: falta la última frase original');
  assert.match(report.sessions.A.spanish, /acompañar.*hoy/i, 'A: falta la última frase traducida');
  assert.match(report.sessions.B.original, /end of our second session/i, 'B: falta la última frase original');
  assert.match(report.sessions.B.spanish, /(?:fin|final) de nuestra segunda sesión/i, 'B: falta la última frase traducida');
  viewerA.send({ type: 'watch', session: 'B' });
  const switched = await viewerA.next((e) => e.session === 'B' && e.status === 'ended');
  assert.equal(captionText(switched.original), report.sessions.B.original);
  assert.equal(captionText(switched.spanish), report.sessions.B.spanish);
  assert.ok(viewerA.events.filter((e) => e.status === 'live' && e.session === 'A').some((e) => captionText(e.spanish).includes('taller')));
  assert.ok(viewerB.events.filter((e) => e.status === 'live' && e.session === 'B').some((e) => captionText(e.spanish).includes('bicicleta')));
  report.passed = true;
  report.checks = ['Original y traducción durante audio en A y B', 'Marcadores de contenido separados por sesión', 'Última frase presente en ambos idiomas de ambas sesiones', 'Dos conexiones listas antes del envío paralelo', 'Cambio de espectador A→B con ambos textos de B'];
} catch (error) {
  report.error = String(error.message).replaceAll(process.env.GEMINI_API_KEY || '__absent__', '[CLAVE OCULTA]');
  process.exitCode = 1;
} finally {
  for (const client of clients) client.ws.terminate();
  for (const ws of wss.clients) ws.terminate();
  wss.close(); server.closeAllConnections(); server.close();
  audienceServer.closeAllConnections(); audienceServer.close();
  await mkdir(new URL('../results/', import.meta.url), { recursive: true });
  await writeFile(new URL('../results/live-check.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
