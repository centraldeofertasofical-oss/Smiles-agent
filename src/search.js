/**
 * search.js
 * ─────────────────────────────────────────────────────────────
 * Busca voos disponíveis por milhas na Smiles.
 *
 * Estratégia:
 * 1. Usa a API interna da Smiles (endpoint interceptado)
 * 2. Fallback para scraping DOM se a API mudar
 * 3. Suporta busca flexível (próximos N dias) para achar o mais barato
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const axios = require('axios');
const { getTokens, forceRelogin } = require('./auth');

// ── Endpoints da API interna Smiles (mapeados via intercept.js) ─
// NOTA: Se mudar após rodar intercept.js, atualize aqui
const SMILES_API_BASE = 'https://api-air-flightsearch-prd.smiles.com.br';
const ENDPOINTS = {
  flightSearch: `${SMILES_API_BASE}/v1/airlines/search`,
  // Alternativo caso o principal mude:
  flightSearchV2: `${SMILES_API_BASE}/v2/airlines/search`,
};

const SMILES_WEB_BASE = 'https://www.smiles.com.br';

/**
 * Busca voos para um destino específico.
 *
 * @param {Object} params
 * @param {string} params.origin       - Código IATA de origem (ex: "GRU")
 * @param {string} params.destination  - Código IATA de destino (ex: "MIA")
 * @param {string} params.date         - Data de partida "YYYY-MM-DD" ou "flexible"
 * @param {number} params.adults       - Número de adultos (default: 1)
 * @param {number} params.flexDays     - Dias à frente para busca flexível (default: 30)
 * @returns {Array} Lista de voos ordenados por milhas (menor primeiro)
 */
async function searchFlights({ origin, destination, date = 'flexible', adults = 1, flexDays = 30 }) {
  if (date === 'flexible') {
    return await searchFlexible({ origin, destination, adults, flexDays });
  }
  return await searchSpecificDate({ origin, destination, date, adults });
}

/**
 * Busca nos próximos N dias e retorna todos os resultados.
 */
async function searchFlexible({ origin, destination, adults, flexDays }) {
  const results = [];
  const today = new Date();

  console.log(`[search] 🔍 Busca flexível ${origin}→${destination} nos próximos ${flexDays} dias...`);

  // Busca em paralelo em grupos de 7 dias (evita sobrecarregar a API)
  const dates = [];
  for (let i = 3; i <= flexDays; i += 2) { // começa em 3 dias à frente, pulando 1 dia
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  // Processa em lotes de 5 datas simultâneas
  for (let i = 0; i < dates.length; i += 5) {
    const batch = dates.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map(date => searchSpecificDate({ origin, destination, date, adults }))
    );

    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        results.push(...r.value);
      }
    });

    // Delay entre lotes
    if (i + 5 < dates.length) {
      await sleep(1500);
    }
  }

  // Ordena por milhas e remove duplicatas
  return deduplicateAndSort(results);
}

/**
 * Busca em uma data específica.
 */
async function searchSpecificDate({ origin, destination, date, adults }) {
  let tokens;
  try {
    tokens = await getTokens();
  } catch (err) {
    console.error('[search] ❌ Falha ao obter tokens:', err.message);
    throw err;
  }

  const headers = buildHeaders(tokens);

  // Tenta endpoint primário
  try {
    const result = await callSearchAPI({
      endpoint: ENDPOINTS.flightSearch,
      origin, destination, date, adults, headers,
    });
    return result;
  } catch (err) {
    if (err.response?.status === 401) {
      console.log('[search] Token expirado, forçando relogin...');
      tokens = await forceRelogin();
      const headers2 = buildHeaders(tokens);
      return await callSearchAPI({
        endpoint: ENDPOINTS.flightSearch,
        origin, destination, date, adults, headers: headers2,
      });
    }

    // Tenta endpoint alternativo
    console.log('[search] ⚠️  Endpoint primário falhou, tentando v2...');
    return await callSearchAPI({
      endpoint: ENDPOINTS.flightSearchV2,
      origin, destination, date, adults, headers,
    });
  }
}

/**
 * Chama a API de busca de voos.
 */
async function callSearchAPI({ endpoint, origin, destination, date, adults, headers }) {
  const params = {
    adults,
    children: 0,
    infants: 0,
    tripType: 1,           // 1 = só ida
    originAirportCode: origin,
    destinationAirportCode: destination,
    departureDate: date.replace(/-/g, ''), // formato YYYYMMDD
    forceCongener: false,
    r: 'disney',           // parâmetro que a Smiles usa internamente
  };

  const response = await axios.get(endpoint, {
    params,
    headers,
    timeout: 15000,
  });

  return parseFlightResponse(response.data, origin, destination, date);
}

/**
 * Faz o parse da resposta da API e normaliza os dados.
 */
function parseFlightResponse(data, origin, destination, date) {
  const flights = [];

  // Estrutura típica da API Smiles (baseada em interceptações conhecidas)
  const flightList = data?.requestedFlightSegmentList?.[0]?.flightList ||
                     data?.flightList ||
                     data?.data?.flightList ||
                     [];

  for (const flight of flightList) {
    try {
      const fare = extractBestFare(flight);
      if (!fare) continue;

      const miles = fare.miles || fare.milesValue || 0;
      const tax = fare.tax || fare.taxValue || fare.totalTax || 0;
      const currency = fare.taxCurrency || 'BRL';

      if (miles === 0) continue;

      flights.push({
        origin,
        destination,
        date,
        airline: flight.airline?.code || flight.airline?.name || 'N/A',
        airlineName: flight.airline?.name || flight.airline?.code || 'N/A',
        flightNumber: flight.flightNumber || flight.departure?.flightNumber || '',
        departureTime: flight.departure?.date || flight.departureDate || date,
        arrivalTime: flight.arrival?.date || flight.arrivalDate || '',
        stops: flight.stops || flight.connections || 0,
        cabinType: fare.cabin || fare.cabinType || 'ECONOMY',
        miles,
        tax: parseFloat(tax) || 0,
        taxCurrency: currency,
        totalCost: `${miles.toLocaleString('pt-BR')} milhas + R$ ${parseFloat(tax).toFixed(2)}`,
        directLink: buildSmilesDiretLink(origin, destination, date),
        capturedAt: new Date().toISOString(),
        score: calculateScore(miles, tax),
      });
    } catch (err) {
      // ignora voos com dados inválidos
    }
  }

  // Ordena por score (menor milhas + menor taxa = melhor score)
  return flights.sort((a, b) => a.score - b.score);
}

/**
 * Extrai a melhor tarifa disponível do voo (menor milhas).
 */
function extractBestFare(flight) {
  const fareList = flight.fareList ||
                   flight.fares ||
                   flight.availabilityMap?.ECONOMY ||
                   [];

  if (Array.isArray(fareList) && fareList.length > 0) {
    return fareList.reduce((best, fare) => {
      const miles = fare.miles || fare.milesValue || Infinity;
      const bestMiles = best?.miles || best?.milesValue || Infinity;
      return miles < bestMiles ? fare : best;
    }, null);
  }

  // Se não tem fareList, o próprio objeto flight pode ter os dados
  if (flight.miles || flight.milesValue) return flight;

  return null;
}

/**
 * Score para ordenação: normaliza milhas e taxa em escala 0-100.
 * Menor score = melhor oferta.
 */
function calculateScore(miles, tax) {
  // Peso: 70% milhas, 30% taxa (em reais)
  const milesNorm = miles / 100;    // normaliza dividindo por 100
  const taxNorm = parseFloat(tax) * 0.3;
  return milesNorm + taxNorm;
}

/**
 * Constrói o link direto para a busca na Smiles.
 */
function buildSmilesDiretLink(origin, destination, date) {
  return `${SMILES_WEB_BASE}/emission?originAirportCode=${origin}&destinationAirportCode=${destination}&departureDate=${date}&adults=1&children=0&infants=0&isFlexibleDateChecked=false&tripType=1&cabinType=all&currencyCode=BRL`;
}

/**
 * Headers para autenticação na API da Smiles.
 */
function buildHeaders(tokens) {
  return {
    'Authorization': `Bearer ${tokens.accessToken}`,
    'x-api-key': 'aJqPU7xNHl9qN3NVZnPaJ208aPo2Bh2p2ZV844tw', // chave pública da Smiles (vem no intercept)
    'channel': 'Web',
    'region': 'BRASIL',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Language': 'pt-BR',
    'Origin': 'https://www.smiles.com.br',
    'Referer': 'https://www.smiles.com.br/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
}

/**
 * Remove duplicatas e ordena por score.
 */
function deduplicateAndSort(flights) {
  const seen = new Set();
  return flights
    .filter(f => {
      const key = `${f.date}-${f.airline}-${f.flightNumber}-${f.miles}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.score - b.score);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { searchFlights };
