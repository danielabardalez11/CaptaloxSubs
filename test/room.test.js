import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/room.js';

test('sin traducción no presenta el original inglés como español', () => {
  const room = new Room('A'); room.reset('en', false);
  room.accept({ type: 'final', text: 'Hello there.' });
  assert.deepEqual(room.snapshot().original.history, ['Hello there.']);
  assert.deepEqual(room.snapshot().spanish.history, []);
});
test('fragmentos de traducción y original forman frases sin duplicación', () => {
  const room = new Room('A'); room.reset('en', true);
  room.accept({ type: 'original', text: 'The work' }); room.accept({ type: 'original', text: 'shop starts at ten. Next' });
  room.accept({ type: 'translation', text: 'El taller' }); room.accept({ type: 'translation', text: ' empieza a las diez.' });
  assert.deepEqual(room.snapshot().original.history, ['The workshop starts at ten.']);
  assert.equal(room.snapshot().original.current, 'Next');
  assert.equal(room.snapshot().spanish.current, 'El taller empieza a las diez.');
});
test('provisional se reemplaza; final lo limpia; reiniciar borra ambos idiomas', () => {
  const room = new Room('B'); room.reset('es', false);
  room.accept({ type: 'interim', text: 'Hola' }); room.accept({ type: 'interim', text: 'Hola mundo' });
  assert.equal(room.snapshot().original.interim, 'Hola mundo');
  room.accept({ type: 'final', text: 'Hola mundo.' });
  assert.equal(room.snapshot().spanish.interim, '');
  assert.deepEqual(room.snapshot().spanish.history, ['Hola mundo.']);
  room.reset('en', true);
  assert.deepEqual(room.snapshot().original.history, []);
  assert.equal(room.snapshot().spanish.current, '');
});
test('historial tiene límite de memoria y snapshot no expone arrays mutables', () => {
  const room = new Room('A');
  for (let i = 0; i < 100; i++) room.accept({ type: 'final', text: String(i) });
  const snapshot = room.snapshot(); assert.equal(snapshot.original.history.length, 30);
  snapshot.original.history.push('external'); assert.equal(room.snapshot().original.history.length, 30);
});
