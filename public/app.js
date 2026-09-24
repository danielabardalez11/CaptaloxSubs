import { captionText, renderCaptions, spanishPlaceholder, roomStatus } from './render.js';
const $ = (id) => document.getElementById(id);
let active = null, configured = false;
const status = (text) => { $('status').textContent = text; };
const inputs = ['session', 'language', 'source', 'translate', 'file', 'monitor', 'device', 'devices', 'input-mode'];
const selection = new URLSearchParams(location.search).get('session');
if (new URLSearchParams(location.search).get('compact') === '1') document.body.classList.add('compact');
if (['A', 'B'].includes(selection)) $('session').value = selection;
function buttons(busy) {
  for (const id of inputs) $(id).disabled = busy;
  $('translate').disabled = busy;
  $('start').disabled = busy || !configured;
  if (!busy) $('stop').disabled = true;
}
$('source').onchange = () => { $('file-controls').hidden = $('source').value !== 'file'; $('mic-controls').hidden = $('source').value !== 'mic'; };
$('language').onchange = () => {
  const isEs = $('language').value === 'es';
  if ($('translate-label')) {
    $('translate-label').textContent = isEs
      ? 'Traducir del español al inglés (opcional jurados)'
      : 'Traducir del inglés al español';
  }
  buttons(Boolean(active));
};
$('devices').onclick = async () => {
  $('devices').disabled = true;
  let permissionStream;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const chosen = $('device').value;
    $('device').replaceChildren(new Option('Predeterminada de Windows', ''));
    for (const device of devices.filter((item) => item.kind === 'audioinput' && item.deviceId !== 'default')) $('device').add(new Option(device.label || 'Entrada de audio', device.deviceId));
    if ([...$('device').options].some((option) => option.value === chosen)) $('device').value = chosen;
    status('Entradas actualizadas. Elegí la que recibe el cable de la placa.');
  } catch { status('No se pudieron detectar las entradas. Permití el micrófono en localhost.'); }
  finally { permissionStream?.getTracks().forEach((track) => track.stop()); $('devices').disabled = Boolean(active); }
};
$('resume').onclick = async () => { if (active?.context) await active.context.resume(); };
async function releaseAudio(run) {
  if (run.released) return;
  run.released = true;
  clearTimeout(run.flushTimer);
  clearInterval(run.signalTimer);
  if (active === run) { $('level').value = 0; $('signal').textContent = 'Sin captura'; $('resume').hidden = true; }
  run.stream?.getTracks().forEach((track) => track.stop());
  if (run.player) { run.player.onended = null; try { run.player.stop(); } catch {} }
  run.source?.disconnect(); run.capture?.disconnect(); run.monitor?.disconnect();
  if (run.context && run.context.state !== 'closed') await run.context.close();
}
async function fail(run, message) {
  run.failed = true;
  if (active === run) status(message);
  await releaseAudio(run);
  run.ws?.close();
  if (!run.ws && active === run) { active = null; buttons(false); }
}
function stop(run) {
  if (run.stopping) return;
  run.stopping = true; $('stop').disabled = true;
  status('Esperando los últimos subtítulos (hasta 20 segundos con traducción)…');
  run.capture?.port.postMessage('stop');
  run.flushTimer = setTimeout(() => fail(run, 'La captura no respondió al cierre. Reiniciá la sesión.'), 3000);
}
function render(snapshot) {
  renderCaptions($('original'), snapshot.original);
  renderCaptions($('spanish'), snapshot.spanish, spanishPlaceholder(snapshot));
  $('original-history').textContent = captionText(snapshot.original);
  $('spanish-history').textContent = captionText(snapshot.spanish);
  if (snapshot.translationError) $('spanish').append(document.createTextNode(` ⚠ ${snapshot.translationError}`));
  if (snapshot.status !== 'ended') status(roomStatus(snapshot));
}
try {
  const health = await (await fetch('/health')).json();
  configured = health.configured; buttons(false);
  status(configured ? 'Lista. Elegí una sesión y una fuente de audio.' : 'Falta GEMINI_API_KEY: completá .env y reiniciá el servidor.');
} catch { status('No se pudo contactar al servidor.'); }

$('start').onclick = async () => {
  if (active) return;
  const run = active = { stopping: false, failed: false, released: false };
  buttons(true);
  $('metrics').textContent = $('original-history').textContent = $('spanish-history').textContent = '';
  $('original').textContent = $('spanish').textContent = 'Conectando…';
  try {
    run.context = new AudioContext({ sampleRate: 16000 });
    await run.context.resume();
    if (run.context.sampleRate !== 16000) throw new Error('El navegador no permitió 16000 Hz. Usá Chrome o Edge.');
    if ($('source').value === 'file') {
      const file = $('file').files[0];
      if (!file) throw new Error('Elegí un archivo de audio.');
      if (file.size > 25 * 1024 * 1024) throw new Error('Usá un archivo de hasta 25 MB.');
      run.buffer = await run.context.decodeAudioData(await file.arrayBuffer());
      if (run.buffer.duration > 180) throw new Error('Usá un audio de hasta 3 minutos.');
    } else {
      const filters = $('input-mode').value === 'mic';
      run.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: filters, noiseSuppression: filters, autoGainControl: filters, ...($('device').value ? { deviceId: { exact: $('device').value } } : {}) }, video: false });
      run.stream.getAudioTracks()[0].onended = () => fail(run, 'La entrada de audio se desconectó. Revisá el cable o dispositivo y volvé a iniciar.');
    }
    await run.context.audioWorklet.addModule('/pcm-worklet.js');
    status('Conectando con Gemini…');
    const ws = run.ws = new WebSocket(`ws://${location.host}/audio`);
    ws.onopen = () => ws.send(JSON.stringify({
      type: 'start',
      session: $('session').value,
      language: $('language').value,
      translate: $('translate').checked,
      targetLanguage: $('language').value === 'es' ? 'en' : 'es',
    }));
    ws.onerror = () => fail(run, 'Falló la conexión con el servidor local.');
    ws.onclose = async () => {
      await releaseAudio(run);
      if (active !== run) return;
      active = null; buttons(false);
      if (!run.failed && !run.done) status('Conexión cerrada antes de terminar. Reiniciá la sesión.');
    };
    ws.onmessage = async ({ data }) => {
      if (active !== run) return;
      try {
        const event = JSON.parse(data);
        if (event.type === 'snapshot') render(event);
        if (event.type === 'ready') {
          run.lastPacket = performance.now();
          run.signalTimer = setInterval(() => {
            if (performance.now() - run.lastPacket > 3000 && !run.stopping) $('signal').textContent = 'No llegan fragmentos de audio. Revisá la entrada o reanudá el audio.';
          }, 1000);
          run.context.onstatechange = () => { if (active === run) $('resume').hidden = run.context.state !== 'suspended'; };
          if (run.buffer) {
            run.source = run.player = run.context.createBufferSource();
            run.player.buffer = run.buffer;
            run.player.onended = () => stop(run);
          } else run.source = run.context.createMediaStreamSource(run.stream);
          run.capture = new AudioWorkletNode(run.context, 'pcm-capture');
          run.monitor = run.context.createGain(); run.monitor.gain.value = run.buffer && $('monitor').checked ? 1 : 0;
          run.capture.port.onmessage = ({ data: pcm }) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (pcm === 'flushed') { clearTimeout(run.flushTimer); ws.send(JSON.stringify({ type: 'stop' })); releaseAudio(run); return; }
            run.lastPacket = performance.now();
            const samples = new Int16Array(pcm);
            let sum = 0, peak = 0;
            for (const sample of samples) { const value = sample / 32768; sum += value * value; peak = Math.max(peak, Math.abs(value)); }
            const rms = Math.sqrt(sum / samples.length);
            $('level').value = Math.min(1, rms * 5);
            $('signal').textContent = peak > 0.98 ? 'Señal muy alta: bajá el nivel de la placa' : rms < 0.005 ? 'Silencio o señal baja' : 'Recibiendo audio';
            if (ws.bufferedAmount > 64000) { fail(run, 'La red se atrasó. Reiniciá la sesión.'); return; }
            ws.send(pcm);
          };
          run.source.connect(run.capture).connect(run.context.destination);
          run.source.connect(run.monitor).connect(run.context.destination);
          run.player?.start();
          $('stop').disabled = false;
          status(run.buffer ? 'Enviando archivo a velocidad real…' : 'Escuchando. Hablá naturalmente.');
        }
        if (event.type === 'error') await fail(run, event.message);
        if (event.type === 'done') {
          run.done = true;
          $('metrics').textContent = JSON.stringify(event.stats, null, 2);
          const s = event.stats;
          status(s.translationErrors ? 'Hubo errores de traducción. Revisá el original y el registro.' : !s.originalEvents ? 'Sin texto original: prueba NO aprobada.' : !s.textBeforeEnd ? 'Llegó texto; falta demostrar que llega durante el audio.' : $('language').value === 'en' && $('translate').checked && !s.translationBeforeEnd ? 'Llegó el original, pero falta comprobar traducción durante el audio.' : 'Texto recibido durante el audio. Revisá exactitud y traducción en el registro.');
        }
      } catch (error) { await fail(run, error.message); }
    };
  } catch (error) { await fail(run, error.name === 'NotAllowedError' ? 'Permití el micrófono en el navegador y en la privacidad de Windows.' : error.message); }
};
$('stop').onclick = () => { if (active) stop(active); };
window.addEventListener('pagehide', () => { active?.ws?.close(); active?.stream?.getTracks().forEach((track) => track.stop()); });

// Read-only dashboard: each tab controls only the audio it captures.
const labels = { idle: 'Sin iniciar', connecting: 'Conectando', live: 'En vivo', draining: 'Cerrando', ended: 'Terminada', error: 'Interrumpida' };
const trackNames = { A: 'Principal', B: 'Secundario', C: 'Workshops', D: 'DevOps', E: 'AI & Data', F: 'Open Source' };
async function updateRooms() {
  try {
    const rooms = await (await fetch('/sessions')).json();
    $('rooms').replaceChildren();
    for (const room of rooms) {
      const card = document.createElement('article'); card.className = 'room-card';
      const title = document.createElement('h3');
      const track = trackNames[room.session] ? ` · ${trackNames[room.session]}` : '';
      const statusBadge = room.status === 'live'
        ? '<span class="badge-live">En vivo</span>'
        : `<span style="font-size:12px; color:var(--text-muted); font-weight:normal;">${labels[room.status] || room.status}</span>`;
      title.innerHTML = `<span>Sala ${room.session}${track}</span> ${statusBadge}`;
      const details = document.createElement('p');
      const stale = room.status === 'live' && (!room.lastAudioAt || Date.now() - room.lastAudioAt > 5000);
      details.textContent = `${room.viewers} espectadores · ${Math.round(room.audioSeconds)} s de audio${stale ? ' · Sin audio reciente' : ''}${room.message ? ` · ${room.message}` : ''}`;
      const link = document.createElement('a'); link.href = `/?session=${room.session}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `Abrir control de sala ${room.session} ↗`;
      card.append(title, details, link); $('rooms').append(card);
    }
  } catch { $('rooms').textContent = 'No se pudo consultar el estado del servidor.'; }
}

await updateRooms();
const dashboardTimer = setInterval(updateRooms, 2000);
window.addEventListener('pagehide', () => clearInterval(dashboardTimer));
try {
  const access = await (await fetch('/access')).json();
  for (const link of access.links) $('network').add(new Option(`${link.name} · ${link.address}`, link.address));
  const showLink = () => {
    const link = access.links.find((item) => item.address === $('network').value);
    if (!link) return;
    $('audience-link').href = link.url; $('audience-link').textContent = link.url;
    $('qr').src = `/qr.svg?ip=${encodeURIComponent(link.address)}`; $('qr').hidden = false;
    $('network-status').textContent = 'Si el celular no abre el enlace, revisá la misma Wi-Fi y el permiso de firewall indicado en el README.';
  };
  $('network').onchange = showLink; showLink();
  if (!access.links.length) $('network-status').textContent = 'Sin dirección para audiencia. Comprobá Wi-Fi y el puerto de audiencia; luego recargá.';
} catch { $('network-status').textContent = 'No se pudo preparar el enlace de audiencia.'; }

if ($('export-txt')) {
  $('export-txt').onclick = () => {
    location.href = `/export?session=${encodeURIComponent($('session').value)}&format=txt`;
  };
}
if ($('export-srt')) {
  $('export-srt').onclick = () => {
    location.href = `/export?session=${encodeURIComponent($('session').value)}&format=srt`;
  };
}
