/**

- redis-client.js
- Substituído por armazenamento em memória simples.
- Não precisa de Redis — os dados ficam na RAM do servidor Railway.
  */

const store = {};

const redis = {
async get(key) {
const entry = store[key];
if (!entry) return null;
if (entry.expiresAt && Date.now() > entry.expiresAt) {
delete store[key];
return null;
}
return entry.value;
},

async set(key, value, options = {}) {
const expiresAt = options.EX ? Date.now() + options.EX * 1000 : null;
store[key] = { value, expiresAt };
return ‘OK’;
},

async del(…keys) {
keys.forEach(k => delete store[k]);
return keys.length;
},

async lPush(key, value) {
if (!store[key]) store[key] = { value: [], expiresAt: null };
store[key].value.unshift(value);
return store[key].value.length;
},

async lTrim(key, start, end) {
if (!store[key]) return;
store[key].value = store[key].value.slice(start, end + 1);
},

async lRange(key, start, end) {
const entry = store[key];
if (!entry) return [];
const arr = entry.value;
return end === -1 ? arr.slice(start) : arr.slice(start, end + 1);
},

async expire(key, seconds) {
if (!store[key]) return;
store[key].expiresAt = Date.now() + seconds * 1000;
},

on() {}, // compatibilidade — não faz nada
};

module.exports = redis;
