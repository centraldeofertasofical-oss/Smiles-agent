/**
 * redis-client.js
 * Cliente Redis singleton compartilhado por todos os módulos.
 */

require('dotenv').config();
const { createClient } = require('redis');

const client = createClient({ url: process.env.REDIS_URL });

client.on('error', (err) => console.error('[redis] Erro:', err.message));
client.on('connect', () => console.log('[redis] ✅ Conectado'));

// Conecta automaticamente na primeira importação
let connected = false;
const connectPromise = (async () => {
  if (!connected) {
    await client.connect();
    connected = true;
  }
})();

// Wrapper que garante conexão antes de qualquer operação
const redis = new Proxy(client, {
  get(target, prop) {
    const original = target[prop];
    if (typeof original === 'function') {
      return async (...args) => {
        await connectPromise;
        return original.apply(target, args);
      };
    }
    return original;
  }
});

module.exports = redis;
