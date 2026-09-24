// Read RIFF chunks rather than assuming every WAV has a 44-byte header.
export function readPcmWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Se necesita un archivo WAV RIFF.');
  if (buffer.readUInt32LE(4) + 8 > buffer.length) throw new Error('WAV truncado.');
  let format, audio;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) throw new Error('WAV truncado.');
    if (id === 'fmt ') {
      if (length < 16) throw new Error('Formato WAV inválido.');
      format = { encoding: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), rate: buffer.readUInt32LE(start + 4), bits: buffer.readUInt16LE(start + 14) };
    }
    if (id === 'data') audio = buffer.subarray(start, start + length);
    offset = start + length + (length % 2);
  }
  if (!format || format.encoding !== 1 || format.channels !== 1 || format.rate !== 16000 || format.bits !== 16) throw new Error('El WAV debe ser PCM de 16 bits, mono, 16000 Hz.');
  if (!audio?.length || audio.length % 2) throw new Error('El WAV no contiene audio PCM válido.');
  return audio;
}
