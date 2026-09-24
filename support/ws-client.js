import WebSocket from 'ws';
// Test/diagnostic client: retains events so assertions cannot miss fast responses.
export async function connectClient(host, route) {
  const ws = new WebSocket(`ws://${host}${route}`, { origin: `http://${host}` });
  const events = [];
  const waiting = new Set();
  let closed = false;
  ws.on('message', (data) => {
    const event = JSON.parse(data.toString()); events.push(event);
    for (const waiter of [...waiting]) if (waiter.predicate(event)) waiter.resolve(event);
  });
  ws.on('close', () => { closed = true; for (const waiter of [...waiting]) waiter.reject(new Error('Socket cerrado antes del evento esperado.')); });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return {
    ws, events,
    send: (message) => ws.send(Buffer.isBuffer(message) ? message : JSON.stringify(message)),
    next(predicate, timeout = 5000, from = 0) {
      const existing = events.slice(from).find(predicate);
      if (existing) return Promise.resolve(existing);
      if (closed) return Promise.reject(new Error('Socket cerrado.'));
      return new Promise((resolve, reject) => {
        const clear = () => { clearTimeout(timer); waiting.delete(waiter); };
        const waiter = { predicate, resolve: (event) => { clear(); resolve(event); }, reject: (error) => { clear(); reject(error); } };
        const timer = setTimeout(() => waiter.reject(new Error('Timeout esperando evento.')), timeout);
        waiting.add(waiter);
      });
    },
  };
}
