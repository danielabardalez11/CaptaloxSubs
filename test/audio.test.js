import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readPcmWav } from '../src/wav.js';

function wav(rate = 16000) {
  const data = Buffer.alloc(54);
  data.write('RIFF'); data.writeUInt32LE(46, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('JUNK', 36); data.writeUInt32LE(0, 40);
  data.write('data', 44); data.writeUInt32LE(2, 48); data.writeInt16LE(-1234, 52);
  return data;
}
test('WAV: encuentra PCM aunque existan metadatos antes del audio', () => assert.equal(readPcmWav(wav()).readInt16LE(), -1234));
test('WAV: rechaza frecuencia incorrecta, truncado y formato ajeno', () => {
  assert.throws(() => readPcmWav(wav(44100)), /16000/);
  assert.throws(() => readPcmWav(wav().subarray(0, 50)), /truncado/);
  assert.throws(() => readPcmWav(Buffer.from('no wav')), /RIFF/);
});
test('AudioWorklet: mezcla canales, limita amplitud, entrega 100 ms y vacía la cola', async () => {
  let Processor;
  const messages = [];
  const sandbox = { AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (x) => messages.push(x) }; } }, registerProcessor: (_, klass) => { Processor = klass; } };
  vm.runInNewContext(await readFile(new URL('../public/pcm-worklet.js', import.meta.url), 'utf8'), sandbox);
  const processor = new Processor();
  processor.process([[new Float32Array(1600).fill(2), new Float32Array(1600).fill(0)]]);
  assert.equal(messages[0].byteLength, 3200);
  assert.equal(new DataView(messages[0]).getInt16(0, true), 32767);
  processor.process([[new Float32Array([-2, 0, 0.5])]]);
  processor.port.onmessage({ data: 'stop' });
  assert.equal(messages[1].byteLength, 6);
  assert.equal(new DataView(messages[1]).getInt16(0, true), -32768);
  assert.equal(messages[2], 'flushed');
  assert.equal(processor.process([]), false);
});
