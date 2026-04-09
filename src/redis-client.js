var s = {};

function getE(k) {
  var e = s[k];
  if (!e) return null;
  if (e.exp && Date.now() > e.exp) { delete s[k]; return null; }
  return e;
}

var redis = {
  get: async function(k) { var e = getE(k); return e ? e.v : null; },
  set: async function(k, v, o) {
    var exp = null;
    if (o && o.EX) exp = Date.now() + o.EX * 1000;
    s[k] = { v: v, exp: exp };
    return "OK";
  },
  del: async function(k) { delete s[k]; return 1; },
  lPush: async function(k, v) {
    if (!s[k]) s[k] = { v: [], exp: null };
    s[k].v.unshift(v);
    return s[k].v.length;
  },
  lTrim: async function(k, a, b) { if (s[k]) s[k].v = s[k].v.slice(a, b + 1); },
  lRange: async function(k, a, b) {
    var e = getE(k);
    if (!e) return [];
    return b === -1 ? e.v.slice(a) : e.v.slice(a, b + 1);
  },
  expire: async function(k, sec) { if (s[k]) s[k].exp = Date.now() + sec * 1000; },
  on: function() {}
};

module.exports = redis;