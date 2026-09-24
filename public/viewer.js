import { captionText, renderCaptions, spanishPlaceholder, roomStatus } from './render.js';
const $ = (id) => document.getElementById(id);
let ws, latest, retry, disposed = false;
const socketUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/watch`;
const initial = new URLSearchParams(location.search);

if (initial.get('overlay') === '1') document.body.classList.add('overlay');

try {
  const savedSession = localStorage.getItem('nerdearla_session');
  const savedLanguage = localStorage.getItem('nerdearla_language');
  const validSessions = [...$('session').options].map((o) => o.value);
  if (initial.get('session') && validSessions.includes(initial.get('session').toUpperCase())) {
    $('session').value = initial.get('session').toUpperCase();
  } else if (savedSession && validSessions.includes(savedSession)) {
    $('session').value = savedSession;
  }
  if (['es', 'en', 'original'].includes(initial.get('language'))) $('language').value = initial.get('language');
  else if (['es', 'en', 'original'].includes(savedLanguage)) $('language').value = savedLanguage;
} catch {}

function render() {
  if (!latest || latest.session !== $('session').value) return;
  const choice = $('language').value;
  const captions = choice === 'es' ? latest.spanish
    : choice === 'en' ? (latest.english || latest.original)
    : latest.original;

  const placeholder = choice === 'es' ? spanishPlaceholder(latest)
    : choice === 'en' ? (latest.language === 'en' ? 'Waiting for speech…' : 'Waiting for English translation…')
    : 'Esperando audio…';

  renderCaptions($('captions'), captions, placeholder);
  if (choice !== 'original' && latest.translationError) $('captions').append(document.createTextNode(` ⚠ ${latest.translationError}`));
  $('history').textContent = captionText(captions);
  $('status').textContent = roomStatus(latest);
  const liveIndicator = $('live-indicator');
  if (liveIndicator) liveIndicator.style.display = latest.status === 'live' ? 'inline-flex' : 'none';

  const note = latest.language === 'es'
    ? (choice === 'en' ? (latest.translate ? 'Traducción al inglés en vivo.' : 'Charla en español (traducción al inglés desactivada).') : 'La charla es en español.')
    : (choice === 'es' ? 'Traducción al español en vivo.' : 'Transcripción en inglés.');
  $('note').textContent = note;
}

function updateObsLink() {
  const obsLink = $('btn-obs');
  if (obsLink) obsLink.href = `/viewer?session=${$('session').value}&overlay=1`;
}

function select() {
  latest = null; $('captions').textContent = 'Esperando la sesión elegida…'; $('history').textContent = ''; $('note').textContent = '';
  $('status').textContent = 'Cambiando de sesión…';
  updateObsLink();
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'watch', session: $('session').value }));
}

function connect() {
  if (disposed) return;
  ws = new WebSocket(socketUrl);
  ws.onopen = select;
  ws.onmessage = ({ data }) => {
    const event = JSON.parse(data);
    if (event.type === 'snapshot' && event.session === $('session').value) { latest = event; render(); }
    if (event.type === 'error') $('status').textContent = event.message;
  };
  ws.onclose = () => {
    if (disposed) return;
    latest = null; $('captions').textContent = 'Conexión interrumpida'; $('history').textContent = '';
    $('status').textContent = 'Reconectando con el servidor…';
    retry = setTimeout(connect, 1500);
  };
  ws.onerror = () => ws.close();
}

$('session').onchange = () => {
  try { localStorage.setItem('nerdearla_session', $('session').value); } catch {}
  select();
};
$('language').onchange = () => {
  try { localStorage.setItem('nerdearla_language', $('language').value); } catch {}
  render();
};
$('stage').onclick = () => {
  const enabled = document.body.classList.toggle('stage');
  $('stage').textContent = enabled ? 'Salir de modo escenario' : 'Modo escenario';
};
if (initial.get('stage') === '1') $('stage').click();
$('fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('note').textContent = 'Este navegador no permite pantalla completa. Podés usar el modo escenario.'; }
};

if ($('export-txt')) {
  $('export-txt').onclick = () => {
    const session = $('session').value;
    const lang = $('language').value;
    location.href = `/export?session=${encodeURIComponent(session)}&format=txt&lang=${encodeURIComponent(lang)}`;
  };
}
if ($('export-srt')) {
  $('export-srt').onclick = () => {
    const session = $('session').value;
    const lang = $('language').value;
    location.href = `/export?session=${encodeURIComponent(session)}&format=srt&lang=${encodeURIComponent(lang)}`;
  };
}

updateObsLink();
window.addEventListener('pagehide', () => { disposed = true; clearTimeout(retry); ws?.close(); });
connect();
