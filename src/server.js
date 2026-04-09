require("dotenv").config();
var express = require("express");
var srch = require("./search");
var norm = require("./normalize");
var dests = require("./destinations");
var app = express();
app.use(express.json());
var PORT = process.env.PORT || 3000;

app.get("/health", function(req, res) {
  res.json({ status: "ok", agent: "smiles-agent-v2", destinations: dests.getDestinations().map(function(d) { return d.id; }), time: new Date().toISOString() });
});

app.get("/search-all", async function(req, res) {
  var d = dests.getDestinations(), results = [], errors = [];
  var td = req.query.date || nextDate(30);
  for (var i = 0; i < d.length; i++) {
    try {
      var raw = await srch.searchFlights({ from: d[i].from, to: d[i].to, date: td });
      var fl = norm.normalizeFlights(raw, Object.assign({}, d[i], { date: td }));
      var cal = norm.extractCalendar(raw);
      results.push({ route: d[i].id, label: d[i].label, date: td, total: fl.length, bestOffer: fl[0] || null, top3: fl.slice(0, 3), bestPricing: cal.bestPricing, calendar: cal.calendar.slice(0, 7) });
      await sleep(1500);
    } catch(err) {
      errors.push({ route: d[i].id, error: err.message });
    }
  }
  res.json({ searchedAt: new Date().toISOString(), date: td, total: results.length, errors: errors.length, results: results, errorDetails: errors });
});

app.post("/search", async function(req, res) {
  var f = req.body.from, t = req.body.to, date = req.body.date;
  if (!f || !t) return res.status(400).json({ error: "from e to obrigatorios" });
  var td = date || nextDate(30);
  try {
    var raw = await srch.searchFlights({ from: f, to: t, date: td });
    var fl = norm.normalizeFlights(raw, { from: f, to: t, date: td });
    var cal = norm.extractCalendar(raw);
    res.json({ route: f + "-" + t, date: td, total: fl.length, bestOffer: fl[0] || null, top3: fl.slice(0, 3), bestPricing: cal.bestPricing, calendar: cal.calendar.slice(0, 7) });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/status", function(req, res) {
  res.json({ status: "ok", destinations: dests.getDestinations(), updatedAt: new Date().toISOString() });
});

function nextDate(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split("T")[0].replace(/-/g, ""); }
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

app.listen(PORT, function() {
  console.log("Smiles Agent v2 porta " + PORT);
  console.log("Destinos: " + dests.getDestinations().map(function(d) { return d.id; }).join(", "));
});

module.exports = app;
