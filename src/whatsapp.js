require('dotenv').config();
const axios = require('axios');

const WA_GATEWAY = process.env.WHATSAPP_URL || 'https://wa-gateway-production-a39d.up.railway.app';
const GROUP_ID   = process.env.WHATSAPP_GROUP_ID || '120363426317749766@g.us';

const SMILES_BANNER = 'https://veja.abril.com.br/wp-content/uploads/2016/09/turismo-mala-viagem-20160905-03.jpg?quality=70&strip=info&w=750&h=500&crop=1';

async function sendAlert({ destination, flights, dealInfo }) {
  if (!flights || flights.length === 0) return;
  const caption = formatMessage({ destination, flights, dealInfo });
  return await sendToGroup(caption);
}

function formatMessage({ destination, flights, dealInfo }) {
  const topFlights = flights.slice(0, 3);
  const isGood = dealInfo?.isGoodDeal;
  const emoji = isGood ? '🔥' : '✈️';

  const header = isGood
    ? `${emoji} *OFERTA DE MILHAS — ${destination.label}*`
    : `${emoji} *ATUALIZAÇÃO MILHAS — ${destination.label}*`;

  const flightsText = topFlights.map((f, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    const stops = f.stops === 0 ? 'Direto' : `${f.stops} escala(s)`;
    const date = formatDate(f.date);
    const taxStr = f.tax > 0 ? ` + R$ ${f.tax.toFixed(2)} taxas` : ' + taxas incluídas';
    return [
      `${rank} *${f.airline}* — ${f.cabin === 'ECONOMIC' ? 'Econômica' : f.cabin}`,
      `📅 ${date} | ${stops}`,
      `💎 *${f.miles.toLocaleString('pt-BR')} milhas*${taxStr}`,
    ].join('\n');
  }).join('\n\n');

  const historyText = dealInfo?.avgMiles
    ? `\n📊 Média histórica: ${dealInfo.avgMiles.toLocaleString('pt-BR')} milhas`
    : '';

  const dealText = dealInfo?.percentBelow != null && dealInfo.percentBelow > 0
    ? `\n📉 *${dealInfo.percentBelow}% abaixo da média* ${isGood ? '🔥' : ''}`
    : '';

  return [header, '', flightsText, historyText, dealText, '', `_Atualizado: ${formatDateTime(new Date())}_`]
    .filter(l => l !== null).join('\n');
}

async function sendToGroup(caption) {
  const url = `${WA_GATEWAY}/send-group-image`;
  const payload = { groupId: GROUP_ID, imageUrl: SMILES_BANNER, caption };

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log('[whatsapp] ✅ Mensagem enviada para o grupo');
    return response.data;
  } catch (err) {
    console.error('[whatsapp] ❌ Erro ao enviar:', err.message);
    if (err.response) {
      console.error('[whatsapp] ❌ Gateway respondeu:', JSON.stringify(err.response.data));
    }
    throw err;
  }
}

async function sendTest() {
  const caption = [
    '🤖 *Smiles Agent — Teste de Conexão*',
    '',
    '✅ WhatsApp configurado com sucesso!',
    'O agente está monitorando os destinos configurados.',
    '',
    `_${formatDateTime(new Date())}_`,
  ].join('\n');
  return await sendToGroup(caption);
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (_) { return dateStr; }
}

function formatDateTime(date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

module.exports = { sendAlert, sendTest, formatMessage };
