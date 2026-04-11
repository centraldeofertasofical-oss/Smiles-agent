// Limiar para considerar uma oferta boa (% abaixo da média histórica)
const GOOD_DEAL_THRESHOLD = 10;

// Histórico simples em memória por rota (ex: "GYN-GIG")
const history = {};

/**
 * Avalia se o melhor voo encontrado é uma boa oferta.
 * @param {string} routeId - ex: "GYN-GIG"
 * @param {number} miles - milhas do melhor voo encontrado agora
 * @returns {{ isGoodDeal: boolean, avgMiles: number|null, percentBelow: number|null }}
 */
function isGoodDeal(routeId, miles) {
  if (!routeId || !miles) return { isGoodDeal: false, avgMiles: null, percentBelow: null };

  if (!history[routeId]) history[routeId] = [];

  const entries = history[routeId];

  // Calcula média histórica
  const avgMiles = entries.length > 0
    ? Math.round(entries.reduce((a, b) => a + b, 0) / entries.length)
    : null;

  // Registra o valor atual no histórico (máximo 30 entradas)
  entries.push(miles);
  if (entries.length > 30) entries.shift();

  if (!avgMiles) return { isGoodDeal: false, avgMiles: null, percentBelow: null };

  const percentBelow = Math.round(((avgMiles - miles) / avgMiles) * 100);
  const isGoodDeal = percentBelow >= GOOD_DEAL_THRESHOLD;

  return { isGoodDeal, avgMiles, percentBelow };
}

module.exports = { isGoodDeal };
