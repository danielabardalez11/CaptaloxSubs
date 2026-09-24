import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { LiveTranscriber } from '../src/live.js';

async function fake(t, handler) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  server.on('connection', (ws) => ws.on('message', (data) => handler(ws, JSON.parse(data))));
  t.after(() => { for (const ws of server.clients) ws.terminate(); server.close(); });
  return `ws://127.0.0.1:${server.address().port}`;
}
test('protocolo simulado: setup, PCM intacto, provisionales, finales y fin de audio', async (t) => {
  const pcm = Buffer.alloc(3200, 7);
  const messages = [];
  const endpoint = await fake(t, (ws, message) => {
    messages.push(message);
    if (message.setup) ws.send(JSON.stringify({ setupComplete: {} }));
    if (message.realtimeInput?.audio) {
      ws.send(JSON.stringify({ serverContent: { interimInputTranscription: { text: 'Hola' }, inputTranscription: { text: 'Hola mundo.' } } }));
    }
    if (message.realtimeInput?.audioStreamEnd) ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Final.' } } }));
  });
  const live = new LiveTranscriber({ apiKey: 'fake', endpoint, language: 'es' });
  t.after(() => live.close());
  const events = []; live.on('event', (event) => events.push(event));
  await live.connect();
  const received = once(live, 'event'); live.sendAudio(pcm); await received;
  assert.deepEqual(messages[0].setup.generationConfig.responseModalities, ['TEXT']);
  assert.deepEqual(messages[0].setup.inputAudioTranscription.languageCodes, ['es-419']);
  assert.deepEqual(Buffer.from(messages[1].realtimeInput.audio.data, 'base64'), pcm);
  assert.equal(messages[1].realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
  assert.deepEqual(events.map((event) => event.type), ['ready', 'interim', 'final']);
  assert.equal(live.report().textBeforeEnd, true);
  assert.equal(live.report().audioSeconds, 0.1);
  const final = once(live, 'event'); live.endAudio(); await final;
  assert.equal(messages[2].realtimeInput.audioStreamEnd, true);
  assert.throws(() => live.sendAudio(pcm), /no está lista/);
});
test('falta de clave falla antes de abrir red', () => assert.throws(() => new LiveTranscriber({ apiKey: '' }), /GEMINI_API_KEY/));
test('error remoto oculta la clave y rechaza conexión', async (t) => {
  const endpoint = await fake(t, (ws) => ws.send(JSON.stringify({ error: { message: 'Bad secret-test' } })));
  const live = new LiveTranscriber({ apiKey: 'secret-test', endpoint });
  await assert.rejects(live.connect(), /Bad \[CLAVE OCULTA\]/);
});
test('timeout de setup no deja la conexión pendiente', async (t) => {
  const endpoint = await fake(t, () => {});
  const live = new LiveTranscriber({ apiKey: 'fake', endpoint, setupTimeout: 50 });
  await assert.rejects(live.connect(), /no confirmó/);
  assert.equal(live.state, 'closed');
});
test('rechaza JSON inválido del proveedor', async (t) => {
  const endpoint = await fake(t, (ws) => ws.send('invalid'));
  const live = new LiveTranscriber({ apiKey: 'fake', endpoint });
  await assert.rejects(live.connect(), /JSON inválido/);
});
test('traducción: campos en setup, modalidad audio y eventos de texto incremental', async (t) => {
  let setup;
  const endpoint = await fake(t, (ws, message) => {
    if (message.setup) { setup = message.setup; ws.send(JSON.stringify({ setupComplete: {} })); }
    if (message.realtimeInput?.audio) ws.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Hello' }, outputTranscription: { text: 'Hola' } } }));
  });
  const live = new LiveTranscriber({ apiKey: 'fake', endpoint, mode: 'translate' });
  t.after(() => live.close());
  const events = []; live.on('event', (event) => events.push(event)); await live.connect();
  assert.deepEqual(setup.inputAudioTranscription, {});
  assert.deepEqual(setup.outputAudioTranscription, {});
  assert.equal(setup.generationConfig.translationConfig.targetLanguageCode, 'es');
  assert.equal(setup.generationConfig.inputAudioTranscription, undefined);
  const text = once(live, 'event'); live.sendAudio(Buffer.alloc(3200)); await text;
  assert.deepEqual(events.map((event) => event.type), ['ready', 'original', 'translation']);
  assert.equal(live.report().translationBeforeEnd, true);
  assert.equal(live.report().originalEvents, 1);
  assert.equal(live.report().finalEvents, 0);
});
