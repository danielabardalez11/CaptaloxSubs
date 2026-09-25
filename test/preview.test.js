import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { CaptionSession } from '../src/caption-session.js';
import { Room } from '../src/room.js';

class Recognizer extends EventEmitter {
  state = 'ready'; startedAt = Date.now();
  safe(text) { return text; }
  report() { return {}; }
  close() { this.state = 'closed'; }
}
test('provisionales se traducen antes del final sin guardar revisiones en el historial', async () => {
  const upstream = new Recognizer(), room = new Room('A'); room.reset('en', true);
  const session = new CaptionSession({ upstream, mode: 'translate', preview: true, translate: async ({ text }) => `ES ${text}` });
  session.on('event', (e) => room.accept(e));
  upstream.emit('event', { type: 'interim', text: 'one' }); await sleep(0);
  assert.equal(room.snapshot().spanish.interim, 'ES one');
  assert.deepEqual(room.snapshot().spanish.history, []);
  upstream.emit('event', { type: 'final', text: 'one two' }); await session.flush();
  assert.equal(room.snapshot().spanish.interim, '');
  assert.deepEqual(room.snapshot().spanish.history, ['ES one two']); session.close();
});

test('un provisional lento no pisa el final', async () => {
  let finish; const events = [];
  const upstream = new Recognizer();
  const session = new CaptionSession({ upstream, mode: 'translate', preview: true, translate: ({ text }) => text === 'old' ? new Promise((r) => { finish = r; }) : Promise.resolve(`ES ${text}`) });
  session.on('event', (e) => events.push(e));
  upstream.emit('event', { type: 'interim', text: 'old' });
  upstream.emit('event', { type: 'final', text: 'complete' });
  await session.flush(); finish('STALE'); await sleep(0);
  assert.ok(!events.some((e) => e.text === 'STALE'));
  assert.equal(events.filter((e) => e.type === 'translation-final')[0].text, 'ES complete'); session.close();
});
