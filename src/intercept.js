require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

async function intercept() {
  console.log('Abrindo Chrome...');
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', viewport: { width: 1366, height: 768 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const reqs = [];

  page.on('request', r => {
    const u = r.url();
    if (u.includes('api.smiles') || u.includes('cognito') || u.includes('amazonaws.com/oauth2') || u.includes('/v1/airlines') || u.includes('/v2/airlines')) {
      reqs.push({ url: u, method: r.method(), headers: r.headers(), postData: r.postData() || null });
      console.log('>> ' + r.method() + ' ' + u);
    }
  });

  try { await page.goto('https://www.smiles.com.br', { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch(e) { console.log('Site carregou, continuando...'); }
  await page.waitForTimeout(3000);

  console.log('');
  console.log('========================================');
  console.log('FACA O LOGIN MANUALMENTE NA JANELA!');
  console.log('Voce tem 5 MINUTOS para fazer login + SMS');
  console.log('========================================');
  console.log('');
  await page.waitForTimeout(300000);

  console.log('Navegando para busca de voos...');
  const date = new Date(); date.setDate(date.getDate() + 45);
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const url = 'https://www.smiles.com.br/emission?originAirportCode=GRU&destinationAirportCode=MIA&departureDate=' + dateStr + '&adults=1&tripType=1&cabinType=all';
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch(e) { console.log('Timeout na busca, ok'); }
  await page.waitForTimeout(15000);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(8000);

  const tokens = await page.evaluate(() => {
    const d = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes('Cognito') || k.includes('token') || k.includes('Token'))) d[k] = localStorage.getItem(k);
    }
    return d;
  });

  const cookies = await ctx.cookies();
  fs.writeFileSync('intercept-report.json', JSON.stringify({ tokens, requests: reqs, cookies: cookies.filter(c => c.domain.includes('smiles')) }, null, 2));

  console.log('');
  console.log('=== RESULTADO ===');
  console.log('Requests: ' + reqs.length);
  console.log('Tokens: ' + Object.keys(tokens).length);
  const apis = reqs.filter(r => r.url.includes('airline') || r.url.includes('flight') || r.url.includes('miles'));
  if (apis.length > 0) { console.log('ENDPOINTS DE VOO:'); apis.forEach(r => console.log('  ' + r.method + ' ' + r.url)); }
  console.log('Salvo em intercept-report.json');
  await browser.close();
}

intercept().catch(e => { console.error('ERRO:', e.message); process.exit(1); });