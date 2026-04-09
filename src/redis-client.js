var store = {};

function getEntry(key) {
var entry = store[key];
if (!entry) return null;
if (entry.exp && Date.now() > entry.exp) {
delete store[key];
return null;
}
return entry;
}

var redis = {
get: async function(key) {
var e = getEntry(key);
return e ? e.val : null;
},
set: async function(key, value, opts) {
var exp = null;
if (opts && opts.EX) exp = Date.now() + opts.EX * 1000;
store[key] = { val: value, exp: exp };
return ‘OK’;
},
del: async function(key) {
delete store[key];
return 1;
},
lPush: async function(key, value) {
if (!store[key]) store[key] = { val: [], exp: null };
store[key].val.unshift(value);
return store[key].val.length;
},
lTrim: async function(key, start, end) {
if (!store[key]) return;
store[key].val = store[key].val.slice(start, end + 1);
},
lRange: async function(key, start, end) {
var e = getEntry(key);
if (!e) return [];
var arr = e.val;
if (end === -1) return arr.slice(start);
return arr.slice(start, end + 1);
},
expire: async function(key, seconds) {
if (!store[key]) return;
store[key].exp = Date.now() + seconds * 1000;
},
on: function() {}
};

module.exports = redis;
