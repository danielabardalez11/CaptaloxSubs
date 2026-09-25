import assert from 'node:assert/strict';
import { prepareTranslator, translateLocally } from '../src/local-translation.js';
console.log('Preparando traducción local EN → ES. La primera vez descarga el modelo.');
await prepareTranslator();
const [a, b] = await Promise.all([
  translateLocally({ text: 'The workshop starts at ten.' }),
  translateLocally({ text: 'The bicycle is blue.' }),
]);
assert.match(a, /taller/i); assert.doesNotMatch(a, /bicicleta/i);
assert.match(b, /bicicleta/i); assert.doesNotMatch(b, /taller/i);
console.log('Modelo listo. Dos traducciones concurrentes verificadas sin mezclar contenido.');
