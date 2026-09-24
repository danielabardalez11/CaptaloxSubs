import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceLinks } from '../src/network.js';
test('enlaces LAN priorizan Wi-Fi y excluyen loopback, IPv6 y direcciones sin red', () => {
  const entry = (address, internal = false, family = 'IPv4') => ({ address, internal, family });
  const links = audienceLinks(3001, { Virtual: [entry('192.168.56.1')], 'Wi-Fi': [entry('192.168.0.161')], Loopback: [entry('127.0.0.1', true)], Broken: [entry('169.254.4.5')], IPv6: [entry('::1', false, 'IPv6')] });
  assert.equal(links.length, 2);
  assert.equal(links[0].url, 'http://192.168.0.161:3001/viewer');
  assert.deepEqual(audienceLinks(null), []);
});
