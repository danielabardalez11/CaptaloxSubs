import { networkInterfaces } from 'node:os';

export function audienceLinks(port, interfaces = networkInterfaces()) {
  if (!port) return [];
  return Object.entries(interfaces).flatMap(([name, entries]) => entries
    .filter((entry) => entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'))
    .map((entry) => ({ name, address: entry.address, url: `http://${entry.address}:${port}/viewer` })))
    .sort((a, b) => Number(/wi-?fi|wlan/i.test(b.name)) - Number(/wi-?fi|wlan/i.test(a.name)) || a.name.localeCompare(b.name));
}
