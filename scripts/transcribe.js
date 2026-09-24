import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { MODEL } from '../src/live.js';
import { CaptionSession, TEXT_MODEL } from '../src/caption-session.js';
import { readPcmWav } from '../src/wav.js';

let live;
try {
  const [path, language = 'auto', mode = 'transcribe'] = process.argv.slice(2);
  if (!path) throw new Error('Uso: npm.cmd run transcribe -- recordings/es.wav es');
  const audio = readPcmWav(await readFile(path));
  if (audio.length > 32000 * 180) throw new Error('Usá un audio de hasta 3 minutos.');
  live = new CaptionSession({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_TRANSCRIBE_MODEL || MODEL, textModel: process.env.GEMINI_TEXT_MODEL || TEXT_MODEL, language, mode });
  live.on('event', (event) => console.log(JSON.stringify(event)));
  await live.connect();
  const start = performance.now();
  for (let offset = 0; offset < audio.length; offset += 3200) {
    await sleep(Math.max(0, start + offset / 32 - performance.now()));
    live.sendAudio(audio.subarray(offset, offset + 3200));
  }
  await sleep(Math.max(0, start + audio.length / 32 - performance.now()));
  live.endAudio();
  await sleep(5000);
  await live.flush();
  const stats = live.report();
  console.log(JSON.stringify({ type: 'result', stats, note: 'firstTextMs mide desde el primer fragmento; no mide latencia por palabra.' }));
  if (!stats.originalEvents || !stats.textBeforeEnd || live.state === 'closed') process.exitCode = 2;
  if (mode === 'translate' && (!stats.translationEvents || !stats.translationBeforeEnd)) process.exitCode = 2;
  if (stats.translationErrors || stats.pendingTranslations) process.exitCode = 2;
} catch (error) { console.error(live ? live.safe(error.message) : error.message); process.exitCode = 1; }
finally { live?.close(); }
