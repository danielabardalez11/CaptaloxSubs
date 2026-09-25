import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { MODEL } from './live.js';
import { CaptionSession, TEXT_MODEL } from './caption-session.js';
import { Room } from './room.js';
import { audienceLinks } from './network.js';
import QRCode from 'qrcode';

export function createApp({ apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_TRANSCRIBE_MODEL || MODEL, translateModel = process.env.GEMINI_TEXT_MODEL || TEXT_MODEL, makeLive = (options) => new CaptionSession(options), drainMs, roomList = (process.env.ROOMS ? process.env.ROOMS.split(',').map((s) => s.trim().toUpperCase()) : ['A', 'B']) } = {}) {
  const rooms = new Map(roomList.map((id) => [id, new Room(id)]));
  const owners = new Map();
  const viewers = new Map();
  const files = { '/': ['index.html', 'text/html'], '/viewer': ['viewer.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/viewer.js': ['viewer.js', 'text/javascript'], '/render.js': ['render.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/pcm-worklet.js': ['pcm-worklet.js', 'text/javascript'] };
  files['/demo'] = ['demo.html', 'text/html'];
  const audienceFiles = new Set(['/viewer', '/viewer.js', '/render.js', '/style.css', '/export']);
  const handleHttp = (audienceOnly) => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;
    if (audienceOnly && pathname === '/') pathname = '/viewer';
    if (pathname === '/export') {
      const sessionId = (url.searchParams.get('session') || 'A').toUpperCase();
      const format = url.searchParams.get('format') === 'srt' ? 'srt' : 'txt';
      const lang = url.searchParams.get('lang') || 'original';
      const room = rooms.get(sessionId);
      if (!room) { res.writeHead(404); res.end('Sesión no encontrada'); return; }
      const content = room.exportTranscript(format, lang);
      const filename = `subtitulos-${sessionId}-${lang}.${format}`;
      res.writeHead(200, {
        'Content-Type': format === 'srt' ? 'application/x-subrip; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      res.end(content);
      return;
    }
    if (audienceOnly && !audienceFiles.has(pathname)) { res.writeHead(404); res.end('No encontrado'); return; }
    if (!audienceOnly && pathname === '/sessions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([...rooms.values()].map((room) => ({ ...room.summary(), viewers: [...viewers.values()].filter((id) => id === room.id).length })))); return;
    }
    if (!audienceOnly && pathname === '/access') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ links: audienceLinks(audienceServer.address()?.port), listening: audienceServer.listening })); return;
    }
    if (!audienceOnly && pathname === '/qr.svg') {
      const link = audienceLinks(audienceServer.address()?.port).find((item) => item.address === url.searchParams.get('ip'));
      if (!link) { res.writeHead(400); res.end('Elegí una dirección de red disponible.'); return; }
      try { const svg = await QRCode.toString(link.url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }); res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(svg); }
      catch { res.writeHead(500); res.end('No se pudo generar el QR.'); }
      return;
    }
    if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ configured: Boolean(apiKey), model, translateModel })); return; }
    const file = files[pathname];
    if (!file || req.method !== 'GET') { res.writeHead(404); res.end('No encontrado'); return; }
    try { const body = await readFile(new URL(`../public/${file[0]}`, import.meta.url)); res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(body); }
    catch { res.writeHead(500); res.end('No se pudo cargar la página.'); }
  };
  const server = createServer(handleHttp(false));
  const audienceServer = createServer(handleHttp(true));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 6400 });
  const send = (ws, event) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 256000) { ws.close(1013, 'Conexión atrasada'); return; }
    ws.send(JSON.stringify(event));
  };
  const publish = (room) => {
    const snapshot = room.snapshot();
    for (const [ws, id] of viewers) if (id === room.id) send(ws, snapshot);
    const owner = owners.get(room.id);
    if (owner) send(owner, snapshot);
  };
  const upgrade = (audienceOnly) => (req, socket, head) => {
    const origins = audienceOnly ? [`http://${req.headers.host}`, `https://${req.headers.host}`] : [`http://${req.headers.host}`];
    if (!(audienceOnly ? ['/watch'] : ['/audio', '/watch']).includes(req.url) || !origins.includes(req.headers.origin)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req.url));
  };
  server.on('upgrade', upgrade(false));
  audienceServer.on('upgrade', upgrade(true));
  // WebSocket ping detects dead TCP connections; viewers reconnect in the page.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.alive === false) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 15000);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));
  wss.on('connection', (ws, route) => {
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => ws.close());
    if (route === '/watch') {
      const defaultRoom = rooms.keys().next().value || 'A';
      viewers.set(ws, defaultRoom); send(ws, rooms.get(defaultRoom).snapshot());
      ws.on('message', (data, binary) => {
        try {
          const message = binary ? {} : JSON.parse(data.toString());
          if (message.type !== 'watch' || !rooms.has(message.session)) throw new Error('Sesión inválida.');
          viewers.set(ws, message.session); send(ws, rooms.get(message.session).snapshot());
        } catch { send(ws, { type: 'error', message: `Elegí una sala válida (${[...rooms.keys()].join(' o ')}).` }); ws.close(); }
      });
      ws.on('close', () => viewers.delete(ws));
      return;
    }
    let live, timer, room, started = false, finished = false;
    const end = (message) => {
      if (room && !finished && room.status !== 'error') { room.accept({ type: 'error', message }); publish(room); }
      ws.close();
    };
    ws.on('message', async (data, binary) => {
      try {
        if (binary) { if (!live) throw new Error('Primero iniciá una sesión.'); live.sendAudio(data); room.lastAudioAt = Date.now(); room.audioBytes += data.length; return; }
        const message = JSON.parse(data.toString());
        if (message.type === 'start' && !started) {
          started = true;
          const id = message.session || 'A';
          if (!rooms.has(id)) throw new Error(`Elegí una sala válida (${[...rooms.keys()].join(' o ')}).`);
          if (!['es', 'en', 'auto'].includes(message.language)) throw new Error('Idioma inválido.');
          if (owners.has(id)) throw new Error(`La sesión ${id} ya tiene un emisor. Elegí otra sesión.`);
          const translate = message.translate === true && (message.language !== 'es' || message.targetLanguage === 'en');
          room = rooms.get(id); owners.set(id, ws); room.reset(message.language, translate); publish(room);
          live = makeLive({ apiKey, model, textModel: translateModel, mode: translate ? 'translate' : 'transcribe', language: message.language, targetLanguage: message.targetLanguage });
          live.on('event', (event) => {
            room.accept(event); publish(room); send(ws, event);
            if (event.type === 'error') ws.close();
          });
          await live.connect();
          if (ws.readyState !== WebSocket.OPEN) live.close();
        } else if (message.type === 'stop') {
          if (live && live.state !== 'closed') {
            live.endAudio(); room.status = 'draining'; publish(room);
            timer = setTimeout(async () => {
              try {
                await Promise.race([
                  live.flush?.(),
                  new Promise((resolve) => setTimeout(resolve, 2500))
                ]);
              } catch {}
              if (ws.readyState !== WebSocket.OPEN) return;
              const event = { type: 'done', stats: live.report() };
              finished = true; room.accept(event); publish(room); send(ws, event);
              live.close(); ws.close();
            }, drainMs ?? 600);
          } else {
            ws.close();
          }
        } else throw new Error('Mensaje o estado inválido.');
      } catch (error) {
        const message = live ? live.safe(error.message) : error.message;
        send(ws, { type: 'error', message }); end(message);
      }
    });
    ws.on('close', () => {
      clearTimeout(timer); live?.close();
      if (room && owners.get(room.id) === ws) {
        owners.delete(room.id);
        if (!finished && room.status !== 'error') room.accept({ type: 'error', message: 'El emisor se desconectó. Volvé a iniciar esta sesión.' });
        publish(room);
      }
    });
  });
  return { server, audienceServer, wss, rooms };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, audienceServer } = createApp();
  server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Emisor: http://localhost:${server.address().port} — Espectador: http://localhost:${server.address().port}/viewer`));
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? 'Puerto ocupado: cambiá PORT en .env.' : 'No se pudo iniciar el servidor.'); process.exitCode = 1; });
  audienceServer.listen(Number(process.env.AUDIENCE_PORT || 3001), '0.0.0.0', () => {
    for (const link of audienceLinks(audienceServer.address().port)) console.log(`Audiencia (${link.name}): ${link.url}`);
    console.log('El celular debe estar en la misma red. QR disponible en la página del emisor.');
  });
  audienceServer.on('error', () => console.error('No se pudo abrir el puerto de audiencia. Revisá AUDIENCE_PORT. El emisor puede seguir funcionando.'));
}
