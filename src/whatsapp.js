/**
 * whatsapp.js
 * ─────────────────────────────────────────────────────────────
 * Envia alertas de milhas via WhatsApp.
 * Suporta Evolution API e Z-API.
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const axios = require('axios');

const PROVIDER   = process.env.WHATSAPP_PROVIDER || 'evolution';
const WA_URL     = process.env.WHATSAPP_URL;
const WA_TOKEN   = process.env.WHATSAPP_TOKEN;
const WA_INST    = process.env.WHATSAPP_INSTANCE;
const GROUP_ID   = process.env.WHATSAPP_GROUP_ID;

/**
 * Envia alerta de milhas para o WhatsApp configurado.
 * @param {Object} params
 * @param {Object} params.destination  - objeto destino do destinations.js
 * @param {Array}  params.flights      - top voos encontrados
 * @param {Object} params.dealInfo     - resultado do isGoodDeal()
 */
async function sendAlert({ destination, flights, dealInfo }) {
  if (!flights || flights.length === 0) return;

  const message = formatMessage({ destination, flights, dealInfo });

  if (PROVIDER === 'evolution') {
    return await sendEvolution(message);
  } else {
    return await sendZAPI(message);
  }
}

/**
 * Formata a mensagem de alerta no padrão WhatsApp.
 */
function formatMessage({ destination, flights, dealInfo }) {
  const topFlights = flights.slice(0, 3); // máximo 3 voos por alerta
  const isGood = dealInfo?.isGoodDeal;
  const emoji = isGood ? '🔥' : '✈️';
  const header = isGood
    ? `${emoji} *OFERTA DE MILHAS — ${destination.label}*`
    : `${emoji} *ATUALIZAÇÃO MILHAS — ${destination.label}*`;

  const flightsText = topFlights.map((f, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    const stops = f.stops === 0 ? 'Direto' : `${f.stops} escala(s)`;
    const dateFormatted = formatDate(f.date);

    return [
      `${rank} *${f.airlineName}* — ${f.cabinType === 'ECONOMY' ? 'Econômica' : f.cabinType}`,
      `📅 ${dateFormatted} | ${stops}`,
      `💎 *${f.miles.toLocaleString('pt-BR')} milhas* + R$ ${f.tax.toFixed(2)} taxas`,
    ].join('\n');
  }).join('\n\n');

  const historyText = dealInfo?.avgMiles
    ? `\n📊 Média histórica: ${dealInfo.avgMiles.toLocaleString('pt-BR')} milhas`
    : '';

  const dealText = dealInfo?.percentBelow !== null && dealInfo?.percentBelow !== undefined
    ? `\n📉 *${dealInfo.percentBelow}% abaixo da média* ${isGood ? '🔥' : ''}`
    : '';

  const link = topFlights[0]?.directLink || '';

  return [
    header,
    '',
    flightsText,
    historyText,
    dealText,
    '',
    `🔗 ${link}`,
    '',
    `_Atualizado: ${formatDateTime(new Date())}_`,
  ].filter(l => l !== null).join('\n');
}

/**
 * Envia via Evolution API.
 */
async function sendEvolution(message) {
  const url = `${WA_URL}/message/sendText/${WA_INST}`;

  const payload = {
    number: GROUP_ID,
    text: message,
    delay: 1200,
  };

  const response = await axios.post(url, payload, {
    headers: {
      'apikey': WA_TOKEN,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  console.log('[whatsapp] ✅ Mensagem enviada via Evolution API');
  return response.data;
}

/**
 * Envia via Z-API.
 */
async function sendZAPI(message) {
  const [instanceId, token] = WA_TOKEN.split(':');
  const url = `https://api.z-api.io/instances/${instanceId || WA_INST}/token/${token}/send-text`;

  const payload = {
    phone: GROUP_ID,
    message,
  };

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  console.log('[whatsapp] ✅ Mensagem enviada via Z-API');
  return response.data;
}

/**
 * Envia mensagem de teste (para validar configuração).
 */
async function sendTest() {
  const message = [
    '🤖 *Smiles Agent — Teste de Conexão*',
    '',
    '✅ WhatsApp configurado com sucesso!',
    'O agente está monitorando os destinos configurados.',
    '',
    `_${formatDateTime(new Date())}_`,
  ].join('\n');

  return await (PROVIDER === 'evolution' ? sendEvolution(message) : sendZAPI(message));
}

// ── Helpers de formatação ─────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (_) {
    return dateStr;
  }
}

function formatDateTime(date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

module.exports = { sendAlert, sendTest, formatMessage };
