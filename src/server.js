/**
 * server.js
 * ─────────────────────────────────────────────────────────────
 * Servidor Express do Smiles Agent.
 *
 * Endpoints:
 *   POST /search       - Busca manual (chamado pelo n8n ou Artifact)
 *   POST /run-all      - Roda todos os 4 destinos agora
 *   GET  /health       - Health check
 *   GET  /history/:id  - Histórico de preços de um destino
 *   POST /test-whatsapp - Testa envio WhatsApp
 *
 * Segurança: todas as rotas exigem o header Authorization: Bearer <WEBHOOK_SECRET>
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const express    = require('express');
const { searchFlights }                          = require('./search');
const { getDestinations, saveHistory, isGoodDeal, isWithinMaxMiles, getHistory } = require('./destinations');
const { sendAlert, sendTest }                    = require('./whatsapp');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return next(); // se não configurado, pula (dev)

  const auth = req.headers['authorization'] || req.headers['x-webhook-secret'];
  const token = auth?.replace('Bearer ', '');

  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(authMiddleware);

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'smiles-agent',
    destinations: getDestinations().map(d => d.id),
    time: new Date().toISOString(),
  });
});

// ── Busca manual de um destino específico ────────────────────
app.post('/search', async (req, res) => {
  const { origin, destination, date, adults = 1, sendWhatsApp = false } = req.body;

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin e destination são obrigatórios' });
  }

  console.log(`[server] 🔍 Busca manual: ${origin}→${destination} em ${date || 'flexible'}`);

  try {
    const flights = await searchFlights({ origin, destination, date: date || 'flexible', adults });
    const destId = `${origin}-${destination}`;

    if (flights.length > 0) {
      await saveHistory(destId, flights);

      if (sendWhatsApp) {
        const dest = { id: destId, label: `${origin} → ${destination}` };
        const dealInfo = await isGoodDeal(destId, flights[0]);
        await sendAlert({ destination: dest, flights, dealInfo });
      }
    }

    res.json({
      origin,
      destination,
      date: date || 'flexible',
      total: flights.length,
      flights: flights.slice(0, 10), // retorna top 10
    });

  } catch (err) {
    console.error('[server] Erro na busca:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Roda todos os destinos configurados ──────────────────────
app.post('/run-all', async (req, res) => {
  const { sendWhatsApp = true, onlyGoodDeals = true } = req.body;
  const destinations = getDestinations();

  console.log(`[server] 🚀 Iniciando monitoramento de ${destinations.length} destinos...`);

  const results = [];
  const alerts  = [];

  // Processa em sequência com delay para não parecer bot
  for (const dest of destinations) {
    try {
      console.log(`[server] 🔍 ${dest.label}...`);

      const flights = await searchFlights({
        origin: dest.origin,
        destination: dest.destination,
        date: dest.date,
        adults: parseInt(process.env.ADULTS || '1'),
      });

      if (flights.length === 0) {
        console.log(`[server] ⚠️  Nenhum voo encontrado para ${dest.label}`);
        results.push({ dest: dest.id, flights: 0, alerted: false });
        continue;
      }

      // Filtra pelo limite de milhas configurado
      const validFlights = dest.maxMiles > 0
        ? flights.filter(f => isWithinMaxMiles(dest, f.miles))
        : flights;

      if (validFlights.length === 0) {
        console.log(`[server] ⚠️  Todos os voos de ${dest.label} estão acima do limite de ${dest.maxMiles} milhas`);
        results.push({ dest: dest.id, flights: 0, alerted: false, reason: 'acima do limite de milhas' });
        await sleep(randomDelay(3000, 7000));
        continue;
      }

      // Salva no histórico
      await saveHistory(dest.id, validFlights);

      // Verifica se é boa oferta
      const dealInfo = await isGoodDeal(dest.id, validFlights[0]);

      const shouldAlert = sendWhatsApp && (!onlyGoodDeals || dealInfo.isGoodDeal);

      if (shouldAlert) {
        console.log(`[server] 🔥 ALERTA: ${dest.label} — ${dealInfo.reason}`);
        await sendAlert({ destination: dest, flights: validFlights, dealInfo });
        alerts.push(dest.id);
      } else {
        console.log(`[server] ℹ️  ${dest.label}: ${validFlights[0].miles} milhas — ${dealInfo.reason}`);
      }

      results.push({
        dest: dest.id,
        flights: validFlights.length,
        bestOffer: {
          miles: validFlights[0].miles,
          tax: validFlights[0].tax,
          date: validFlights[0].date,
          airline: validFlights[0].airlineName,
        },
        alerted: shouldAlert,
        dealInfo,
      });

    } catch (err) {
      console.error(`[server] ❌ Erro em ${dest.label}:`, err.message);
      results.push({ dest: dest.id, error: err.message, alerted: false });
    }

    // Delay humano entre destinos (8–15s)
    if (destinations.indexOf(dest) < destinations.length - 1) {
      await sleep(randomDelay(8000, 15000));
    }
  }

  console.log(`[server] ✅ Ciclo completo. ${alerts.length} alertas enviados.`);

  res.json({
    completedAt: new Date().toISOString(),
    totalDestinations: destinations.length,
    alertsSent: alerts.length,
    results,
  });
});

// ── Histórico de preços de um destino ────────────────────────
app.get('/history/:id', async (req, res) => {
  const destId = req.params.id; // ex: GRU-MIA
  const history = await getHistory(destId);
  res.json({ destId, ...history });
});

// ── Teste do WhatsApp ─────────────────────────────────────────
app.post('/test-whatsapp', async (req, res) => {
  try {
    await sendTest();
    res.json({ success: true, message: 'Mensagem de teste enviada!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Status de todos os destinos ──────────────────────────────
app.get('/status', async (req, res) => {
  const destinations = getDestinations();
  const status = await Promise.all(
    destinations.map(async (dest) => {
      const history = await getHistory(dest.id);
      return {
        id: dest.id,
        label: dest.label,
        maxMiles: dest.maxMiles || 'sem limite',
        date: dest.date,
        history: {
          count: history.count,
          avgMiles: history.avgMiles,
          minMiles: history.minMiles,
          lastCheck: history.entries[0]?.ts || null,
        },
      };
    })
  );
  res.json({ status, updatedAt: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Smiles Agent rodando na porta ${PORT}`);
  console.log(`   Destinos: ${getDestinations().map(d => d.id).join(', ')}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});

// ── Helpers ───────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomDelay(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

module.exports = app;
