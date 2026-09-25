export const emptyCaptions = () => ({ history: [], current: '', interim: '' });
export function captionText(captions) {
  return [...captions.history, captions.current, captions.interim].filter(Boolean).join(' ');
}
export function renderCaptions(element, captions, placeholder = 'Esperando audio…') {
  element.replaceChildren();
  const text = [...captions.history.slice(-2), captions.current].filter(Boolean).join(' ').slice(-500);
  const stable = document.createElement('span'); stable.textContent = text;
  const interim = document.createElement('span'); interim.className = 'interim'; interim.textContent = captions.interim ? ` ${captions.interim}` : '';
  element.append(stable, interim);
  if (!text && !captions.interim) element.textContent = placeholder;
}
export function spanishPlaceholder(snapshot) {
  if (snapshot.language === 'es') {
    return snapshot.translate ? 'Esperando traducción al inglés…' : 'Traducción desactivada.';
  }
  return snapshot.language === 'es' || snapshot.translate ? 'Esperando texto en español…' : 'El emisor no activó la traducción.';
}
export function roomStatus(snapshot) {
  const labels = { idle: 'Esperando emisor', connecting: 'Preparando audio', live: 'En vivo', draining: 'Recibiendo los últimos subtítulos', ended: 'Sesión terminada', error: 'Sesión interrumpida' };
  return `Sesión ${snapshot.session} · ${labels[snapshot.status] || snapshot.status}${snapshot.message ? `: ${snapshot.message}` : ''}`;
}
