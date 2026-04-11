require("dotenv").config();
const express = require("express");
const srch    = require("./search");
const norm    = require("./normalize");
const dests   = require("./destinations");
const deals   = require("./deals");
const wa      = require("./whatsapp");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", function(req, res) {
  res.json({
    status: "ok",
    agent: "smiles-agent-v2",
    destinations: dests.getDestinations().map(function(d) { return d.id; }),
    time: new Date().toISOString()
  });
});

// ── Status ────────────────────────────────────────────────────────────────────

app.get("/status", function(req, res) {
  res.json({
    status: "ok",
    destinations: dests.getDestinations(),
    updatedAt: new Date().toISOString()
  });
});

// ── /run-all — busca todos os destinos + envia WhatsApp ──────────────────────

app.get("/run-all", async function(req, res) {
  const d           = dests.getDestinations();
  const results     = [];
  const errors      = [];
  const td          = req.query.date || nextDate(30);
  const sendWA      = req.query.sendWhatsApp !== "false";
  const onlyGood    = req.query.onlyGoodDeals !== "false";

  for (var i = 0; i < d.length; i++) {
    try {
      console.log("[run-all] " + d[i].label + " em " + td);

      const raw  = await srch.searchFlights({ from: d[i].from, to: d[i].to, date: td });
      const fl   = norm.normalizeFlights(raw, Object.assign({}, d[i], { date: td }));
      const cal  = norm.extractCalendar(raw);

      const bestOffer  = fl[0] || null;
      const dealInfo   = bestOffer ? deals.isGoodDeal(d[i].id, bestOffer.miles) : null;
      let   alerted    = false;

      if (sendWA && bestOffer && (!onlyGood || dealInfo?.isGoodDeal)) {
        try {
          await wa.sendAlert({ destination: d[i], flights: fl, dealInfo });
          alerted = true;
        } catch (waErr) {
          console.error("[run-all] WhatsApp erro:", waErr.message);
        }
      }

      results.push({
        route:       d[i].id,
        label:       d[i].label,
        date:        td,
        total:       fl.length,
        bestOffer,
        top3:        fl.slice(0, 3),
        dealInfo,
        alerted,
        bestPricing: cal.bestPricing,
        calendar:    cal.calendar.slice(0, 7),
      });

      await sleep(1500);
    } catch (err) {
      console.error("[run-all] erro " + d[i].id + ": " + err.message);
      errors.push({ route: d[i].id, error: err.message });
    }
  }

  res.json({
    searchedAt:       new Date().toISOString(),
    date:             td,
    totalDestinations: results.length,
    alertsSent:       results.filter(function(r) { return r.alerted; }).length,
    errors:           errors.length,
    results,
    errorDetails:     errors,
  });
});

// ── /search-all — busca todos sem enviar WhatsApp ─────────────────────────────

app.get("/search-all", async function(req, res) {
  const d       = dests.getDestinations();
  const results = [];
  const errors  = [];
  const td      = req.query.date || nextDate(30);

  for (var i = 0; i < d.length; i++) {
    try {
      console.log("[search-all] " + d[i].label + " em " + td);
      const raw = await srch.searchFlights({ from: d[i].from, to: d[i].to, date: td });
      const fl  = norm.normalizeFlights(raw, Object.assign({}, d[i], { date: td }));
      const cal = norm.extractCalendar(raw);

      results.push({
        route:       d[i].id,
        label:       d[i].label,
        date:        td,
        total:       fl.length,
        bestOffer:   fl[0] || null,
        top3:        fl.slice(0, 3),
        bestPricing: cal.bestPricing,
        calendar:    cal.calendar.slice(0, 7),
      });

      await sleep(1500);
    } catch (err) {
      console.error("[search-all] erro " + d[i].id + ": " + err.message);
      errors.push({ route: d[i].id, error: err.message });
    }
  }

  res.json({
    searchedAt: new Date().toISOString(),
    date:       td,
    total:      results.length,
    errors:     errors.length,
    results,
    errorDetails: errors,
  });
});

// ── /search — busca rota única ────────────────────────────────────────────────

app.post("/search", async function(req, res) {
  const f    = req.body.from || req.body.origin;
  const t    = req.body.to   || req.body.destination;
  const date = req.body.date;

  if (!f || !t) return res.status(400).json({ error: "from e to obrigatorios" });

  const td = date || nextDate(30);

  try {
    const raw = await srch.searchFlights({ from: f, to: t, date: td });
    const fl  = norm.normalizeFlights(raw, { from: f, to: t, date: td });
    const cal = norm.extractCalendar(raw);

    res.json({
      route:       f + "-" + t,
      date:        td,
      total:       fl.length,
      bestOffer:   fl[0] || null,
      top3:        fl.slice(0, 3),
      bestPricing: cal.bestPricing,
      calendar:    cal.calendar.slice(0, 7),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── /test-whatsapp — testa envio no grupo ─────────────────────────────────────

app.get("/test-whatsapp", async function(req, res) {
  try {
    await wa.sendTest();
    res.json({ status: "ok", message: "Mensagem de teste enviada!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextDate(n) {
  var d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, function() {
  console.log("Smiles Agent v2 porta " + PORT);
  console.log("Destinos: " + dests.getDestinations().map(function(d) { return d.id; }).join(", "));
});

module.exports = app;
