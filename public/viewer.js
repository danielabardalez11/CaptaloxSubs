import { captionText, renderCaptions, spanishPlaceholder, roomStatus } from './render.js';
const $ = (id) => document.getElementById(id);
let ws, latest, retry, disposed = false;
const socketUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/watch`;
const initial = new URLSearchParams(location.search);
try {
  const savedSession = localStorage.getItem('nerdearla_session');
  const savedLanguage = localStorage.getItem('nerdearla_language');
  if (['A', 'B'].includes(initial.get('session'))) $('session').value = initial.get('session');
  else if (['A', 'B'].includes(savedSession)) $('session').value = savedSession;
  if (['es', 'original'].includes(initial.get('language'))) $('language').value = initial.get('language');
  else if (['es', 'original'].includes(savedLanguage)) $('language').value = savedLanguage;
} catch {}
function render() {
  if (!latest || latest.session !== $('session').value) return;
  const spanish = $('language').value === 'es';
  const captions = spanish ? latest.spanish : latest.original;
  renderCaptions($('captions'), captions, spanish ? spanishPlaceholder(latest) : 'Esperando audio…');
  if (spanish && latest.translationError) $('captions').append(document.createTextNode(` ⚠ ${latest.translationError}`));
  $('history').textContent = captionText(captions);
  $('status').textContent = roomStatus(latest);
  $('note').textContent = latest.language === 'es' ? 'La charla es en español. Ambas opciones muestran el original.' : spanish ? 'Traducción al español. Puede llegar después del original.' : 'Transcripción en inglés. La puntuación puede contener errores.';
}
function select() {
  latest = null; $('captions').textContent = 'Esperando la sesión elegida…'; $('history').textContent = ''; $('note').textContent = '';
  $('status').textContent = 'Cambiando de sesión…';
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
window.addEventListener('pagehide', () => { disposed = true; clearTimeout(retry); ws?.close(); });
connect();
