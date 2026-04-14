require('dotenv').config();
const axios = require('axios');

const WA_GATEWAY = process.env.WHATSAPP_URL || 'https://wa-gateway-production-a39d.up.railway.app';
const GROUP_ID   = process.env.WHATSAPP_GROUP_ID || '120363426317749766@g.us';

const SMILES_BANNER = 'https://veja.abril.com.br/wp-content/uploads/2016/09/turismo-mala-viagem-20160905-03.jpg?quality=70&strip=info&w=750&h=500&crop=1';

// Opcional: defina no .env se quiser testar vídeo
const TEST_VIDEO_URL = process.env.WHATSAPP_TEST_VIDEO_URL || '';

async function sendAlert({ destination, flights, dealInfo, mediaType = 'image', mediaUrl }) {
  if (!flights || flights.length === 0) return;

  const caption = formatMessage({ destination, flights, dealInfo });

  const finalMediaType = mediaType === 'video' ? 'video' : 'image';
  const finalMediaUrl = mediaUrl || SMILES_BANNER;

  return await sendMediaToGroup({
    mediaType: finalMediaType,
    mediaUrl: finalMediaUrl,
    caption,
  });
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
    ? `📊 Média histórica: ${dealInfo.avgMiles.toLocaleString('pt-BR')} milhas`
    : null;

  const dealText = dealInfo?.percentBelow != null && dealInfo.percentBelow > 0
    ? `📉 *${dealInfo.percentBelow}% abaixo da média* ${isGood ? '🔥' : ''}`
    : null;

  return [
    header,
    '',
    flightsText,
    historyText,
    dealText,
    '',
    `_Atualizado: ${formatDateTime(new Date())}_`,
  ]
    .filter(line => line !== null && line !== undefined && line !== '')
    .join('\n');
}

async function sendMediaToGroup({ mediaType = 'image', mediaUrl, caption }) {
  if (!mediaUrl || typeof mediaUrl !== 'string' || !mediaUrl.startsWith('http')) {
    throw new Error(`[whatsapp] URL de mídia inválida para envio: ${mediaUrl}`);
  }

  const isVideo = mediaType === 'video';
  const endpoint = isVideo ? '/send-group-video' : '/send-group-image';

  const payload = {
    groupId: GROUP_ID,
    caption,
  };

  if (isVideo) {
    payload.videoUrl = mediaUrl;
  } else {
    payload.imageUrl = mediaUrl;
  }

  const url = `${WA_GATEWAY}${endpoint}`;

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    });

    console.log(`[whatsapp] ✅ ${isVideo ? 'Vídeo' : 'Imagem'} enviado(a) para o grupo`);
    return response.data;
  } catch (err) {
    console.error(`[whatsapp] ❌ Erro ao enviar ${isVideo ? 'vídeo' : 'imagem'}:`, err.message);

    if (err.response) {
      console.error('[whatsapp] ❌ Gateway respondeu:', JSON.stringify(err.response.data));
    }

    throw err;
  }
}

async function sendToGroup(caption) {
  return await sendMediaToGroup({
    mediaType: 'image',
    mediaUrl: SMILES_BANNER,
    caption,
  });
}

async function sendVideoToGroup({ caption, videoUrl }) {
  return await sendMediaToGroup({
    mediaType: 'video',
    mediaUrl: videoUrl,
    caption,
  });
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

async function sendTestVideo(videoUrl = TEST_VIDEO_URL) {
  if (!videoUrl) {
    throw new Error('Defina WHATSAPP_TEST_VIDEO_URL no .env ou passe a videoUrl na função sendTestVideo(videoUrl).');
  }

  const caption = [
    '🎥 *Smiles Agent — Teste de Vídeo*',
    '',
    '✅ Envio de vídeo configurado com sucesso!',
    '',
    `_${formatDateTime(new Date())}_`,
  ].join('\n');

  return await sendVideoToGroup({ caption, videoUrl });
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';

  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (_) {
    return dateStr;
  }
}

function formatDateTime(date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

module.exports = {
  sendAlert,
  sendTest,
  sendTestVideo,
  sendToGroup,
  sendVideoToGroup,
  sendMediaToGroup,
  formatMessage,
};