import { fileURLToPath } from 'node:url';

let loading;
let queue = Promise.resolve();
export function prepareTranslator() {
  loading ||= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = fileURLToPath(new URL('../.cache/translation/', import.meta.url));
    return pipeline('translation', 'Xenova/opus-mt-en-es', {
      dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: 2 },
    });
  })().catch((error) => { loading = undefined; throw error; });
  return loading;
}

export function translateLocally({ text, signal }) {
  const result = queue.then(async () => {
    signal?.throwIfAborted();
    const translator = await prepareTranslator();
    // Bound each decoding request without silently truncating long confirmed turns.
    const chunks = text.match(/.{1,350}(?:\s|$)|\S{1,350}/gs) || [];
    const translated = [];
    for (const chunk of chunks) {
      signal?.throwIfAborted();
      const output = await translator(chunk.trim(), { max_new_tokens: 256, num_beams: 1 });
      signal?.throwIfAborted();
      if (!output[0]?.translation_text?.trim()) throw new Error('No se pudo traducir el segmento.');
      translated.push(output[0].translation_text.trim());
    }
    return translated.join(' ');
  });
  queue = result.catch(() => {});
  return result;
}
