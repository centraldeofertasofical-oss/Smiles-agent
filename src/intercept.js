require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

async function run() {
  console.log('Abrindo Chrome - faca o login manualmente!');
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'pt-BR'
  });
  const page = await ctx.newPage();
  const reqs = [];

  page.on('request', function(r) {
    var u = r.url();
    if (u.indexOf('api.smiles') > -1 || u.indexOf('cognito') > -1 || u.indexOf('/v1/airlines') > -1 || u.indexOf('/v2/airlines') > -1) {
      reqs.push({ url: u, method: r.method(), headers: r.headers(), postData: r.postData() || null });
      console.log('>> ' + r.method() + ' ' + u.substring(0, 100));
    }
  });

  try {
    await page.goto('https://login.smiles.com.br', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch(e) {}

  console.log('');
  console.log('INSTRUCOES:');
  console.log('1. Digite seu CPF: 041.203.311-99');
  console.log('2. Digite sua senha: 4688');
  console.log('3. Digite o codigo SMS quando pedir');
  console.log('Voce tem 5 MINUTOS (300 segundos)');
  console.log('');

  await page.waitForTimeout(300000);

  console.log('Navegando para busca de voos...');
  var date = new Date();
  date.setDate(date.getDate() + 45);
  var dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  var url = 'https://www.smiles.com.br/emission?originAirportCode=GRU&destinationAirportCode=MIA&departureDate=' + dateStr + '&adults=1&tripType=1&cabinType=all';
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch(e) {}
  await page.waitForTimeout(15000);
  await page.evaluate(function() { window.scrollBy(0, 600); });
  await page.waitForTimeout(8000);

  var tokens = await page.evaluate(function() {
    var d = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('Cognito') > -1 || k.indexOf('token') > -1 || k.indexOf('Token') > -1)) {
        d[k] = localStorage.getItem(k);
      }
    }
    return d;
  });

  var cookies = await ctx.cookies();
  var report = { tokens: tokens, requests: reqs, cookies: cookies.filter(function(c) { return c.domain.indexOf('smiles') > -1; }) };
  fs.writeFileSync('intercept-report.json', JSON.stringify(report, null, 2));

  console.log('');
  console.log('PRONTO! Requests: ' + reqs.length + ' | Tokens: ' + Object.keys(tokens).length);
  var apis = reqs.filter(function(r) { return r.url.indexOf('airline') > -1 || r.url.indexOf('miles') > -1; });
  if (apis.length > 0) { apis.forEach(function(r) { console.log('ENDPOINT: ' + r.method + ' ' + r.url); }); }
  console.log('Arquivo salvo: intercept-report.json');
  await browser.close();
}

run().catch(function(e) { console.error('ERRO:', e.message); process.exit(1); });